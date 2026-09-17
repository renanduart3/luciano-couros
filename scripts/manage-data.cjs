const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { resolveDataPaths } = require('./data-paths.cjs');
const { checkDatabase, stamp, pruneBackups } = require('./backup-files.cjs');

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function copyTree(source, destination) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Link recusado na migracao: ${entry.name}`);
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); copyTree(from, to); }
    else {
      fs.mkdirSync(destination, { recursive: true });
      if (fs.existsSync(to)) {
        if (!fs.readFileSync(from).equals(fs.readFileSync(to))) throw new Error(`Conflito entre backups: ${entry.name}`);
      } else fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      if (!fs.readFileSync(from).equals(fs.readFileSync(to))) throw new Error(`Falha de verificacao: ${entry.name}`);
    }
  }
}
async function snapshotFiles(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const names = fs.readdirSync(source).filter(name => /^database(?:_mock(?:_sqlite)?)?\.db$/.test(name));
  if (!names.includes('database.db')) throw new Error('Banco real nao encontrado. Migracao cancelada.');
  for (const name of names) {
    const sourceFile = path.join(source, name);
    if (fs.lstatSync(sourceFile).isSymbolicLink()) throw new Error('Banco simbolico recusado.');
    const database = new Database(sourceFile, { readonly: true, fileMustExist: true });
    try { await database.backup(path.join(destination, name)); }
    finally { database.close(); }
    checkDatabase(path.join(destination, name));
  }
  const config = path.join(source, 'mock_config.json');
  if (fs.existsSync(config)) fs.copyFileSync(config, path.join(destination, 'mock_config.json'));
}
async function migrate(root, destination) {
  if (process.env.DATA_DIR || process.env.BACKUP_DIR) throw new Error('Remova DATA_DIR/BACKUP_DIR do ambiente antes da migracao.');
  if (!path.isAbsolute(destination)) throw new Error('Informe um caminho absoluto.');
  root = fs.realpathSync(root);
  destination = path.resolve(destination);
  if (contains(root, destination) || contains(destination, root)) throw new Error('Destino deve ficar fora do projeto, sem conter o projeto.');
  if (fs.existsSync(destination)) throw new Error('Destino ja existe. Use uma pasta nova para nao sobrescrever dados.');
  const paths = resolveDataPaths(root);
  if (paths.external) throw new Error('Dados ja configurados fora do projeto. Nenhuma alteracao realizada.');
  const source = fs.existsSync(path.join(paths.dataDir, 'database.db')) ? paths.dataDir : root;
  if (!fs.existsSync(path.join(source, 'database.db'))) throw new Error('Nenhum banco existente encontrado.');
  // Resolve existing parent directories to reject junctions into the installation.
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const realDestination = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
  if (contains(root, realDestination) || contains(realDestination, root)) throw new Error('Destino real esta dentro do projeto.');
  fs.mkdirSync(destination);
  await snapshotFiles(source, destination);
  const backupDir = path.join(destination, 'backups');
  fs.mkdirSync(backupDir);
  copyTree(paths.backupDir, backupDir);
  if (path.resolve(paths.backupDir) !== path.join(root, 'backups')) copyTree(path.join(root, 'backups'), backupDir);
  // Existing installations must receive the agreed retention, including mock mode.
  for (const name of ['database.db', 'database_mock.db']) {
    const file = path.join(destination, name);
    if (!fs.existsSync(file)) continue;
    const database = new Database(file);
    try {
      if (database.prepare("SELECT 1 FROM sqlite_master WHERE name='configuracoes'").get()) {
        database.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('retencao_backups_dias', '30')").run();
      }
    } finally { database.close(); }
    checkDatabase(file);
  }
  const manifest = { migratedAt: new Date().toISOString(), source, dataDir: destination, backupDir,
    note: 'Originais preservados. Remover somente depois de validar a instalacao e a restauracao.' };
  fs.writeFileSync(path.join(destination, 'migration-receipt.json'), JSON.stringify(manifest, null, 2));
  const config = { dataDir: destination, backupDir };
  const temporary = paths.configFile + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2));
  fs.renameSync(temporary, paths.configFile);
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}
async function preUpdate(root) {
  const paths = resolveDataPaths(root);
  const source = fs.existsSync(path.join(paths.dataDir, 'database.db')) ? paths.dataDir : root;
  const staging = path.join(path.dirname(paths.backupDir), '.backup-staging', crypto.randomUUID());
  await snapshotFiles(source, staging);
  fs.mkdirSync(paths.backupDir, { recursive: true });
  const target = path.join(paths.backupDir, `antes-da-atualizacao_${stamp()}_${crypto.randomBytes(4).toString('hex')}`);
  fs.renameSync(staging, target);
  console.log(`Backup anterior a atualizacao: ${target}`);
}
if (require.main === module) {
  const [action, destination] = process.argv.slice(2);
  (async () => {
    if (action === 'paths') console.log(JSON.stringify(resolveDataPaths()));
    else if (action === 'migrate') await migrate(process.cwd(), destination || '');
    else if (action === 'snapshot') await preUpdate(process.cwd());
    else if (action === 'prune') pruneBackups(resolveDataPaths().backupDir, 30);
    else throw new Error('Comando de dados desconhecido.');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { migrate, snapshotFiles, contains };
