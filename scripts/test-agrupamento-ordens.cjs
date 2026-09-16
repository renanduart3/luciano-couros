// Integração HTTP em base temporária vazia. Execute após npm run build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const Database = require('better-sqlite3');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-reabertura-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [path.resolve('dist/server.cjs')], {
    cwd: temp, env: { ...process.env, DATA_DIR: temp, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  let cookie = '';
  const base = `http://127.0.0.1:${port}/api`;
  async function request(method, url, body, expected) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const data = await response.json();
    if (expected) assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(data)}`);
    else assert.ok(response.ok, `${method} ${url}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  let db;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await request('GET', '/health'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, logs);
    const pin = 'TesteReabertura123';
    await request('POST', '/auth/configurar-gerente', { nome: 'Gerente teste', senha: pin });
    await request('POST', '/auth/login', { login: 'gerente', senha: pin });
    db = new Database(path.join(temp, 'database.db'));
    const cliente = await request('POST', '/clientes', { nome: 'Cliente teste', documento: '12345678901', ativo: 1 });
    const produto = await request('POST', '/produtos', { nome: 'Material teste', unidade: 'metro', precoVendaPadrao: 1, custoPadrao: 0.5, ativo: 1 });

    const criar = async () => request('POST', '/vendas', { clienteId: cliente.id, data: '2026-09-11', formaPagamento: 'vale', valorPago: 0, vencimento: '2099-10-08', items: [{ produtoId: produto.id, quantidade: 100, unidade: 'metro', precoUnitario: 1, desconto: 0 }] });
    const a = await criar(), b = await criar();
    const pagar = (alocacoes, extras = {}, expected) => request('POST', `/clientes/${cliente.id}/carteira/recebimentos`, { data: '2026-09-16', formaPagamento: 'pix', valorRecebido: alocacoes.reduce((s,a) => s+a.valor,0), alocacoes, ...extras }, expected);
    await pagar([{ vendaId:a.id, valor:10 }, { vendaId:b.id, valor:10 }], {}, 409);
    assert.equal((await request('GET', `/vendas/${a.id}`)).saldoRestante, 100);
    await pagar([{ vendaId:a.id, valor:10 }]);
    const ordem = await request('POST', '/ordens-cobranca', { clienteId:cliente.id, dataEmissao:'2026-09-16', vendaIds:[a.id,b.id] });
    await pagar([{ vendaId:a.id, valor:10 }], {}, 409);
    await request('POST','/pagamentos',{clienteId:cliente.id,vendaId:a.id,data:'2026-09-16',valor:10,formaPagamento:'pix'},409);
    await request('POST','/pagamentos',{clienteId:cliente.id,data:'2026-09-16',valor:10,formaPagamento:'pix'},409);
    for (const route of [`/vales/${a.id}/cancelar`, `/vendas/${a.id}/cancelar`, `/vendas/${a.id}/devolucoes`]) await request('POST', route, { pin }, 409);
    await request('PUT', `/vales/${a.id}`, {pin},409);
    await request('PUT', `/vendas/${a.id}`, {pin},409);
    await pagar([{ vendaId:a.id, valor:90 }, { vendaId:b.id, valor:20 }], {ordemCobrancaId:ordem.id});
    // Vale totalmente pago continua protegido enquanto a ordem estiver aberta.
    await request('PUT', `/vales/${a.id}`, {pin},409);
    const c = await criar();
    await pagar([{ vendaId:c.id, valor:10 }], {ordemCobrancaId:ordem.id},409);
    await request('POST', `/ordens-cobranca/${ordem.id}/encerrar`, {pin,status:'cancelada',motivo:'Teste de liberação'});
    await pagar([{vendaId:b.id,valor:10}]);
    const d = await criar(), e = await criar();
    const quitada = await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:'2026-09-16',vendaIds:[d.id,e.id]});
    await pagar([{vendaId:d.id,valor:100},{vendaId:e.id,valor:100}],{ordemCobrancaId:quitada.id});
    assert.equal((await request('GET','/ordens-cobranca')).find(o=>o.id===quitada.id).status,'quitada');
    console.log('OK: pagamento individual, agrupamento obrigatório, bloqueios de alteração, vale quitado em ordem aberta, pagamento pela ordem, rejeição de vale externo, cancelamento e quitação.');
  } catch (error) {
    console.error(logs.slice(-4000));
    throw error;
  } finally {
    db?.close();
    child.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
