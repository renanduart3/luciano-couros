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
const conferirResumo = (html, total, pago, devedor, bonus) => {
  assert.match(html, new RegExp(`<dt>TOTAL<\\/dt><dd>R\\$\\s*${total}<\\/dd>.*?<dt>PAGO<\\/dt><dd>R\\$\\s*${pago}<\\/dd>.*?<dt>DEVEDOR<\\/dt><dd>R\\$\\s*${devedor}<\\/dd>.*?<dt>BÔNUS<\\/dt><dd>R\\$\\s*${bonus}<\\/dd>`));
};

const recibo = {
  id: 'rec_teste', data: '2026-10-15', clienteNome: 'Cliente teste', formaPagamento: 'pix',
  valorRecebido: 1200, valorAplicado: 1200, titulos: [],
  vales: [{ numeroSequencial: 810, data: '2026-10-09', valorVale: 1553.4, saldoAntes: 1553.4, saldoDepois: 353.4, saldoAtual: 353.4 }],
  pagamentosVale: [{ id: 'p1', data: '2026-10-15', formaPagamento: 'pix', valorNoVale: 1200,
    valorRecebido: 1200, bonusUtilizado: 0, titulos: [], statusPagamento: 'compensado' }],
};
const html = mod.exports.render(recibo);
assert.match(html, /<tfoot><tr><td colSpan="4">TOTAL PAGAMENTOS<\/td><td class="number">R\$\s*1\.200,00/);
assert.match(html, /<th>VALE<\/th><th>Nº VALE<\/th><th>DATA EMISSÃO<\/th>/);
assert.match(html, /<td>09\/10\/2026<\/td>/);
assert.match(html, /TOTAL VALES<\/td><td class="number">R\$\s*1\.553,40/);
conferirResumo(html, '1\\.553,40', '1\\.200,00', '353,40', '0,00');
assert.doesNotMatch(html, /VALOR VALE|TOTAL PAGO/);
assert.equal((html.match(/R\$\s*1\.200,00/g) || []).length, 3);

const creditoDeDevolucao = mod.exports.render({ ...recibo, bonusGeradoVale: 380 });
assert.doesNotMatch(creditoDeDevolucao, /DEMONSTRATIVO DE BÔNUS/);

const vale138 = mod.exports.render({ ...recibo, bonusGeradoVale: 1308.55,
  vales: [{ vendaId: 'vale138', numeroSequencial: 138, valorVale: 2469.9, saldoAntes: 2469.9, saldoDepois: 0 }],
  pagamentosVale: [{ ...recibo.pagamentosVale[0], valorNoVale: 2469.9, valorAplicado: 2469.9,
    valorRecebido: 3398.45, bonusGerado: 928.55, alocacoes: [{ vendaId: 'vale138', valor: 2469.9 }] }],
});
conferirResumo(vale138, '2\\.469,90', '3\\.398,45', '0,00', '928,55');
assert.doesNotMatch(vale138, /R\$\s*1\.308,55/);

const excedente = {
  ...recibo, bonusGeradoVale: 829.8,
  vales: [{ vendaId: 'vale174', numeroSequencial: 174, valorVale: 8170.2, saldoAntes: 8170.2, saldoDepois: 0 }],
  pagamentosVale: [{ ...recibo.pagamentosVale[0], status: 'ativo', valorNoVale: 8170.2, valorAplicado: 8170.2,
    valorRecebido: 9000, bonusGerado: 829.8, alocacoes: [{ vendaId: 'vale174', valor: 8170.2 }] }],
};
const htmlExcedente = mod.exports.render(excedente);
assert.match(htmlExcedente, /class="number strong">R\$\s*9\.000,00/);
assert.match(htmlExcedente, /TOTAL PAGAMENTOS<\/td><td class="number">R\$\s*9\.000,00/);
conferirResumo(htmlExcedente, '8\\.170,20', '9\\.000,00', '0,00', '829,80');
const varios = mod.exports.render({ ...excedente, pagamentosVale: [
  { ...excedente.pagamentosVale[0], id: 'primeiro', valorRecebido: 1000, valorNoVale: 1000, valorAplicado: 1000, alocacoes: [{ vendaId: 'vale174', valor: 1000 }] },
  { ...excedente.pagamentosVale[0], id: 'segundo', valorRecebido: 8000, valorNoVale: 7170.2, valorAplicado: 7170.2, alocacoes: [{ vendaId: 'vale174', valor: 7170.2 }] },
] });
assert.match(varios, /TOTAL PAGAMENTOS<\/td><td class="number">R\$\s*9\.000,00/);
const compartilhado = { ...excedente.pagamentosVale[0], valorRecebido: 120, bonusUtilizado: 20, valorAplicado: 100, valorNoVale: 40,
  alocacoes: [{ vendaId: 'vale174', valor: 40 }, { vendaId: 'outro', valor: 60 }] };
const rateado = mod.exports.render({ ...excedente, pagamentosVale: [compartilhado] });
assert.match(rateado, /TOTAL PAGAMENTOS<\/td><td class="number">R\$\s*56,00/);
assert.match(rateado, /BÔNUS UTILIZADO<\/td>.*?R\$\s*8,00/);
const ordemExcedente = mod.exports.render({ ...excedente, resumoOrdem: { id: 'ordem', numero: 15, saldo: 0 },
  pagamentosVale: [{ ...excedente.pagamentosVale[0], ordemCobrancaId: 'ordem' }] });
