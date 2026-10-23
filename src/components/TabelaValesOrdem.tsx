import React from "react";
import type { OrdemCobranca } from "../types";
import { totaisValesOrdem } from "../lib/demonstrativoOrdem";
import { formatCurrency, formatDate } from "../lib/utils";

export function TabelaValesOrdem({ ordem, onOpenVale, somenteTotal = false }: {
  ordem: OrdemCobranca; onOpenVale?: (id: string) => void; somenteTotal?: boolean;
}) {
  const totais = totaisValesOrdem(ordem);
  return <div className="overflow-x-auto print:overflow-visible"><table className="w-full text-xs">
    <thead className="bg-white"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Emissão do vale</th><th className="p-2 text-right">Valor</th></tr></thead>
    <tbody>{ordem.vales.map(vale => <tr key={vale.id} className="border-t border-slate-200">
      <td className="p-2">{onOpenVale ? <button type="button" onClick={() => onOpenVale(vale.vendaId)} className="font-bold text-blue-800 underline">#{vale.numeroSequencial}</button> : <b>#{vale.numeroSequencial}</b>}</td>
      <td className="p-2 whitespace-nowrap">{formatDate(vale.data)}</td>
      <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(vale.valorOriginalVale ?? vale.valorVinculado)}</td>
    </tr>)}</tbody>
    <tfoot className="border-t-2 border-slate-300 bg-white font-semibold">
      <tr><td className="p-2" colSpan={2}>TOTAL</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totais.total)}</td></tr>
      {!somenteTotal && <><tr><td className="p-2" colSpan={2}>PAGO</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totais.pago)}</td></tr>
      <tr><td className="p-2" colSpan={2}>DEVEDOR</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totais.devedor)}</td></tr>
      <tr><td className="p-2" colSpan={2}>BÔNUS</td><td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totais.bonus)}</td></tr></>}
    </tfoot>
  </table></div>;
}
