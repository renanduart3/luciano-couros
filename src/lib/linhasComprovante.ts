import { FORMAS_PAGAMENTO } from "./pagamentos";
import { formatCurrency } from "./utils";
import type { ComprovanteRecebimento } from "../types";

type PagamentoAcumulado = NonNullable<ComprovanteRecebimento["pagamentosVale"]>[number];
export type LinhaAcumulada = { id: string; forma: string; numero: string; data: string; situacao: string; valor: number; detalhe?: string };
export const centavos = (valor: number) => Math.round(Number(valor || 0) * 100);

export function linhasDoPagamento(pagamento: PagamentoAcumulado, descricaoCartao?: string): LinhaAcumulada[] {
  const forma = FORMAS_PAGAMENTO.find(f => f.value === pagamento.formaPagamento)?.label
    || pagamento.formaPagamento.replaceAll("_", " ").toUpperCase();
  const total = centavos(pagamento.valorNoVale);
  const bonus = Math.min(total, centavos(pagamento.bonusUtilizado));
  const dinheiro = total - bonus;
  const titulosValidos = pagamento.titulos.filter(titulo => titulo.status !== "recusado");
  const totalTitulos = titulosValidos.reduce((soma, titulo) => soma + centavos(titulo.valor), 0);
  let distribuido = 0;
  const linhas: LinhaAcumulada[] = pagamento.titulos.map((titulo, indice) => {
    const posicaoValida = titulosValidos.indexOf(titulo);
    const restante = Math.max(0, dinheiro - distribuido);
    const valor = titulo.status === "recusado" ? 0
      : posicaoValida === titulosValidos.length - 1 ? restante
      : Math.min(restante, Math.round(dinheiro * centavos(titulo.valor) / (totalTitulos || 1)));
    distribuido += valor;
    return {
      id: `${pagamento.id}-${titulo.id || indice}`,
      forma: FORMAS_PAGAMENTO.find(f => f.value === titulo.tipo)?.label || forma,
      numero: titulo.numeroDocumento || "—",
      data: titulo.dataCompensacao || titulo.vencimento || pagamento.data,
      situacao: titulo.status === "recusado" ? "RECUSADO" : titulo.status === "aguardando" ? "A COMPENSAR" : "RECEBIDO",
      valor: valor / 100,
      detalhe: titulo.status === "recusado" ? `Título de ${formatCurrency(titulo.valor)} recusado` :
        valor !== centavos(titulo.valor) ? `Título de ${formatCurrency(titulo.valor)}; parcela aplicada neste documento` : undefined,
    };
  });
  if (dinheiro > 0 && titulosValidos.length === 0) linhas.push({
    id: `${pagamento.id}-pagamento`, forma, numero: "—", data: pagamento.data,
    situacao: pagamento.statusPagamento === "aguardando" ? "A COMPENSAR" : "RECEBIDO", valor: dinheiro / 100,
    detalhe: pagamento.formaPagamento === "cartao_credito" ? descricaoCartao : undefined,
  });
  if (bonus > 0) linhas.push({ id: `${pagamento.id}-bonus`, forma: "BÔNUS UTILIZADO", numero: "—",
    data: pagamento.data, situacao: "APLICADO", valor: bonus / 100 });
  return linhas;
}
