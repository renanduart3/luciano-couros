const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
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
for (const formaPagamento of ['pix', 'avista_debito', 'cartao_credito']) {
  for (const data of ['2026-09-10', '2099-12-20']) {
    assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...pix, formaPagamento, data }] }).linhas[0].data, data);
  }
}
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...boleto, titulos: [{ ...boleto.titulos[0], vencimento: '' }] }] }).linhas[0].data, boleto.data);
assert.deepEqual(r.linhas.map(l => l.valor), [2222, 1000, 1000]);
assert.equal(r.pago, 3222);
assert.equal(r.restante, 1778);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...cheque, status: 'cancelado' }, pix] }).pago, 1000);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...pix, valorRecebido: 1200 }] }).pago, 1200);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...pix, valorAplicadoOrdem: 500 }] }).pago, 500);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [] }).restante, 5000);
assert.equal(demonstrativoOrdem({ ...ordem, pagamentos: [{ ...cheque, titulos: cheque.titulos.map(t => ({ ...t, status: 'recusado' })) }] }).pago, 0);
console.log('OK: títulos em linhas únicas; compensação parcial, estorno, recusados, bônus e recebimento compartilhado.');
