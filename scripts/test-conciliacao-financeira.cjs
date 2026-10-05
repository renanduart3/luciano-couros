const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os'); const crypto=require('node:crypto');
const Module=require('node:module'); const Database=require('better-sqlite3'); const {buildSync}=require('esbuild');
const {diagnosticar,aplicarDescricoesNaCopia,executar}=require('./conciliar-financeiro.cjs');
async function main(){
  const raiz=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'couros-conciliacao-'));
  const code=buildSync({entryPoints:['server/db.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text;
  process.env.DATA_DIR=temp; process.chdir(temp);
  const m=new Module(path.join(raiz,'scripts/conciliacao-runtime.cjs'));m.filename=m.id;m.paths=module.paths;m._compile(code,m.filename);
  m.exports.initDatabase(); const db=m.exports.db;
  try {
    db.prepare("INSERT INTO clientes(id,nome) VALUES ('conc-c','Cliente confidencial teste'),('conc-outro','Outro cliente')").run();
    for(const [id,n,total,pago,saldo,receita] of [['conc-v',10001,100,40,0,1],['conc-r',10002,60,20,40,0],['conc-ambiguo',10003,50,0,50,0]]) {
      db.prepare("INSERT INTO vendas(id,numeroSequencial,clienteId,data,desconto,subtotal,totalLiquido,valorPago,saldoRestante,status,contabilizaReceita) VALUES (?,?,'conc-c','2026-10-04',0,?,?,?,?, 'pendente',?)").run(id,n,total,total,pago,saldo,receita);
    }
    db.prepare("INSERT INTO vale_residual_origens(valeResidualId,vendaOrigemId,numeroValeOrigem,valorTransferido) VALUES ('conc-r','conc-v',10001,60)").run();
    db.prepare("INSERT INTO recebimentos_cliente(id,clienteId,data,valorRecebido,valorAplicado,formaPagamento,status) VALUES ('conc-recusado','conc-c','2026-10-04',0,0,'cheque_emitente','recusado'),('conc-bad','conc-c','2026-10-04',100,80,'pix','ativo')").run();
    db.prepare("INSERT INTO recebimento_titulos(id,recebimentoId,clienteId,tipo,nomeTitular,documentoTitular,valor,vencimento,numeroDocumento,status) VALUES ('conc-t','conc-recusado','conc-c','cheque_emitente','Titular confidencial','TESTE',100,'2099-01-01','DOC','recusado')").run();
    const before=diagnosticar(db);
    assert.equal(before.resumo.verificacoesIndisponiveis,0,JSON.stringify(before.verificacoes.filter(v=>v.indisponivel)));
    assert.ok(before.propostas.some(p=>p.id==='conc-r')); assert.ok(!before.propostas.some(p=>p.id==='conc-ambiguo'));
    assert.ok(!before.verificacoes.find(v=>v.codigo==='titulo_sem_recebimento').registros.some(r=>r.id==='conc-t'));
    assert.ok(before.verificacoes.find(v=>v.codigo==='recebimento_composicao').registros.some(r=>r.id==='conc-bad'));
    assert.ok(!JSON.stringify(before).includes('confidencial'));
    const arquivo=path.join(temp,'database.db'),copia=path.join(temp,'copia.db');
    const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    const mainHash=hash(arquivo),walHash=hash(arquivo+'-wal');
    const resultado=await executar({arquivo,copia,saida:path.join(temp,'relatorio.json')});
    assert.equal(hash(arquivo),mainHash);assert.equal(hash(arquivo+'-wal'),walHash);
    assert.equal(db.prepare("SELECT observacoes FROM vendas WHERE id='conc-r'").get().observacoes,null);
    const cd=new Database(copia);
    try {
      const reparado=cd.prepare("SELECT * FROM vendas WHERE id='conc-r'").get();
      assert.match(reparado.observacoes,/#10001/);assert.equal(reparado.valorPago,20);assert.equal(reparado.saldoRestante,40);assert.equal(reparado.totalLiquido,60);
      assert.equal(cd.prepare("SELECT observacoes FROM vendas WHERE id='conc-ambiguo'").get().observacoes,null);
      assert.equal(cd.prepare("SELECT COUNT(*) n FROM conciliacao_metadados WHERE vendaId='conc-r'").get().n,1);
      const depois=diagnosticar(cd);assert.ok(!depois.propostas.some(p=>p.id==='conc-r'));
      aplicarDescricoesNaCopia(cd,depois);assert.equal(cd.prepare("SELECT COUNT(*) n FROM conciliacao_metadados WHERE vendaId='conc-r'").get().n,1);
      cd.prepare("UPDATE vendas SET observacoes=NULL WHERE id='conc-r'").run();
      const stale=diagnosticar(cd);cd.prepare("UPDATE vendas SET observacoes='Alterado' WHERE id='conc-r'").run();
      assert.throws(()=>aplicarDescricoesNaCopia(cd,stale),/mudou/);
      cd.prepare("UPDATE vendas SET observacoes=NULL WHERE id='conc-r'").run();
      cd.exec("CREATE TRIGGER falha_conciliacao BEFORE INSERT ON conciliacao_metadados BEGIN SELECT RAISE(ABORT,'Falha simulada'); END");
      assert.throws(()=>aplicarDescricoesNaCopia(cd,diagnosticar(cd)),/Falha simulada/);
      assert.equal(cd.prepare("SELECT observacoes FROM vendas WHERE id='conc-r'").get().observacoes,null);
      cd.exec('DROP TRIGGER falha_conciliacao');
      cd.exec("CREATE TRIGGER efeito_financeiro AFTER UPDATE OF observacoes ON vendas BEGIN UPDATE vendas SET totalLiquido=totalLiquido+1 WHERE id=NEW.id; END");
      assert.throws(()=>aplicarDescricoesNaCopia(cd,diagnosticar(cd)),/Alteração financeira inesperada/);
      assert.equal(cd.prepare("SELECT totalLiquido FROM vendas WHERE id='conc-r'").get().totalLiquido,60);
      assert.equal(cd.prepare("SELECT observacoes FROM vendas WHERE id='conc-r'").get().observacoes,null);
      cd.exec('DROP TRIGGER efeito_financeiro');
      cd.prepare("UPDATE vendas SET clienteId='conc-outro' WHERE id='conc-v'").run();
      assert.ok(!diagnosticar(cd).propostas.some(p=>p.id==='conc-r'));
    } finally {cd.close();}
    await assert.rejects(executar({arquivo,copia}),/já existe/);
    await assert.rejects(executar({arquivo,copia:arquivo}),/já existe/);
    const ausente=path.join(temp,'inexistente.db');await assert.rejects(executar({arquivo:ausente}));assert.equal(fs.existsSync(ausente),false);
    const vazio=new Database(':memory:');assert.equal(diagnosticar(vazio).resumo.verificacoesIndisponiveis,before.verificacoes.length);vazio.close();
    console.log('OK: WAL preservado, cópia íntegra, diagnóstico sem dados pessoais, recusados históricos, descrição comprovada, ambiguidade, idempotência, revisão, rollback e esquema incompleto.');
  } finally {db.close();process.chdir(raiz);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
