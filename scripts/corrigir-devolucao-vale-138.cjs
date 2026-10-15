// Conciliação pontual da devolução de R$ 380 registrada como bônus no vale #138.
// Por padrão só confere. --apply exige também --expect-paid e cria backup.
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const saleId = 'vend_0ca31eb61d034e13';
const returnId = 'dev_25cca5ad665e408a';
const creditId = 'bon_af787d78f2b84dc4';
const money = value => Math.round(Number(value) * 100) / 100;
const check = (ok, message) => { if (!ok) throw new Error(message); };
const option = key => process.argv.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1);

async function main() {
  const filename = option('--db');
  check(filename && fs.existsSync(filename), 'Informe --db=C:\\caminho\\database.db para conferir a base.');
  const apply = process.argv.includes('--apply');
  const expectedPaid = Number(option('--expect-paid'));
  if (apply) check(Number.isFinite(expectedPaid) && option('--expect-paid') !== undefined,
    'Para aplicar, informe --expect-paid=VALOR mostrado na conferência.');
  const db = new Database(path.resolve(filename), { readonly: !apply, fileMustExist: true });
  try {
    const read = () => {
      const sale = db.prepare('SELECT * FROM vendas WHERE id=? AND numeroSequencial=138 AND deletedAt IS NULL').get(saleId);
      check(sale && sale.vencimento && !sale.finalizadoAt && sale.status !== 'cancelada', 'Vale #138 esperado não encontrado ou possui finalização/cancelamento.');
      const returned = db.prepare('SELECT * FROM devolucoes_venda WHERE id=? AND vendaId=?').get(returnId, saleId);
      check(returned && returned.modalidade === 'bonus_integral' && money(returned.valorCredito) === 380
        && money(returned.bonusGerado) === 380 && money(returned.abatimentoVale) === 0,
      'Devolução histórica não corresponde ao lançamento de R$ 380.');
      const credit = db.prepare('SELECT * FROM cliente_bonus_movimentos WHERE id=? AND vendaId=? AND clienteId=? AND deletedAt IS NULL')
        .get(creditId, saleId, sale.clienteId);
      check(credit && credit.tipo === 'credito' && money(credit.valor) === 380 && !credit.recebimentoId,
        'Crédito de R$ 380 não está disponível para reversão.');
      const debits = db.prepare("SELECT COUNT(*) quantidade FROM cliente_bonus_movimentos WHERE clienteId=? AND tipo='debito' AND deletedAt IS NULL AND createdAt>=?")
        .get(sale.clienteId, credit.createdAt).quantidade;
      check(debits === 0, 'Há uso de bônus posterior à devolução. Concilie a carteira antes de corrigir.');
      const transfers = db.prepare('SELECT COALESCE(SUM(valorTransferido),0) total FROM vale_residual_origens WHERE vendaOrigemId=?').get(saleId).total;
      check(money(transfers) === 0, 'Há saldo transferido deste vale. Conciliação manual necessária.');
      check(money(sale.totalLiquido) === 2469.9 && money(sale.saldoRestante) === money(2469.9 - sale.valorPago),
        'Total, valor pago e restante do vale divergem da situação esperada.');
      const receipts = db.prepare(`SELECT COALESCE(SUM(a.valor),0) total FROM recebimento_alocacoes a
        JOIN recebimentos_cliente r ON r.id=a.recebimentoId
        WHERE a.vendaId=? AND a.deletedAt IS NULL AND r.deletedAt IS NULL AND r.status='ativo'`).get(saleId).total;
      const legacy = db.prepare(`SELECT COALESCE(SUM(valor),0) total FROM pagamentos WHERE vendaId=? AND deletedAt IS NULL
        AND recebimentoId IS NULL AND NOT EXISTS (SELECT 1 FROM recebimentos_cliente r WHERE r.pagamentoId=pagamentos.id)`).get(saleId).total;
      check(money(receipts + legacy) === money(sale.valorPago), 'Pagamentos ativos não fecham com o valor pago do vale.');
      const installments = db.prepare('SELECT * FROM vale_parcelas WHERE vendaId=? AND deletedAt IS NULL ORDER BY vencimento, numero').all(saleId);
      check(installments.length > 0 && money(installments.reduce((sum, p) => sum + p.valor, 0)) === 2469.9,
        'Parcelas não fecham com o total do vale.');
      check(money(installments.reduce((sum, p) => sum + p.valorPago, 0)) === money(sale.valorPago),
        'Valor pago das parcelas diverge do vale.');
      check(money(sale.valorPago) <= 2089.9, 'Devolução excede a dívida ainda aberta. Conciliação manual necessária.');
      return { sale, installments, returned, credit };
    };
    const before = read();
    console.log(JSON.stringify({ vale: 138, totalAtual: before.sale.totalLiquido, pago: before.sale.valorPago,
      restanteAtual: before.sale.saldoRestante, bonusIndevido: 380, totalCorrigido: 2089.9,
      restanteCorrigido: money(2089.9 - before.sale.valorPago), aplicar: apply }, null, 2));
    if (!apply) return;
    check(money(before.sale.valorPago) === money(expectedPaid), 'O valor pago mudou desde a conferência. Nenhuma alteração realizada.');
    const backup = path.join(path.dirname(path.resolve(filename)), `database.before-vale-138-${Date.now()}.db`);
    await db.backup(backup);
    db.transaction(() => {
      const current = read();
      check(money(current.sale.valorPago) === money(expectedPaid), 'O valor pago mudou durante a correção.');
      const now = new Date().toISOString();
      db.prepare("UPDATE cliente_bonus_movimentos SET deletedAt=? WHERE id=? AND deletedAt IS NULL").run(now, creditId);
      db.prepare("UPDATE devolucoes_venda SET modalidade='abatimento', abatimentoVale=380, bonusGerado=0, updatedAt=? WHERE id=?")
        .run(now, returnId);
      db.prepare("UPDATE vendas SET totalLiquido=2089.9, saldoRestante=?, status=?, updatedAt=? WHERE id=?")
        .run(money(2089.9 - expectedPaid), money(2089.9 - expectedPaid) > 0 ? 'pendente' : 'paga', now, saleId);
      let reduction = 380;
      for (const part of [...current.installments].reverse()) {
        const amount = money(part.valor - Math.min(part.valor, reduction));
        reduction = money(reduction - (part.valor - amount));
        db.prepare('UPDATE vale_parcelas SET valor=?, deletedAt=?, updatedAt=? WHERE id=?')
          .run(amount, amount <= 0 ? now : null, now, part.id);
        if (reduction <= 0) break;
      }
      let paid = money(expectedPaid);
      for (const part of db.prepare('SELECT * FROM vale_parcelas WHERE vendaId=? AND deletedAt IS NULL ORDER BY vencimento, numero').all(saleId)) {
        const applied = money(Math.min(part.valor, paid));
        paid = money(paid - applied);
        const due = money(part.valor - applied);
        db.prepare('UPDATE vale_parcelas SET valorPago=?, saldo=?, status=?, updatedAt=? WHERE id=?')
          .run(applied, due, due <= 0 ? 'paga' : 'pendente', now, part.id);
      }
      check(reduction === 0 && paid === 0, 'Parcelas não puderam ser conciliadas.');
      db.prepare('INSERT INTO auditoria (id,usuarioId,acao,entidade,entidadeId,detalhes) VALUES (?,?,?,?,?,?)')
        .run('aud_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), null,
          'corrigir_bonus_devolucao_vale', 'venda', saleId,
          JSON.stringify({ devolucaoId: returnId, creditoId: creditId, antes: { total: 2469.9, pago: expectedPaid },
            depois: { total: 2089.9, restante: money(2089.9 - expectedPaid) }, backup }));
    })();
    console.log(`Corrigido. Backup: ${backup}`);
  } finally { db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
