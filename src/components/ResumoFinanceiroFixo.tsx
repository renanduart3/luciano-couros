import React from "react";
import type { PosicaoFinanceira } from "../lib/financeiro";
import { formatCurrency } from "../lib/utils";

export function ResumoFinanceiroFixo({ negociado, financeiro }: { negociado: number; financeiro: PosicaoFinanceira }) {
  const excedente = financeiro.excedentePresumido > 0.005;
  return <div className="grid shrink-0 grid-cols-2 gap-px border-b border-slate-300 bg-slate-300 sm:grid-cols-4 print:hidden">
    <Item rotulo="Negociado" valor={negociado}/>
    <Item rotulo="Entrou" valor={financeiro.recebido} cor="text-blue-800"/>
    <Item rotulo="Pago presumido" valor={financeiro.presumido} cor="text-emerald-800"/>
    <Item rotulo={excedente ? "Valor excedido" : "Ainda devido"} valor={excedente ? financeiro.excedentePresumido : financeiro.restantePresumido} cor={excedente ? "text-violet-800" : "text-amber-800"}/>
  </div>;
}

function Item({ rotulo, valor, cor = "text-slate-950" }: { rotulo: string; valor: number; cor?: string }) {
  return <div className="bg-white px-3 py-2 text-center"><span className="block text-[9px] font-black uppercase tracking-wide text-slate-500">{rotulo}</span><strong className={`block whitespace-nowrap font-mono text-sm sm:text-base ${cor}`}>{formatCurrency(valor)}</strong></div>;
}
