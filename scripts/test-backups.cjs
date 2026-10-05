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
    assert.equal(copied.prepare("SELECT valor FROM configuracoes WHERE chave='retencao_backups_dias'").get().valor, '30');
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
    copy('auto_mock_2026-08-01_12-00-00.db'); // last valid mock stays
    copy('manual_live_2026-08-18_12-00-00.db'); // exactly 30 days stays
    copy('manual_live_2026-08-17_12-00-00.db');
    copy('manual_live_2026-08-02_12-00-00.db');
    fs.writeFileSync(path.join(dir, 'manual_live_2026-08-02_12-00-00.db.protected'), '');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'do not delete');
    fs.writeFileSync(path.join(dir, 'auto_live_2026-07-01_12-00-00.db.partial'), 'incomplete');
    const oldUpdate = path.join(dir, 'antes-da-atualizacao_2026-08-01_12-00-00');
    fs.mkdirSync(oldUpdate); fs.writeFileSync(path.join(oldUpdate, 'database.db'), 'old');
    const protectedUpdate = path.join(dir, 'antes-da-atualizacao_2026-08-02_12-00-00');
    fs.mkdirSync(protectedUpdate); fs.writeFileSync(path.join(protectedUpdate, '.protected'), '');
    const removed = pruneBackups(dir, 30, new Date('2026-09-17T12:00:00'));
    assert.deepEqual(removed.sort(), ['auto_live_2026-08-01_12-00-00.db', 'manual_live_2026-08-17_12-00-00.db', path.basename(oldUpdate)].sort());
    assert.ok(fs.existsSync(path.join(dir, 'notes.txt')));
    assert.equal(backupInfo('auto_2026-02-31_12-00-00.db'), null);
    assert.throws(() => safeBackupPath(dir, '../database.db'));
    assert.throws(() => safeBackupPath(dir, oldUpdate));
    await assert.rejects(createSnapshot({ backup: async () => { throw new Error('simulated'); } }, dir, 'manual', 'live'));
    assert.deepEqual(fs.readdirSync(path.join(destination, '.backup-staging')), []);

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
    const maintenanceCopies = fs.readdirSync(maintenanceFolder).filter(name => name.startsWith('antes-da-atualizacao_'));
    assert.equal(maintenanceCopies.length, 1);
    assert.ok(fs.existsSync(path.join(maintenanceFolder, maintenanceCopies[0], 'database.db')));

    // Start the actual bundled application using ONLY the persisted external pointer.
    const httpRoot = path.join(fixture, 'http'); fs.mkdirSync(httpRoot);
    const httpData = path.join(fixture, 'http-data'); fs.mkdirSync(httpData);
    new Database(path.join(httpData, 'database.db')).close();
    fs.writeFileSync(path.join(httpRoot, 'installation-paths.json'), JSON.stringify({ dataDir: httpData }));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const env = { ...process.env, PORT: String(port) }; delete env.DATA_DIR; delete env.BACKUP_DIR;
    child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: httpRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = ''; child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
    const exited = new Promise(resolve => child.once('exit', resolve));
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
    assert.equal((await request('POST', '/auth/configurar-gerente', { nome: 'Teste', senha: 'BackupTeste123' })).status, 201);
    assert.equal((await request('POST', '/auth/login', { login: 'gerente', senha: 'BackupTeste123' })).status, 200);
    const customBackup = path.join(fixture, 'drive-backups');
    fs.mkdirSync(customBackup);
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
    // Unavailable destination: three failures surface an alert and survive persisted state.
    for (let i = 0; i < 40; i++) {
      const retry = await request('POST', '/backups');
      if (retry.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const offlineBackup = customBackup + '-offline';
    fs.renameSync(customBackup, offlineBackup);
    for (let i = 0; i < 3; i++) assert.equal((await request('POST', '/backups')).status, 500);
    const failedStatus = (await request('GET', '/backups/status')).data;
    assert.equal(failedStatus.alert, true);
    assert.equal(failedStatus.failures, 3);
    assert.ok(failedStatus.nextRetry);
    assert.equal((await request('GET', '/backups/config')).status, 200, 'Settings stay editable when folder is unavailable');
    const inspect = new Database(path.join(httpData, 'database.db'), { readonly: true });
    assert.equal(JSON.parse(inspect.prepare("SELECT valor FROM configuracoes WHERE chave='backup_estado'").get().valor).failures, 3);
    inspect.close();
    fs.renameSync(offlineBackup, customBackup);
    assert.equal((await request('POST', '/backups')).status, 200);
    assert.equal((await request('GET', '/backups/status')).data.alert, false);
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
    console.log('OK: clean-computer disaster recovery, external installation, unified update destination');
    console.log('OK: migration with WAL, external paths, 30-day retention, protected files, failed backup, HTTP backup and real restoration.');
  } finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    const resolved = fs.realpathSync(fixture);
    if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('luciano-backup-test-')) throw new Error('Unsafe test cleanup');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
