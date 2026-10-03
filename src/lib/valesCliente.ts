import { financeiroVale } from "./financeiro";
import type { Venda } from "../types";

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
