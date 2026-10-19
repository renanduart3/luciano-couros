const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

const source = `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComprovanteFinalizacaoOrdem } from './src/components/ComprovanteFinalizacaoOrdem';
export const render = ordem => renderToStaticMarkup(<ComprovanteFinalizacaoOrdem ordem={ordem} />);`;
const compiled = buildSync({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.png': 'dataurl' }, write: false });
const mod = new Module(path.join(process.cwd(), 'scripts/comprovante-ordem-runtime.cjs'));
mod.filename = mod.id; mod.paths = module.paths;
mod._compile(compiled.outputFiles[0].text, mod.filename);

const pix = (valor) => ({ id: 'pix', data: '2026-10-19', formaPagamento: 'pix', status: 'ativo',
  statusPagamento: 'compensado', valorRecebido: valor, valorAplicado: valor, valorAplicadoOrdem: valor,
  bonusUtilizado: 0, titulos: [] });
const ordem = { id: 'ordem-15', numeroSequencial: 15, clienteNome: 'Cliente teste', clienteEndereco: 'Rua Teste, 10',
  dataEmissao: '2026-10-01', finalizadoAt: '2026-10-19T15:00:00.000Z', totalOriginal: 2903.2,
  observacao: 'Acerto da ordem', vales: [
    { numeroSequencial: 153, valorOriginalVale: 2421.4, valorVinculado: 2000 },
    { numeroSequencial: 154, valorOriginalVale: 481.8, valorVinculado: 400 },
  ], pagamentos: [pix(3200)] };
const html = mod.exports.render(ordem);
assert.equal((html.match(/class="receipt-copy"/g) || []).length, 2);
assert.equal((html.match(/ORDEM DE COBRANÇA #15/g) || []).length, 2);
assert.equal((html.match(/R\$\s*2\.903,20/g) || []).length, 4);
assert.equal((html.match(/-R\$\s*3\.200,00/g) || []).length, 4);
assert.equal((html.match(/BÔNUS GERADO/g) || []).length, 2);
assert.equal((html.match(/-R\$\s*296,80/g) || []).length, 2);
assert.match(html, /Rua Teste, 10/);
assert.match(html, /19\/10\/2026/);
assert.doesNotMatch(html, /2\.400,00/);

const devedor = mod.exports.render({ ...ordem, pagamentos: [pix(2000)] });
assert.match(devedor, /DEVEDOR/);
assert.match(devedor, /R\$\s*903,20/);
console.log('OK: comprovante exclusivo da ordem em duas vias, total dos vales, pago e bônus.');
