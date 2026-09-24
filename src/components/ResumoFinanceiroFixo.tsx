import React from "react";
import type { PosicaoFinanceira } from "../lib/financeiro";
import { formatCurrency } from "../lib/utils";

export function ResumoFinanceiroFixo({ negociado, financeiro, rotuloTotal = "Negociado" }: { negociado: number; financeiro: PosicaoFinanceira; rotuloTotal?: "Negociado" | "Devedor" }) {
  return <div className="grid shrink-0 grid-cols-3 gap-px border-b border-slate-300 bg-slate-300 print:hidden">
    <Item rotulo={rotuloTotal} valor={negociado}/>
    <Item rotulo="Pago" valor={financeiro.presumido} cor="text-emerald-800"/>
    <Item rotulo="Restante" valor={financeiro.restantePresumido} cor="text-amber-800"/>
  </div>;
}

function Item({ rotulo, valor, cor = "text-slate-950" }: { rotulo: string; valor: number; cor?: string }) {
  return <div className="bg-white px-3 py-2 text-center"><span className="block text-[9px] font-black uppercase tracking-wide text-slate-500">{rotulo}</span><strong className={`block whitespace-nowrap font-mono text-sm sm:text-base ${cor}`}>{formatCurrency(valor)}</strong></div>;
}
