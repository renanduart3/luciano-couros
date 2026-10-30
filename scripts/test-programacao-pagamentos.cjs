const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const raiz = process.cwd();
const compiled = buildSync({ stdin: {
  contents: `export * from './server/programacaoPagamentos'; export * from './server/db'; export * from './src/lib/filtroVales'; export * from './src/lib/situacaoOrdem';`,
  resolveDir: raiz, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-programacao-'));
process.env.DATA_DIR = temp;
process.chdir(temp);
const mod = new Module(path.join(raiz, 'scripts/programacao-test.cjs'));
mod.filename = mod.id;
mod.paths = module.paths;
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { db, initDatabase, compensarPagamentosProgramados: processar, programacaoDoTitulo: programar,
  dataFinanceiraValida, ordensAbertasPorVale, correspondeStatusVale } = mod.exports;
try {
  const agenda = mod.exports.situacaoAgendaOrdem;
  assert.equal(agenda({status: 'cancelada', pagamentos: [{titulos:[{status:'aguardando',vencimento:'2099-01-01'}]}]}).texto, 'Ordem cancelada');
  assert.equal(agenda({status: 'renegociada'}).texto, 'Ordem renegociada');
  assert.equal(agenda({status: 'aberta', totalOriginal: 100, pagamentos: []}).texto, 'Saldo em aberto');
  assert.equal(agenda({status: 'quitada', totalOriginal: 0, pagamentos: []}).texto, 'Concluída');
  initDatabase();
  db.prepare("INSERT INTO clientes (id, nome) VALUES ('teste-auto', 'Teste automação')").run();
  db.prepare("INSERT INTO recebimentos_cliente (id, clienteId, data, formaPagamento, valorRecebido, valorAplicado) VALUES ('teste-auto', 'teste-auto', '2028-01-01', 'cheque_emitente', 100, 100)").run();
  const inserir = (id, vencimento, status = 'aguardando', auto = 1, tipo = 'cheque_emitente') =>
    db.prepare(`INSERT INTO recebimento_titulos (id, recebimentoId, clienteId, tipo, nomeTitular, documentoTitular,
      valor, vencimento, numeroDocumento, status, compensacaoAutomatica) VALUES (?, 'teste-auto', 'teste-auto', ?, 'Teste', '123', 10, ?, ?, ?, ?)`)
      .run(id, tipo, vencimento, id, status, auto);
  inserir('vence-hoje', '2028-02-29');
  inserir('atrasado-programado', '2028-02-28', 'aguardando', 1, 'duplicata_emitente');
  inserir('futuro', '2028-03-01');
  inserir('sem-previsao', '2028-02-01', 'aguardando', 0);
  inserir('excecao-manual', '2028-02-28', 'aguardando', 0);
  inserir('recusado', '2028-02-28', 'recusado');
  inserir('data-invalida', '2028-02-30');
  inserir('excluido', '2028-02-28');
  db.prepare("UPDATE recebimento_titulos SET deletedAt = CURRENT_TIMESTAMP WHERE id = 'excluido'").run();
  assert.equal(processar('2028-02-29'), 2);
  assert.equal(processar('2028-02-29'), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimentacoes_financeiras WHERE recebimentoId = 'teste-auto'").get().n, 2);
  assert.equal(db.prepare("SELECT valorAplicado FROM recebimentos_cliente WHERE id = 'teste-auto'").get().valorAplicado, 100);
  for (const id of ['futuro','sem-previsao','excecao-manual','data-invalida']) assert.equal(db.prepare("SELECT status FROM recebimento_titulos WHERE id = ?").get(id).status, 'aguardando');
  const anterior = { status: 'compensado', vencimento: '2028-03-01', compensacaoAutomatica: 0 };
  assert.equal(programar({ ...anterior, status: 'aguardando' }, anterior, '2028-02-29'), 0);
  assert.equal(programar({ ...anterior, status: 'aguardando', vencimento: '2028-03-02' }, anterior, '2028-02-29'), 1);
  assert.equal(programar({ status: 'aguardando', vencimento: '2028-02-28' }, null, '2028-02-29'), 1);
  assert.equal(programar({ status: 'aguardando', vencimento: '2028-03-01' }, null, '2028-02-29'), 1);
  assert.equal(dataFinanceiraValida('2027-02-29'), false);
  assert.equal(dataFinanceiraValida('2028-02-29'), true);
  assert.equal(dataFinanceiraValida('2100-02-29'), false);
  assert.throws(() => processar('2028-03-01', () => { throw new Error('Falha simulada'); }), /Falha simulada/);
  assert.equal(db.prepare("SELECT status FROM recebimento_titulos WHERE id = 'futuro'").get().status, 'aguardando');
  const mapa = ordensAbertasPorVale([{ id:'a', status:'aberta', vales:[{ vendaId:'v1', saldo:0 }] }, { status:'quitada', vales:[{ vendaId:'v2' }] }]);
  assert.equal(mapa.has('v1'),true);
  assert.equal(mapa.has('v2'),false);
  const aberto={id:'v1',status:'pendente',vencimento:'2026-01-01',financeiro:{restantePresumido:100}};
  for (const id of ['v1','v2']) {
    assert.equal(correspondeStatusVale({...aberto,id},'abertos','2026-10-30'),true);
    assert.equal(correspondeStatusVale({...aberto,id},'vencidos','2026-10-30'),true);
    assert.equal(correspondeStatusVale({...aberto,id},'a_vencer','2026-10-30'),false);
  }
  for (const vencimento of ['2026-10-30','2026-11-01']) {
    assert.equal(correspondeStatusVale({...aberto,vencimento},'abertos','2026-10-30'),true);
    assert.equal(correspondeStatusVale({...aberto,vencimento},'vencidos','2026-10-30'),false);
    assert.equal(correspondeStatusVale({...aberto,vencimento},'a_vencer','2026-10-30'),true);
  }
  for(const vale of [{...aberto,status:'cancelada'},{...aberto,finalizadoAt:'2026-10-29'},{...aberto,financeiro:{restantePresumido:0}}]) {
    assert.equal(correspondeStatusVale(vale,'abertos','2026-10-30'),false);
    assert.equal(correspondeStatusVale(vale,'vencidos','2026-10-30'),false);
  }
  const parcelado={...aberto,parcelas:[{status:'paga',saldo:0,vencimento:'2026-01-01'},{status:'pendente',saldo:100,vencimento:'2026-11-01'}]};
  assert.equal(correspondeStatusVale(parcelado,'abertos','2026-10-30'),true);
  assert.equal(correspondeStatusVale(parcelado,'vencidos','2026-10-30'),false);
  // Simula atualização de base antiga: a migração é universal, mas respeita intervenções.
  db.prepare("DROP INDEX idx_titulos_programados").run();
  db.prepare("ALTER TABLE recebimento_titulos DROP COLUMN compensacaoAutomatica").run();
  initDatabase();
  initDatabase();
  console.log('OK: compensação agendada, retomada, não duplicação, exceções manuais, datas, rollback, migração e filtros.');
  console.log('Base isolada:', temp);
} finally { db.close(); }
