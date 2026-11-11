import { financeiroVale } from "./financeiro";
import type { Venda } from "../types";

export const ehVendaComercial = (venda: Venda) => Number(venda.contabilizaReceita ?? 1) === 1;

export function resumoVendaComercial(venda: Venda) {
  if (!venda.vencimento || venda.status === "cancelada") {
    return { pago: venda.valorPago, restante: venda.saldoRestante, status: venda.status };
  }
  const { presumido, restantePresumido } = financeiroVale(venda);
  return { pago: presumido, restante: restantePresumido, status: restantePresumido > 0.005 ? "pendente" : "paga" };
}

export const vencimentoPendente = (vale: Venda) =>
  (vale.parcelas || [])
    .filter((parcela) => parcela.status === "pendente" && Number(parcela.saldo) > 0.005)
    .map((parcela) => parcela.vencimento)
    .sort()[0] || vale.vencimento || "";

export function listarValesPendentesCliente(vendas: Venda[]) {
  return vendas
    .filter((venda) => Boolean(venda.vencimento) && venda.status !== "cancelada" && financeiroVale(venda).restantePresumido > 0.005)
    .sort((a, b) => vencimentoPendente(a).localeCompare(vencimentoPendente(b)) || Number(b.numeroSequencial) - Number(a.numeroSequencial));
}
