import React from "react";
import type { OrdemCobranca } from "../types";
import { financeiroOrdem } from "../lib/financeiro";
import { formatCurrency, formatDate } from "../lib/utils";

export function TabelaValesOrdem({ ordem, onOpenVale }: {
  ordem: OrdemCobranca; onOpenVale?: (id: string) => void;
}) {
  const totalVales = ordem.vales.reduce((soma, vale) => soma + Math.round(Number(vale.valorOriginalVale ?? vale.valorVinculado) * 100), 0) / 100;
  const financeiro = financeiroOrdem(ordem);
  return <div className="overflow-x-auto print:overflow-visible"><table className="w-full text-xs">
    <thead className="bg-slate-100"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Data</th><th className="p-2 text-right">Valor</th></tr></thead>
    <tbody>{ordem.vales.map(vale => <tr key={vale.id} className="border-t border-slate-200">
      <td className="p-2">{onOpenVale ? <button type="button" onClick={() => onOpenVale(vale.vendaId)} className="font-bold text-blue-800 underline">#{vale.numeroSequencial}</button> : <b>#{vale.numeroSequencial}</b>}</td>
      <td className="p-2 whitespace-nowrap">{formatDate(vale.data)}</td>
      <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(vale.valorOriginalVale ?? vale.valorVinculado)}</td>
    </tr>)}</tbody>
    <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
      <tr><td className="p-2" colSpan={2}>TOTAL</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totalVales)}</td></tr>
      <tr><td className="p-2" colSpan={2}>PAGO</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(financeiro.presumido)}</td></tr>
      <tr><td className="p-2" colSpan={2}>DEVEDOR</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(financeiro.restantePresumido)}</td></tr>
    </tfoot>
  </table></div>;
}
