import { financeiroOrdem, valoresConfirmados } from "./financeiro";
import { OrdemCobranca } from "../types";
import { FORMAS_PAGAMENTO } from "./pagamentos";

const centavos = (v: number) => Math.round(Number(v || 0) * 100);
export function demonstrativoOrdem(ordem: OrdemCobranca) {
  const linhas = (ordem.pagamentos || []).filter(p => p.status !== "cancelado").flatMap(p => {
    const forma = FORMAS_PAGAMENTO.find(f => f.value === p.formaPagamento)?.label || p.formaPagamento;
    const fator = p.valorAplicadoOrdem === undefined || (Boolean(ordem.id) && p.ordemCobrancaId === ordem.id) ? 1
      : p.valorAplicado > 0 ? Math.min(1, p.valorAplicadoOrdem / p.valorAplicado) : 0;
    const confirmado = valoresConfirmados(p);
    const bonusRateado = Math.round(centavos(p.bonusUtilizado) * fator);
    const dinheiroConfirmado = Math.round(centavos(confirmado.recebido) * fator) - bonusRateado;
    const totalConfirmado = p.titulos.length
      ? p.titulos.filter(t => t.status === "compensado").reduce((s, t) => s + centavos(t.valor), 0)
      : p.statusPagamento === "compensado" ? centavos(p.valorRecebido) : 0;
    // Arredondar acumulados por situação conserva o mesmo rateio dos saldos financeiros.
    const acumulados = new Map<string, number>();
    const ratear = (valor: number, grupo: string) => {
      const antes = acumulados.get(grupo) || 0, depois = antes + centavos(valor);
      acumulados.set(grupo, depois);
      const proporcao = grupo === "compensado" && totalConfirmado > 0 ? dinheiroConfirmado / totalConfirmado : fator;
      return (Math.round(depois * proporcao) - Math.round(antes * proporcao)) / 100;
    };
    const documentos = p.titulos.length ? p.titulos.map((t, i) => ({
      id: `${p.id}-${t.id || i}`, data: t.vencimento || p.data, forma,
      referencia: t.numeroDocumento || String(i + 1), valor: ratear(t.valor, t.status || "aguardando"),
      status: t.status || "aguardando", titulo: true,
    })) : p.valorRecebido > 0 ? [{
      id: p.id, data: p.data, forma: forma + (p.formaPagamento === "cartao_credito" ? ` · ${p.parcelasCartao || 1}x` : ""),
      referencia: "", valor: ratear(p.valorRecebido, p.statusPagamento), status: p.statusPagamento, titulo: false,
    }] : [];
    if (p.bonusUtilizado > 0 && p.status === "ativo") documentos.push({
      id: `${p.id}-bonus`, data: p.data, forma: "Bônus utilizado", referencia: "",
      valor: ratear(p.bonusUtilizado, "bonus"), status: "compensado", titulo: false,
    });
    return documentos;
  });
  const financeiro = financeiroOrdem(ordem);
  return { linhas, pago: financeiro.presumido, restante: financeiro.restantePresumido,
    recebido: Math.max(0, financeiro.recebido - financeiro.creditoUtilizado), aguardando: financeiro.aguardando,
    bonus: financeiro.creditoUtilizado, transferido: financeiro.transferido || 0,
    totalVales: (ordem.vales || []).reduce((s, v) => s + centavos(v.valorVinculado), 0) / 100,
    totalTitulos: linhas.filter(l => l.titulo && l.status !== "recusado").reduce((s, l) => s + centavos(l.valor), 0) / 100,
  };
}
