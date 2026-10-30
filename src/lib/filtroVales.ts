import { financeiroVale } from "./financeiro";
import { vencimentoPendente } from "./valesCliente";
import { todayLocalIso } from "./utils";
import type { Venda, OrdemCobranca } from "../types";

export function ordensAbertasPorVale(ordens: OrdemCobranca[]) {
  const mapa = new Map<string, OrdemCobranca>();
  for (const ordem of ordens) {
    if (ordem.status !== "aberta") continue;
    for (const vale of ordem.vales) mapa.set(vale.vendaId, ordem);
  }
  return mapa;
}

// Vencimento e vínculo com ordem não encerram um vale com saldo.
export const valeEmAberto = (vale: Venda) => vale.status !== "cancelada" && !vale.finalizadoAt && financeiroVale(vale).restantePresumido > 0.005;

export function correspondeStatusVale(vale: Venda, filtro: string, hoje = todayLocalIso()) {
  const aberto = valeEmAberto(vale);
  const vencimento = vencimentoPendente(vale);
  const vencido = aberto && Boolean(vencimento) && vencimento < hoje;
  if (filtro === "abertos") return aberto;
  if (filtro === "vencidos") return vencido;
  if (filtro === "a_vencer") return aberto && !vencido;
  if (filtro === "quitados") return vale.status !== "cancelada" && !aberto;
  if (filtro === "cancelados") return vale.status === "cancelada";
  return true;
}
