/* Conciliação offline. Não importa db.ts nem executa migrações/programação de pagamentos. */
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const verificacoes = [
  ['ordem_finalizada_sem_pagamento', 'revisao', `SELECT o.id,o.numeroSequencial FROM ordens_cobranca o WHERE o.deletedAt IS NULL AND o.finalizadoAt IS NOT NULL AND o.status<>'cancelada' AND NOT EXISTS(SELECT 1 FROM recebimentos_cliente r WHERE r.deletedAt IS NULL AND r.status='ativo' AND r.valorAplicado>0 AND (r.ordemCobrancaId=o.id OR EXISTS(SELECT 1 FROM ordem_cobranca_recebimentos l WHERE l.ordemId=o.id AND l.recebimentoId=r.id AND l.deletedAt IS NULL)))`, 'Conferir a finalização e eventuais estornos posteriores; não gerar novo residual para compensar a ausência.'],
  ['lancamento_sem_recebimento', 'erro', `SELECT p.id,p.recebimentoId,p.valor FROM pagamentos p LEFT JOIN recebimentos_cliente r ON r.id=p.recebimentoId WHERE p.deletedAt IS NULL AND p.recebimentoId IS NOT NULL AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo' OR r.clienteId<>p.clienteId)`, 'Conferir o recebimento original antes de remover o lançamento financeiro.'],
  ['bonus_sem_recebimento', 'erro', `SELECT b.id,b.recebimentoId,b.tipo,b.valor FROM cliente_bonus_movimentos b LEFT JOIN recebimentos_cliente r ON r.id=b.recebimentoId WHERE b.deletedAt IS NULL AND b.recebimentoId IS NOT NULL AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo' OR r.clienteId<>b.clienteId)`, 'Conferir geração, consumo e estorno do bônus; preservar os movimentos sem recebimento vinculados diretamente à venda.'],
  ['vinculo_ordem_sem_recebimento', 'erro', `SELECT l.id,l.ordemId,l.recebimentoId,l.valor FROM ordem_cobranca_recebimentos l LEFT JOIN recebimentos_cliente r ON r.id=l.recebimentoId LEFT JOIN ordens_cobranca o ON o.id=l.ordemId WHERE l.deletedAt IS NULL AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo' OR o.id IS NULL OR o.clienteId<>r.clienteId)`, 'Revisar todos os vales e parcelas atingidos por esse recebimento.'],
  ['alocacao_sem_recebimento', 'erro', `SELECT a.id,a.recebimentoId,a.vendaId,a.valor FROM recebimento_alocacoes a LEFT JOIN recebimentos_cliente r ON r.id=a.recebimentoId WHERE a.deletedAt IS NULL AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo')`, 'Revisar o recebimento e todos os seus vínculos antes de estornar.'],
  ['alocacao_cliente_incompativel', 'erro', `SELECT a.id,a.recebimentoId,a.vendaId FROM recebimento_alocacoes a JOIN recebimentos_cliente r ON r.id=a.recebimentoId LEFT JOIN vendas v ON v.id=a.vendaId WHERE a.deletedAt IS NULL AND r.deletedAt IS NULL AND r.status='ativo' AND (v.id IS NULL OR v.deletedAt IS NOT NULL OR v.status='cancelada' OR v.clienteId<>r.clienteId)`, 'Conciliar a origem da alocação; não mover valores entre clientes automaticamente.'],
  ['alocacao_duplicada', 'erro', `SELECT recebimentoId,vendaId,COUNT(*) quantidade FROM recebimento_alocacoes WHERE deletedAt IS NULL GROUP BY recebimentoId,vendaId HAVING COUNT(*)>1`, 'Conferir as operações originais antes de eliminar qualquer efeito duplicado.'],
  ['recebimento_total_alocado', 'erro', `SELECT r.id,r.valorAplicado,COALESCE(SUM(a.valor),0) totalAlocado FROM recebimentos_cliente r LEFT JOIN recebimento_alocacoes a ON a.recebimentoId=r.id AND a.deletedAt IS NULL WHERE r.deletedAt IS NULL AND r.status='ativo' GROUP BY r.id HAVING ABS(r.valorAplicado-COALESCE(SUM(a.valor),0))>0.005`, 'Reconstituir a distribuição a partir do comprovante e da auditoria; não ratear pela dívida atual.'],
  ['recebimento_composicao', 'erro', `SELECT id,valorRecebido,bonusUtilizado,valorAplicado,bonusGerado FROM recebimentos_cliente WHERE deletedAt IS NULL AND status='ativo' AND (ABS(valorRecebido+bonusUtilizado-valorAplicado-bonusGerado)>0.005 OR MIN(valorRecebido,bonusUtilizado,valorAplicado,bonusGerado)<0 OR bonusUtilizado>valorAplicado+0.005)`, 'Conferir dinheiro, bônus, abatimento e excedente antes de corrigir o recebimento.'],
  ['recebimento_sem_lancamento', 'erro', `SELECT r.id,r.pagamentoId FROM recebimentos_cliente r LEFT JOIN pagamentos p ON p.id=r.pagamentoId WHERE r.deletedAt IS NULL AND r.status='ativo' AND (p.id IS NULL OR p.deletedAt IS NOT NULL OR p.clienteId<>r.clienteId OR p.recebimentoId<>r.id OR ABS(p.valor-r.valorRecebido)>0.005)`, 'Conferir o lançamento original; não criar dinheiro recebido com base apenas no saldo.'],
  ['titulo_sem_recebimento', 'erro', `SELECT t.id,t.recebimentoId,t.valor FROM recebimento_titulos t LEFT JOIN recebimentos_cliente r ON r.id=t.recebimentoId WHERE t.deletedAt IS NULL AND t.status<>'recusado' AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo' OR r.clienteId<>t.clienteId)`, 'Conferir recusa/estorno e o vínculo do título. Títulos recusados históricos são preservados.'],
  ['titulo_total_divergente', 'erro', `SELECT r.id,r.valorRecebido,SUM(CASE WHEN t.status='recusado' THEN 0 ELSE t.valor END) totalTitulos FROM recebimentos_cliente r JOIN recebimento_titulos t ON t.recebimentoId=r.id AND t.deletedAt IS NULL WHERE r.deletedAt IS NULL AND r.status='ativo' GROUP BY r.id HAVING ABS(r.valorRecebido-SUM(CASE WHEN t.status='recusado' THEN 0 ELSE t.valor END))>0.005`, 'Conferir valores e recusas de cada título; manter a compensação independente da finalização.'],
  ['ordem_cancelada_recebimento_ativo', 'revisao', `SELECT DISTINCT o.id,o.numeroSequencial,r.id recebimentoId FROM ordens_cobranca o JOIN ordem_cobranca_recebimentos l ON l.ordemId=o.id AND l.deletedAt IS NULL JOIN recebimentos_cliente r ON r.id=l.recebimentoId AND r.deletedAt IS NULL AND r.status='ativo' WHERE o.deletedAt IS NULL AND o.status='cancelada'`, 'Distinguir cancelamento de renegociação antiga e conferir pagamentos compartilhados antes da reversão integral.'],
  ['carteira_negativa', 'erro', `SELECT clienteId,ROUND(SUM(CASE WHEN tipo='credito' THEN valor ELSE -valor END),2) saldo FROM cliente_bonus_movimentos WHERE deletedAt IS NULL GROUP BY clienteId HAVING SUM(CASE WHEN tipo='credito' THEN valor ELSE -valor END)<-0.005`, 'Rastrear créditos e usos; não lançar crédito artificial para zerar a diferença.'],
  ['bonus_recebimento_divergente', 'erro', `SELECT r.id,r.bonusUtilizado,r.bonusGerado,COALESCE(SUM(CASE WHEN b.tipo='debito' THEN b.valor ELSE 0 END),0) debitos,COALESCE(SUM(CASE WHEN b.tipo='credito' THEN b.valor ELSE 0 END),0) creditos FROM recebimentos_cliente r LEFT JOIN cliente_bonus_movimentos b ON b.recebimentoId=r.id AND b.deletedAt IS NULL WHERE r.deletedAt IS NULL AND r.status='ativo' GROUP BY r.id HAVING ABS(r.bonusUtilizado-debitos)>0.005 OR ABS(r.bonusGerado-creditos)>0.005`, 'Conciliar os movimentos vinculados ao recebimento e os consumos posteriores.'],
  ['pagamento_legado', 'legado', `SELECT p.id,p.vendaId,p.valor FROM pagamentos p WHERE p.deletedAt IS NULL AND p.recebimentoId IS NULL AND NOT EXISTS(SELECT 1 FROM recebimentos_cliente r WHERE r.pagamentoId=p.id)`, 'Registro legado não é, por si só, erro. Comprovar vínculo e histórico antes de normalizar.'],
  ['saldo_vale_divergente', 'revisao', `SELECT v.id,v.numeroSequencial,v.totalLiquido,v.valorPago,v.saldoRestante,COALESCE((SELECT SUM(x.valorTransferido) FROM vale_residual_origens x WHERE x.vendaOrigemId=v.id),0) transferido FROM vendas v WHERE v.deletedAt IS NULL AND v.status<>'cancelada' AND v.finalizadoAt IS NULL AND ABS(v.saldoRestante-MAX(0,v.totalLiquido-v.valorPago-COALESCE((SELECT SUM(x.valorTransferido) FROM vale_residual_origens x WHERE x.vendaOrigemId=v.id),0)))>0.005`, 'Conferir transferências históricas e pagamentos; o residual é independente e não deve ser reaberto em cascata.'],
  ['residual_sem_origem_estruturada', 'legado', `SELECT v.id,v.numeroSequencial,v.totalLiquido FROM vendas v WHERE v.deletedAt IS NULL AND v.contabilizaReceita=0 AND NOT EXISTS(SELECT 1 FROM vale_residual_origens x WHERE x.valeResidualId=v.id)`, 'Consultar auditoria e referências legadas. Não inferir o valor transferido pelo saldo atual.'],
  ['origem_residual_incompativel', 'erro', `SELECT x.valeResidualId,x.vendaOrigemId,x.ordemOrigemId,x.valorTransferido FROM vale_residual_origens x LEFT JOIN vendas r ON r.id=x.valeResidualId LEFT JOIN vendas v ON v.id=x.vendaOrigemId LEFT JOIN ordens_cobranca o ON o.id=x.ordemOrigemId WHERE r.id IS NULL OR v.id IS NULL OR r.clienteId<>v.clienteId OR x.valorTransferido<0 OR x.valeResidualId=x.vendaOrigemId OR (x.ordemOrigemId IS NOT NULL AND (o.id IS NULL OR o.clienteId<>r.clienteId))`, 'Revisar referências e auditoria sem alterar negociações posteriores.'],
  ['residual_ausente', 'revisao', `SELECT o.id,o.numeroSequencial,o.valeResidualId FROM ordens_cobranca o WHERE o.deletedAt IS NULL AND o.valeResidualId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vendas v WHERE v.id=o.valeResidualId)`, 'Localizar o vale no backup/histórico. Não criar um novo devedor sem comprovar o valor original.'],
];

