const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const Database = require('better-sqlite3');
const { migrate, prepareInstallation, preUpdate } = require('./manage-data.cjs');
const { resolveDataPaths } = require('./data-paths.cjs');
const { createSnapshot, pruneBackups, backupInfo, safeBackupPath } = require('./backup-files.cjs');
const { copySnapshot, checkFolderPermissions, recentSnapshots } = require('./backup-replication.cjs');

async function main() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-backup-test-'));
  let child;
  try {
    const root = path.join(fixture, 'installation');
    const source = path.join(root, 'data');
    fs.mkdirSync(source, { recursive: true });
    const original = new Database(path.join(source, 'database.db'));
    original.pragma('journal_mode = WAL');
    original.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('committed in WAL'); CREATE TABLE configuracoes (chave TEXT PRIMARY KEY, valor TEXT); INSERT INTO configuracoes VALUES ('retencao_backups_dias','90');");
    const destination = path.join(fixture, 'external');
    await migrate(root, destination);
    // Live WAL contents must have been included without copying raw sidecars.
    const copied = new Database(path.join(destination, 'database.db'));
    assert.equal(copied.prepare('SELECT value FROM marker').get().value, 'committed in WAL');
    assert.equal(copied.prepare("SELECT valor FROM configuracoes WHERE chave='retencao_backups_dias'").get().valor, '7');
    copied.close();
    assert.equal(original.prepare("SELECT valor FROM configuracoes WHERE chave='retencao_backups_dias'").get().valor, '90');
    original.close();
    assert.equal(resolveDataPaths(root, {}).dataDir, destination);
    assert.throws(() => resolveDataPaths(root, { BACKUP_DIR: fixture }), /bancos ativos/);
    await assert.rejects(migrate(root, destination));
    fs.renameSync(path.join(destination, 'database.db'), path.join(destination, 'missing.db'));
    assert.throws(() => resolveDataPaths(root, {}), /ausente/);
    fs.renameSync(path.join(destination, 'missing.db'), path.join(destination, 'database.db'));

    const dir = path.join(destination, 'backups');
    const copy = name => fs.copyFileSync(path.join(destination, 'database.db'), path.join(dir, name));
    copy('auto_live_2026-08-01_12-00-00.db');
    copy('auto_live_2026-09-17_12-00-00.db');
    copy('auto_mock_2026-08-01_12-00-00.db'); // expired copies are removed even when they are the last valid copy
    copy('manual_live_2026-09-10_12-00-00.db'); // exactly 7 days stays
    copy('manual_live_2026-09-09_12-00-00.db');
    copy('manual_live_2026-08-02_12-00-00.db');
    fs.writeFileSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db.protected'), '');
    fs.writeFileSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db-wal'), '');
    fs.writeFileSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db-shm'), '');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'do not delete');
    fs.writeFileSync(path.join(dir, 'auto_live_2026-07-01_12-00-00.db.partial'), 'incomplete');
    const oldUpdate = path.join(dir, 'antes-da-atualizacao_2026-08-01_12-00-00');
    fs.mkdirSync(oldUpdate); fs.writeFileSync(path.join(oldUpdate, 'database.db'), 'old');
    const protectedUpdate = path.join(dir, 'antes-da-atualizacao_2026-08-02_12-00-00');
    fs.mkdirSync(protectedUpdate); fs.writeFileSync(path.join(protectedUpdate, '.protected'), '');
    const removed = pruneBackups(dir, undefined, new Date('2026-09-17T12:00:00'));
    assert.deepEqual(removed.sort(), ['auto_live_2026-08-01_12-00-00.db', 'auto_mock_2026-08-01_12-00-00.db', 'manual_live_2026-08-02_12-00-00.db', 'manual_live_2026-09-09_12-00-00.db', path.basename(oldUpdate), path.basename(protectedUpdate)].sort());
    assert.ok(fs.existsSync(path.join(dir, 'notes.txt')));
    assert.ok(!fs.existsSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db-wal')));
    assert.ok(!fs.existsSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db-shm')));
    assert.ok(!fs.existsSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db.protected')));
    copy('auto_mock_2026-09-17_12-00-00.db');
    assert.deepEqual(recentSnapshots(dir, new Date('2026-09-17T12:00:00'), 'mock'), ['auto_mock_2026-09-17_12-00-00.db'], 'Drive settings are scoped to the active database environment');
    assert.equal(backupInfo('auto_2026-02-31_12-00-00.db'), null);
    assert.throws(() => safeBackupPath(dir, '../database.db'));
    assert.throws(() => safeBackupPath(dir, oldUpdate));
    await assert.rejects(createSnapshot({ backup: async () => { throw new Error('simulated'); } }, dir, 'manual', 'live'));
    assert.deepEqual(fs.readdirSync(path.join(destination, '.backup-staging')), []);

    // A failed deletion must be visible, while other expired files still get removed.
    copy('manual_live_2026-08-03_12-00-00.db');
    copy('manual_live_2026-08-04_12-00-00.db');
    const unlink = fs.unlinkSync;
    fs.unlinkSync = file => {
      if (path.basename(file) === 'manual_live_2026-08-03_12-00-00.db') throw new Error('EACCES simulated');
      return unlink(file);
    };
    try {
      assert.throws(() => pruneBackups(dir, 90, new Date('2026-09-17T12:00:00')), /permissao Modificar/);
      assert.ok(!fs.existsSync(path.join(dir, 'manual_live_2026-08-04_12-00-00.db')));
    } finally { fs.unlinkSync = unlink; }
    const replica = path.join(fixture, 'replica'); fs.mkdirSync(replica);
    checkFolderPermissions(replica);
    assert.equal(copySnapshot(dir, replica, 'auto_live_2026-09-17_12-00-00.db'), true);
    assert.equal(copySnapshot(dir, replica, 'auto_live_2026-09-17_12-00-00.db'), false, 'Matching copies are idempotent');
    fs.writeFileSync(path.join(replica, 'auto_live_2026-09-17_12-00-00.db'), 'damaged');
    assert.equal(copySnapshot(dir, replica, 'auto_live_2026-09-17_12-00-00.db'), true, 'Damaged replica is repaired from the local copy');
    assert.ok(fs.readFileSync(path.join(replica, 'auto_live_2026-09-17_12-00-00.db')).equals(fs.readFileSync(path.join(dir, 'auto_live_2026-09-17_12-00-00.db'))));
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === path.join(replica, 'manual_live_2026-09-10_12-00-00.db')) throw new Error('EACCES publishing replica');
      return rename(from, to);
    };
    try {
      assert.throws(() => copySnapshot(dir, replica, 'manual_live_2026-09-10_12-00-00.db'), /publishing replica/);
      assert.ok(!fs.existsSync(path.join(replica, 'manual_live_2026-09-10_12-00-00.db')), 'Partial copy is never published');
      assert.ok(fs.existsSync(path.join(dir, 'manual_live_2026-09-10_12-00-00.db')), 'Failed replication preserves the local backup');
      assert.deepEqual(fs.readdirSync(path.join(fixture, '.backup-staging')), []);
    } finally { fs.renameSync = rename; }

    // Fresh installations keep databases outside code; reinstall reconnects without replacing them.
    const freshRoot = path.join(fixture, 'fresh-install'); fs.mkdirSync(freshRoot);
    const freshData = path.join(fixture, 'permanent-data');
    await prepareInstallation(freshRoot, freshData);
    const permanent = new Database(path.join(freshData, 'database.db'));
    permanent.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('preserved after reinstall')"); permanent.close();
    fs.unlinkSync(path.join(freshRoot, 'installation-paths.json'));
    await prepareInstallation(freshRoot, freshData);
    const reconnected = new Database(path.join(freshData, 'database.db'));
    assert.equal(reconnected.prepare('SELECT value FROM marker').get().value, 'preserved after reinstall'); reconnected.close();
    assert.ok(!fs.existsSync(path.join(freshRoot, 'data')));
    const maintenanceFolder = path.join(fixture, 'maintenance-drive'); fs.mkdirSync(maintenanceFolder);
    const maintenanceDb = new Database(path.join(destination, 'database.db'));
    maintenanceDb.prepare("INSERT INTO configuracoes(chave,valor) VALUES ('backup_pasta', ?)").run(maintenanceFolder); maintenanceDb.close();
    await preUpdate(root);
    const maintenanceCopies = fs.readdirSync(dir).filter(name => name.startsWith('antes-da-atualizacao_'));
    assert.equal(maintenanceCopies.length, 1);
    assert.ok(fs.existsSync(path.join(dir, maintenanceCopies[0], 'database.db')));
    assert.equal(fs.readdirSync(maintenanceFolder).length, 0, 'Pre-update recovery stays local');
    fs.renameSync(maintenanceFolder, maintenanceFolder + '-offline');
    await preUpdate(root); // Drive downtime must not block software updates.

    // Start the actual bundled application using ONLY the persisted external pointer.
    const httpRoot = path.join(fixture, 'http'); fs.mkdirSync(httpRoot);
    const httpData = path.join(fixture, 'http-data'); fs.mkdirSync(httpData);
    const existingSettings = new Database(path.join(httpData, 'database.db'));
    existingSettings.exec("CREATE TABLE configuracoes (chave TEXT PRIMARY KEY, valor TEXT); INSERT INTO configuracoes VALUES ('retencao_backups_dias', '30');");
    existingSettings.prepare('INSERT INTO configuracoes VALUES (?, ?)').run('backup_estado', JSON.stringify({ completedSlot: '2099-01-01', lastSuccess: '2026-01-01T18:00:00.000Z' }));
    existingSettings.close();
    fs.writeFileSync(path.join(httpRoot, 'installation-paths.json'), JSON.stringify({ dataDir: httpData }));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const env = { ...process.env, PORT: String(port) }; delete env.DATA_DIR; delete env.BACKUP_DIR;
    child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: httpRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = ''; child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
    let exited = new Promise(resolve => child.once('exit', resolve));
    let cookie = '';
    async function request(method, route, body) {
      const res = await fetch(`http://127.0.0.1:${port}/api${route}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      return { status: res.status, data: await res.json() };
    }
    let ready = false;
    for (let i=0; i<100; i++) {
      try { ready = (await request('GET', '/health')).status === 200; if (ready) break; } catch { }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const retentionCheck = new Database(path.join(httpData, 'database.db'), { readonly: true });
    assert.equal(retentionCheck.prepare("SELECT valor FROM configuracoes WHERE chave='retencao_backups_dias'").get().valor, '7', 'Existing 30-day settings must migrate on startup');
    retentionCheck.close();
    assert.equal((await request('POST', '/auth/configurar-gerente', { nome: 'Teste', senha: 'BackupTeste123' })).status, 201);
    assert.equal((await request('POST', '/auth/login', { login: 'gerente', senha: 'BackupTeste123' })).status, 200);
    const migratedState = (await request('GET', '/backups/status')).data;
    assert.ok(migratedState.lastSuccess && migratedState.lastSuccess !== '2026-01-01T18:00:00.000Z', 'Legacy success is replaced by a real local backup');
    assert.ok(fs.readdirSync(path.join(httpData, 'backups')).some(x => x.startsWith('auto_live_')));
    const customBackup = path.join(fixture, 'drive-backups');
    fs.mkdirSync(customBackup);
    const localBackup = path.join(httpData, 'backups');
    assert.equal((await request('GET', '/backups/config')).data.localFolder, localBackup);
    assert.equal((await request('GET', '/backups/config')).data.folder, '');
    assert.equal((await request('PUT', '/backups/config', { folder: localBackup, time: '18:00' })).status, 400);
    assert.equal((await request('PUT', '/backups/config', { folder: httpData, time: '18:00' })).status, 400);
    assert.equal((await request('PUT', '/backups/config', { folder: customBackup, time: '25:00' })).status, 400);
    assert.equal((await request('PUT', '/backups/config', { folder: customBackup, time: '18:00' })).status, 200);
    assert.equal((await request('GET', '/backups/config')).data.folder, customBackup);
    const markerDb = new Database(path.join(httpData, 'database.db'));
    markerDb.prepare("INSERT INTO configuracoes(chave,valor) VALUES ('disaster_recovery_marker', 'client data before disaster')").run(); markerDb.close();
    let manual;
    for (let i=0; i<40; i++) {
      manual = await request('POST', '/backups');
      if (manual.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(manual.status, 200, JSON.stringify(manual));
    const saved = path.join(customBackup, manual.data.filename);
    assert.ok(fs.existsSync(saved), 'HTTP must return only after the backup exists');
    assert.ok(fs.existsSync(path.join(localBackup, manual.data.filename)));
    assert.ok(fs.readFileSync(saved).equals(fs.readFileSync(path.join(localBackup, manual.data.filename))), 'Both destinations contain the exact same snapshot');
    const listed = (await request('GET', '/backups')).data;
    assert.equal(listed.filter(x => x.filename === manual.data.filename).length, 1, 'Local/Drive copies are not duplicated in the recovery list');
    assert.equal(listed.find(x => x.filename === manual.data.filename).location, 'local');
    const firstCloudSuccess = (await request('GET', '/backups/status')).data.cloud.lastSuccess;
    for (const directory of [localBackup, customBackup]) {
      fs.copyFileSync(saved, path.join(directory, 'manual_live_2000-01-01_12-00-00.db'));
    }
    // Unavailable Drive: local backups still succeed, with separate persisted alerts.
    for (let i = 0; i < 40; i++) {
      const retry = await request('POST', '/backups');
      if (retry.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const offlineBackup = customBackup + '-offline';
    fs.renameSync(customBackup, offlineBackup);
    const pendingCopies = [];
    for (let i = 0; i < 3; i++) {
      const result = await request('POST', '/backups');
      assert.equal(result.status, 200);
      pendingCopies.push(result.data.filename);
      assert.ok(fs.existsSync(path.join(localBackup, result.data.filename)));
      assert.ok(result.data.cloud.lastError);
    }
    assert.ok(!fs.existsSync(path.join(localBackup, 'manual_live_2000-01-01_12-00-00.db')));
    const failedStatus = (await request('GET', '/backups/status')).data;
    assert.equal(failedStatus.alert, true);
    assert.equal(failedStatus.failures, 0);
    assert.equal(failedStatus.cloud.failures, 3);
    assert.ok(failedStatus.cloud.nextRetry);
    assert.ok(failedStatus.lastSuccess);
    assert.equal((await request('GET', '/backups')).status, 200, 'Local recovery list works without Drive');
    assert.equal((await request('GET', '/backups/config')).status, 200, 'Settings stay editable when folder is unavailable');
    const inspect = new Database(path.join(httpData, 'database.db'), { readonly: true });
    assert.equal(JSON.parse(inspect.prepare("SELECT valor FROM configuracoes WHERE chave='backup_estado'").get().valor).cloud.failures, 3);
    inspect.close();
    const localCountOffline = fs.readdirSync(localBackup).filter(name => backupInfo(name)).length;
    child.kill(); await exited;
    child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: httpRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
    exited = new Promise(resolve => child.once('exit', resolve));
    ready = false; cookie = '';
    for (let i = 0; i < 100; i++) {
      try { ready = (await request('GET', '/health')).status === 200; if (ready) break; } catch { }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    assert.equal((await request('POST', '/auth/login', { login: 'gerente', senha: 'BackupTeste123' })).status, 200);
    const restarted = (await request('GET', '/backups/status')).data;
    assert.equal(restarted.cloud.failures, 3, 'Cloud alert survives restart');
    assert.equal(restarted.cloud.nextRetry, failedStatus.cloud.nextRetry, 'Cloud retry backoff survives restart');
    assert.equal(fs.readdirSync(localBackup).filter(name => backupInfo(name)).length, localCountOffline, 'Restart does not duplicate the local daily copy');
    fs.renameSync(offlineBackup, customBackup);
    assert.equal((await request('PUT', '/backups/config', { folder: customBackup, time: '18:00' })).status, 200);
    assert.equal((await request('GET', '/backups/status')).data.alert, false);
    assert.equal(fs.readdirSync(localBackup).filter(name => backupInfo(name)).length, localCountOffline, 'Cloud recovery copies existing files without generating another local backup');
    assert.ok((await request('GET', '/backups/status')).data.cloud.lastSuccess > firstCloudSuccess, 'The last-copy timestamp advances for new snapshots');
    for (const name of pendingCopies) assert.ok(fs.existsSync(path.join(customBackup, name)), 'Pending local copies are retried');
    assert.ok(!fs.existsSync(path.join(customBackup, 'manual_live_2000-01-01_12-00-00.db')));
    const autoBefore = fs.readdirSync(localBackup).filter(x => x.startsWith('auto_')).length;
    assert.equal((await request('PUT', '/backups/config', { folder: customBackup, time: '18:00' })).status, 200);
    assert.equal((await request('GET', '/backups/status')).data.cloud.failures, 0); // Wait for the settings-triggered copy before modifying the fixture directory.
    const missingLocal = localBackup + '-offline';
    fs.renameSync(localBackup, missingLocal);
    fs.writeFileSync(localBackup, 'simulate unavailable local destination');
    try {
      assert.equal((await request('POST', '/backups')).status, 500, 'Local backup failures must not be reported as success');
      const failure = (await request('GET', '/backups/status')).data;
      assert.equal(failure.failures, 1);
      assert.equal(failure.cloud.failures, 0, 'Local failure is separate from Drive status: ' + JSON.stringify(failure));
    } finally { fs.unlinkSync(localBackup); fs.renameSync(missingLocal, localBackup); }
    assert.equal((await request('POST', '/backups')).status, 200);
    assert.equal(fs.readdirSync(localBackup).filter(x => x.startsWith('auto_')).length, autoBefore, 'Changing Drive settings does not duplicate today\'s local backup');
    // Clearing the optional Drive destination preserves the daily local backup.
    assert.equal((await request('PUT', '/backups/config', { folder: '', time: '18:00' })).status, 200);
    assert.equal((await request('GET', '/backups/status')).data.cloud.enabled, false);
    assert.equal((await request('POST', '/backups')).status, 200);
    assert.equal((await request('PUT', '/backups/config', { folder: customBackup, time: '18:00' })).status, 200);
    const verifier = new Database(saved, { readonly: true });
    assert.equal(verifier.pragma('integrity_check', { simple: true }), 'ok'); verifier.close();
    assert.equal((await request('POST', '/backups/restaurar', { filename: '../database.db' })).status, 400);
    const active = new Database(path.join(httpData, 'database.db'));
    active.exec('CREATE TABLE restore_marker (value INTEGER); INSERT INTO restore_marker VALUES (42)'); active.close();
    assert.equal((await request('POST', '/backups/restaurar', { filename: manual.data.filename })).status, 200);
    await exited;
    const restored = new Database(path.join(httpData, 'database.db'));
    assert.equal(restored.prepare("SELECT name FROM sqlite_master WHERE name='restore_marker'").get(), undefined);
    restored.close();
    assert.ok(!fs.existsSync(path.join(httpRoot, 'data')), 'Must not create another database inside the application');
    // Disaster recovery on a clean installation, with only downloaded backup files.
    const downloadedBackup = path.join(fixture, 'downloaded-on-new-pc');
    fs.mkdirSync(downloadedBackup);
    fs.copyFileSync(saved, path.join(downloadedBackup, manual.data.filename));
    const recoveryRoot = path.join(fixture, 'new-computer-install'); fs.mkdirSync(recoveryRoot);
    const recoveryData = path.join(fixture, 'new-computer-data');
    await prepareInstallation(recoveryRoot, recoveryData);
    child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: recoveryRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
    const recoveryExit = new Promise(resolve => child.once('exit', resolve));
    cookie = ''; ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await request('GET', '/health')).status === 200; if (ready) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    assert.equal((await request('POST', '/auth/configurar-gerente', { nome: 'Novo', senha: 'BackupTeste123' })).status, 201);
    assert.equal((await request('POST', '/auth/login', { login: 'gerente', senha: 'BackupTeste123' })).status, 200);
    let restoreResult;
    for (let i = 0; i < 40; i++) {
      const configured = await request('PUT', '/backups/config', { folder: downloadedBackup, time: '18:00' });
      if (configured.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (let i = 0; i < 40; i++) {
      restoreResult = await request('POST', '/backups/restaurar', { filename: manual.data.filename });
      if (restoreResult.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(restoreResult.status, 200, JSON.stringify(restoreResult));
    await recoveryExit;
    const recovered = new Database(path.join(recoveryData, 'database.db'), { readonly: true });
    assert.equal(recovered.prepare("SELECT valor FROM configuracoes WHERE chave='disaster_recovery_marker'").get().valor, 'client data before disaster');
    assert.equal(recovered.prepare("SELECT valor FROM configuracoes WHERE chave='backup_pasta'").get().valor, downloadedBackup);
    recovered.close();
    assert.ok(!fs.existsSync(path.join(recoveryRoot, 'data')));
    console.log('OK: independent local/Drive copies, offline Drive, retry backlog, separate alerts, both retentions, clean-computer recovery and local update snapshot');
    console.log('OK: migration with WAL, external paths, strict 7-day retention, expired last copies and protection markers, failed backup, HTTP backup and real restoration.');
  } finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    const resolved = fs.realpathSync(fixture);
    if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('luciano-backup-test-')) throw new Error('Unsafe test cleanup');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
