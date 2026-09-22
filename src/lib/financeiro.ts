import type { OrdemCobranca, PagamentoGerenciavel, Venda } from "../types";
export interface PosicaoFinanceira { negociado: number; recebido: number; restante: number; aguardando: number; bonus: number; creditoUtilizado: number; }
const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
export function fecharPosicao(negociado: number, recebido: number, aguardando = 0, creditoUtilizado = 0): PosicaoFinanceira {
  const n = cents(negociado), r = Math.max(0, cents(recebido));
  return { negociado: n / 100, recebido: r / 100, restante: Math.max(0, n - r) / 100,
    aguardando: Math.max(0, cents(aguardando)) / 100, bonus: Math.max(0, r - n) / 100, creditoUtilizado };
}
export function valoresConfirmados(p: PagamentoGerenciavel) {
  if (p.status !== "ativo") return { recebido: 0, aguardando: 0, credito: 0 };
  const titulos = p.titulos || [];
  const confirmado = titulos.length ? titulos.filter(t => t.status === "compensado").reduce((s,t) => s+cents(t.valor),0)
    : p.statusPagamento === "aguardando" || p.statusPagamento === "recusado" ? 0 : cents(p.valorRecebido);
  const aguardando = titulos.length ? titulos.filter(t => !t.status || t.status === "aguardando").reduce((s,t) => s+cents(t.valor),0)
    : p.statusPagamento === "aguardando" ? cents(p.valorRecebido) : 0;
  return { recebido: (confirmado + cents(p.bonusUtilizado)) / 100, aguardando: aguardando / 100, credito: Number(p.bonusUtilizado || 0) };
}
// O rateio acumulado conserva centavos e impede contar o mesmo recebimento inteiro em cada vale.
function parteNoVale(p: PagamentoGerenciavel, id: string, valor: number) {
  const itens = (p.alocacoes || []).filter(a => !a.deletedAt).sort((a,b) => a.vendaId.localeCompare(b.vendaId));
  const total = itens.reduce((s,a) => s+cents(a.valor),0);
  let acumulado = 0, anterior = 0, resultado = 0;
  for (const a of itens) {
    acumulado += cents(a.valor);
    const atual = total ? Math.round(cents(valor)*acumulado/total) : 0;
    if (a.vendaId === id) resultado += atual-anterior;
    anterior = atual;
  }
  return resultado / 100;
}
/** Parcela confirmada desta linha no contexto exibido, com o mesmo rateio dos cards. */
export function recebidoDaLinha(p: PagamentoGerenciavel, vendaId?: string, ordemId?: string) {
  const recebido = valoresConfirmados(p).recebido;
  if (vendaId) return parteNoVale(p, vendaId, recebido);
  const fator = p.valorAplicadoOrdem === undefined || (Boolean(ordemId) && p.ordemCobrancaId === ordemId) ? 1
    : p.valorAplicado > 0 ? Math.min(1, p.valorAplicadoOrdem / p.valorAplicado) : 0;
  return Math.round(cents(recebido) * fator) / 100;
}
export function calcularFinanceiroVale(v: Venda): PosicaoFinanceira {
  let recebido = 0, aguardando = 0, aplicado = 0, credito = 0;
  for (const p of v.recebimentos || []) {
    if (p.status !== "ativo") continue;
    const valores = valoresConfirmados(p);
    recebido += cents(parteNoVale(p,v.id,valores.recebido));
    aguardando += cents(parteNoVale(p,v.id,valores.aguardando));
    credito += cents(parteNoVale(p,v.id,valores.credito));
    aplicado += (p.alocacoes || []).filter(a=>!a.deletedAt && a.vendaId===v.id).reduce((s,a)=>s+cents(a.valor),0);
  }
  const legado = Math.max(0,cents(v.valorPago)-aplicado);
  const instrumento = v.instrumentoRecebimento;
  const valorInstrumento = instrumento ? Math.min(legado,cents(instrumento.valor)) : 0;
  recebido += legado - valorInstrumento;
  if (instrumento && ["aguardando","em_carteira"].includes(instrumento.status)) aguardando += valorInstrumento;
  else if (!instrumento || instrumento.status !== "recusado") recebido += valorInstrumento;
  return fecharPosicao(v.totalLiquido,recebido/100,aguardando/100,credito/100);
}
export const financeiroVale = (v: Venda) => v.financeiro || calcularFinanceiroVale(v);
export function financeiroOrdem(o: OrdemCobranca): PosicaoFinanceira {
  let recebido = 0, aguardando = 0, credito = 0;
  for (const p of o.pagamentos || []) {
    const v = valoresConfirmados(p);
    const fator = p.valorAplicadoOrdem === undefined || (Boolean(o.id) && p.ordemCobrancaId === o.id) ? 1
      : p.valorAplicado > 0 ? Math.min(1,p.valorAplicadoOrdem/p.valorAplicado) : 0;
    recebido += Math.round(cents(v.recebido)*fator);
    aguardando += Math.round(cents(v.aguardando)*fator);
    credito += Math.round(cents(v.credito)*fator);
  }
  return fecharPosicao(o.totalOriginal,recebido/100,aguardando/100,credito/100);
}
