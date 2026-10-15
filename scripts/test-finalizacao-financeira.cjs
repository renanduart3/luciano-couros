const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

const raiz = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-finalizacao-'));
process.env.DATA_DIR = temp;
let source = fs.readFileSync('server.ts', 'utf8')
  .replace('startServer();', 'export { app, db, ajustarBonusFinalizacao };')
  .replace('void runAutoBackup();', '')
  .replace('setInterval(() => void runAutoBackup(), 60 * 1000);', '')
  .replace('setInterval(executarProgramacaoFinanceira, 60_000).unref();', '')
  .replace('setTimeout(executarProgramacaoFinanceira, 0).unref();', '');
source += '\nexport { fecharPosicao } from "./src/lib/financeiro"; export { descreverParcelamentoCartao } from "./src/components/ParcelamentoCartaoSelect";';
const compiled = buildSync({ stdin: { contents: source, resolveDir: raiz, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
process.chdir(temp);
const mod = new Module(path.join(raiz, 'scripts/finalizacao-runtime.cjs'));
mod.filename = mod.id; mod.paths = module.paths; mod._compile(compiled.outputFiles[0].text, mod.filename);
const { app, db, fecharPosicao, descreverParcelamentoCartao, ajustarBonusFinalizacao } = mod.exports;

function chamar(rota, params, body, esperado = 200) {
  const camada = app._router.stack.find(item => item.route?.path === rota && item.route.methods.post);
  let resposta, status = 200;
  camada.route.stack[0].handle({ params, body }, { status(codigo) { status = codigo; return this; }, json(valor) { resposta = valor; } });
  assert.equal(status, esperado, JSON.stringify(resposta));
  return resposta;
}

function consultar(rota, params, query = {}) {
  const camada = app._router.stack.find(item => item.route?.path === rota && item.route.methods.get);
  let resposta, status = 200;
  camada.route.stack[0].handle({ params, query }, { status(codigo) { status = codigo; return this; }, json(valor) { resposta = valor; } });
  assert.equal(status, 200, JSON.stringify(resposta));
  return resposta;
}

try {
  const posicao = fecharPosicao(1000, 300, 900, 0);
  assert.deepEqual({ entrou: posicao.recebido, presumido: posicao.presumido, devido: posicao.restantePresumido, excedente: posicao.excedentePresumido }, { entrou: 300, presumido: 1200, devido: 0, excedente: 200 });
  assert.match(descreverParcelamentoCartao(1200, 4, [300, 300, 300, 300]), /^4x de/);
  assert.equal(descreverParcelamentoCartao(11008.99, 6, [1834.84, 1834.83, 1834.83, 1834.83, 1834.83, 1834.83]), '6x de R$ 1.834,83');

  const salt = 'teste-finalizacao';
  const hash = crypto.scryptSync('1234', salt, 64).toString('hex');
  db.prepare("UPDATE usuarios SET pinSalt=?, pinHash=? WHERE perfil='administrador'").run(salt, hash);
  db.prepare("INSERT INTO clientes(id,nome) VALUES ('c','Cliente teste')").run();
  db.prepare("INSERT INTO vendas(id,numeroSequencial,clienteId,data,subtotal,desconto,totalLiquido,valorPago,saldoRestante,status,vencimento) VALUES ('v1',1,'c','2026-09-24',100,0,100,40,60,'pendente','2026-10-01')").run();
  db.prepare("INSERT INTO vale_parcelas(id,vendaId,numero,vencimento,valor,valorPago,saldo,status) VALUES ('vp1','v1',1,'2026-10-01',100,40,60,'pendente')").run();
  db.prepare("INSERT INTO ordens_cobranca(id,numeroSequencial,clienteId,dataEmissao,totalOriginal,valorPago,saldo,status) VALUES ('o1',1,'c','2026-09-24',100,40,60,'aberta')").run();
  db.prepare("INSERT INTO ordem_cobranca_vales(id,ordemId,vendaId,valorVinculado,valorPago,saldo,ativo) VALUES ('ov1','o1','v1',100,40,60,1)").run();
  db.prepare("INSERT INTO ordem_cobranca_parcelas(id,ordemId,numero,vencimento,valor,valorPago,saldo,status) VALUES ('op1','o1',1,'2026-10-01',100,40,60,'pendente')").run();

  chamar('/api/ordens-cobranca/:id/finalizar', { id: 'o1' }, { pin: '1234', destinoRestante: 'novo_vale', zerarExcedente: false }, 409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM vendas').get().n, 1);
  assert.equal(db.prepare("SELECT finalizadoAt FROM ordens_cobranca WHERE id='o1'").get().finalizadoAt, null);
  db.prepare("INSERT INTO recebimentos_cliente (id,clienteId,data,valorRecebido,valorAplicado,formaPagamento,ordemCobrancaId) VALUES ('r1','c','2026-09-24',40,40,'pix','o1')").run();
  db.prepare("INSERT INTO recebimento_alocacoes (id,recebimentoId,vendaId,valor) VALUES ('a1','r1','v1',40)").run();
  db.prepare("INSERT INTO ordem_cobranca_recebimentos (id,ordemId,recebimentoId,vendaId,valor) VALUES ('ocr1','o1','r1','v1',40)").run();
  const resultado = chamar('/api/ordens-cobranca/:id/finalizar', { id: 'o1' }, { pin: '1234', destinoRestante: 'novo_vale', zerarExcedente: false });
  assert.equal(resultado.ordem.finalizadoAt != null, true);
  assert.equal(resultado.valeResidual.numeroSequencial, 2);
  assert.equal(resultado.ordem.saldoDevedorAtual, 60);
  assert.equal(resultado.ordem.numeroValeDevedor, 2);
  const origem = db.prepare("SELECT status,saldoRestante,finalizadoAt FROM vendas WHERE id='v1'").get();
  const residual = db.prepare("SELECT totalLiquido,saldoRestante,contabilizaReceita,valeOrigemIds,observacoes FROM vendas WHERE id=?").get(resultado.valeResidual.id);
  assert.deepEqual({ status: origem.status, saldo: origem.saldoRestante, finalizado: Boolean(origem.finalizadoAt) }, { status: 'paga', saldo: 0, finalizado: true });
  assert.equal(residual.totalLiquido, 60); assert.equal(residual.saldoRestante, 60); assert.equal(residual.contabilizaReceita, 0);
  assert.deepEqual(JSON.parse(residual.valeOrigemIds), [1]); assert.match(residual.observacoes, /^Devedor da ordem #1$/);
  const reciboDaOrdem = consultar('/api/recebimentos-cliente/:id/comprovante', { id: 'r1' }, { vendaId: 'v1' });
  assert.equal(reciboDaOrdem.vales[0].saldoAtual, 60);
  assert.equal(reciboDaOrdem.vales[0].valeDevedor, resultado.valeResidual.numeroSequencial);

  db.prepare("INSERT INTO vendas(id,numeroSequencial,clienteId,data,subtotal,desconto,totalLiquido,valorPago,saldoRestante,status,vencimento) VALUES ('v2',3,'c','2026-09-24',724.22,0,724.22,48.71,675.51,'pendente','2026-10-01')").run();
  db.prepare("INSERT INTO recebimentos_cliente(id,clienteId,data,valorRecebido,valorAplicado,formaPagamento) VALUES ('r2','c','2026-09-24',48.71,48.71,'pix')").run();
  db.prepare("INSERT INTO recebimento_alocacoes(id,recebimentoId,vendaId,valor,saldoAntes,saldoDepois) VALUES ('a2','r2','v2',48.71,724.22,675.51)").run();
  const finalizacaoDireta = chamar('/api/vendas/:id/finalizar', { id: 'v2' }, { pin: '1234' });
  const reciboDireto = consultar('/api/recebimentos-cliente/:id/comprovante', { id: 'r2' }, { vendaId: 'v2' });
  assert.equal(reciboDireto.vales[0].saldoAtual, 675.51);
  assert.equal(reciboDireto.vales[0].valeDevedor, finalizacaoDireta.valeResidual.numeroSequencial);
  db.prepare("INSERT INTO recebimentos_cliente(id,clienteId,data,valorRecebido,valorAplicado,formaPagamento) VALUES ('r4','c','2026-09-25',100,100,'pix')").run();
  db.prepare('INSERT INTO recebimento_alocacoes(id,recebimentoId,vendaId,valor,saldoAntes,saldoDepois) VALUES (?,?,?,?,?,?)')
    .run('a4', 'r4', finalizacaoDireta.valeResidual.id, 100, 675.51, 575.51);
  db.prepare('UPDATE vendas SET valorPago = 100, saldoRestante = 575.51 WHERE id = ?').run(finalizacaoDireta.valeResidual.id);
  const segundaFinalizacao = chamar('/api/vendas/:id/finalizar', { id: finalizacaoDireta.valeResidual.id }, { pin: '1234' });
  const reciboAposSegundaFinalizacao = consultar('/api/recebimentos-cliente/:id/comprovante', { id: 'r2' }, { vendaId: 'v2' });
  assert.equal(reciboAposSegundaFinalizacao.vales[0].saldoAtual, 575.51);
  assert.equal(reciboAposSegundaFinalizacao.vales[0].valeDevedor, segundaFinalizacao.valeResidual.numeroSequencial);

  db.prepare("INSERT INTO vendas(id,numeroSequencial,clienteId,data,subtotal,desconto,totalLiquido,valorPago,saldoRestante,status,vencimento) VALUES ('v3',6,'c','2026-09-24',100,0,100,25,0,'pendente','2026-10-01')").run();
  db.prepare("INSERT INTO recebimentos_cliente(id,clienteId,data,valorRecebido,valorAplicado,formaPagamento) VALUES ('r3','c','2026-09-24',25,25,'pix')").run();
  db.prepare("INSERT INTO recebimento_alocacoes(id,recebimentoId,vendaId,valor,saldoAntes,saldoDepois) VALUES ('a3','r3','v3',25,100,75)").run();
  assert.equal(consultar('/api/recebimentos-cliente/:id/comprovante', { id: 'r3' }, { vendaId: 'v3' }).vales[0].saldoAtual, 75);
  const debitos = [], creditos = [];
  ajustarBonusFinalizacao('c', 0, 25.37, 'Teste ajuste', debitos, creditos);
  assert.equal(creditos.length, 1);
  assert.equal(db.prepare('SELECT valor FROM cliente_bonus_movimentos WHERE id=?').get(creditos[0]).valor, 25.37);
  ajustarBonusFinalizacao('c', 25.37, 10, 'Teste reducao', debitos, creditos);
  assert.equal(db.prepare('SELECT valor FROM cliente_bonus_movimentos WHERE id=?').get(debitos[0]).valor, 15.37);
  assert.throws(() => ajustarBonusFinalizacao('c', 10, -1, '', [], []), /bônus válido/);
  assert.throws(() => ajustarBonusFinalizacao('c', 10, NaN, '', [], []), /bônus válido/);
  db.prepare("INSERT INTO cliente_bonus_movimentos(id,clienteId,data,tipo,valor) VALUES ('uso','c','2026-10-01','debito',10)").run();
  assert.throws(() => ajustarBonusFinalizacao('c', 10, 0, '', [], []), /já foi utilizado/);
  console.log('OK: ajuste de bônus em centavos, redução, validação e bloqueio de saldo utilizado.');
  console.log('OK: lucro presumido, 4x iguais e finalização com vale residual rastreável sem duplicar receita.');
} finally { db.close(); }
