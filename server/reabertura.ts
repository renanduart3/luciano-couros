import crypto from "node:crypto";
import { registrarMovimentacaoFinanceira } from "./programacaoPagamentos.js";
import { execute, queryAll, queryOne, runInTransaction } from "./db.js";

type Alvo = "vale" | "parcela" | "recebimento";
const dinheiro = (valor: number) => Math.round(valor * 100) / 100;
const falha = (mensagem: string, statusCode = 409): never => { throw Object.assign(new Error(mensagem), { statusCode }); };

export function criarGerenciadorReabertura(deps: {
  recalcularVale: (id: string) => void;
  estornarOrdens: (id: string) => void;
  auditar: (usuarioId: string, acao: string, entidade: string, id: string, detalhes: any) => void;
}) {
  function preparar(tipo: Alvo, id: string) {
    if (!["vale", "parcela", "recebimento"].includes(tipo)) falha("Informe um alvo válido para a reabertura.", 400);
    let alvo: any;
    let recebimentos: any[];
    let legados: any[] = [];
    if (tipo === "vale") {
      alvo = queryOne<any>("SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL AND status != 'cancelada'", [id]);
      if (!alvo) falha("Vale não encontrado ou cancelado.", 404);
      recebimentos = queryAll<any>(`SELECT DISTINCT rc.* FROM recebimentos_cliente rc
        JOIN recebimento_alocacoes a ON a.recebimentoId = rc.id
        WHERE a.vendaId = ? AND a.deletedAt IS NULL AND rc.deletedAt IS NULL AND rc.status = 'ativo' ORDER BY rc.id`, [id]);
      legados = queryAll<any>(`SELECT p.* FROM pagamentos p WHERE p.vendaId = ? AND p.deletedAt IS NULL
        AND p.recebimentoId IS NULL AND NOT EXISTS (SELECT 1 FROM recebimentos_cliente rc WHERE rc.pagamentoId = p.id) ORDER BY p.id`, [id]);
    } else if (tipo === "parcela") {
      alvo = queryOne<any>(`SELECT p.*, oc.status AS statusOrdem, oc.numeroSequencial, oc.clienteId FROM ordem_cobranca_parcelas p
        JOIN ordens_cobranca oc ON oc.id = p.ordemId WHERE p.id = ? AND p.deletedAt IS NULL AND oc.deletedAt IS NULL`, [id]);
      if (!alvo) falha("Parcela não encontrada.", 404);
      if (!["aberta", "quitada"].includes(alvo.statusOrdem)) falha("Esta ordem foi cancelada ou renegociada e não pode ser reaberta por uma parcela.");
      recebimentos = queryAll<any>(`SELECT DISTINCT rc.* FROM recebimentos_cliente rc
        JOIN ordem_cobranca_parcela_recebimentos p ON p.recebimentoId = rc.id
        WHERE p.parcelaId = ? AND p.deletedAt IS NULL AND rc.deletedAt IS NULL AND rc.status = 'ativo' ORDER BY rc.id`, [id]);
    } else {
      alvo = queryOne<any>("SELECT * FROM recebimentos_cliente WHERE id = ? AND deletedAt IS NULL AND status = 'ativo'", [id]);
      if (!alvo) falha("Pagamento já estornado ou indisponível. Atualize a tela.");
      recebimentos = [alvo];
    }
    if (!recebimentos.length && !legados.length) falha("Não há pagamentos ativos para estornar neste registro.");
    const alocacoes = recebimentos.flatMap((r) => queryAll<any>("SELECT * FROM recebimento_alocacoes WHERE recebimentoId = ? AND deletedAt IS NULL ORDER BY id", [r.id]));
    const titulos = recebimentos.flatMap((r) => queryAll<any>("SELECT * FROM recebimento_titulos WHERE recebimentoId = ? AND deletedAt IS NULL ORDER BY id", [r.id]));
    const parcelas = recebimentos.flatMap((r) => queryAll<any>(`SELECT pr.*, p.numero, oc.numeroSequencial, oc.status AS statusOrdem
      FROM ordem_cobranca_parcela_recebimentos pr JOIN ordem_cobranca_parcelas p ON p.id = pr.parcelaId
      JOIN ordens_cobranca oc ON oc.id = pr.ordemId WHERE pr.recebimentoId = ? AND pr.deletedAt IS NULL ORDER BY pr.id`, [r.id]));
    const valoresPorVale = new Map<string, number>();
    for (const item of [...alocacoes, ...legados]) valoresPorVale.set(item.vendaId, dinheiro((valoresPorVale.get(item.vendaId) || 0) + Number(item.valor)));
    const vales = [...valoresPorVale].map(([vendaId, valor]) => {
      const venda = queryOne<any>("SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL AND status != 'cancelada'", [vendaId]);
      if (!venda) falha("Um vale deste pagamento foi cancelado. Revise o histórico antes de estornar.");
      if (valor > Number(venda.valorPago) + 0.005) falha(`O histórico do vale #${venda.numeroSequencial} diverge do valor pago. Revise os lançamentos antes de estornar.`);
      return { ...venda, valorEstornado: valor };
    });
    if (tipo === "vale" && Math.abs(Number(alvo.valorPago) - (valoresPorVale.get(id) || 0)) > 0.005) {
      falha("Este vale possui pagamentos antigos sem vínculo individual. É necessário conciliar esses lançamentos antes de reabrir, para preservar os saldos.");
    }
    const ordens = recebimentos.flatMap(r => queryAll<any>(`SELECT DISTINCT oc.id AS ordemId, oc.status AS statusOrdem
      FROM ordens_cobranca oc JOIN ordem_cobranca_recebimentos pr ON pr.ordemId = oc.id
      WHERE pr.recebimentoId = ? AND pr.deletedAt IS NULL`, [r.id]));
    // Reabrir uma ordem antiga não pode colocar o mesmo vale em duas negociações ativas.
    for (const parcela of ordens) {
      if (!["aberta", "quitada"].includes(parcela.statusOrdem)) falha("Este recebimento também pertence a uma ordem cancelada ou renegociada. Revise essa negociação antes do estorno.");
      const conflito = queryOne<any>(`SELECT outra.numeroSequencial FROM ordem_cobranca_vales original
        JOIN ordem_cobranca_vales novo ON novo.vendaId = original.vendaId AND novo.ordemId != original.ordemId AND novo.removidoAt IS NULL
        JOIN ordens_cobranca outra ON outra.id = novo.ordemId AND outra.status = 'aberta' AND outra.deletedAt IS NULL
        WHERE original.ordemId = ? AND original.removidoAt IS NULL LIMIT 1`, [parcela.ordemId]);
      if (conflito) falha(`Um vale já está na ordem aberta #${conflito.numeroSequencial}. Revise essa negociação antes de reabrir a anterior.`);
    }
    const movimentos = recebimentos.flatMap((r) => queryAll<any>("SELECT * FROM cliente_bonus_movimentos WHERE recebimentoId = ? AND deletedAt IS NULL ORDER BY id", [r.id]));
    const saldoBonus = Number(queryOne<any>(`SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo
      FROM cliente_bonus_movimentos WHERE clienteId = ? AND deletedAt IS NULL`, [alvo.clienteId])?.saldo || 0);
    const variacaoBonus = dinheiro(movimentos.reduce((total, m) => total + (m.tipo === "credito" ? -Number(m.valor) : Number(m.valor)), 0));
    if (saldoBonus + variacaoBonus < -0.005) falha("O bônus gerado por este pagamento já foi utilizado. Estorne primeiro o uso desse bônus para não deixar a carteira negativa.");
    const lancamentos = recebimentos.flatMap((r) => queryAll<any>("SELECT * FROM pagamentos WHERE (id = ? OR recebimentoId = ?) AND deletedAt IS NULL ORDER BY id", [r.pagamentoId || "", r.id]));
    const snapshot = { tipo, id, alvo, recebimentos, legados, alocacoes, titulos, parcelas, ordens, vales, movimentos, saldoBonus, lancamentos };
    const revisao = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const totalFinanceiro = dinheiro([...lancamentos, ...legados].reduce((total, p) => total + Number(p.valor), 0));
    const resumo = {
      revisao,
      titulo: tipo === "vale" ? `Reabrir vale #${alvo.numeroSequencial}` : tipo === "parcela" ? `Reabrir parcela ${alvo.numero} da ordem #${alvo.numeroSequencial}` : "Estornar pagamento",
      totalFinanceiro,
      totalEstornado: dinheiro(vales.reduce((total, v) => total + v.valorEstornado, 0)),
      variacaoBonus,
      quantidadePagamentos: recebimentos.length + legados.length,
      compartilhado: tipo === "vale" ? vales.some((v) => v.id !== id) : tipo === "parcela" ? parcelas.some((p) => p.parcelaId !== id) : vales.length > 1 || new Set(parcelas.map((p) => p.parcelaId)).size > 1,
      vales: vales.map((v) => ({ numero: v.numeroSequencial, valor: v.valorEstornado })),
      parcelas: [...new Map(parcelas.map((p) => [p.parcelaId, { numero: p.numero, ordemNumero: p.numeroSequencial }])).values()],
    };
    return { ...snapshot, resumo };
  }

  function executar(tipo: Alvo, id: string, revisao: string, usuarioId: string, motivo: string) {
    return runInTransaction(() => {
      const plano = preparar(tipo, id);
      if (!revisao || revisao !== plano.resumo.revisao) falha("Os pagamentos mudaram desde a conferência. Feche esta confirmação e abra novamente para revisar os valores.");
      const agora = new Date().toISOString();
      for (const vale of plano.vales) {
        const pago = dinheiro(Math.max(0, Number(vale.valorPago) - vale.valorEstornado));
        const saldo = dinheiro(Math.max(0, Number(vale.totalLiquido) - pago));
        execute("UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = ? WHERE id = ?", [pago, saldo, saldo > 0.005 ? "pendente" : "paga", agora, vale.id]);
        deps.recalcularVale(vale.id);
      }
      for (const recebimento of plano.recebimentos) {
        deps.estornarOrdens(recebimento.id);
        for (const tabela of ["recebimento_alocacoes", "cliente_bonus_movimentos", "recebimento_titulos", "recebimento_instrumentos"]) {
          execute(`UPDATE ${tabela} SET deletedAt = ? WHERE recebimentoId = ? AND deletedAt IS NULL`, [agora, recebimento.id]);
        }
        execute("UPDATE pagamentos SET deletedAt = ?, updatedAt = ? WHERE (id = ? OR recebimentoId = ?) AND deletedAt IS NULL", [agora, agora, recebimento.pagamentoId || "", recebimento.id]);
        execute("UPDATE recebimentos_cliente SET status = 'cancelado', deletedAt = ?, updatedAt = ? WHERE id = ?", [agora, agora, recebimento.id]);
        registrarMovimentacaoFinanceira(recebimento.id, "estorno", -Number(recebimento.valorRecebido), { motivo, alvo: { tipo, id }, valores: plano.resumo }, usuarioId);
        deps.auditar(usuarioId, "estornar_recebimento", "recebimento_cliente", recebimento.id, { clienteId: recebimento.clienteId, motivo, alvo: { tipo, id }, valorRecebido: recebimento.valorRecebido });
      }
      for (const pagamento of plano.legados) {
        execute("UPDATE pagamentos SET deletedAt = ?, updatedAt = ? WHERE id = ?", [agora, agora, pagamento.id]);
        deps.auditar(usuarioId, "estornar_pagamento", "pagamento", pagamento.id, { motivo, alvo: { tipo, id }, valor: pagamento.valor });
      }
      deps.auditar(usuarioId, "reabrir_pagamento", tipo, id, { motivo, ...plano.resumo });
      return { success: true, message: "Pagamentos estornados. Saldos dos vales, parcelas, carteira e lançamentos financeiros atualizados." };
    });
  }
  return { preparar: (tipo: Alvo, id: string) => preparar(tipo, id).resumo, executar };
}
