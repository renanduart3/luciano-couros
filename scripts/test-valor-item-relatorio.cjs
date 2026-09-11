const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const result = buildSync({ entryPoints: ['server/valorItemRelatorio.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(__filename);
mod._compile(result.outputFiles[0].text, __filename);
const { valorItemRelatorioSql } = mod.exports;
const db = new Database(':memory:');
db.exec(`CREATE TABLE vendas(id TEXT, subtotal REAL, desconto REAL, totalLiquido REAL);
CREATE TABLE itens_venda(id TEXT, vendaId TEXT, quantidade REAL, total REAL);
CREATE TABLE itens_devolucao(itemVendaId TEXT, quantidade REAL);
INSERT INTO vendas VALUES ('487', 1304.03, 1302.726, 1304.03);
INSERT INTO itens_venda VALUES ('madeira', '487', 11.47, 778.813), ('coral', '487', 2.3, 167.67), ('terra', '487', 5.27, 357.833);`);
const consultar = (filtro = '') => db.prepare(`SELECT iv.id,
  (${valorItemRelatorioSql}) * (iv.quantidade - COALESCE((SELECT SUM(quantidade) FROM itens_devolucao WHERE itemVendaId = iv.id), 0)) / iv.quantidade AS valor
  FROM itens_venda iv JOIN vendas v ON v.id = iv.vendaId ${filtro}`).all();
const perto = (a, b) => assert.ok(Math.abs(a - b) < 0.000001, `${a} != ${b}`);
const soma = () => consultar().reduce((s, i) => s + i.valor, 0);
// Subtotal/desconto inconsistentes não podem produzir receita em centavos
// quando a venda registra o total integral.
perto(soma(), 1304.03);
assert.ok(consultar()[0].valor > 778);
perto(consultar("WHERE iv.id = 'madeira'")[0].valor, consultar()[0].valor);
// Desconto legítimo é preservado e distribuído proporcionalmente.
db.exec('UPDATE vendas SET totalLiquido = 1173.627');
perto(soma(), 1173.627);
// Devolução parcial não pode ser descontada duas vezes.
db.exec("INSERT INTO itens_devolucao VALUES ('coral', 1); UPDATE vendas SET totalLiquido = 1108.017");
perto(soma(), 1108.017);
// Devolução integral e venda gratuita não geram NaN nem receita fictícia.
db.exec("INSERT INTO itens_devolucao VALUES ('coral', 1.3)");
perto(consultar("WHERE iv.id = 'coral'")[0].valor, 0);
db.exec('UPDATE vendas SET totalLiquido = 0');
assert.ok(consultar().every(i => i.valor === 0));
db.exec("INSERT INTO itens_devolucao VALUES ('madeira', 11.47), ('terra', 5.27)");
assert.ok(consultar().every(i => i.valor === 0));
db.close();
console.log('OK: rateio, filtros, descontos, devoluções e valor líquido zero.');
