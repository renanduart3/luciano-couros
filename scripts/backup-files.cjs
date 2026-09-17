const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function stamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
function backupInfo(name) {
  const match = /^(?:(auto|manual)_(?:(live|mock)_)?|antes-da-atualizacao_)(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})(?:_[a-f0-9]{8})?(\.db)?$/.exec(name);
  if (!match || (Boolean(match[1]) !== Boolean(match[5]))) return null;
  const date = new Date(`${match[3]}T${match[4].replaceAll('-', ':')}`);
  if (!Number.isFinite(date.getTime()) || stamp(date) !== `${match[3]}_${match[4]}`) return null;
  return { date, type: match[1] || 'update', mode: match[2] || 'legacy' };
}
function checkDatabase(file) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma('integrity_check');
    if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error(`Backup invalido: ${path.basename(file)}`);
  } finally { database.close(); }
}
function safeBackupPath(dir, name) {
  if (typeof name !== 'string' || !backupInfo(name) || !name.endsWith('.db') || path.basename(name) !== name) {
    throw new Error('Nome de backup invalido.');
  }
  const file = path.join(dir, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Backup deve ser um arquivo regular.');
  return file;
}
async function createSnapshot(database, dir, type, mode) {
  fs.mkdirSync(dir, { recursive: true });
  // Sibling directory: Google Drive must synchronize only `dir`, never this staging area.
  const staging = path.join(path.dirname(dir), '.backup-staging');
  fs.mkdirSync(staging, { recursive: true });
  const name = `${type}_${mode}_${stamp()}_${crypto.randomBytes(4).toString('hex')}.db`;
  const temporary = path.join(staging, name);
  try {
    await database.backup(temporary);
    checkDatabase(temporary);
    fs.renameSync(temporary, path.join(dir, name));
    return name;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function safeTree(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).every(entry => {
    if (entry.name === '.protected' || entry.isSymbolicLink()) return false;
    return !entry.isDirectory() || safeTree(path.join(dir, entry.name));
  });
}
function pruneBackups(dir, days = 30, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Retencao invalida.');
  const root = fs.realpathSync(dir);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const entries = fs.readdirSync(root, { withFileTypes: true }).map(entry => ({ entry, info: backupInfo(entry.name) }))
    .filter(({entry, info}) => info && !entry.isSymbolicLink() && (info.type === 'update' ? entry.isDirectory() : entry.isFile()));
  const protectedFiles = new Set();
  // Preserve the most recent valid copy of each database, even during a prolonged outage.
  for (const mode of ['live', 'mock', 'legacy']) {
    for (const item of entries.filter(x => x.info.type !== 'update' && x.info.mode === mode).sort((a,b) => b.info.date - a.info.date)) {
      try { checkDatabase(path.join(root, item.entry.name)); protectedFiles.add(item.entry.name); break; } catch { }
    }
  }
  // A pre-update snapshot may be the only recovery point on an older installation.
  for (const item of entries.filter(x => x.info.type === 'update').sort((a,b) => b.info.date - a.info.date)) {
    try {
      const folder = path.join(root, item.entry.name);
      if (!safeTree(folder)) continue;
      checkDatabase(path.join(folder, 'database.db'));
      protectedFiles.add(item.entry.name);
      break;
    } catch { }
  }
  const removed = [];
  for (const {entry, info} of entries) {
    if (info.date >= cutoff || protectedFiles.has(entry.name)) continue;
    const target = path.resolve(root, entry.name);
    if (path.dirname(target) !== root) throw new Error('Limpeza fora da pasta de backups recusada.');
    try {
      if (fs.existsSync(`${target}.protected`)) continue;
      if (entry.isDirectory()) {
        if (!safeTree(target)) continue;
        fs.rmSync(target, { recursive: true });
      } else { fs.unlinkSync(target); }
      removed.push(entry.name);
      console.log(`[Backup] Removido por retencao: ${entry.name}`);
    } catch (error) { console.error(`[Backup] Nao foi possivel limpar ${entry.name}: ${error.message}`); }
  }
  return removed;
}
module.exports = { stamp, backupInfo, checkDatabase, safeBackupPath, createSnapshot, pruneBackups };
