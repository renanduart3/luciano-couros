import assert from 'node:assert/strict';
import { linhasDoPagamento } from '../src/lib/linhasComprovante.ts';

const titulo = (n, status = 'compensado') => ({ id: `t${n}`, tipo: 'cheque_emitente', numeroDocumento: String(1110 + n),
  valor: 200, vencimento: `2026-10-${String(n).padStart(2, '0')}`, dataCompensacao: status === 'compensado' ? `2026-10-${String(n + 10).padStart(2, '0')}` : undefined, status });
const pagamento = (valorNoVale, titulos, bonusUtilizado = 0) => ({ id: 'rec_1', data: '2026-10-01',
  formaPagamento: 'cheque_emitente', valorNoVale, valorRecebido: 800, bonusUtilizado,
  statusPagamento: 'compensado', titulos });

const quatro = linhasDoPagamento(pagamento(800, [1, 2, 3, 4].map(n => titulo(n))));
assert.equal(quatro.length, 4);
assert.deepEqual(quatro.map(linha => linha.valor), [200, 200, 200, 200]);
assert.deepEqual(quatro.map(linha => linha.data), ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
assert.deepEqual(quatro.map(linha => linha.numero), ['1111', '1112', '1113', '1114']);

const parcial = linhasDoPagamento(pagamento(327, [1, 2, 3, 4].map(n => titulo(n))));
assert.equal(parcial.reduce((total, linha) => total + linha.valor, 0), 327);
assert.ok(parcial.every(linha => linha.detalhe?.includes('parcela aplicada')));

const recusado = linhasDoPagamento(pagamento(400, [titulo(1), titulo(2), titulo(3, 'recusado')]));
assert.deepEqual(recusado.map(linha => linha.valor), [200, 200, 0]);
assert.equal(recusado[2].situacao, 'RECUSADO');
assert.equal(recusado[2].data, '2026-10-03');

const comBonus = linhasDoPagamento(pagamento(450, [titulo(1), titulo(2)], 50));
assert.deepEqual(comBonus.map(linha => linha.valor), [200, 200, 50]);
assert.equal(comBonus[2].forma, 'BÔNUS UTILIZADO');
console.log('OK: linhas individuais, datas de compensação, rateio, título recusado e bônus.');
