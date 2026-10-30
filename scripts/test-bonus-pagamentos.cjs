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
    const saldo=async()=>Number((await request('GET',`/clientes/${cliente.id}/carteira/resumo`)).saldoBonus);
    const creditar=valor=>db.prepare("INSERT INTO cliente_bonus_movimentos(id,clienteId,data,tipo,valor,observacao) VALUES (?,?,?,'credito',?,'Crédito de teste')").run(require('node:crypto').randomUUID(),cliente.id,data,valor);
    const pagar=(v,cash,bonus,extra={})=>request('POST',`/clientes/${cliente.id}/carteira/recebimentos`,{data,valorRecebido:cash,bonusUtilizado:bonus,formaPagamento:'pix',alocacoes:[{vendaId:v.id,valor:cash+bonus}],...extra});
    const editar=(id,cash,bonus,extra={},expected)=>request('PUT',`/recebimentos-cliente/${id}`,{pin,data,status:'compensado',formaPagamento:'pix',valorRecebido:cash,bonusUtilizado:bonus,alocacoes:[],distribuicaoAutomatica:true,...extra},expected);
    const estornar=(id,expected)=>request('POST',`/recebimentos-cliente/${id}/cancelar`,{pin},expected);
    // Diferença editável: desconto quita saldo sem aumentar o dinheiro recebido.
    for (const desconto of [60,120]) {
      const vd=await criar(520);
      const rd=await pagar(vd,400,0,{descontoRecebimento:desconto,alocacoes:[{vendaId:vd.id,valor:400+desconto}]});
      let atual=await get(vd.id);
      assert.equal(atual.saldoRestante,120-desconto);
      assert.equal(atual.financeiro.recebido,400);
      assert.equal(atual.financeiro.restante,120-desconto);
      await editar(rd.id,400,0);
      assert.equal((await get(vd.id)).saldoRestante,120-desconto);
      await estornar(rd.id);
      assert.equal((await get(vd.id)).saldoRestante,520);
    }
    // Bônus excedente pode ser reduzido ou zerado e não reaparece na edição.
    for (const dispensado of [5,10]) {
      const ve=await criar(520);
      const re=await pagar(ve,530,0,{bonusDispensado:dispensado,alocacoes:[{vendaId:ve.id,valor:520}]});
      assert.equal(await saldo(),10-dispensado);
      assert.equal((await get(ve.id)).financeiro.bonus,10-dispensado);
      await editar(re.id,530,0);
      assert.equal(await saldo(),10-dispensado);
      await estornar(re.id);
      assert.equal(await saldo(),0);
    }
    // Ajuste livre: bônus acima do excedente, inclusive com pagamento menor que a dívida.
    for (const [cash, aplicado, desconto, dispensado, esperado] of [[530,520,-10,-40,50],[400,520,120,-50,50],[400,300,-100,100,0]]) {
      const v=await criar(520);
      const r=await pagar(v,cash,0,{descontoRecebimento:desconto,bonusDispensado:dispensado,alocacoes:[{vendaId:v.id,valor:aplicado}]});
      assert.equal(await saldo(),esperado);
      assert.equal((await get(v.id)).saldoRestante,520-aplicado);
      assert.equal((await get(v.id)).financeiro.restante,520-aplicado);
      assert.equal((await get(v.id)).financeiro.bonus,esperado);
      await editar(r.id,cash,0);
      assert.equal(await saldo(),esperado);
      assert.equal((await get(v.id)).saldoRestante,520-aplicado);
      await estornar(r.id);
      assert.equal(await saldo(),0);
      assert.equal((await get(v.id)).saldoRestante,520);
    }
    // Ordem com dois vales e duas formas: ajuste livre, saldo e reversão em conjunto.
    for (const [aplicado, desconto, dispensado, bonusEsperado] of [[260,60,-25,50],[150,-50,50,0]]) {
      const a=await criar(260), b=await criar(260);
      const o=await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:data,vendaIds:[a.id,b.id],parcelas:[]});
      const lote=await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,{chave:require('node:crypto').randomUUID(),pagamentos:[a,b].map(v=>({
        data,formaPagamento:'pix',valorRecebido:200,descontoRecebimento:desconto,bonusDispensado:dispensado,ordemCobrancaId:o.id,alocacoes:[{vendaId:v.id,valor:aplicado}]
      }))});
      assert.equal(await saldo(),bonusEsperado);
      for(const v of [a,b]) assert.equal((await get(v.id)).saldoRestante,260-aplicado);
      for(const r of lote.recebimentos) await estornar(r.id);
      assert.equal(await saldo(),0);
      for(const v of [a,b]) assert.equal((await get(v.id)).saldoRestante,260);
    }
    // Dívida maior que a original: acréscimo nos próprios vales e reversão integral.
    for (const emOrdem of [false,true]) {
      const a=await criar(60), b=emOrdem ? await criar(40) : null;
      const ids=b?[a,b]:[a];
      const o=emOrdem ? await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:data,vendaIds:ids.map(v=>v.id),parcelas:[{vencimento:'2099-12-01',valor:100}]}) : null;
      const pagamentos=[{data,formaPagamento:'pix',valorRecebido:80,ordemCobrancaId:o?.id,
        acrescimosDivida:ids.map(v=>({vendaId:v.id,valor:v.id===a.id?120:80})),alocacoes:[{vendaId:a.id,valor:80}]}];
      const chave=require('node:crypto').randomUUID();
      const lote=await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,{chave,pagamentos});
      await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,{chave,pagamentos});
      assert.equal((await get(a.id)).totalLiquido,180);
      assert.equal((await get(a.id)).saldoRestante,100);
      assert.equal((await get(a.id)).financeiro.restante,100);
      if(b) {
        assert.equal((await get(b.id)).totalLiquido,120);
        assert.equal((await get(b.id)).saldoRestante,120);
        const ordem=db.prepare('SELECT * FROM ordens_cobranca WHERE id=?').get(o.id);
        assert.equal(ordem.totalOriginal,300);assert.equal(ordem.saldo,220);
        assert.equal(db.prepare('SELECT SUM(valor) total FROM ordem_cobranca_parcelas WHERE ordemId=?').get(o.id).total,300);
      }
      await editar(lote.recebimentos[0].id,80,0,{ordemCobrancaId:o?.id});
      await estornar(lote.recebimentos[0].id);
      assert.equal((await get(a.id)).totalLiquido,60);assert.equal((await get(a.id)).saldoRestante,60);
      if(b) {
        assert.equal((await get(b.id)).totalLiquido,40);assert.equal((await get(b.id)).saldoRestante,40);
        assert.equal(db.prepare('SELECT saldo FROM ordens_cobranca WHERE id=?').get(o.id).saldo,100);
        assert.equal(db.prepare('SELECT SUM(valor) total FROM ordem_cobranca_parcelas WHERE ordemId=?').get(o.id).total,100);
      }
      assert.equal(await saldo(),0);
    }
    // Falha posterior no lote não deixa acréscimo sem pagamento.
    const vaa=await criar(100);
    await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,{chave:require('node:crypto').randomUUID(),pagamentos:[{
      data,formaPagamento:'pix',valorRecebido:80,acrescimosDivida:[{vendaId:vaa.id,valor:200}],alocacoes:[{vendaId:vaa.id,valor:80}]
    },{data,formaPagamento:'invalida',valorRecebido:1,alocacoes:[{vendaId:vaa.id,valor:1}]}]},400);
    assert.equal((await get(vaa.id)).totalLiquido,100);assert.equal((await get(vaa.id)).saldoRestante,100);
    // Números vazios ou só com espaços são rejeitados para ambas as famílias.
    for (const forma of ['cheque_emitente','cheque_terceiro','duplicata_emitente','duplicata_terceiro']) {
      const v=await criar(100);
      for (const numeroDocumento of ['', '   ']) await request('POST',`/clientes/${cliente.id}/carteira/recebimentos`,{
        data,formaPagamento:forma,valorRecebido:100,alocacoes:[{vendaId:v.id,valor:100}],
        titulos:[{tipo:forma,nomeTitular:'Teste',documentoTitular:'12345678901',valor:100,vencimento:'2099-12-01',numeroDocumento}]
      },400);
      assert.equal((await get(v.id)).saldoRestante,100);
    }
    // Ordem: gravação em lote é atômica e repetir o envio não duplica o ajuste.
    const vo=await criar(520);
    const od=await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:data,vendaIds:[vo.id],parcelas:[]});
    const lote={chave:require('node:crypto').randomUUID(),pagamentos:[{data,formaPagamento:'pix',valorRecebido:400,bonusUtilizado:0,descontoRecebimento:120,ordemCobrancaId:od.id,alocacoes:[{vendaId:vo.id,valor:520}]}]};
    const lo=await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,lote);
    const repetido=await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,lote);
    assert.equal(repetido.recebimentos[0].id,lo.recebimentos[0].id);
    assert.equal((await get(vo.id)).saldoRestante,0);
    assert.equal((await get(vo.id)).financeiro.recebido,400);
    await estornar(lo.recebimentos[0].id);
    assert.equal((await get(vo.id)).saldoRestante,520);
    const vm=await criar(520);
    const om=await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:data,vendaIds:[vm.id],parcelas:[]});
    const lm=await request('POST',`/clientes/${cliente.id}/carteira/recebimentos-lote`,{chave:require('node:crypto').randomUUID(),pagamentos:[
      {data,formaPagamento:'pix',valorRecebido:265,bonusDispensado:5,ordemCobrancaId:om.id,alocacoes:[{vendaId:vm.id,valor:260}]},
      {data,formaPagamento:'avista_dinheiro',valorRecebido:265,bonusDispensado:5,ordemCobrancaId:om.id,alocacoes:[{vendaId:vm.id,valor:260}]}
    ]});
    assert.equal((await get(vm.id)).saldoRestante,0);assert.equal(await saldo(),0);
    for (const r of lm.recebimentos) await estornar(r.id);
    assert.equal((await get(vm.id)).saldoRestante,520);
    // Recusa do cheque reabre também a diferença dispensada, sem crédito fantasma.
    const vch=await criar(520);
    const rch=await pagar(vch,400,0,{descontoRecebimento:120,formaPagamento:'cheque_terceiro',titulos:[{tipo:'cheque_terceiro',nomeTitular:'Maria da Silva',documentoTitular:'12345678901',numeroDocumento:'DIF-1',valor:400,vencimento:'2099-12-01',status:'aguardando'}],alocacoes:[{vendaId:vch.id,valor:520}]});
    assert.equal((await get(vch.id)).financeiro.restantePresumido,0);
    const tch=db.prepare('SELECT id FROM recebimento_titulos WHERE recebimentoId=? AND deletedAt IS NULL').get(rch.id);
    await request('PUT',`/recebimento-titulos/${tch.id}/status`,{pin,status:'recusado',motivo:'Teste de diferença'});
    assert.equal((await get(vch.id)).saldoRestante,520);
    assert.equal((await get(vch.id)).financeiro.restante,520);
    assert.equal(await saldo(),0);
    const invalido=await criar(100);
    await request('POST',`/clientes/${cliente.id}/carteira/recebimentos`,{data,formaPagamento:'pix',valorRecebido:80,descontoRecebimento:30,alocacoes:[{vendaId:invalido.id,valor:100}]},400);
    creditar(20);
    const v=await criar(100), r=await pagar(v,80,20);
    assert.equal(await saldo(),0); assert.equal((await get(v.id)).saldoRestante,0);
    assert.equal((await get(v.id)).financeiro.creditoUtilizado,20);
    await editar(r.id,90,10); assert.equal(await saldo(),10); assert.equal((await get(v.id)).valorPago,100);
    await editar(r.id,70,30,{},409); assert.equal(await saldo(),10);
    assert.equal(db.prepare('SELECT bonusUtilizado FROM recebimentos_cliente WHERE id=?').get(r.id).bonusUtilizado,10);
    await estornar(r.id); assert.equal(await saldo(),20); assert.equal((await get(v.id)).saldoRestante,100);
    await estornar(r.id,409); assert.equal(await saldo(),20);
    // Checkout registra dinheiro e crédito separadamente; cancelamento desfaz ambos.
    const sale=await criar(100,{formaPagamento:'pix',valorPago:80,bonusUtilizado:20});
    const sr=db.prepare('SELECT r.* FROM recebimentos_cliente r JOIN recebimento_alocacoes a ON a.recebimentoId=r.id WHERE a.vendaId=?').get(sale.id);
    assert.equal(sr.valorRecebido,80); assert.equal(sr.bonusUtilizado,20); assert.equal(sr.valorAplicado,100);
    assert.equal((await get(sale.id)).financeiro.creditoUtilizado,20);
    await request('POST',`/vendas/${sale.id}/cancelar`,{pin}); assert.equal(await saldo(),20);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM recebimento_alocacoes WHERE recebimentoId=? AND deletedAt IS NULL').get(sr.id).n,0);
    // Recusar só o cheque preserva o bônus; reconfirmar e editar não o apaga.
    const titulo={tipo:'cheque_emitente',nomeTitular:'Cliente teste',documentoTitular:'12345678901',numeroDocumento:'BONUS-1',valor:80,vencimento:'2099-12-01',status:'aguardando'};
    const vc=await criar(100), rc=await pagar(vc,80,20,{formaPagamento:'cheque_emitente',titulos:[titulo]});
    let finance=(await get(vc.id)).financeiro;
    assert.equal(finance.recebido,20); assert.equal(finance.aguardando,80); assert.equal(finance.restantePresumido,0);
    let tc=db.prepare('SELECT id FROM recebimento_titulos WHERE recebimentoId=? AND deletedAt IS NULL').get(rc.id);
    await request('PUT',`/recebimento-titulos/${tc.id}/status`,{pin,status:'recusado',motivo:'Teste'});
    assert.equal((await get(vc.id)).valorPago,20); assert.equal(await saldo(),0);
    assert.equal((await request('GET',`/recebimentos-cliente/${rc.id}/gerenciar`)).statusPagamento,'compensado');
    await request('PUT',`/recebimento-titulos/${tc.id}/status`,{pin,status:'compensado',dataCompensacao:data});
    assert.equal((await get(vc.id)).valorPago,100); assert.equal(await saldo(),0);
    await estornar(rc.id); assert.equal(await saldo(),20);
    const checkoutCheque=await criar(100,{formaPagamento:'cheque_emitente',valorPago:80,bonusUtilizado:20,instrumentoRecebimento:{emitente:'Cliente teste',numeroDocumento:'CHECKOUT',vencimento:'2099-12-01',cpfTitular:'12345678901',banco:''}});
    assert.equal(checkoutCheque.financeiro.aguardando,80); assert.equal(checkoutCheque.financeiro.creditoUtilizado,20);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM instrumentos_recebimento WHERE vendaId=? AND deletedAt IS NULL').get(checkoutCheque.id).n,0);
    await request('POST',`/vendas/${checkoutCheque.id}/cancelar`,{pin}); assert.equal(await saldo(),20);
    // Bônus integral permite finalizar e reabrir antes de corrigir.
    const vb=await criar(20,{formaPagamento:'bonus',valorPago:20});
    await request('POST',`/vendas/${vb.id}/finalizar`,{pin,destinoRestante:'novo_vale'});
    const pf=await request('GET',`/finalizacoes/vale/${vb.id}/reabertura`);
    await request('POST',`/finalizacoes/vale/${vb.id}/reabertura`,{pin,revisao:pf.revisao});
    const pb=await request('GET',`/reabertura-pagamentos/vale/${vb.id}`);
    await request('POST',`/reabertura-pagamentos/vale/${vb.id}`,{pin,revisao:pb.revisao});
    assert.equal(await saldo(),20); assert.equal((await get(vb.id)).saldoRestante,20);
    const cancelarVale=await criar(100,{formaPagamento:'vale',valorPago:0,bonusUtilizado:20});
    assert.equal(cancelarVale.saldoRestante,80);
    await request('POST',`/vales/${cancelarVale.id}/cancelar`,{pin}); assert.equal(await saldo(),20);
    await request('POST',`/vales/${cancelarVale.id}/cancelar`,{pin},409); assert.equal(await saldo(),20);
    // Pagamento compartilhado conserva crédito e reabre todos os vales.
    const va=await criar(60), vz=await criar(40);
    const o=await request('POST','/ordens-cobranca',{clienteId:cliente.id,dataEmissao:data,vendaIds:[va.id,vz.id],parcelas:[]});
    const ro=await pagar(va,80,20,{ordemCobrancaId:o.id,alocacoes:[{vendaId:va.id,valor:60},{vendaId:vz.id,valor:40}]});
    const fa=(await get(va.id)).financeiro,fz=(await get(vz.id)).financeiro;
    assert.equal(fa.creditoUtilizado+fz.creditoUtilizado,20);
    await estornar(ro.id); assert.equal(await saldo(),20);
    assert.equal((await get(va.id)).saldoRestante,60); assert.equal((await get(vz.id)).saldoRestante,40);
    const novo=await pagar(va,80,20,{ordemCobrancaId:o.id,alocacoes:[{vendaId:va.id,valor:60},{vendaId:vz.id,valor:40}]});
    const itens=[{tipo:'recebimento',id:novo.id}], acao='estornar';
    const plano=await request('POST',`/ordens-cobranca/${o.id}/pagamentos/previa`,{acao,itens});
    let projetada=await request('POST',`/ordens-cobranca/${o.id}/pagamentos/acoes`,{acao,itens,pin,revisao:plano.revisao});
    const proj=projetada.projecoes[0];
    projetada=await request('PUT',`/ordens-cobranca/${o.id}/projecoes/${proj.id}`,{pin,revisao:proj.revisao,data,formaPagamento:'pix',valorRecebido:85,bonusUtilizado:15});
    assert.equal(projetada.projecoes[0].dados.bonusUtilizado,15); assert.equal(await saldo(),20);
    // Falha tardia reverte carteira, venda, pagamento e alocação.
    const before=db.prepare('SELECT COUNT(*) n FROM vendas').get().n;
    db.exec("CREATE TRIGGER falha_bonus BEFORE INSERT ON cliente_bonus_movimentos WHEN NEW.tipo='debito' BEGIN SELECT RAISE(ABORT,'Falha simulada'); END");
    await criar(100,{formaPagamento:'pix',valorPago:80,bonusUtilizado:20},500);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vendas').get().n,before); assert.equal(await saldo(),20);
    db.exec('DROP TRIGGER falha_bonus');
    // Formato antigo: débito de bônus sem recebimento continua reversível.
    const legado=await criar(20);
    db.prepare("INSERT INTO cliente_bonus_movimentos(id,clienteId,vendaId,data,tipo,valor,observacao) VALUES ('bonus-legado',?,?,?,'debito',20,'Crédito aplicado na venda #123')").run(cliente.id,legado.id,data);
    db.prepare("UPDATE vendas SET valorPago=20,saldoRestante=0,status='paga' WHERE id=?").run(legado.id);
    assert.equal((await get(legado.id)).financeiro.creditoUtilizado,20);
    await request('POST',`/vendas/${legado.id}/finalizar`,{pin,destinoRestante:'novo_vale'});
    const legadoFinal=await request('GET',`/finalizacoes/vale/${legado.id}/reabertura`);
    await request('POST',`/finalizacoes/vale/${legado.id}/reabertura`,{pin,revisao:legadoFinal.revisao});
    const pl=await request('GET',`/reabertura-pagamentos/vale/${legado.id}`);
    await request('POST',`/reabertura-pagamentos/vale/${legado.id}`,{pin,revisao:pl.revisao});
    assert.equal(await saldo(),20); assert.equal((await get(legado.id)).saldoRestante,20);
    console.log('OK: bônus misto, edição, saldo insuficiente, estorno repetido, checkout, títulos recusados/reconfirmados, finalização, rateio, rollback e legado.');
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { db?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
