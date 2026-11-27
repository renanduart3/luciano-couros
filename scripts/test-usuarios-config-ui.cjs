// Tela "Usuários e senha de operação" no sistema compilado: troca de senhas sem caixas do navegador (prompt/confirm).
// Roda o servidor numa pasta temporária; não toca no banco real.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'); const { once } = require('node:events'); const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-usuarios-'));
  fs.writeFileSync(path.join(temp, 'mock_config.json'), '{"mockEnabled":false}');
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const base = `http://127.0.0.1:${port}`;
  const iniciar = async () => {
    const c = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: process.cwd(), env: { ...process.env, DATA_DIR: temp, PORT: String(port), NODE_ENV: 'production' }, windowsHide: true, stdio: 'ignore' });
    for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) return c; } catch {} await new Promise(r => setTimeout(r, 100)); }
    throw Error('servidor indisponível');
  };
  const login = (l, s) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, senha: s }) });
  let servidor = await iniciar(); servidor.kill(); await once(servidor, 'exit');
  const db = new Database(path.join(temp, 'database.db'));
  const h = s => { const salt = crypto.randomBytes(16).toString('hex'); return [crypto.scryptSync(s, salt, 64).toString('hex'), salt]; };
  db.prepare("UPDATE usuarios SET login='gerente',pinHash=?,pinSalt=?,operacaoHash=?,operacaoSalt=?,deveTrocarSenha=0 WHERE perfil='administrador'").run(...h('Gerente123'), ...h('1234'));
  db.close();
  servidor = await iniciar();
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const dialogos = [], erros = [];
  try {
    const r = await login('gerente', 'Gerente123');
    const [nome, valor] = r.headers.get('set-cookie').split(';')[0].split('=');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addCookies([{ name: nome, value: valor, url: base }]);
    const p = await ctx.newPage();
    p.on('dialog', d => { dialogos.push(d.message()); void d.dismiss(); }); p.on('pageerror', e => erros.push(e.message));
    await p.goto(base + '/');
    await p.getByRole('button', { name: /Config/ }).first().click();
    await p.getByRole('button', { name: 'Usuários e senha de operação' }).click();
    const card = p.getByRole('form', { name: 'Senha de operação' });
    // Senha de operação: confirmação diferente, igual à do gerente e troca correta, com aviso na própria tela.
    const trocar = async (a, b) => { await card.getByLabel('Nova senha').fill(a); await card.getByLabel('Repetir senha').fill(b); await card.getByRole('button', { name: 'Salvar' }).click(); };
    await trocar('5555', '5556'); await card.getByText('As duas senhas digitadas não são iguais.').waitFor();
    await trocar('Gerente123', 'Gerente123'); await card.getByRole('alert').filter({ hasText: /diferentes/ }).waitFor();
    await trocar('5555', '5555'); await card.getByText('Senha de operação salva.').waitFor();
    assert.equal((await fetch(base + '/api/seguranca/verificar-pin', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${nome}=${valor}` }, body: JSON.stringify({ pin: '5555' }) })).status, 200);
    // Vendedor: cadastrar, nova senha, desativar (cancelar e confirmar) e ativar.
    await p.getByLabel('Nome', { exact: true }).fill('Joana'); await p.getByLabel('Login', { exact: true }).fill('joana'); await p.getByLabel('Senha provisória', { exact: true }).fill('Joana123');
    await p.getByRole('button', { name: 'Cadastrar vendedor' }).click(); await p.getByText('Vendedor Joana cadastrado.').waitFor();
    const linha = p.locator('article').filter({ hasText: 'joana' });
    await linha.getByRole('button', { name: 'Nova senha' }).click();
    await linha.getByLabel('Senha provisória de Joana').fill('Nova4567'); await linha.getByRole('button', { name: 'Salvar' }).click();
    await linha.getByText(/Senha provisória definida/).waitFor();
    assert.equal((await login('joana', 'Nova4567')).status, 200);
    await linha.getByRole('button', { name: 'Desativar' }).click();
    await linha.getByRole('group', { name: 'Confirmar desativação' }).getByRole('button', { name: 'Cancelar' }).click();
    await linha.getByRole('button', { name: 'Desativar' }).click();
    await linha.getByRole('group', { name: 'Confirmar desativação' }).getByRole('button', { name: 'Desativar' }).click();
    await linha.getByText('Usuário desativado.').waitFor();
    await linha.getByRole('button', { name: 'Ativar' }).click(); await linha.getByText('Usuário ativado.').waitFor();
    fs.mkdirSync('output', { recursive: true }); await p.screenshot({ path: 'output/config-usuarios.png', fullPage: true });
    // A linha do gerente não troca a senha dele por aqui.
    assert.equal(await p.locator('article').filter({ hasText: 'Gerente' }).getByRole('button', { name: 'Nova senha' }).count(), 0);
    await p.getByRole('button', { name: 'Sistema, senha do gerente e backups' }).click(); await p.getByText('Esqueceu a senha?').waitFor();
    await p.screenshot({ path: 'output/config-sistema.png' });
    assert.deepEqual(dialogos, [], 'caixas do navegador abertas: ' + dialogos.join(' | '));
    assert.deepEqual(erros, []);
    console.log('OK: senha de operação (erros e troca na tela) e vendedor (nova senha, desativar, ativar) sem caixas do navegador.');
  } finally { await browser.close(); servidor.kill(); await once(servidor, 'exit'); try { fs.rmSync(temp, { recursive: true, force: true }); } catch {} }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
