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
  .replace('startServer();', 'export { app, db };')
  .replace('runAutoBackup();', '')
  .replace('setInterval(runAutoBackup, 12 * 60 * 60 * 1000);', '')
  .replace('setInterval(executarProgramacaoFinanceira, 60_000).unref();', '')
  .replace('setTimeout(executarProgramacaoFinanceira, 0).unref();', '');
source += '\nexport { fecharPosicao } from "./src/lib/financeiro"; export { descreverParcelamentoCartao } from "./src/components/ParcelamentoCartaoSelect";';
const compiled = buildSync({ stdin: { contents: source, resolveDir: raiz, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
process.chdir(temp);
const mod = new Module(path.join(raiz, 'scripts/finalizacao-runtime.cjs'));
mod.filename = mod.id; mod.paths = module.paths; mod._compile(compiled.outputFiles[0].text, mod.filename);
const { app, db, fecharPosicao, descreverParcelamentoCartao } = mod.exports;

function chamar(rota, params, body) {
  const camada = app._router.stack.find(item => item.route?.path === rota && item.route.methods.post);
  let resposta, status = 200;
  camada.route.stack[0].handle({ params, body }, { status(codigo) { status = codigo; return this; }, json(valor) { resposta = valor; } });
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

  const resultado = chamar('/api/ordens-cobranca/:id/finalizar', { id: 'o1' }, { pin: '1234', destinoRestante: 'novo_vale', zerarExcedente: false });
  assert.equal(resultado.ordem.finalizadoAt != null, true);
  assert.equal(resultado.valeResidual.numeroSequencial, 2);
  const origem = db.prepare("SELECT status,saldoRestante,finalizadoAt FROM vendas WHERE id='v1'").get();
  const residual = db.prepare("SELECT totalLiquido,saldoRestante,contabilizaReceita,valeOrigemIds,observacoes FROM vendas WHERE id=?").get(resultado.valeResidual.id);
  assert.deepEqual({ status: origem.status, saldo: origem.saldoRestante, finalizado: Boolean(origem.finalizadoAt) }, { status: 'paga', saldo: 0, finalizado: true });
  assert.equal(residual.totalLiquido, 60); assert.equal(residual.saldoRestante, 60); assert.equal(residual.contabilizaReceita, 0);
  assert.deepEqual(JSON.parse(residual.valeOrigemIds), [1]); assert.match(residual.observacoes, /Restante dos vales #1/);
  console.log('OK: lucro presumido, 4x iguais e finalização com vale residual rastreável sem duplicar receita.');
} finally { db.close(); }
