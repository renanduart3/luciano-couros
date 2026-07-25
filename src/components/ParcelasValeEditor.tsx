import React from "react";
import { CalendarPlus, Equal, Trash2 } from "lucide-react";
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
        {PRAZOS_RAPIDOS.map((dias) => <button key={dias} type="button" onClick={() => adicionarPrazo(dias)} className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-2.5 py-1.5 text-[10px] font-black text-white"><CalendarPlus size={12} /> +{dias} dias</button>)}
      </div>

      <div className="mt-3 space-y-2">
        {parcelas.map((parcela, index) => (
          <div key={`${parcela.vencimento}-${index}`} className="grid grid-cols-[28px_minmax(130px,1fr)_minmax(90px,0.7fr)_32px] items-center gap-2 rounded-lg border border-amber-200 bg-white p-2">
            <strong className="text-center text-xs text-amber-900">{index + 1}ª</strong>
            <input type="date" value={parcela.vencimento} onChange={(event) => onChange(parcelas.map((item, itemIndex) => itemIndex === index ? { ...item, vencimento: event.target.value } : item))} aria-label={`Vencimento da parcela ${index + 1}`} className="min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold" />
            <input inputMode="decimal" value={parcela.valor} onChange={(event) => onChange(parcelas.map((item, itemIndex) => itemIndex === index ? { ...item, valor: event.target.value } : item))} placeholder="0,00" aria-label={`Valor da parcela ${index + 1}`} className="min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-right text-xs font-black" />
            <button type="button" onClick={() => remover(index)} aria-label={`Remover parcela ${index + 1}`} className="rounded-md border border-red-200 p-1.5 text-red-700"><Trash2 size={14} /></button>
          </div>
        ))}
        {parcelas.length === 0 && <p className="rounded-lg border border-dashed border-amber-300 bg-white/60 p-3 text-center text-xs font-bold text-amber-800">Escolha ao menos um prazo acima.</p>}
      </div>

      <div className="mt-2 flex justify-between text-[10px] font-black uppercase">
        <span className="text-amber-900">Planejado: {formatCurrency(soma)}</span>
        <span className={Math.abs(diferenca) <= 0.01 ? "text-emerald-700" : "text-red-700"}>{Math.abs(diferenca) <= 0.01 ? "Valores conferidos" : `Diferença: ${formatCurrency(diferenca)}`}</span>
      </div>
    </div>
  );
}
