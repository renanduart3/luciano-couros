import { financeiroOrdem } from "./financeiro";
import { OrdemCobranca } from "../types";
import { FORMAS_PAGAMENTO } from "./pagamentos";

const centavos = (v: number) => Math.round(Number(v || 0) * 100);
export function demonstrativoOrdem(ordem: OrdemCobranca) {
  const linhas = (ordem.pagamentos || []).filter(p => p.status !== "cancelado").flatMap(p => {
    const forma = FORMAS_PAGAMENTO.find(f => f.value === p.formaPagamento)?.label || p.formaPagamento;
    return p.titulos.length ? p.titulos.map((t, i) => ({
      id: `${p.id}-${t.id || i}`, data: t.vencimento || p.data, forma,
      referencia: t.numeroDocumento || String(i + 1), valor: t.valor,
      status: t.status || "aguardando",
    })) : [{
      id: p.id, data: p.data, forma: forma + (p.formaPagamento === "cartao_credito" ? ` · ${p.parcelasCartao || 1}x` : ""),
      referencia: "", valor: p.valorRecebido + p.bonusUtilizado, status: p.statusPagamento,
    }];
  });
  const financeiro = financeiroOrdem(ordem);
  return { linhas, pago: financeiro.presumido, restante: financeiro.restantePresumido };
}
