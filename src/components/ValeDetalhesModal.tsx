import React, { useState } from "react";
import { CalendarClock, FileText, List, Printer, X } from "lucide-react";
import { Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";

interface ValeDetalhesModalProps {
  vale: Venda;
  onClose: () => void;
}

export function ValeDetalhesModal({ vale, onClose }: ValeDetalhesModalProps) {
  const [aba, setAba] = useState<"itens" | "comprovante">("itens");
  const itens = vale.items || [];

  const imprimir = () => {
    setAba("comprovante");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  return (
    <div id="print-vale-detail-overlay" className="fixed inset-0 z-[80] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-100 p-2 text-amber-800"><FileText size={20} /></span>
            <div>
              <h2 className="font-black uppercase text-slate-950">Vale #{vale.numeroSequencial}</h2>
              <p className="text-xs font-bold text-slate-500">{vale.clienteNome || "Cliente não informado"} • {formatDate(vale.data)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAba("itens")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "itens" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><List size={16} /> Detalhes</button>
            <button type="button" onClick={() => setAba("comprovante")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "comprovante" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><FileText size={16} /> Comprovante</button>
            <button type="button" onClick={imprimir} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-black uppercase text-white sm:flex-none"><Printer size={16} /> Imprimir</button>
            <button type="button" aria-label="Fechar detalhes do vale" onClick={onClose} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-slate-600"><X size={18} /></button>
          </div>
        </header>

        {aba === "itens" ? (
          <div className="space-y-4 p-3 sm:p-5 print:hidden">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              <Resumo titulo="Valor original" valor={formatCurrency(vale.totalLiquido)} />
              <Resumo titulo="Valor pago" valor={formatCurrency(vale.valorPago)} destaque="text-blue-800" />
              <Resumo titulo="Saldo atual" valor={formatCurrency(vale.saldoRestante)} destaque="text-amber-800" />
              <Resumo titulo="Itens" valor={String(itens.length)} />
              <Resumo titulo="Vencimento" valor={vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"} icone />
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-300 bg-white md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-100 text-xs font-black uppercase text-slate-600">
                  <tr><th className="p-3 text-left">Ref.</th><th className="p-3 text-left">Material</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-left">Un.</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {itens.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/50">
                      <td className="p-3 font-mono text-xs font-bold text-slate-500">{item.referencia || "—"}</td>
                      <td className="p-3 font-black text-slate-950">{item.descricao}</td>
                      <td className="p-3 text-right font-mono font-black">{formatDecimal(item.quantidade)}</td>
                      <td className="p-3 font-bold text-slate-600">{item.unidade}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(item.precoUnitario)}</td>
                      <td className="p-3 text-right font-mono font-black">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white md:hidden">
              {itens.map((item) => (
                <article key={item.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-950">{item.descricao}</strong><strong className="shrink-0 font-mono text-sm">{formatCurrency(item.total)}</strong></div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500"><span>{item.referencia || "Sem referência"}</span><span>{formatDecimal(item.quantidade)} {item.unidade} × {formatCurrency(item.precoUnitario)}</span></div>
                </article>
              ))}
            </div>

            {itens.length === 0 && <p className="rounded-xl border border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">Nenhum item encontrado para esta venda.</p>}
            {vale.observacoes && <div className="rounded-xl border border-slate-300 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Observações</span><p className="mt-1 text-sm font-bold text-slate-800">{vale.observacoes}</p></div>}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto p-2 sm:p-4 print:overflow-visible print:p-0">
            <VendaComprovante venda={vale} />
          </div>
        )}
      </div>
    </div>
  );
}

function Resumo({ titulo, valor, destaque = "text-slate-950", icone = false }: { titulo: string; valor: string; destaque?: string; icone?: boolean }) {
  return <div className="rounded-xl border border-slate-300 bg-white p-3"><span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">{icone && <CalendarClock size={13} />}{titulo}</span><strong className={`mt-1 block text-base ${destaque}`}>{valor}</strong></div>;
}
