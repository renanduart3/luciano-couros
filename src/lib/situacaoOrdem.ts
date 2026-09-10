import type { OrdemCobranca } from "../types";
export function situacaoAgendaOrdem(ordem: OrdemCobranca) {
  if (ordem.status === "cancelada") return { titulo: "Situação", texto: "Ordem cancelada" };
  if (ordem.status === "renegociada") return { titulo: "Situação", texto: "Ordem renegociada" };
  const titulo = (ordem.pagamentos || []).flatMap(p => p.titulos).filter(t => t.status === "aguardando")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (titulo) return { titulo: "Próximo título", vencimento: titulo.vencimento, valor: titulo.valor };
  return { titulo: "Situação", texto: ordem.status === "quitada" ? "Concluída" : "Saldo em aberto" };
}
