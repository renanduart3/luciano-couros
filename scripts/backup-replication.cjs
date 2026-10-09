const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeBackupPath, checkDatabase, backupInfo } = require('./backup-files.cjs');

function digest(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

// Publish only complete, verified copies; never expose a partially copied .db to Drive.
function copySnapshot(sourceDir, destinationDir, name) {
  const source = safeBackupPath(sourceDir, name);
  checkDatabase(source);
  if (!fs.statSync(destinationDir).isDirectory()) throw new Error('Pasta do Drive indisponivel.');
  const target = path.join(destinationDir, name);
  if (fs.existsSync(target)) {
    safeBackupPath(destinationDir, name);
    if (digest(source) === digest(target)) return false;
  }
  const staging = path.join(path.dirname(destinationDir), '.backup-staging');
  fs.mkdirSync(staging, { recursive: true });
  const temporary = path.join(staging, `copy-${crypto.randomUUID()}.db`);
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    checkDatabase(temporary);
    if (digest(source) !== digest(temporary)) throw new Error('A copia do backup nao corresponde ao arquivo local.');
    fs.renameSync(temporary, target);
    return true;
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(temporary + suffix)) fs.unlinkSync(temporary + suffix);
    }
  }
}

function recentSnapshots(dir, now = new Date(), mode) {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return fs.readdirSync(dir).filter(name => {
    const info = backupInfo(name);
    return info && info.type !== 'update' && (!mode || info.mode === mode) && info.date.getTime() >= cutoff && info.date <= now;
  }).sort();
}

// Probe creation and deletion with the server's actual account, including subfolders.
function checkFolderPermissions(folder, withStaging = false) {
  const probe = path.join(folder, `.backup-permission-test-${crypto.randomUUID()}`);
  let created = false;
  try {
    fs.mkdirSync(probe);
    created = true;
    const file = path.join(probe, 'test');
    fs.writeFileSync(file, '', { flag: 'wx' });
    fs.unlinkSync(file);
    fs.rmdirSync(probe);
    created = false;
    if (withStaging) {
      const staging = path.join(path.dirname(folder), '.backup-staging');
      fs.mkdirSync(staging, { recursive: true });
      checkFolderPermissions(staging);
    }
  } catch (error) {
    throw new Error(`Sem permissao para criar e excluir backups em ${folder}. Conceda Modificar a conta que executa o sistema. ${error.message}`);
  } finally {
    if (created) {
      // Only remove our random, known probe and its known file.
      try { fs.unlinkSync(path.join(probe, 'test')); } catch { }
      try { fs.rmdirSync(probe); } catch { }
    }
  }
}

module.exports = { copySnapshot, recentSnapshots, checkFolderPermissions };