// Impressão digital local: nenhum conteúdo livre dessas tabelas é exportado.
function estadoFinanceiro(db) {
  const tabelas=['vendas','pagamentos','recebimentos_cliente','recebimento_alocacoes','recebimento_titulos','recebimento_instrumentos','instrumentos_recebimento','cliente_bonus_movimentos','ordens_cobranca','ordem_cobranca_vales','ordem_cobranca_recebimentos','ordem_cobranca_parcela_recebimentos','ordem_cobranca_parcelas','vale_parcelas','vale_residual_origens'];
  const hash=crypto.createHash('sha256');
  for(const tabela of tabelas) {
    if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tabela)) continue;
    const linhas=db.prepare(`SELECT * FROM ${tabela}`).all().map(l=>{if(tabela==='vendas')delete l.observacoes;return JSON.stringify(l);}).sort();
    hash.update(tabela).update(JSON.stringify(linhas));
  }
  return hash.digest('hex');
}

function diagnosticar(db) {
  const relatorio={versao:1,geradoEm:new Date().toISOString(),verificacoes:[],propostas:[],limites:['Indicadores não certificam integridade nem autorizam correção financeira automática.','Sem nomes, documentos pessoais ou conteúdo livre da auditoria no relatório.']};
  db.transaction(()=>{
    relatorio.estadoFinanceiro=estadoFinanceiro(db);
    relatorio.integridade=db.pragma('quick_check').map(r=>Object.values(r)[0]);
    relatorio.chavesEstrangeiras=db.pragma('foreign_key_check');
    for(const [codigo,nivel,sql,orientacao] of verificacoes) {
      try {const registros=db.prepare(sql).all(); relatorio.verificacoes.push({codigo,nivel,orientacao,total:registros.length,registros});}
      catch(e){relatorio.verificacoes.push({codigo,nivel,orientacao,indisponivel:e.message});}
    }
    // Única proposta automática: preencher descrição vazia por referências estruturadas comprovadas.
    try {
      const residuais=db.prepare("SELECT id,numeroSequencial,clienteId FROM vendas WHERE deletedAt IS NULL AND contabilizaReceita=0 AND TRIM(COALESCE(observacoes,''))=''").all();
      for(const residual of residuais) {
        const origens=db.prepare(`SELECT x.*,v.clienteId clienteOrigem,v.numeroSequencial numeroOrigem,o.clienteId clienteOrdem,o.numeroSequencial numeroOrdem FROM vale_residual_origens x LEFT JOIN vendas v ON v.id=x.vendaOrigemId LEFT JOIN ordens_cobranca o ON o.id=x.ordemOrigemId WHERE x.valeResidualId=? ORDER BY x.numeroValeOrigem,x.vendaOrigemId`).all(residual.id);
        if(!origens.length || origens.some(x=>x.clienteOrigem!==residual.clienteId || x.vendaOrigemId===residual.id || x.numeroOrigem!==x.numeroValeOrigem || !Number.isFinite(x.valorTransferido) || x.valorTransferido<0 || (x.ordemOrigemId && (x.clienteOrdem!==residual.clienteId || x.numeroOrdem!==x.numeroOrdemOrigem)))) continue;
        const ordens=[...new Set(origens.filter(x=>x.ordemOrigemId).map(x=>x.numeroOrdemOrigem))];
        relatorio.propostas.push({tipo:'descricao_residual',id:residual.id,numero:residual.numeroSequencial,observacoes:`Saldo devedor dos vales ${origens.map(x=>'#'+x.numeroValeOrigem).join(', ')}${ordens.length?' / ordens '+ordens.map(n=>'#'+n).join(', '):''}`,origens:origens.map(x=>({vendaId:x.vendaOrigemId,ordemId:x.ordemOrigemId,valorTransferido:x.valorTransferido}))});
      }
    } catch(e){relatorio.propostasIndisponiveis=e.message;}
  })();
  relatorio.resumo={ocorrencias:relatorio.verificacoes.reduce((n,v)=>n+(v.total||0),0),verificacoesIndisponiveis:relatorio.verificacoes.filter(v=>v.indisponivel).length,propostas:relatorio.propostas.length};
  relatorio.resumo.situacao = relatorio.resumo.verificacoesIndisponiveis || relatorio.propostasIndisponiveis ? 'diagnostico_incompleto' : relatorio.resumo.ocorrencias || relatorio.propostas.length || relatorio.chavesEstrangeiras.length || relatorio.integridade.some(r=>r!=='ok') ? 'revisao_necessaria' : 'sem_indicios_nas_verificacoes_executadas';
  relatorio.revisao=crypto.createHash('sha256').update(JSON.stringify({estadoFinanceiro:relatorio.estadoFinanceiro,verificacoes:relatorio.verificacoes,propostas:relatorio.propostas})).digest('hex');
  return relatorio;
}

