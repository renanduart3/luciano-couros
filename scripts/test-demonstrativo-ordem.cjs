const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const result = buildSync({ entryPoints: ['src/lib/demonstrativoOrdem.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(__filename);
mod.filename = __filename;
mod.paths = module.paths;
mod._compile(result.outputFiles[0].text, __filename);
const { demonstrativoOrdem } = mod.exports;
const cheque = { id: 'cheque', data: '2026-09-10', formaPagamento: 'cheque_emitente', status: 'ativo',
  statusPagamento: 'aguardando', valorRecebido: 3222, bonusUtilizado: 0, valorAplicado: 3222, valorAplicadoOrdem: 3222,
  titulos: [{ id: '1', numeroDocumento: '1', vencimento: '2026-09-10', valor: 2222, status: 'compensado' },
    { id: '2', numeroDocumento: '2', vencimento: '2026-10-16', valor: 1000, status: 'aguardando' }] };
const pix = { id: 'pix', data: '2026-09-10', formaPagamento: 'pix', status: 'ativo',
  statusPagamento: 'compensado', valorRecebido: 1000, bonusUtilizado: 0, valorAplicado: 1000, valorAplicadoOrdem: 1000, titulos: [] };
let ordem = { totalOriginal: 5000, pagamentos: [cheque, pix] };
let r = demonstrativoOrdem(ordem);
assert.equal(r.linhas.length, 3);
assert.deepEqual(r.linhas.map(l => l.data), ['2026-09-10', '2026-10-16', '2026-09-10']);
const boleto = { ...cheque, formaPagamento: 'duplicata_emitente', data: '2026-09-15',
  titulos: [{ ...cheque.titulos[0], vencimento: '2026-10-20', dataCompensacao: '2026-09-16' }] };
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [boleto] }).linhas[0].data, '2026-10-20');
for (const formaPagamento of ['cheque_emitente', 'cheque_terceiro', 'duplicata_emitente', 'duplicata_terceiro']) {
  for (const status of ['aguardando', 'compensado', 'recusado']) {
    const pagamento = { ...boleto, formaPagamento, titulos: boleto.titulos.map(t => ({ ...t, status })) };
    assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [pagamento] }).linhas[0].data, '2026-10-20');
  }
}
for (const formaPagamento of ['cheque_emitente', 'cheque_terceiro', 'duplicata_emitente', 'duplicata_terceiro']) {
  const pagamento = { ...boleto, formaPagamento, titulos: [{ ...boleto.titulos[0], nomeTitular: '  Tiago Rosa  ' }] };
  assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [pagamento] }).linhas[0].titular, 'Tiago Rosa');
}
for (const formaPagamento of ['pix', 'avista_debito', 'cartao_credito']) {
  for (const data of ['2026-09-10', '2099-12-20']) {
    assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...pix, formaPagamento, data }] }).linhas[0].data, data);
  }
}
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...boleto, titulos: [{ ...boleto.titulos[0], vencimento: '' }] }] }).linhas[0].data, boleto.data);
assert.deepEqual(r.linhas.map(l => l.valor), [2222, 1000, 1000]);
assert.equal(r.pago, 4222);
assert.equal(r.restante, 778);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...cheque, status: 'cancelado' }, pix] }).pago, 1000);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...pix, valorRecebido: 1200 }] }).pago, 1200);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...pix, valorAplicadoOrdem: 500 }] }).pago, 500);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [] }).restante, 5000);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...cheque, titulos: cheque.titulos.map(t => ({ ...t, status: 'recusado' })) }] }).pago, 0);
console.log('OK: títulos em linhas únicas; compensação parcial, estorno, recusados, bônus e recebimento compartilhado.');

