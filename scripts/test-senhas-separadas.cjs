// Senha do gerente (login administrativo) e senha de operação (vendas) separadas.
// Roda o servidor compilado numa pasta temporária; não toca no banco real.
// Uso: node scripts/test-senhas-separadas.cjs [--porta-3000-com-script]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const SCRIPT_RESET = path.resolve('scripts/recuperacao/senha-gerente/RESETAR SENHA DO GERENTE.cmd');
const usarScriptReal = process.argv.includes('--porta-3000-com-script');

async function portaLivre() {
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r)); return port;
}
async function iniciar(temp, port) {
  const child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: temp, env: { ...process.env, DATA_DIR: temp, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return child; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  child.kill(); throw Error('Servidor de teste indisponível\n' + logs);
}
async function parar(child) { child.kill(); await once(child, 'exit'); }
function cliente(port) {
  let cookie = '';
  return async function req(method, url, body, esperado = 200) {
    const r = await fetch(`http://127.0.0.1:${port}/api${url}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const data = await r.json();
    assert.equal(r.status, esperado, `${method} ${url}: ${data.error || r.status}`);
    return data;
  };
}
const hash = senha => { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(senha, salt, 64).toString('hex') }; };

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-senhas-'));
  fs.writeFileSync(path.join(temp, 'mock_config.json'), '{"mockEnabled":false}');
  const port = usarScriptReal ? 3000 : await portaLivre();
  // 1) Cria o banco e simula uma instalação antiga: uma senha só, já conhecida pelos vendedores.
  let servidor = await iniciar(temp, port); await parar(servidor);
  const db = new Database(path.join(temp, 'database.db'));
  const antiga = hash('SenhaDaLoja1');
  db.prepare("UPDATE usuarios SET login='gerente', pinHash=?, pinSalt=?, operacaoHash=NULL, operacaoSalt=NULL, deveTrocarSenha=0, ativo=1 WHERE perfil='administrador'").run(antiga.hash, antiga.salt);
  db.prepare("DELETE FROM configuracoes WHERE chave='senhas_separadas_v1'").run();
  db.close();
  servidor = await iniciar(temp, port);
  try {
    const req = cliente(port);
    // 2) Migração: a senha antiga vira a de operação e o gerente precisa criar uma nova.
    const login = await req('POST', '/auth/login', { login: 'gerente', senha: 'SenhaDaLoja1' });
    assert.equal(login.usuario.deveTrocarSenha, 1, 'gerente deve trocar a senha no primeiro login');
    await req('GET', '/clientes', undefined, 403);
    const igual = await req('PUT', '/auth/senha', { novaSenha: 'SenhaDaLoja1' }, 400);
    assert.match(igual.error, /precisam ser diferentes/);
    await req('PUT', '/auth/senha', { novaSenha: 'SoDoGerente9' });
    await req('GET', '/clientes');
    // 3) A senha antiga continua liberando as vendas, mas não entra mais como gerente.
    await req('POST', '/seguranca/verificar-pin', { pin: 'SenhaDaLoja1', finalidade: 'alterar_preco' });
    await req('POST', '/seguranca/verificar-pin', { pin: 'SoDoGerente9' }, 403);
    await cliente(port)('POST', '/auth/login', { login: 'gerente', senha: 'SenhaDaLoja1' }, 403);
    // 4) Tela "Usuários e senha de operação": troca a senha de operação sem precisar da antiga.
    let status = await req('GET', '/seguranca/status');
    assert.equal(status.pinConfigurado, true); assert.equal(status.senhaGerenteConfigurada, true);
    await req('PUT', '/seguranca/senha-operacao', { novaSenha: 'SoDoGerente9' }, 400);
    await req('PUT', '/seguranca/senha-operacao', { novaSenha: '4321' });
    await req('POST', '/seguranca/verificar-pin', { pin: 'SenhaDaLoja1' }, 403);
    await req('POST', '/seguranca/verificar-pin', { pin: '4321' });
    // 5) Tela "Sistema, senha do gerente e backups": exige a senha atual do gerente e diferente da de operação.
    await req('PUT', '/seguranca/admin-pin', { pinAtual: '4321', novoPin: 'Outra123' }, 403);
    await req('PUT', '/seguranca/admin-pin', { pinAtual: 'SoDoGerente9', novoPin: '4321' }, 400);
    await req('PUT', '/seguranca/admin-pin', { pinAtual: 'SoDoGerente9', novoPin: 'Gerente2026' });
    await cliente(port)('POST', '/auth/login', { login: 'gerente', senha: 'Gerente2026' });
    // 6) Vendedor: a senha de operação não abre áreas do gerente.
    await req('POST', '/usuarios', { nome: 'Vendedor', login: 'vend1', senha: 'Vend1234' }, 201);
    const vendedor = cliente(port);
    await vendedor('POST', '/auth/login', { login: 'vend1', senha: 'Vend1234' });
    await vendedor('PUT', '/auth/senha', { novaSenha: 'Vend9999' });
    await vendedor('POST', '/seguranca/verificar-pin', { pin: '4321' });
    await vendedor('PUT', '/seguranca/senha-operacao', { novaSenha: '9999' }, 403);
    await vendedor('GET', '/usuarios', undefined, 403);
    // 7) Reset da senha do gerente (somente neste computador). A senha de operação não muda.
    // Executa o .cmd de verdade; fora da porta 3000, usa uma cópia apontada para o servidor de teste
    // (nunca redefine a senha do sistema instalado nesta máquina).
    await cliente(port)('POST', '/auth/reset-gerente', { senhaPadrao: 'Errada' }, 403);
    let script = SCRIPT_RESET;
    if (!usarScriptReal) {
      script = path.join(temp, 'reset-teste.cmd');
      fs.writeFileSync(script, fs.readFileSync(SCRIPT_RESET, 'utf8').replace('127.0.0.1:3000', `127.0.0.1:${port}`));
    }
    const r = spawnSync('cmd.exe', ['/c', script], { input: 'SIM\r\n\r\n', encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.match(r.stdout, /Senha do gerente redefinida/, r.stdout + r.stderr);
    const aposReset = cliente(port);
    const loginReset = await aposReset('POST', '/auth/login', { login: 'gerente', senha: 'Altinopolis' });
    assert.equal(loginReset.usuario.deveTrocarSenha, 1);
    await aposReset('PUT', '/auth/senha', { novaSenha: '4321' }, 400);
    await aposReset('PUT', '/auth/senha', { novaSenha: 'NovaDoGerente1' });
    await aposReset('POST', '/seguranca/verificar-pin', { pin: '4321' });
    await cliente(port)('POST', '/auth/login', { login: 'gerente', senha: 'Gerente2026' }, 403);
    // 8) A migração roda uma vez só: reiniciar não copia a senha de novo nem força nova troca.
    await parar(servidor); servidor = await iniciar(temp, port);
    const depois = await cliente(port)('POST', '/auth/login', { login: 'gerente', senha: 'NovaDoGerente1' });
    assert.equal(depois.usuario.deveTrocarSenha, 0);
    const auditoria = new Database(path.join(temp, 'database.db'), { readonly: true });
    const acoes = auditoria.prepare("SELECT acao FROM auditoria ORDER BY rowid").all().map(a => a.acao);
    auditoria.close();
    for (const acao of ['senha_operacao_alterada', 'senha_gerente_alterada', 'senha_gerente_redefinida_localmente']) assert.ok(acoes.includes(acao), 'auditoria: ' + acao);
    console.log(`OK: migração (senha antiga vira a de operação), senhas diferentes obrigatórias, troca de cada senha, vendedor sem acesso de gerente, reset pelo script .cmd e migração única.`);
  } finally {
    await parar(servidor);
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
