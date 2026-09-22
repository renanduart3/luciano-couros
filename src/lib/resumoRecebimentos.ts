import type { PagamentoGerenciavel } from "../types";

const centavos = (valor: number | undefined) => Math.round(Number(valor || 0) * 100);

/** Valores da transação e sua aplicação são distintos; bônus utilizado não é entrada nova. */
export function resumoRecebimentos(pagamentos: PagamentoGerenciavel[], vendaId?: string) {
  let confirmado = 0, aguardando = 0, bonusGerado = 0, bonusUtilizado = 0, aplicado = 0, outrosVales = 0;
  const vistos = new Set<string>();
  for (const pagamento of pagamentos) {
    if (vistos.has(pagamento.id) || pagamento.status !== "ativo") continue;
    vistos.add(pagamento.id);
    const alocacoes = pagamento.alocacoes.filter(a => !a.deletedAt);
    if (vendaId && !alocacoes.some(a => a.vendaId === vendaId)) continue;
    const recebido = centavos(pagamento.valorRecebido);
    if (pagamento.titulos.length) {
      const compensado = pagamento.titulos.filter(t => t.status === "compensado").reduce((s, t) => s + centavos(t.valor), 0);
      confirmado += Math.min(recebido, compensado);
      aguardando += Math.min(Math.max(0, recebido - compensado), pagamento.titulos.filter(t => !t.status || t.status === "aguardando").reduce((s, t) => s + centavos(t.valor), 0));
    } else if (pagamento.statusPagamento === "compensado") confirmado += recebido;
    else if (pagamento.statusPagamento === "aguardando") aguardando += recebido;
    bonusGerado += centavos(pagamento.bonusGerado);
    bonusUtilizado += centavos(pagamento.bonusUtilizado);
    aplicado += vendaId ? alocacoes.filter(a => a.vendaId === vendaId).reduce((s, a) => s + centavos(a.valor), 0) : centavos(pagamento.valorAplicado);
    if (vendaId) outrosVales += alocacoes.filter(a => a.vendaId !== vendaId).reduce((s, a) => s + centavos(a.valor), 0);
  }
  return { confirmado: confirmado / 100, aguardando: aguardando / 100, bonusGerado: bonusGerado / 100, bonusUtilizado: bonusUtilizado / 100, aplicado: aplicado / 100, outrosVales: outrosVales / 100 };
}
