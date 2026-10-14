import React from "react";
import { OrdemCobrancaVale } from "../types";
import { formatCurrency } from "../lib/utils";

/** Valores integrais dos vales, incluindo pagamentos anteriores à ordem. */
export function TabelaValesOrdem({ vales, onOpenVale, descricao = false }: {
  vales: OrdemCobrancaVale[]; onOpenVale?: (id: string) => void; descricao?: boolean;
}) {
  const transferidos = vales.some(v => Number(v.valorTransferidoVale) > 0.005);
  const moeda = (valor?: number) => valor === undefined ? "—" : formatCurrency(valor);
  const total = (campo: "valorOriginalVale" | "valorPagoTotalVale" | "saldoAtualVale" | "valorTransferidoVale") =>
    vales.some(v => v[campo] === undefined && campo !== "valorTransferidoVale") ? undefined
      : vales.reduce((s, v) => s + Math.round(Number(v[campo] || 0) * 100), 0) / 100;
  return <div className="overflow-x-auto print:overflow-visible"><table className="w-full text-xs">
    <thead className="bg-slate-100"><tr><th className="p-2 text-left">Vale</th>{descricao && <th className="p-2 text-left">Descrição</th>}<th className="p-2 text-right">Valor original</th><th className="p-2 text-right">Abatido</th>{transferidos && <th className="p-2 text-right">Transferido</th>}<th className="p-2 text-right">Falta</th></tr></thead>
    <tbody>{vales.map(v => <tr key={v.id} className="border-t border-slate-200">
      <td className="p-2">{onOpenVale ? <button type="button" onClick={() => onOpenVale(v.vendaId)} className="font-bold text-blue-800 underline">#{v.numeroSequencial}</button> : <b>#{v.numeroSequencial}</b>}</td>
      {descricao && <td className="p-2">VALE</td>}
      <td className="p-2 text-right font-mono whitespace-nowrap">{moeda(v.valorOriginalVale)}</td>
      <td className="p-2 text-right font-mono whitespace-nowrap">{moeda(v.valorPagoTotalVale)}</td>
      {transferidos && <td className="p-2 text-right font-mono whitespace-nowrap">{moeda(v.valorTransferidoVale || 0)}</td>}
      <td className="p-2 text-right font-mono font-bold whitespace-nowrap">{moeda(v.saldoAtualVale)}</td>
    </tr>)}</tbody>
    <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold"><tr><td className="p-2" colSpan={descricao ? 2 : 1}>TOTAL</td><td className="p-2 text-right whitespace-nowrap">{moeda(total("valorOriginalVale"))}</td><td className="p-2 text-right whitespace-nowrap">{moeda(total("valorPagoTotalVale"))}</td>{transferidos && <td className="p-2 text-right whitespace-nowrap">{moeda(total("valorTransferidoVale"))}</td>}<td className="p-2 text-right whitespace-nowrap">{moeda(total("saldoAtualVale"))}</td></tr></tfoot>
  </table></div>;
}
