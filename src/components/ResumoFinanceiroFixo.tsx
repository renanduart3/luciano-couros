import React from "react";
import type { PosicaoFinanceira } from "../lib/financeiro";
import { formatCurrency } from "../lib/utils";

export function ResumoFinanceiroFixo({ negociado, financeiro, rotuloTotal = "Negociado", bonusGerado, vertical = false }: { negociado: number; financeiro: PosicaoFinanceira; rotuloTotal?: "Negociado" | "Devedor"; bonusGerado?: number; vertical?: boolean }) {
  return <div className={`grid shrink-0 gap-px border-b border-slate-300 bg-slate-300 print:hidden ${vertical ? "grid-cols-1 rounded-xl border border-slate-300 overflow-hidden" : bonusGerado === undefined ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
    <Item rotulo={rotuloTotal} valor={negociado}/>
    <Item rotulo="Pago" valor={financeiro.presumido} cor="text-emerald-800" detalhe={financeiro.creditoUtilizado > 0 ? `Inclui ${formatCurrency(financeiro.creditoUtilizado)} de bônus` : undefined}/>
    <Item rotulo="Restante" valor={financeiro.restantePresumido} cor="text-amber-800"/>
    {Number(financeiro.transferido || 0) > 0 && <Item rotulo="Transferido para outro vale" valor={financeiro.transferido!}/>}
    {bonusGerado !== undefined && <Item rotulo="Bônus deste vale" valor={bonusGerado} cor="text-violet-800"/>}
  </div>;
}

function Item({ rotulo, valor, cor = "text-slate-950", detalhe }: { rotulo: string; valor: number; cor?: string; detalhe?: string }) {
  return <div className="bg-white px-3 py-2 text-center"><span className="block text-[9px] font-black uppercase tracking-wide text-slate-500">{rotulo}</span><strong className={`block whitespace-nowrap font-mono text-sm sm:text-base ${cor}`}>{formatCurrency(valor)}</strong>{detalhe && <span className="block text-[10px] text-violet-800">{detalhe}</span>}</div>;
}
