// Integração HTTP em base temporária vazia. Execute após npm run build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const Database = require('better-sqlite3');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-finalizacao-http-'));
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

    const data='2026-09-08';
    const criar=(valor,extras={},expected)=>request('POST','/vendas',{clienteId:cliente.id,data,formaPagamento:'vale',valorPago:0,descontoGeral:0,vencimento:'2099-10-08',autorizacaoPreco:{pin},items:[{produtoId:produto.id,quantidade:1,unidade:'metro',precoUnitario:valor,desconto:0}],...extras},expected);
    const get=id=>request('GET',`/vendas/${id}`);

    const vale = await criar(100, {observacoes:'Anotação existente'});
    const antes = await get(vale.id);
    const nota = 'Combinar retirada na sexta-feira.\n' + 'Detalhes '.repeat(30);
    const salvo = await request('PUT','/vales/'+vale.id+'/anotacao',{texto:nota,anterior:'Anotação existente'});
    assert.equal(salvo.observacoes,nota.trim());
    assert.equal(salvo.totalLiquido,antes.totalLiquido);assert.equal(salvo.saldoRestante,antes.saldoRestante);assert.equal(salvo.status,antes.status);
    await request('PUT','/vales/'+vale.id+'/anotacao',{texto:'conflito',anterior:'Anotação existente'},409);
    await request('PUT','/vales/'+vale.id+'/anotacao',{texto:'x'.repeat(2001),anterior:nota.trim()},400);
    const ordem = await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:data,vendaIds:[vale.id]});
    const ordemSalva = await request('PUT','/ordens-cobranca/'+ordem.id+'/anotacao',{texto:'Cobrar na próxima visita',anterior:ordem.observacao || ''});
    assert.equal(ordemSalva.observacao,'Cobrar na próxima visita');assert.equal(ordemSalva.saldo,ordem.saldo);assert.equal(ordemSalva.status,ordem.status);
    await request('PUT','/vales/'+vale.id+'/anotacao',{texto:'Vale vinculado',anterior:nota.trim()});
    db.prepare('UPDATE vendas SET finalizadoAt=? WHERE id=?').run(new Date().toISOString(),vale.id);
    db.prepare('UPDATE ordens_cobranca SET finalizadoAt=? WHERE id=?').run(new Date().toISOString(),ordem.id);
    const fechado=await request('PUT','/vales/'+vale.id+'/anotacao',{texto:'Cliente retirou',anterior:'Vale vinculado'});
    assert.ok(fechado.finalizadoAt);assert.equal(fechado.saldoRestante,antes.saldoRestante);
    await request('PUT','/ordens-cobranca/'+ordem.id+'/anotacao',{texto:'',anterior:'Cobrar na próxima visita'});
    assert.equal((await get(vale.id)).observacoes,'Cliente retirou');
    const lista=await request('GET','/ordens-cobranca');assert.equal(lista.find(o=>o.id===ordem.id).observacao,null);
    await request('PUT','/vales/inexistente/anotacao',{texto:'teste',anterior:''},404);
    console.log('OK: anotações de vale e ordem persistidas, histórico preservado, conflito detectado, limite validado e saldos inalterados em documentos vinculados/finalizados.');
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { db?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
