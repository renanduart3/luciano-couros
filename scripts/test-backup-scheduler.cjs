const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const schedule = require('./backup-scheduler.cjs');
const { selectFolder } = require('./folder-picker.cjs');
async function main() {
  const morning = new Date(2026, 9, 3, 8);
  assert.equal(schedule.slotKey(schedule.dueSlot(morning, '18:00')), '2026-10-02');
  const last = schedule.succeeded({}, new Date(2026, 8, 30, 18), '2026-09-30');
  assert.equal(schedule.pending(last, morning, '18:00'), true, 'Catch up even before today\'s scheduled hour');
  const caughtUp = schedule.succeeded(last, morning, '2026-10-02');
  assert.equal(schedule.pending(caughtUp, new Date(2026, 9, 3, 17, 59), '18:00'), false);
  assert.equal(schedule.pending(caughtUp, new Date(2026, 9, 3, 18), '18:00'), true);
  const done = schedule.succeeded(caughtUp, new Date(2026, 9, 3, 18), '2026-10-03');
  assert.equal(schedule.pending(JSON.parse(JSON.stringify(done)), new Date(2026, 9, 3, 20), '18:00'), false, 'Restart must not duplicate completed backup');
  assert.equal(schedule.pending(done, new Date(2026, 9, 3, 17), '18:00'), false, 'Clock rollback must not recreate an older slot');
  let state = {};
  for (const minutes of [5, 15, 30, 60, 60]) {
    state = schedule.failed(state, morning, new Error('Disk unavailable'));
    assert.equal(state.nextRetry, morning.getTime() + minutes * 60000);
    assert.equal(schedule.pending(JSON.parse(JSON.stringify(state)), morning, '18:00'), false);
  }
  assert.equal(state.failures, 5);
  assert.equal(schedule.pending(state, new Date(state.nextRetry), '18:00'), true);
  assert.equal(schedule.succeeded(state, morning, '2026-10-02').failures, 0);
  // Service-to-tray handoff, including Unicode paths and cancellation; no real dialog opened.
  if (process.platform === 'win32') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-picker-test-'));
    const runtime = path.join(root, '.runtime');
    fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(runtime, 'tray-heartbeat'), 'ready');
    let folder = 'C:\\Cópias de segurança';
    const responder = setInterval(() => {
      const file = path.join(runtime, 'folder-picker-request.json');
      if (!fs.existsSync(file)) return;
      const request = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.writeFileSync(path.join(runtime, 'folder-picker-response.json'), JSON.stringify({ id: request.id, folder }));
    }, 50);
    try {
      assert.equal(await selectFolder(root, true, 0), folder);
      folder = null;
      assert.equal(await selectFolder(root, true, 0), null);
      fs.unlinkSync(path.join(runtime, 'tray-heartbeat'));
      await assert.rejects(selectFolder(root, true, 0), /ABRIR CONTROLE/);
    } finally {
      clearInterval(responder);
      assert.equal(path.dirname(path.resolve(root)), fs.realpathSync(os.tmpdir()));
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  console.log('OK: missed days, catch-up before schedule, restart, retry backoff, recovery, folder handoff and cancellation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
