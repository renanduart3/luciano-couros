const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
let busy = false;
let sessionPromise;
function getSessionId() {
  if (!sessionPromise) sessionPromise = new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${process.pid}).SessionId`],
      { windowsHide: true, timeout: 10000 }, (error, stdout) => {
        const value = stdout.trim();
        if (error || !/^\d+$/.test(value)) { sessionPromise = undefined; reject(new Error('Nao foi possivel identificar a sessao do Windows.')); }
        else resolve(Number(value));
      });
  });
  return sessionPromise;
}
async function selectFolder(root, production, sessionOverride) {
  if (process.platform !== 'win32') throw new Error('O seletor nativo requer Windows.');
  if (busy) throw new Error('Ja existe uma selecao de pasta aberta.');
  busy = true;
  const runtime = path.join(root, '.runtime');
  const request = path.join(runtime, 'folder-picker-request.json');
  const response = path.join(runtime, 'folder-picker-response.json');
  try {
    // Production builds can run in an interactive terminal too. Only session 0 needs the tray.
    const sessionId = sessionOverride === undefined ? await getSessionId() : sessionOverride;
    if (sessionId > 0) {
      return await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'SelecionarPasta.ps1')], { windowsHide: true, timeout: 120000 }, (error, stdout) => {
        if (error) reject(new Error('Nao foi possivel abrir o seletor de pastas.'));
        else resolve(stdout.trim() || null);
      }));
    }
    const heartbeat = path.join(runtime, 'tray-heartbeat');
    if (!fs.existsSync(heartbeat) || Date.now() - fs.statSync(heartbeat).mtimeMs > 15000) {
      throw new Error('Abra ABRIR CONTROLE DO SISTEMA.cmd neste computador para habilitar o seletor de pastas.');
    }
    const id = crypto.randomUUID();
    fs.writeFileSync(request, JSON.stringify({ id, expiresAt: Date.now() + 120000 }));
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!fs.existsSync(response)) continue;
      try {
        const result = JSON.parse(fs.readFileSync(response, 'utf8').replace(/^\uFEFF/, ''));
        if (result.id === id) {
          if (result.error) throw new Error(result.error);
          return typeof result.folder === 'string' && result.folder ? result.folder : null;
        }
      } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    throw new Error('Selecao expirou. Tente novamente.');
  } finally {
    for (const file of [request, response]) { try { fs.unlinkSync(file); } catch {} }
    busy = false;
  }
}
module.exports = { selectFolder };
