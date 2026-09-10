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
  dataFinanceiraValida, ordensAbertasPorVale, visivelPorVinculoOrdem } = mod.exports;
try {
  const agenda = mod.exports.situacaoAgendaOrdem;
  assert.equal(agenda({status: 'cancelada', pagamentos: [{titulos:[{status:'aguardando',vencimento:'2099-01-01'}]}]}).texto, 'Ordem cancelada');
  assert.equal(agenda({status: 'renegociada'}).texto, 'Ordem renegociada');
  assert.equal(agenda({status: 'aberta'}).texto, 'Saldo em aberto');
  assert.equal(agenda({status: 'quitada'}).texto, 'Concluída');
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
  assert.equal(programar({ status: 'aguardando', vencimento: '2028-02-28' }, null, '2028-02-29'), 0);
  assert.equal(programar({ status: 'aguardando', vencimento: '2028-03-01' }, null, '2028-02-29'), 1);
  assert.equal(dataFinanceiraValida('2027-02-29'), false);
  assert.equal(dataFinanceiraValida('2028-02-29'), true);
  assert.equal(dataFinanceiraValida('2100-02-29'), false);
  assert.throws(() => processar('2028-03-01', () => { throw new Error('Falha simulada'); }), /Falha simulada/);
  assert.equal(db.prepare("SELECT status FROM recebimento_titulos WHERE id = 'futuro'").get().status, 'aguardando');
  const mapa = ordensAbertasPorVale([{ id:'a', status:'aberta', vales:[{ vendaId:'v1', saldo:0 }] }, { status:'quitada', vales:[{ vendaId:'v2' }] }]);
  for (const filtro of ['abertos','vencidos','a_vencer','quitados','cancelados']) assert.equal(visivelPorVinculoOrdem('v1', filtro, mapa), false);
  assert.equal(visivelPorVinculoOrdem('v1', 'todos', mapa), true);
  assert.equal(visivelPorVinculoOrdem('v2', 'abertos', mapa), true);
  // Simula atualização de base antiga: a migração é universal, mas respeita intervenções.
  db.prepare("DROP INDEX idx_titulos_programados").run();
  db.prepare("ALTER TABLE recebimento_titulos DROP COLUMN compensacaoAutomatica").run();
  initDatabase();
  initDatabase();
  console.log('OK: compensação agendada, retomada, não duplicação, exceções manuais, datas, rollback, migração e filtros.');
  console.log('Base isolada:', temp);
} finally { db.close(); }
