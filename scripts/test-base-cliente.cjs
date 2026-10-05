// Testes HTTP em cópias descartáveis de um backup real. Nunca abre a origem para escrita.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { diagnosticar } = require('./conciliar-financeiro.cjs');
const arquivo = process.argv[2], saida = process.argv[3];
if (!arquivo || !saida) throw Error('Uso: node scripts/test-base-cliente.cjs base.db relatorio.json');
if (fs.existsSync(saida)) throw Error('Relatório já existe.');
const resultados = [];
const pin = crypto.randomBytes(20).toString('hex');
async function cenario(nome, executar) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-base-real-'));
  const origem = new Database(path.resolve(arquivo), { readonly: true, fileMustExist: true });
  await origem.backup(path.join(temp, 'database.db')); origem.close();
  fs.writeFileSync(path.join(temp, 'mock_config.json'), '{"mockEnabled":false}');
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const child = spawn(process.execPath, [path.resolve('dist/server.cjs')], { cwd: temp, env: { ...process.env, DATA_DIR: temp, PORT: String(port) }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  let db, cookie = '';
  async function req(method, url, body, expected = 200) {
    const r = await fetch(`http://127.0.0.1:${port}/api${url}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const data = await r.json();
    if (expected !== null) assert.equal(r.status, expected, `${method} ${url}: ${data.error || r.status}`);
    return expected === null ? { status: r.status, erro: data.error, data } : data;
  }
  try {
    let ready = false;
    for (let i=0;i<150;i++) { try { await req('GET','/health'); ready=true; break; } catch { await new Promise(r=>setTimeout(r,100)); } }
    assert.ok(ready, 'Servidor de teste indisponível');
    db = new Database(path.join(temp,'database.db'));
    const salt = crypto.randomBytes(16).toString('hex');
    // Credencial exclusivamente na cópia descartável; contas da origem são preservadas.
    db.prepare("UPDATE usuarios SET login='auditoria_local', pinHash=?,pinSalt=?,ativo=1,deveTrocarSenha=0 WHERE id=(SELECT id FROM usuarios WHERE perfil='administrador' LIMIT 1)").run(crypto.scryptSync(pin,salt,64).toString('hex'),salt);
    await req('POST','/auth/login',{login:'auditoria_local',senha:pin});
    const evidencias = await executar({db,req,pin});
    assert.deepEqual(db.pragma('quick_check').map(x=>x.quick_check),['ok']);
    resultados.push({nome,sucesso:true,evidencias}); console.log('OK: '+nome);
  } catch(e) { resultados.push({nome,sucesso:false,erro:e.message}); console.log('FALHOU: '+nome+': '+e.message); }
  finally { db?.close(); child.kill(); await once(child,'exit'); }
}
async function main() {
  await cenario('Diagnóstico após migração e prévias de todos os recebimentos ativos', async ({db,req}) => {
    const diagnostico = diagnosticar(db);
    const previas=[];
    for(const r of db.prepare("SELECT id FROM recebimentos_cliente WHERE deletedAt IS NULL AND status IN ('ativo','recusado')").all()) {
      const p=await req('GET',`/reabertura-pagamentos/recebimento/${r.id}`,undefined,null);
      assert.ok([200,409].includes(p.status));
      previas.push({id:r.id,status:p.status,motivo:p.erro});
    }
    return {diagnostico,previas};
  });
  await cenario('Vale 621: origem, replanejamento e reabertura da ordem 29', async ({db,req,pin}) => {
    const v=db.prepare('SELECT * FROM vendas WHERE numeroSequencial=621').get(); assert.ok(v);
    const antes=await req('GET',`/vendas/${v.id}`);
    assert.equal(antes.origemSaldo.ordem.numero,29); assert.equal(antes.totalLiquido,2029.86);
    assert.deepEqual(antes.origemSaldo.vales.map(v=>v.numero).sort(),[206,227,228,229,313]);
    const repl=await req('PUT',`/vales/${v.id}`,{pin,observacoes:'Conferência de prazo em cópia',parcelas:[{valor:2029.86,vencimento:'2026-12-20'}]});
    assert.equal(repl.totalLiquido,2029.86); assert.equal(repl.vencimento,'2026-12-20');
    const ordem=antes.origemSaldo.ordem.id;
    const p=await req('GET',`/finalizacoes/ordem/${ordem}/reabertura`);
    await req('POST',`/finalizacoes/ordem/${ordem}/reabertura`,{pin,revisao:p.revisao,motivo:'Teste da reclamação 621'});
    const depois=await req('GET',`/vendas/${v.id}`); assert.equal(depois.totalLiquido,2029.86); assert.equal(depois.saldoRestante,2029.86);
    assert.equal(db.prepare('SELECT finalizadoAt FROM ordens_cobranca WHERE id=?').get(ordem).finalizadoAt,null);
    return {numero:621,valor:depois.totalLiquido,origem:depois.origemSaldo,origens:db.prepare('SELECT numeroValeOrigem,valorTransferido FROM vale_residual_origens WHERE valeResidualId=?').all(v.id)};
  });
  await cenario('Estorno e exclusão de recebimentos reais elegíveis', async ({db,req,pin}) => {
    const saidas=[];
    for(const r of db.prepare("SELECT id,formaPagamento FROM recebimentos_cliente WHERE deletedAt IS NULL AND status='ativo' ORDER BY createdAt DESC").all()) {
      const p=await req('GET',`/reabertura-pagamentos/recebimento/${r.id}`,undefined,null); if(p.status!==200)continue;
      await req('POST',`/reabertura-pagamentos/recebimento/${r.id}`,{pin,revisao:p.data.revisao,motivo:'Teste de exclusão em cópia'});
      assert.equal(db.prepare('SELECT status FROM recebimentos_cliente WHERE id=?').get(r.id).status,'cancelado');
      for(const t of ['recebimento_alocacoes','pagamentos','cliente_bonus_movimentos','recebimento_titulos']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE recebimentoId=? AND deletedAt IS NULL`).get(r.id).n,0,t);
      await req('POST',`/reabertura-pagamentos/recebimento/${r.id}`,{pin,revisao:p.data.revisao,motivo:'Repetição'},409);
      saidas.push({id:r.id,forma:r.formaPagamento,vales:p.data.vales});
    }
    assert.ok(saidas.length>0); return saidas;
  });
  await cenario('Cancelamento de ordens reais elegíveis', async ({db,req,pin}) => {
    const saidas=[];
    for(const o of db.prepare("SELECT id,numeroSequencial FROM ordens_cobranca WHERE deletedAt IS NULL AND status IN ('aberta','quitada') AND finalizadoAt IS NULL").all()) {
      const p=await req('GET',`/ordens-cobranca/${o.id}/cancelamento/previa`,undefined,null); if(p.status!==200){saidas.push({numero:o.numeroSequencial,status:p.status,motivo:p.erro});continue;}
      await req('POST',`/ordens-cobranca/${o.id}/encerrar`,{pin,status:'cancelada',revisao:p.data.revisao,motivo:'Teste em cópia'});
      assert.equal(db.prepare('SELECT status FROM ordens_cobranca WHERE id=?').get(o.id).status,'cancelada');
      saidas.push({numero:o.numeroSequencial,status:200});
    }
    assert.ok(saidas.some(s=>s.status===200)); return saidas;
  });

  await cenario('Vale 621 em nova ordem: referência curta e cadeia preservada', async ({db,req,pin}) => {
    const v=db.prepare('SELECT * FROM vendas WHERE numeroSequencial=621').get();
    const origemAntes=db.prepare('SELECT * FROM ordens_cobranca WHERE numeroSequencial=29').get();
    const ordem=await req('POST','/ordens-cobranca',{clienteId:v.clienteId,dataEmissao:'2026-10-05',vendaIds:[v.id],parcelas:[]},201);
    assert.equal(ordem.vales[0].descricao,'Devedor da ordem #29');
    assert.deepEqual(ordem.vales[0].origemSaldo.vales.map(v=>v.numero).sort(),[206,227,228,229,313]);
    await req('POST',`/clientes/${v.clienteId}/carteira/recebimentos`,{data:'2026-10-05',formaPagamento:'pix',valorRecebido:10,bonusUtilizado:0,ordemCobrancaId:ordem.id,alocacoes:[{vendaId:v.id,valor:10}]},201);
    const final=await req('POST',`/ordens-cobranca/${ordem.id}/finalizar`,{pin,destinoRestante:'novo_vale',zerarExcedente:false});
    const residual=await req('GET',`/vendas/${final.valeResidual.id}`);
    assert.equal(residual.totalLiquido,2019.86);
    assert.equal(residual.origemSaldo.descricao,`Devedor da ordem #${ordem.numeroSequencial}`);
    assert.equal(residual.origemSaldo.vales[0].numero,621);
    const anterior=await req('GET',`/vendas/${v.id}`);
    assert.equal(anterior.origemSaldo.ordem.numero,29);
    assert.deepEqual(db.prepare('SELECT * FROM ordens_cobranca WHERE numeroSequencial=29').get(),origemAntes);
    return {novaOrdem:ordem.numeroSequencial,descricao:residual.origemSaldo.descricao,valor:residual.totalLiquido,cadeia:[residual.numeroSequencial,621,29]};
  });
  await cenario('Digitação inválida e alterações reais de vale sem perda de pagamentos', async ({db,req,pin}) => {
    const v=db.prepare('SELECT * FROM vendas WHERE numeroSequencial=621').get();
    const antes=db.prepare('SELECT * FROM vendas WHERE id=?').get(v.id);
    for(const vencimento of ['0026-12-20','2026-02-30','2026-13-01']) {
      await req('PUT',`/vales/${v.id}`,{pin,observacoes:'Teste',parcelas:[{valor:2029.86,vencimento}]},400);
      assert.deepEqual(db.prepare('SELECT * FROM vendas WHERE id=?').get(v.id),antes);
      await req('POST',`/clientes/${v.clienteId}/carteira/recebimentos`,{data:vencimento,formaPagamento:'pix',valorRecebido:10,alocacoes:[{vendaId:v.id,valor:10}]},400);
    }
    const candidatos=db.prepare("SELECT v.id FROM vendas v WHERE v.deletedAt IS NULL AND v.status<>'cancelada' AND v.finalizadoAt IS NULL AND v.valorPago=0 AND v.totalLiquido>0 AND EXISTS(SELECT 1 FROM itens_venda i WHERE i.vendaId=v.id) AND NOT EXISTS(SELECT 1 FROM ordem_cobranca_vales ov JOIN ordens_cobranca o ON o.id=ov.ordemId WHERE ov.vendaId=v.id AND ov.removidoAt IS NULL AND o.status='aberta') ORDER BY v.numeroSequencial DESC").all();
    let editado;
    for(const c of candidatos){
      const d=await req('GET',`/vendas/${c.id}`);
      const r=await req('PUT',`/vendas/${c.id}`,{pin,data:d.data,desconto:d.desconto,items:d.items,totalEsperado:Math.round(d.totalLiquido*100)/100,observacoes:'Correção de digitação em cópia'},null);
      if(r.status===409)continue;
      assert.equal(r.status,200,r.erro); assert.equal(r.data.totalLiquido,Math.round(d.totalLiquido*100)/100);
      editado=d.numeroSequencial;break;
    }
    assert.ok(editado);return {datasInvalidasBloqueadas:3,valeEditado:editado};
  });
  await cenario('Exclusão e estorno no controle da ordem, com rollback e revisão', async ({db,req,pin}) => {
    const registros=db.prepare("SELECT DISTINCT r.id,o.id ordemId,o.numeroSequencial FROM recebimentos_cliente r JOIN ordem_cobranca_recebimentos l ON l.recebimentoId=r.id AND l.deletedAt IS NULL JOIN ordens_cobranca o ON o.id=l.ordemId WHERE r.deletedAt IS NULL AND r.status='ativo' AND o.deletedAt IS NULL AND o.finalizadoAt IS NULL AND o.status IN ('aberta','quitada') ORDER BY o.numeroSequencial DESC").all();
    const feitos=[];
    for(const acao of ['estornar','excluir']) {
      let sucesso=false;
      for(const r of registros) {
        const itens=[{tipo:'recebimento',id:r.id}];
        const p=await req('POST',`/ordens-cobranca/${r.ordemId}/pagamentos/previa`,{acao,itens},null);if(p.status!==200)continue;
        const body={pin,acao,itens,revisao:p.data.revisao};
        await req('POST',`/ordens-cobranca/${r.ordemId}/pagamentos/acoes`,{...body,revisao:'desatualizada'},409);
        await req('POST',`/ordens-cobranca/${r.ordemId}/pagamentos/acoes`,{...body,pin:'errada'},403);
        const snapshot=db.prepare('SELECT * FROM recebimentos_cliente WHERE id=?').get(r.id);
        db.exec("CREATE TRIGGER falha_auditoria_cliente BEFORE INSERT ON auditoria WHEN NEW.acao='estornar_recebimento' BEGIN SELECT RAISE(ABORT,'Falha teste rollback'); END");
        await req('POST',`/ordens-cobranca/${r.ordemId}/pagamentos/acoes`,body,500);
        assert.deepEqual(db.prepare('SELECT * FROM recebimentos_cliente WHERE id=?').get(r.id),snapshot);
        db.exec('DROP TRIGGER falha_auditoria_cliente');
        await req('POST',`/ordens-cobranca/${r.ordemId}/pagamentos/acoes`,body);
        assert.equal(db.prepare('SELECT status FROM recebimentos_cliente WHERE id=?').get(r.id).status,'cancelado');
        const projecoes=db.prepare("SELECT COUNT(*) n FROM ordem_pagamentos_projetados WHERE recebimentoOrigemId=? AND estado='pendente'").get(r.id).n;
        assert.equal(projecoes,acao==='estornar'?1:0);
        feitos.push({acao,ordem:r.numeroSequencial});sucesso=true;break;
      }
      assert.ok(sucesso,acao);
    }
    return feitos;
  });
  fs.writeFileSync(saida,JSON.stringify({arquivo:path.resolve(arquivo),resultados},null,2),{flag:'wx'});
  if(resultados.some(r=>!r.sucesso))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
