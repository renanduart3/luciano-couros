import crypto from "node:crypto";
import { queryOne, execute, runInTransaction } from "./db.js";
import { registrarMovimentacaoFinanceira } from "./programacaoPagamentos.js";

type Item = { tipo: "recebimento" | "projecao"; id: string };
type Acao = "estornar" | "excluir";
const falha = (texto: string, statusCode = 409): never => { throw Object.assign(new Error(texto), { statusCode }); };
export function criarAcoesPagamentosOrdem(deps: {
  preparar: (tipo: "recebimento", id: string) => any;
  estornar: (tipo: "recebimento", id: string, revisao: string, usuario: string, motivo: string) => any;
  carregar: (id: string) => any;
  auditar: (usuario: string, acao: string, entidade: string, id: string, dados: any) => void;
}) {
  function preparar(ordemId: string, acao: Acao, entrada: Item[]) {
    if (!["estornar", "excluir"].includes(acao) || !Array.isArray(entrada) || !entrada.length || entrada.length > 100) falha("Selecione de 1 a 100 pagamentos.", 400);
    const ordem = queryOne<any>("SELECT * FROM ordens_cobranca WHERE id = ? AND deletedAt IS NULL", [ordemId]);
    if (!ordem || !["aberta", "quitada"].includes(ordem.status)) falha("Esta ordem não permite alterar pagamentos.");
    const ids = new Set<string>();
    const itens = entrada.map(item => {
      if (!item || !["recebimento", "projecao"].includes(item.tipo) || typeof item.id !== "string" || ids.has(item.id)) falha("Seleção inválida ou repetida.", 400);
      ids.add(item.id);
      if (item.tipo === "projecao") {
        if (acao !== "excluir") falha("Uma previsão pendente não tem pagamento para estornar.");
        const projecao = queryOne<any>("SELECT * FROM ordem_pagamentos_projetados WHERE id = ? AND ordemId = ? AND estado = 'pendente'", [item.id, ordemId]);
        if (!projecao) falha("A previsão mudou. Atualize a ordem.");
        return { ...item, projecao, plano: null, pagamento: null };
      }
      const pertence = queryOne<any>(`SELECT r.id FROM recebimentos_cliente r WHERE r.id = ? AND r.deletedAt IS NULL
        AND r.clienteId = ? AND (r.ordemCobrancaId = ? OR EXISTS (
          SELECT 1 FROM ordem_cobranca_recebimentos o WHERE o.recebimentoId = r.id AND o.ordemId = ?))`,
        [item.id, ordem.clienteId, ordemId, ordemId]);
      if (!pertence) falha("Um pagamento não pertence a esta ordem.");
      const pagamento = deps.carregar(item.id);
      if (!pagamento) falha("Pagamento indisponível. Atualize a ordem.");
      const plano = pagamento.status === "ativo" ? deps.preparar("recebimento", item.id) : null;
      if (!plano && pagamento.status !== "recusado") falha("Pagamento já estornado.");
      return { ...item, pagamento, plano, projecao: null };
    });
    const revisao = crypto.createHash("sha256").update(JSON.stringify({ ordem, acao, itens })).digest("hex");
    return { itens, revisao, quantidade: itens.length,
      totalFinanceiro: Math.round(itens.reduce((s, i) => s + Number(i.plano?.totalFinanceiro || 0), 0) * 100) / 100 };
  }
  function executar(ordemId: string, acao: Acao, itens: Item[], revisao: string, usuario: string) {
    return runInTransaction(() => {
      const plano = preparar(ordemId, acao, itens);
      if (!revisao || plano.revisao !== revisao) falha("Os pagamentos mudaram. Confira novamente antes de confirmar.");
      for (const item of plano.itens) {
        if (item.projecao) {
          execute("UPDATE ordem_pagamentos_projetados SET estado = 'excluida', updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
        } else {
          if (item.plano) {
            // Reconfere cada item após o anterior; qualquer falha reverte o lote inteiro.
            const atual = deps.preparar("recebimento", item.id);
            deps.estornar("recebimento", item.id, atual.revisao, usuario, acao === "excluir" ? "Exclusão do pagamento na ordem" : "Estorno do pagamento na ordem");
          } else {
            execute("UPDATE recebimentos_cliente SET status = 'cancelado', deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
            execute("UPDATE recebimento_titulos SET deletedAt = CURRENT_TIMESTAMP, compensacaoAutomatica = 0 WHERE recebimentoId = ? AND deletedAt IS NULL", [item.id]);
          }
          if (acao === "estornar") {
            const dados = { ...item.pagamento, bonusGerado: 0, valorAplicado: 0, statusPagamento: "aguardando",
              titulos: item.pagamento.titulos.map((t: any) => ({ ...t, status: "aguardando", dataCompensacao: undefined, compensacaoAutomatica: 0 })) };
            if (dados.titulos.length) dados.valorRecebido = Math.round(dados.titulos.reduce((s: number, t: any) => s + Number(t.valor), 0) * 100) / 100;
            execute("INSERT INTO ordem_pagamentos_projetados (id, ordemId, recebimentoOrigemId, dados) VALUES (?, ?, ?, ?)",
              [crypto.randomUUID(), ordemId, item.id, JSON.stringify(dados)]);
          }
        }
        registrarMovimentacaoFinanceira(item.pagamento?.id || item.projecao.recebimentoOrigemId,
          acao === "excluir" ? "exclusao_controle_ordem" : "projecao_restaurada", 0, { ordemId, alvo: item.id }, usuario);
      }
      deps.auditar(usuario, "pagamentos_ordem_" + acao, "ordem_cobranca", ordemId,
        { quantidade: plano.quantidade, totalFinanceiro: plano.totalFinanceiro, ids: itens, revisao });
      return { success: true };
    });
  }
  return {
    preparar: (ordemId: string, acao: Acao, itens: Item[]) => {
      const p = preparar(ordemId, acao, itens);
      return { revisao: p.revisao, totalFinanceiro: p.totalFinanceiro, quantidade: p.quantidade };
    },
    executar,
  };
}
