const assert = require('node:assert/strict');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const compiled = buildSync({ entryPoints: ['src/lib/totaisVenda.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(__filename);
mod._compile(compiled.outputFiles[0].text, __filename);
const { arredondarDinheiro, totalItemVenda, totaisVenda, validarTotalEsperado } = mod.exports;

// Caso da loja: a devolução de 1,65 m a R$ 79,90 não pode perder um centavo.
assert.equal(arredondarDinheiro(-1.65 * 79.90), -131.84);
assert.equal(arredondarDinheiro(-2.17 * 79.90), -173.38);
assert.equal(arredondarDinheiro(1.65 * 80.50), 132.83);
assert.equal(arredondarDinheiro(-1.65 * 80.50), -132.83);
for (const valor of [1.005, 131.835, 0.005, 9.995, 173.383]) {
  assert.equal(arredondarDinheiro(-valor), -arredondarDinheiro(valor));
}
const itens = [
  { total: totalItemVenda(1, 1200) },
  { total: arredondarDinheiro(-2.17 * 79.90) },
  { total: arredondarDinheiro(-1.65 * 79.90) },
];
const venda = totaisVenda(itens, 120);
assert.equal(venda.subtotal, 894.78);
assert.equal(venda.totalLiquido, 774.78);
validarTotalEsperado(774.78, venda.totalLiquido);
assert.throws(() => validarTotalEsperado(774.79, venda.totalLiquido), /diverge/);
const devolucao = totaisVenda(itens.slice(1), 0);
assert.equal(devolucao.totalLiquido, 0);
assert.equal(devolucao.creditoLinhaDevolucao, 305.22);
console.log('OK: arredondamento simétrico de devoluções, totais com desconto e crédito excedente.');
