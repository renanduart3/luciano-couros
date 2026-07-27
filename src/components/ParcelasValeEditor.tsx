import React from "react";
import { CalendarPlus, CheckCircle2, Equal, Trash2 } from "lucide-react";
import { formatCurrency, parseBrazilianNumber } from "../lib/utils";

export interface ParcelaValeRascunho {
  vencimento: string;
  valor: string;
}

interface ParcelasValeEditorProps {
  total: number;
  parcelas: ParcelaValeRascunho[];
  onChange: (parcelas: ParcelaValeRascunho[]) => void;
  compacto?: boolean;
}

const PRAZOS_RAPIDOS = [30, 60, 90, 120, 150];

export function dataComPrazo(dias: number) {
  const data = new Date();
  data.setHours(12, 0, 0, 0);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function distribuir(total: number, parcelas: ParcelaValeRascunho[]) {
  if (parcelas.length === 0) return [];
  const totalCentavos = Math.max(0, Math.round(total * 100));
  const base = Math.floor(totalCentavos / parcelas.length);
  let restante = totalCentavos - base * parcelas.length;
  return parcelas.map((parcela) => {
    const centavos = base + (restante-- > 0 ? 1 : 0);
    return { ...parcela, valor: (centavos / 100).toFixed(2).replace(".", ",") };
  });
}

export function ParcelasValeEditor({ total, parcelas, onChange, compacto = false }: ParcelasValeEditorProps) {
  const soma = parcelas.reduce((valor, parcela) => valor + parseBrazilianNumber(parcela.valor), 0);
  const diferenca = Math.round((total - soma) * 100) / 100;

  const adicionarPrazo = (dias: number) => {
    const vencimento = dataComPrazo(dias);
    if (parcelas.some((parcela) => parcela.vencimento === vencimento)) return;
    onChange(distribuir(total, [...parcelas, { vencimento, valor: "" }]));
  };

  const remover = (index: number) => {
    onChange(distribuir(total, parcelas.filter((_, itemIndex) => itemIndex !== index)));
  };

  return (
    <div className={`rounded-xl border border-amber-300 bg-amber-50 ${compacto ? "p-2" : "p-3"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span />
        <button type="button" onClick={() => onChange(distribuir(total, parcelas))} disabled={parcelas.length === 0} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-amber-900 disabled:opacity-40"><Equal size={13} /> Distribuir igualmente</button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRAZOS_RAPIDOS.map((dias) => {
          const aplicado = parcelas.some((parcela) => parcela.vencimento === dataComPrazo(dias));
          return (
            <button
              key={dias}
              type="button"
              onClick={() => adicionarPrazo(dias)}
              disabled={aplicado}
              aria-pressed={aplicado}
              className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition-colors ${
                aplicado
                  ? "cursor-not-allowed border-emerald-300 bg-emerald-100 text-emerald-800"
                  : "border-amber-700 bg-amber-700 text-white hover:bg-amber-800"
              }`}
            >
              {aplicado ? <CheckCircle2 size={13} /> : <CalendarPlus size={12} />}
              +{dias} dias {aplicado && <span>• Aplicado</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-amber-200 bg-white">
        <table className="w-full min-w-[470px] text-xs">
          <thead className="bg-amber-100 text-[10px] font-black uppercase text-amber-950">
            <tr>
              <th className="w-16 px-3 py-2 text-center">Parcela</th>
              <th className="px-3 py-2 text-left">Data prevista</th>
              <th className="px-3 py-2 text-right">Valor previsto</th>
              <th className="w-14 px-3 py-2 text-center">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {parcelas.map((parcela, index) => (
              <tr key={`parcela-${index}`}>
                <td className="px-3 py-2 text-center font-black text-amber-900">{index + 1}ª</td>
                <td className="px-3 py-2">
                  <input type="date" value={parcela.vencimento} onChange={(event) => onChange(parcelas.map((item, itemIndex) => itemIndex === index ? { ...item, vencimento: event.target.value } : item))} aria-label={`Vencimento da parcela ${index + 1}`} className="min-h-9 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold" />
                </td>
                <td className="px-3 py-2">
                  <input inputMode="decimal" value={parcela.valor} onChange={(event) => onChange(parcelas.map((item, itemIndex) => itemIndex === index ? { ...item, valor: event.target.value } : item))} placeholder="0,00" aria-label={`Valor da parcela ${index + 1}`} className="min-h-9 w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-xs font-black" />
                </td>
                <td className="px-3 py-2 text-center">
                  <button type="button" onClick={() => remover(index)} aria-label={`Remover parcela ${index + 1}`} className="rounded-md border border-red-200 p-2 text-red-700"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {parcelas.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-xs font-bold text-amber-800">Escolha ao menos um prazo acima.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex justify-between text-[10px] font-black uppercase">
        <span className="text-amber-900">Planejado: {formatCurrency(soma)}</span>
        <span className={Math.abs(diferenca) <= 0.01 ? "text-emerald-700" : "text-red-700"}>{Math.abs(diferenca) <= 0.01 ? "Valores conferidos" : `Diferença: ${formatCurrency(diferenca)}`}</span>
      </div>
    </div>
  );
}
