const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

const source = `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComprovanteRecebimentoModal } from './src/components/ComprovanteRecebimentoModal';
export const render = comprovante => renderToStaticMarkup(<ComprovanteRecebimentoModal embedded comprovante={comprovante} onClose={() => {}} />);`;
const compiled = buildSync({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.png': 'dataurl' }, write: false });
const mod = new Module(path.join(process.cwd(), 'scripts/comprovante-runtime.cjs'));
mod.filename = mod.id; mod.paths = module.paths;
mod._compile(compiled.outputFiles[0].text, mod.filename);

const recibo = {
  id: 'rec_teste', data: '2026-10-15', clienteNome: 'Cliente teste', formaPagamento: 'pix',
  valorRecebido: 1200, valorAplicado: 1200, titulos: [],
  vales: [{ numeroSequencial: 810, data: '2026-10-09', valorVale: 1553.4, saldoAntes: 1553.4, saldoDepois: 353.4, saldoAtual: 353.4 }],
  pagamentosVale: [{ id: 'p1', data: '2026-10-15', formaPagamento: 'pix', valorNoVale: 1200,
    valorRecebido: 1200, bonusUtilizado: 0, titulos: [], statusPagamento: 'compensado' }],
};
const html = mod.exports.render(recibo);
assert.match(html, /<tfoot><tr><td colSpan="4">TOTAL<\/td><td class="number">R\$\s*1\.200,00/);
assert.match(html, /<th>VALE<\/th><th>Nº VALE<\/th><th>DATA EMISSÃO<\/th>/);
assert.match(html, /<td>09\/10\/2026<\/td>/);
assert.match(html, /TOTAL VALES<\/td><td class="number">R\$\s*1\.553,40/);
assert.match(html, /VALOR VALE/);
assert.match(html, /DEVEDOR/);
assert.match(html, /R\$\s*353,40/);
assert.match(html, /TOTAL PAGO/);
assert.equal((html.match(/R\$\s*1\.200,00/g) || []).length, 3);

const ordem = mod.exports.render({ ...recibo, resumoOrdem: { numero: 12, totalOriginal: 1553.4, saldo: 353.4, valeDevedor: 811 } });
assert.match(ordem, /VALOR DA ORDEM/);
assert.match(ordem, /Saldo devedor transferido para o vale #811/);
const ordem19 = mod.exports.render({ ...recibo,
  resumoOrdem: { numero: 19, totalOriginal: 1127.4, saldo: 0 },
  vales: [
    { numeroSequencial: 153, data: '2026-08-21', valorVale: 2421.4, saldoAntes: 1127.4, saldoDepois: 0 },
    { numeroSequencial: 154, data: '2026-08-21', valorVale: 481.8, saldoAntes: 0, saldoDepois: 0 },
  ],
});
assert.match(ordem19, /TOTAL VALES<\/td><td class="number">R\$\s*2\.903,20/);
assert.match(ordem19, /VALOR DA ORDEM<\/td><td class="number">R\$\s*2\.903,20/);
const titulo = (n, data) => ({ id: `t${n}`, tipo: 'cheque_emitente', numeroDocumento: String(n), valor: 200,
  vencimento: '2026-10-30', dataCompensacao: data, status: 'compensado' });
const quatroCheques = mod.exports.render({ ...recibo, pagamentosVale: [{ ...recibo.pagamentosVale[0],
  formaPagamento: 'cheque_emitente', valorNoVale: 800, valorRecebido: 800,
  titulos: [titulo(1111, '2026-10-10'), titulo(1112, '2026-10-11'), titulo(1113, '2026-10-12'), titulo(1114, '2026-10-13')] }] });
assert.equal((quatroCheques.match(/<td>111[1-4]<\/td>/g) || []).length, 4);
assert.equal((quatroCheques.match(/<td>1[0-3]\/10\/2026<\/td>/g) || []).length, 4);
assert.equal((quatroCheques.match(/R\$\s*200,00/g) || []).length, 4);
console.log('OK: nomenclaturas e valores do recibo de vale e ordem.');
