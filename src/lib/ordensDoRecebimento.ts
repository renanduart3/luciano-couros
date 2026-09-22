import type { OrdemCobranca, PagamentoGerenciavel } from "../types";

/** Inclui vínculos antigos por parcela e vales incorporados a uma ordem aberta. */
export function ordensDoRecebimento(pagamento: PagamentoGerenciavel, ordens: OrdemCobranca[]) {
  return ordens.filter(ordem => ordem.clienteId === pagamento.clienteId && (
    ordem.id === pagamento.ordemCobrancaId
    || ordem.pagamentos?.some(item => item.id === pagamento.id)
    || pagamento.parcelasOrdem?.some(parcela => parcela.ordemId === ordem.id)
    || (ordem.status === "aberta" && ordem.vales.some(vale =>
      pagamento.alocacoes.some(alocacao => alocacao.vendaId === vale.vendaId)))
  )).sort((a, b) => Number(b.status === "aberta") - Number(a.status === "aberta"));
}
