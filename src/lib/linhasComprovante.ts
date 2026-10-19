import { FORMAS_PAGAMENTO } from "./pagamentos";
import { formatCurrency } from "./utils";
import type { ComprovanteRecebimento } from "../types";
import { parteNoVale, valoresConfirmados } from "./financeiro";

type PagamentoAcumulado = NonNullable<ComprovanteRecebimento["pagamentosVale"]>[number];
export type LinhaAcumulada = { id: string; forma: string; titular?: string; numero: string; data: string; situacao: string; valor: number; detalhe?: string };
export const centavos = (valor: number) => Math.round(Number(valor || 0) * 100);
const siglasTitulo: Record<string, string> = {
  cheque_emitente: "CQ", cheque_terceiro: "CQ-TER",
  duplicata_emitente: "BO", duplicata_terceiro: "BO-TER",
};

export function linhasDoPagamento(pagamento: PagamentoAcumulado, descricaoCartao?: string, contexto?: { vendaId?: string; ordemId?: string }): LinhaAcumulada[] {
  const forma = FORMAS_PAGAMENTO.find(f => f.value === pagamento.formaPagamento)?.label
    || pagamento.formaPagamento.replaceAll("_", " ").toUpperCase();
  let total = centavos(pagamento.valorNoVale);
  let bonus = Math.min(total, centavos(pagamento.bonusUtilizado));
  if (contexto) {
    const valores = valoresConfirmados({ ...pagamento, status: pagamento.status || "ativo" });
    const ratear = (valor: number) => {
      if (contexto.vendaId && pagamento.alocacoes?.length) return centavos(parteNoVale(pagamento, contexto.vendaId, valor));
      const fator = contexto.ordemId && pagamento.ordemCobrancaId === contexto.ordemId ? 1
        : pagamento.valorAplicado > 0 ? Math.min(1, pagamento.valorNoVale / pagamento.valorAplicado)
        : 1;
      return Math.round(centavos(valor) * fator);
    };
    // O recibo mostra o que foi entregue, inclusive o excedente que virou bônus.
    // O valor alocado continua servindo apenas como proporção em pagamentos compartilhados.
    total = ratear(valores.recebido) + ratear(valores.aguardando);
    bonus = Math.min(total, ratear(valores.credito));
  }
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
      forma: siglasTitulo[titulo.tipo] || forma,
      titular: titulo.nomeTitular?.trim() || undefined,
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
