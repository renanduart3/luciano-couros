const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');

const result = buildSync({ entryPoints: ['src/lib/valesCliente.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(__filename);
mod.filename = __filename;
mod.paths = module.paths;
mod._compile(result.outputFiles[0].text, __filename);
const { listarValesPendentesCliente, vencimentoPendente } = mod.exports;

const vale = (id, numeroSequencial, restantePresumido, vencimento, status = 'pendente', parcelas = []) => ({
  id, numeroSequencial, vencimento, status, parcelas, financeiro: { restantePresumido }
});
const vencido = vale('vencido', 1, 40, '2026-09-01', 'pendente', [
  { vencimento: '2026-09-01', status: 'paga', saldo: 0 },
  { vencimento: '2026-09-10', status: 'pendente', saldo: 40 }
]);
const aVencer = vale('a-vencer', 2, 20, '2026-10-10');
const quitado = vale('quitado', 3, 0, '2026-09-01', 'paga');
const cancelado = vale('cancelado', 4, 20, '2026-09-01', 'cancelada');
const vendaNormal = vale('normal', 5, 20, undefined);

assert.equal(vencimentoPendente(vencido), '2026-09-10');
assert.deepEqual(listarValesPendentesCliente([aVencer, cancelado, quitado, vendaNormal, vencido]).map(v => v.id), ['vencido', 'a-vencer']);
console.log('OK: ficha do cliente lista só vales em aberto, considera o vencimento pendente e ordena os vencidos primeiro.');
