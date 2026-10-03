const assert = require('node:assert/strict');
const { ordensDoRecebimento } = require('../src/lib/ordensDoRecebimento.ts');
const pagamento = { id: 'p1', clienteId: 'c1', alocacoes: [{ vendaId: 'v1' }] };
const ordem = { id: 'o18', numeroSequencial: 18, clienteId: 'c1', status: 'aberta', vales: [{ vendaId: 'v1' }], pagamentos: [] };
const ids = (p, ordens) => ordensDoRecebimento(p, ordens).map(o => o.id);
assert.deepEqual(ids(pagamento, []), [], 'individual sem ordem continua livre');
assert.deepEqual(ids(pagamento, [ordem]), ['o18'], 'vale incorporado à ordem também redireciona');
assert.deepEqual(ids(pagamento, [{ ...ordem, vales: [] }]), [], 'vale removido deixa de bloquear');
assert.deepEqual(ids(pagamento, [{ ...ordem, status: 'cancelada' }]), [], 'vínculo apenas pelo vale termina com a ordem');
for (const status of ['aberta', 'quitada', 'cancelada', 'renegociada']) {
  assert.deepEqual(ids({ ...pagamento, ordemCobrancaId: 'o18' }, [{ ...ordem, status, vales: [] }]), ['o18'], 'pagamento da ordem não vira avulso ao encerrar');
}
assert.deepEqual(ids(pagamento, [{ ...ordem, vales: [], pagamentos: [{ id: 'p1' }] }]), ['o18']);
assert.deepEqual(ids({ ...pagamento, parcelasOrdem: [{ ordemId: 'o18' }] }, [{ ...ordem, vales: [] }]), ['o18'], 'parcelamento antigo preservado');
assert.deepEqual(ids(pagamento, [{ ...ordem, clienteId: 'outro' }]), []);
assert.deepEqual(ids({ ...pagamento, ordemCobrancaId: 'antiga' }, [{ ...ordem, id: 'antiga', status: 'quitada' }, ordem]), ['o18', 'antiga'], 'ordem aberta tem prioridade');
console.log('OK: vínculos diretos, por vale, por parcela, ordens encerradas e pagamentos individuais');
