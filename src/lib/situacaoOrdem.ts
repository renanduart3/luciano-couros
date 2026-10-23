import type { OrdemCobranca } from "../types";
import { financeiroOrdem } from "./financeiro";
import { todayLocalIso } from "./utils";

export function situacaoFinanceiraOrdem(ordem: OrdemCobranca, hoje = todayLocalIso()) {
  if (ordem.status === "cancelada" || ordem.status === "renegociada") return ordem.status;
  if (financeiroOrdem(ordem).restantePresumido <= 0.005) return "quitada";
  const vencimentos = ordem.parcelas?.length
    ? ordem.parcelas.filter(p => p.status === "pendente" && p.saldo > 0.005).map(p => p.vencimento)
    : ordem.vales.filter(v => v.saldo > 0.005).map(v => v.vencimento);
  return vencimentos.some(data => data && data < hoje) ? "vencida" : "aberta";
}

export function situacaoAgendaOrdem(ordem: OrdemCobranca) {
  if (ordem.status === "cancelada") return { titulo: "Situação", texto: "Ordem cancelada" };
  if (ordem.status === "renegociada") return { titulo: "Situação", texto: "Ordem renegociada" };
  const titulo = (ordem.pagamentos || []).flatMap(p => p.titulos).filter(t => t.status === "aguardando")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (titulo) return { titulo: "Próximo título", vencimento: titulo.vencimento, valor: titulo.valor };
  return { titulo: "Situação", texto: financeiroOrdem(ordem).restantePresumido <= 0.005 ? "Concluída" : "Saldo em aberto" };
}
