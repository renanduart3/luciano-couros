const fs = require('node:fs');
const path = require('node:path');

// Shared by the server and Windows maintenance commands. Never store this file in updates.
function resolveDataPaths(root = process.cwd(), env = process.env) {
  const configFile = path.join(root, 'installation-paths.json');
  const config = fs.existsSync(configFile)
    ? JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')) : {};
  if (fs.existsSync(configFile) && (typeof config.dataDir !== 'string' || !path.isAbsolute(config.dataDir))) {
    throw new Error('installation-paths.json invalido: dataDir absoluto obrigatorio.');
  }
  const external = !env.DATA_DIR && Boolean(config.dataDir);
  if (config.dataDir && !path.isAbsolute(config.dataDir)) throw new Error('dataDir deve ser absoluto.');
  if (config.backupDir && !path.isAbsolute(config.backupDir)) throw new Error('backupDir deve ser absoluto.');
  const dataDir = path.resolve(env.DATA_DIR || config.dataDir || path.join(root, 'data'));
  const backupDir = path.resolve(env.BACKUP_DIR || (!env.DATA_DIR && config.backupDir) || path.join(dataDir, 'backups'));
  const relativeData = path.relative(backupDir, dataDir);
  if (relativeData === '' || (!relativeData.startsWith('..' + path.sep) && relativeData !== '..' && !path.isAbsolute(relativeData))) {
    throw new Error('A pasta de backups nao pode conter os bancos ativos.');
  }
  if (external && !fs.existsSync(path.join(dataDir, 'database.db'))) {
    throw new Error(`Banco externo ausente em ${dataDir}. Inicializacao cancelada para nao criar um banco vazio.`);
  }
  if (external && fs.existsSync(path.join(dataDir, 'mock_config.json'))) {
    const mode = JSON.parse(fs.readFileSync(path.join(dataDir, 'mock_config.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (mode.mockEnabled && !fs.existsSync(path.join(dataDir, 'database_mock.db'))) throw new Error('Banco de demonstracao configurado esta ausente.');
  }
  return { dataDir, backupDir, configFile, external };
}
module.exports = { resolveDataPaths };
if (require.main === module) {
  try { console.log(JSON.stringify(resolveDataPaths())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
