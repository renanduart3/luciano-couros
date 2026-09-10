import type { OrdemCobranca } from "../types";

export function ordensAbertasPorVale(ordens: OrdemCobranca[]) {
  const mapa = new Map<string, OrdemCobranca>();
  for (const ordem of ordens) {
    if (ordem.status !== "aberta") continue;
    for (const vale of ordem.vales) mapa.set(vale.vendaId, ordem);
  }
  return mapa;
}

export function visivelPorVinculoOrdem(id: string, statusFiltro: string, mapa: Map<string, OrdemCobranca>) {
  return statusFiltro === "todos" || !mapa.has(id);
}