assert.match(ordemExcedente, /TOTAL PAGAMENTOS<\/td><td class="number">R\$\s*9\.000,00/);

const ordem = mod.exports.render({ ...recibo, resumoOrdem: { numero: 12, totalOriginal: 1553.4, saldo: 353.4, valeDevedor: 811 } });
assert.doesNotMatch(ordem, /VALOR DA ORDEM/);
assert.match(ordem, /Saldo devedor transferido para o vale #811/);
assert.match(ordem, /payment-receipt-transfer/);
const ordem19 = mod.exports.render({ ...recibo,
  resumoOrdem: { numero: 19, totalOriginal: 1127.4, saldo: 0 },
  vales: [
    { numeroSequencial: 153, data: '2026-08-21', valorVale: 2421.4, saldoAntes: 1127.4, saldoDepois: 0 },
    { numeroSequencial: 154, data: '2026-08-21', valorVale: 481.8, saldoAntes: 0, saldoDepois: 0 },
  ],
});
assert.match(ordem19, /TOTAL VALES<\/td><td class="number">R\$\s*2\.903,20/);
assert.match(ordem19, /TOTAL PAGAMENTOS<\/td><td class="number">R\$\s*1\.200,00/);
conferirResumo(ordem19, '2\\.903,20', '1\\.200,00', '1\\.703,20', '0,00');
assert.doesNotMatch(ordem19, /<td colSpan="4">DEVEDOR<\/td>/);
assert.doesNotMatch(ordem19, /VALOR DA ORDEM|TOTAL PAGO/);
const titulo = (n, data) => ({ id: `t${n}`, tipo: 'cheque_emitente', numeroDocumento: String(n), valor: 200,
  vencimento: '2026-10-30', dataCompensacao: data, status: 'compensado' });
const quatroCheques = mod.exports.render({ ...recibo, pagamentosVale: [{ ...recibo.pagamentosVale[0],
  formaPagamento: 'cheque_emitente', valorNoVale: 800, valorRecebido: 800,
  titulos: [titulo(1111, '2026-10-10'), titulo(1112, '2026-10-11'), titulo(1113, '2026-10-12'), titulo(1114, '2026-10-13')] }] });
assert.equal((quatroCheques.match(/<td>111[1-4]<\/td>/g) || []).length, 4);
assert.equal((quatroCheques.match(/<td>1[0-3]\/10\/2026<\/td>/g) || []).length, 4);
assert.equal((quatroCheques.match(/R\$\s*200,00/g) || []).length, 4);

const tituloOrdem = (id, tipo, titular, valor, numeroDocumento) => ({ id, tipo, nomeTitular: titular,
  numeroDocumento, vencimento: '2026-11-18', status: 'aguardando', valor });
const pagamentoOrdem = (id, valor, titulo) => ({ id, data: '2026-10-19', formaPagamento: titulo?.tipo || 'pix',
  status: 'ativo', statusPagamento: titulo ? 'aguardando' : 'compensado', valorRecebido: valor,
  valorAplicado: valor, valorNoVale: valor, bonusUtilizado: 0, titulos: titulo ? [titulo] : [] });
const ordem20 = mod.exports.render({ ...recibo, id: 'ordem_20', resumoOrdem: { id: 'ordem20', numero: 20, saldo: 0 },
  vales: [2271, 437.8, 836, 110, 3630].map((valorVale, i) => ({ numeroSequencial: [164, 175, 176, 177, 178][i], valorVale, data: '2026-10-17' })),
  pagamentosVale: [
    pagamentoOrdem('pix1', 3000),
    pagamentoOrdem('cq', 250, tituloOrdem('t1', 'cheque_emitente', 'Roberto Alencar Mendes', 250, '45')),
    pagamentoOrdem('cqter', 1000, tituloOrdem('t2', 'cheque_terceiro', 'Maria Souza', 1000, '67')),
    pagamentoOrdem('bo', 1000, tituloOrdem('t3', 'duplicata_emitente', 'Roberto Alencar Mendes', 1000, '68')),
    pagamentoOrdem('boter', 1000, tituloOrdem('t4', 'duplicata_terceiro', 'João Lima', 1000, '69')),
    pagamentoOrdem('pix2', 3500),
  ],
});
for (const forma of ['CQ · Roberto Alencar Mendes', 'CQ-TER · Maria Souza', 'BO · Roberto Alencar Mendes', 'BO-TER · João Lima'])
  assert.ok(ordem20.includes(forma), forma);
conferirResumo(ordem20, '7\\.284,80', '9\\.750,00', '0,00', '2\\.465,20');
const ordem17 = mod.exports.render({ ...recibo, id: 'ordem_17', resumoOrdem: { numero: 17, saldo: 0 },
  vales: [{ numeroSequencial: 168, valorVale: 2675.2 }, { numeroSequencial: 169, valorVale: 92.2 }],
  pagamentosVale: [pagamentoOrdem('pix17', 7000)],
});
conferirResumo(ordem17, '2\\.767,40', '7\\.000,00', '0,00', '4\\.232,60');
assert.doesNotMatch(ordem20, /SALDO \(TOTAL VALES/);
assert.match(ordem20, /payment-receipt-order/);
console.log('OK: nomenclaturas e valores do recibo de vale e ordem.');
