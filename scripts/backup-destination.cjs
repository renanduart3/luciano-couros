const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
function maintenanceBackupDir(paths) {
  const configFile = path.join(paths.dataDir, 'mock_config.json');
  const mock = fs.existsSync(configFile) && JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')).mockEnabled;
  const file = path.join(paths.dataDir, mock ? 'database_mock.db' : 'database.db');
  const database = new Database(file, { readonly: true, fileMustExist: true });
  let configured;
  try {
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE name='configuracoes'").get()) {
      configured = database.prepare("SELECT valor FROM configuracoes WHERE chave='backup_pasta'").get()?.valor;
    }
  } finally { database.close(); }
  if (!configured) return paths.backupDir;
  if (!path.isAbsolute(configured) || !fs.statSync(configured).isDirectory()) throw new Error('Pasta de backup configurada indisponivel.');
  const relative = path.relative(fs.realpathSync(configured), fs.realpathSync(paths.dataDir));
  if (!relative || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw new Error('A pasta de backup nao pode conter os bancos ativos.');
  return configured;
}
module.exports = { maintenanceBackupDir };