function aplicarDescricoesNaCopia(db,relatorio) {
  if(relatorio.integridade.some(r=>r!=='ok')) throw new Error('Integridade SQLite inválida; não aplicar propostas.');
  if(!relatorio.propostas.length) return;
  db.transaction(()=>{
    if(diagnosticar(db).revisao!==relatorio.revisao) throw new Error('A cópia mudou desde a análise.');
    db.exec(`CREATE TABLE IF NOT EXISTS conciliacao_metadados (id TEXT PRIMARY KEY, vendaId TEXT NOT NULL, revisao TEXT NOT NULL, antes TEXT, depois TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    for(const p of relatorio.propostas) {
      const antes=db.prepare('SELECT observacoes FROM vendas WHERE id=?').get(p.id).observacoes;
      const r=db.prepare("UPDATE vendas SET observacoes=? WHERE id=? AND TRIM(COALESCE(observacoes,''))=''").run(p.observacoes,p.id);
      if(r.changes!==1) throw new Error('Descrição alterada durante a conciliação.');
      db.prepare('INSERT INTO conciliacao_metadados (id,vendaId,revisao,antes,depois) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),p.id,relatorio.revisao,antes,p.observacoes);
    }
    if(estadoFinanceiro(db)!==relatorio.estadoFinanceiro) throw new Error('Alteração financeira inesperada: toda a simulação foi revertida.');
  })();
}

async function executar({arquivo,saida,copia}) {
  if(!arquivo) throw new Error('Informe --db com o caminho explícito da base.');
  if(saida && copia && path.resolve(saida).toLowerCase()===path.resolve(copia).toLowerCase()) throw new Error('O relatório e a cópia precisam de destinos distintos.');
  if(saida && fs.existsSync(path.resolve(saida))) throw new Error('O relatório de destino já existe; nada foi sobrescrito.');
  const original=fs.realpathSync(arquivo);
  const db=new Database(original,{readonly:true,fileMustExist:true});
  db.pragma('query_only=ON');
  try {
    let resultado;
    if(copia) {
      const destino=path.resolve(copia);
      if(fs.existsSync(destino)) throw new Error('A cópia de destino já existe; nada foi sobrescrito.');
      if([original,original+'-wal',original+'-shm'].some(p=>p.toLowerCase()===destino.toLowerCase())) throw new Error('O destino não pode ser a base ou seus arquivos auxiliares.');
      fs.closeSync(fs.openSync(destino,'wx'));
      await db.backup(destino);
      const copiaDb=new Database(destino,{fileMustExist:true});
      try {
        const antes=diagnosticar(copiaDb);
        aplicarDescricoesNaCopia(copiaDb,antes);
        resultado={original,copia:destino,aplicadas:antes.propostas,antes,depois:diagnosticar(copiaDb)};
      } finally {copiaDb.close();}
    } else resultado={original,diagnostico:diagnosticar(db)};
    if(saida) fs.writeFileSync(path.resolve(saida),JSON.stringify(resultado,null,2)+'\n',{flag:'wx'});
    return resultado;
  } finally {db.close();}
}
module.exports={diagnosticar,aplicarDescricoesNaCopia,executar};
if(require.main===module) {
  const opts={}; const nomes={'--db':'arquivo','--saida':'saida','--copia-corrigida':'copia'};
  try {
    for(let i=2;i<process.argv.length;i+=2) {if(!nomes[process.argv[i]] || !process.argv[i+1]) throw new Error('Uso: --db arquivo [--saida novo.json] [--copia-corrigida nova.db]'); opts[nomes[process.argv[i]]]=process.argv[i+1];}
    executar(opts).then(r=>console.log(JSON.stringify(opts.saida?{relatorio:path.resolve(opts.saida),resumo:(r.diagnostico||r.depois).resumo,copia:r.copia}:r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
  } catch(e){console.error(e.message);process.exitCode=1;}
}
