const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const result = buildSync({ entryPoints: ['src/components/VendaComprovante.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.png': 'dataurl' }, write: false });
const mod = new Module(__filename);
mod.filename = __filename;
mod.paths = module.paths;
mod._compile(result.outputFiles[0].text, __filename);
const venda = { id: 'teste', numeroSequencial: 514, data: '2026-09-11', subtotal: 236.30, desconto: 0, totalLiquido: 236.30, valorPago: 0, vencimento: '2099-10-08', items: [{ id: 'item', descricao: 'ESTF COROLA', unidade: 'metro', quantidade: 2.49, precoUnitario: 94.9, total: 236.30 }] };
const render = v => renderToStaticMarkup(React.createElement(mod.exports.VendaComprovante, { venda: v }));
let html = render(venda);
assert.equal((html.match(/236,30/g) || []).length, 4); // item e rodapé das duas vias
assert.ok(!html.includes('0,24'));
html = render({ ...venda, totalLiquido: 0.24, desconto: 236.06 });
assert.ok(html.includes('236,06'));
assert.ok(html.includes('DESCONTOS / AJUSTES DE DEVOLUÇÃO'));
assert.equal((html.match(/0,24/g) || []).length, 2);
const devolucao = { items: [{ itemVendaId: 'item', quantidade: 1, totalCredito: 94.9 }] };
html = render({ ...venda, totalLiquido: 141.4, devolucoes: [devolucao], items: [{ ...venda.items[0], quantidadeDevolvida: 1, quantidadeDisponivel: 1.49 }] });
assert.equal((html.match(/DEVOLVIDO: ESTF COROLA/g) || []).length, 2);
assert.equal((html.match(/-1,00/g) || []).length, 2);
assert.equal((html.match(/-R\$\s?94,90/g) || []).length, 2);
assert.equal((html.match(/receipt-return-row/g) || []).length, 2);
assert.equal((html.match(/141,40/g) || []).length, 2);
const itens = Array.from({ length: 14 }, (_, index) => ({ ...venda.items[0], id: `item-${index}`, descricao: `PRODUTO ${index}`, quantidade: 2, precoUnitario: 10, total: 20 }));
const devolucoes = [{ items: [0, 1].map(index => ({ itemVendaId: `item-${index}`, quantidade: 1, totalCredito: 10 })) , valorCredito: 20 }];
html = render({ ...venda, items: itens, devolucoes, totalLiquido: 260 });
assert.equal((html.match(/data-receipt-page=/g) || []).length, 2);
assert.equal((html.match(/receipt-return-row/g) || []).length, 4);
for (const via of html.matchAll(/<tbody>(.*?)<\/tbody>/g)) {
  assert.equal((via[1].match(/<tr/g) || []).length, 15);
}
assert.ok(html.indexOf('PRODUTO 13') < html.indexOf('DEVOLVIDO: PRODUTO 0'));
html = render({ ...venda, devolucoes: [{ ...devolucao, modalidade: 'bonus_integral', valorCredito: 94.9 }], totalMercadoriasAposDevolucoes: 141.4 });
assert.ok(html.includes('BÔNUS DEV. (DÍVIDA MANTIDA)'));
assert.equal((html.match(/236,30/g) || []).length, 4);
html = render({ ...venda, items: [venda.items[0]], devolucoes: [{ ...devolucao, valorCredito: 236.30, items: [{ itemVendaId: 'item', quantidade: 2.49, totalCredito: 236.30 }] }], totalLiquido: 0 });
assert.equal((html.match(/DEVOLVIDO: ESTF COROLA/g) || []).length, 2);
assert.equal((html.match(/VALOR TOTAL/g) || []).length, 2);
console.log('OK: duas vias, devoluções parcial e integral, paginação de 15 linhas e valores.');

html = render({ ...venda, contabilizaReceita: 0, items: [], totalLiquido: 60, valorPago: 20, saldoRestante: 40,
  origemSaldo: { ordem: { id: 'o', numero: 12 }, vales: Array.from({length: 20}, (_, i) => ({ id: `v${i}`, numero: 100+i, valor: 3 })) } });
assert.ok(html.includes('VALE DE SALDO DEVEDOR'));
assert.ok(html.includes('Saldo devedor do vale #119 / ordem #12'));
assert.ok(html.includes('40,00'));
assert.ok(!html.includes('DESCONTOS / AJUSTES'));
assert.ok(!html.includes('Nº ITENS'));
assert.equal((html.match(/data-receipt-page=/g) || []).length, 2);
console.log('OK: residual com valor, saldo e todas as referências, sem itens ou descontos fictícios.');