const tabelaBuild = buildSync({ entryPoints: ['src/components/TabelaValesOrdem.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const tabelaMod = new Module(__filename);
tabelaMod.filename = __filename;
tabelaMod.paths = module.paths;
tabelaMod._compile(tabelaBuild.outputFiles[0].text, __filename);
const tabelaHtml = renderToStaticMarkup(React.createElement(tabelaMod.exports.TabelaValesOrdem, { ordem: {
  id: 'ordem', totalOriginal: 100, saldo: 50,
  vales: [{ id: 'vinculo', vendaId: 'vale', numeroSequencial: 12, data: '2026-10-10', valorOriginalVale: 120, valorVinculado: 100 }],
  pagamentos: [{ ...pix, valorRecebido: 50, valorAplicado: 50, valorAplicadoOrdem: 50 }],
} }));
assert.ok(tabelaHtml.includes('>Vale<') && tabelaHtml.includes('>Data<') && tabelaHtml.includes('>Valor<'));
assert.ok(tabelaHtml.includes('10/10/2026'));
assert.ok(tabelaHtml.includes('120,00') && tabelaHtml.includes('50,00'));
assert.ok(tabelaHtml.includes('>TOTAL<') && tabelaHtml.includes('>PAGO<') && tabelaHtml.includes('>DEVEDOR<'));
assert.ok(!tabelaHtml.includes('Abatido') && !tabelaHtml.includes('Transferido') && !tabelaHtml.includes('Falta'));

const demonstrativoBuild = buildSync({ entryPoints: ['src/components/OrdemCobrancaDemonstrativoModal.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const demonstrativoMod = new Module(__filename);
demonstrativoMod.filename = __filename;
demonstrativoMod.paths = module.paths;
demonstrativoMod._compile(demonstrativoBuild.outputFiles[0].text, __filename);
const demonstrativoHtml = renderToStaticMarkup(React.createElement(demonstrativoMod.exports.DemonstrativoOrdemConteudo, { ordem: {
  id: 'ordem', numeroSequencial: 1, dataEmissao: '2026-10-17', updatedAt: '2026-10-17', clienteNome: 'Cliente',
  totalOriginal: 100, vales: [{ id: 'vinculo', numeroSequencial: 12, data: '2026-10-10', valorOriginalVale: 120, valorVinculado: 100 }],
  pagamentos: [{ ...pix, valorRecebido: 50, valorAplicado: 50, valorAplicadoOrdem: 50 },
    { ...cheque, valorRecebido: 20, valorAplicado: 20, valorAplicadoOrdem: 20,
      titulos: [{ id: 'pendente', numeroDocumento: '45', nomeTitular: 'Renan Farias', vencimento: '2026-10-30', valor: 20, status: 'aguardando' }] }],
} }));
assert.match(demonstrativoHtml, /<th[^>]*>Situação<\/th><th[^>]*>Valor<\/th>/);
assert.match(demonstrativoHtml, /CHEQUE EMITENTE · #45 - Renan Farias<\/td><td[^>]*>Aguardando<\/td><td[^>]*>R\$\s*20,00<\/td>/);
assert.match(demonstrativoHtml, /<tr><td colSpan="3" class="p-2">TOTAL<\/td><td[^>]*>R\$\s*70,00<\/td><\/tr>/);
assert.equal((demonstrativoHtml.match(/>TOTAL<\/td>/g) || []).length, 2);
assert.ok(!demonstrativoHtml.includes('>PAGO<') && !demonstrativoHtml.includes('>DEVEDOR<'));
assert.ok(!demonstrativoHtml.includes('TOTAL DE CHEQUES') && !demonstrativoHtml.includes('TOTAL DOS PAGAMENTOS'));
assert.ok(demonstrativoHtml.includes('Aguardando compensação: <b>R$\u00a020,00'));
assert.ok(demonstrativoHtml.includes('RESTANTE</span><strong class="font-mono text-xl text-emerald-950">R$\u00a050,00'));
assert.ok(!demonstrativoHtml.includes('Dinheiro / títulos compensados:') && !demonstrativoHtml.includes('Restante após pagamentos registrados'));

r = demonstrativoOrdem({...ordem, vales:[{valorVinculado:60},{valorVinculado:40}], pagamentos:[{...cheque,valorRecebido:80,bonusUtilizado:20,valorAplicado:100,valorAplicadoOrdem:50,titulos:[{...cheque.titulos[0],valor:30},{...cheque.titulos[1],valor:50}]}]});
assert.deepEqual(r.linhas.map(l=>l.valor),[15,25,10]);
assert.equal(r.totalVales,100); assert.equal(r.totalTitulos,40);
assert.equal(r.recebido,15); assert.equal(r.aguardando,25); assert.equal(r.bonus,10); assert.equal(r.pago,50);
assert.equal(r.linhas.reduce((s,l)=>s+l.valor,0),r.pago);
r=demonstrativoOrdem({...ordem,pagamentos:[{...pix,valorRecebido:0,bonusUtilizado:20,formaPagamento:'bonus'}]});
assert.equal(r.linhas.length,1); assert.equal(r.linhas[0].forma,'Bônus utilizado');
console.log('OK: totais de vales/títulos, rateio e bônus em linha própria sem duplicar pagamento.');

r=demonstrativoOrdem({...ordem,pagamentos:[{...pix,valorRecebido:0.01,bonusUtilizado:0.01,valorAplicado:0.02,valorAplicadoOrdem:0.01}]});
assert.equal(r.linhas.reduce((s,l)=>s+Math.round(l.valor*100),0),Math.round(r.pago*100));
console.log('OK: rateio conserva o centavo entre dinheiro e bônus.');
