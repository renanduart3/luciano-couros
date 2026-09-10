const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const compiled = buildSync({ entryPoints: ['src/lib/saldoCliente.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(path.resolve('scripts/saldo-test.cjs'));
mod.filename = path.resolve('scripts/saldo-test.cjs');
mod.paths = module.paths;
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { demonstrativoSaldoCliente } = mod.exports;
const cliente = { id: 'cliente', nome: 'Cliente teste' };
const vale = n => ({ id: String(n), clienteId: cliente.id, numeroSequencial: n, data: '2026-09-10', status: 'pendente', totalLiquido: 30.03, valorPago: 20.02, saldoRestante: 10.01 });
for (const n of [0, 1, 15, 16, 40]) {
  const result = demonstrativoSaldoCliente(cliente, Array.from({ length: n }, (_, i) => vale(i + 1)));
  assert.equal(result.quantidadeVales, n);
  assert.equal(result.totais.totalVale, n * 3003 / 100);
  assert.equal(result.totais.totalPago, n * 2002 / 100);
  assert.equal(result.linhas.reduce((s, l) => s + Math.round(l.totalVale * 100), 0), n * 3003);
  assert.equal(result.linhas.reduce((s, l) => s + Math.round(l.totalPago * 100), 0), n * 2002);
  assert.equal(result.linhas.length, n > 15 ? 1 : n);
  assert.equal(result.totais.saldo, n * 1001 / 100);
  assert.equal(result.linhas.reduce((s, i) => s + Math.round(i.saldo * 100), 0), n * 1001);
}
const result = demonstrativoSaldoCliente(cliente, [
  vale(2), vale(1), { ...vale(3), status: 'cancelada' }, { ...vale(4), saldoRestante: 0 },
  { ...vale(5), deletedAt: '2026-09-10' }, { ...vale(6), clienteId: 'outro' }
]);
assert.equal(result.quantidadeVales, 2);
assert.match(result.linhas[0].descricao, /Vale #1/);
assert.equal(result.totais.saldo, 20.02);
console.log('OK: demonstrativo com 0, 1, 15, 16 e 40 vales; centavos, ordenação e exclusão de cancelados/quitados/outro cliente');
