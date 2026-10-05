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
    const produtoNovo = await request('POST','/produtos',{nome:'Material novo',unidade:'un',precoVendaPadrao:50,custoPadrao:10,ativo:1});
    const linha = (p,q,preco,extras={})=>({produtoId:p.id,quantidade:q,unidade:p.unidade,precoUnitario:preco,desconto:0,...extras});
    const criar = (items,extras={},expected)=>request('POST','/vendas',{clienteId:cliente.id,data:'2026-09-08',formaPagamento:'vale',valorPago:0,descontoGeral:0,vencimento:'2099-10-08',autorizacaoPreco:{pin},items,...extras},expected);
    const get = id=>request('GET',`/vendas/${id}`);
    const editar = (v,items,expected)=>request('PUT',`/vendas/${v.id}`,{pin,data:v.data,desconto:0,items:items.map((i,n)=>({...i,id:i.id || `novo-${n}`}))},expected);
    const compra = await criar([linha(produto,2,10)]);
    const ultima = await criar([linha(produto,1,12)]);
    const outro = await request('POST','/clientes',{nome:'Outro cliente',documento:'98765432100',ativo:1});
    await criar([linha(produto,1,90)],{clienteId:outro.id});
    const cancelada = await criar([linha(produto,1,80)]);
    await request('POST',`/vendas/${cancelada.id}/cancelar`,{pin});
    const elegiveis = await request('GET',`/clientes/${cliente.id}/itens-devolucao`);
    assert.equal(elegiveis.find(i=>i.id===compra.items[0].id).preco,12);
    const retorno = q=>linha(produto,-q,12,{itemOrigemId:compra.items[0].id});
    const mista = await criar([linha(produtoNovo,1,50),retorno(1)]);
    assert.equal(mista.totalLiquido,38); assert.equal(mista.saldoRestante,38);
    const negativo=mista.items.find(i=>i.quantidade<0);
    assert.equal(negativo.total,-12); assert.equal(negativo.itemPrecoOrigemId,ultima.items[0].id);
    assert.equal((await get(compra.id)).items[0].quantidadeDisponivel,1);
    const livre = await criar([linha(produtoNovo,1,50),retorno(10)]);
    assert.equal(livre.totalLiquido,0);
    assert.equal(livre.creditoLinhaDevolucao,70);
    assert.equal(livre.bonusGeradoVenda,70);
    assert.ok((await request('GET',`/clientes/${cliente.id}/itens-devolucao`)).some(i=>i.id===compra.items[0].id));
    await request('POST',`/vendas/${livre.id}/cancelar`,{pin});
    await criar([retorno(1)],{clienteId:outro.id},409);
    await criar([retorno(1)],{autorizacaoPreco:{pin:'errado'}},403);
    await request('POST',`/vendas/${compra.id}/cancelar`,{pin},409);
    const editada = await editar(mista,mista.items.map(i=>i.id===negativo.id?{...i,quantidade:-0.5}:i));
    assert.equal(editada.totalLiquido,44); assert.equal((await get(compra.id)).items[0].quantidadeDisponivel,1.5);
    const pura = await criar([retorno(1.5)],{formaPagamento:'pix',vencimento:null});
    assert.equal(pura.totalLiquido,0); assert.equal(pura.creditoLinhaDevolucao,18);
    assert.equal(pura.bonusGeradoVenda,18);
    const repetida = await criar([retorno(0.1)]);
    assert.equal(repetida.creditoLinhaDevolucao,1.2);
    await request('POST',`/vendas/${repetida.id}/cancelar`,{pin});
    await request('POST',`/vendas/${compra.id}/devolucoes`,{pin,data:'2026-09-08',items:[{itemVendaId:compra.items[0].id,quantidade:0.1}]},400);
    await editar(pura,pura.items);
    assert.equal(db.prepare('SELECT valor FROM cliente_bonus_movimentos WHERE id=?').get('credito_devolucao_'+pura.id).valor,18);
    const usado = await criar([linha(produtoNovo,1,50)],{formaPagamento:'bonus',valorPago:18});
    await request('POST',`/vendas/${pura.id}/cancelar`,{pin},409);
    await editar(pura,pura.items.map(i=>({...i,quantidade:-1})),409);
    assert.equal((await get(pura.id)).creditoLinhaDevolucao,18);
    await request('POST',`/vendas/${usado.id}/cancelar`,{pin});
    await request('POST',`/vendas/${pura.id}/cancelar`,{pin});
    assert.equal((await get(compra.id)).items[0].quantidadeDisponivel,1.5);
    // Edição pode adicionar/remover linha, sem alterar o preço habitual com a devolução.
    const destino = await criar([linha(produtoNovo,1,50)]);
    const comRetorno = await editar(destino,[...destino.items,retorno(1)]);
    assert.equal(comRetorno.totalLiquido,38);
    await editar(comRetorno,comRetorno.items.filter(i=>i.quantidade>0));
    assert.equal((await get(compra.id)).items[0].quantidadeDisponivel,1.5);
    const antiga = await request('POST',`/vendas/${compra.id}/devolucoes`,{pin,data:'2026-09-08',items:[{itemVendaId:compra.items[0].id,quantidade:1}]});
    assert.equal(antiga.valorCredito,12);
    assert.equal(db.prepare('SELECT itemPrecoOrigemId FROM itens_devolucao WHERE devolucaoId=?').get(antiga.id).itemPrecoOrigemId,ultima.items[0].id);
    // Falha após inserir venda deve reverter também crédito e consumo da compra.
    db.exec("CREATE TRIGGER falha_linha BEFORE INSERT ON itens_venda WHEN NEW.quantidade<0 BEGIN SELECT RAISE(ABORT,'Falha simulada'); END");
    const n=db.prepare('SELECT COUNT(*) n FROM vendas').get().n;
    await criar([retorno(0.5)],{},500);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vendas').get().n,n);
    assert.equal((await get(compra.id)).items[0].quantidadeDisponivel,0.5);
    db.exec('DROP TRIGGER falha_linha');
    const ultimaComDesconto = await criar([linha(produto,1,20,{desconto:2})]);
    await criar([retorno(0.5)],{},409); // cotação anterior de R$ 12 ficou desatualizada
    const atualizada = (await request('GET',`/clientes/${cliente.id}/itens-devolucao`)).find(i=>i.id===compra.items[0].id);
    assert.equal(atualizada.preco,18);
    const final = await criar([{...retorno(0.5),precoUnitario:18}]);
    assert.equal(final.creditoLinhaDevolucao,9);
    assert.equal(final.items[0].itemPrecoOrigemId,ultimaComDesconto.items[0].id);
    assert.equal((await get(compra.id)).items[0].quantidadeDisponivel,0);
    const trocaMesmoProduto = await criar([linha(produto,1,20),linha(produto,-0.25,18,{itemOrigemId:ultimaComDesconto.items[0].id})]);
    assert.equal(trocaMesmoProduto.totalLiquido,15.5);
    assert.equal(trocaMesmoProduto.items.length,2);
    const relatorio = await request('GET',`/relatorios?clienteId=${cliente.id}`);
    const linhasTroca = relatorio.itensVendidos.filter(i=>i.vendaId===trocaMesmoProduto.id);
    assert.equal(linhasTroca.length,2);
    assert.equal(linhasTroca.reduce((s,i)=>s+i.valorVendaLiquido,0),15.5);
    assert.equal(relatorio.itensVendidos.find(i=>i.vendaId===final.id).valorVendaLiquido,-9);
    console.log('OK: último preço do cliente, canceladas excluídas, venda/vale com devolução, edição, crédito, consumo protegido, repetição e rollback.');
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { db?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
