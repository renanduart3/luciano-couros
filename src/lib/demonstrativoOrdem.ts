import { OrdemCobranca } from "../types";
import { FORMAS_PAGAMENTO } from "./pagamentos";

const centavos = (v: number) => Math.round(Number(v || 0) * 100);
export function demonstrativoOrdem(ordem: OrdemCobranca) {
  const linhas = (ordem.pagamentos || []).filter(p => p.status !== "cancelado").flatMap(p => {
    const forma = FORMAS_PAGAMENTO.find(f => f.value === p.formaPagamento)?.label || p.formaPagamento;
    return p.titulos.length ? p.titulos.map((t, i) => ({
      id: `${p.id}-${t.id || i}`, data: p.data, forma,
      referencia: t.numeroDocumento || String(i + 1), valor: t.valor,
      status: t.status || "aguardando",
    })) : [{
      id: p.id, data: p.data, forma: forma + (p.formaPagamento === "cartao_credito" ? ` · ${p.parcelasCartao || 1}x` : ""),
      referencia: "", valor: p.valorRecebido + p.bonusUtilizado, status: p.statusPagamento,
    }];
  });
  // Aguardando compensação não é dinheiro pago. Rateia apenas recebimentos legados
  // compartilhados, usando a alocação efetiva desta ordem, sem contar o bônus excedente.
  const pago = (ordem.pagamentos || []).filter(p => p.status === "ativo").reduce((s, p) => {
    const compensado = p.titulos.length
      ? p.titulos.filter(t => t.status === "compensado").reduce((n, t) => n + centavos(t.valor), 0)
      : p.statusPagamento === "compensado" ? centavos(p.valorRecebido + p.bonusUtilizado) : 0;
    const aplicado = centavos(p.valorAplicado);
    const nestaOrdem = centavos(p.valorAplicadoOrdem ?? p.valorAplicado);
    return s + (aplicado > 0 ? Math.round(Math.min(compensado, aplicado) * nestaOrdem / aplicado) : 0);
  }, 0);
  const negociado = centavos(ordem.totalOriginal);
  return { linhas, pago: Math.min(pago, negociado) / 100, restante: Math.max(0, negociado - pago) / 100 };
}
