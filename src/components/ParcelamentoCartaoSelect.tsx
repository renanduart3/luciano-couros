import React from "react";
import { formatCurrency } from "../lib/utils";

export function normalizarQuantidadeParcelas(parcelas: number | undefined) {
  const quantidade = Number(parcelas || 1);
  return Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 12 ? quantidade : 1;
}

export function descreverParcelamentoCartao(valorTotal: number, parcelas: number | undefined, valores?: number[]) {
  if (valores?.length) {
    const centavos = valores.map(valor => Math.round(Number(valor) * 100));
    if (Math.max(...centavos) - Math.min(...centavos) <= 1) {
      return `${valores.length}x de ${formatCurrency(Math.min(...centavos) / 100)}`;
    }
    return valores.map((valor, indice) => `${indice + 1}ª ${formatCurrency(valor)}`).join(" · ");
  }
  const quantidade = normalizarQuantidadeParcelas(parcelas);
  const totalCentavos = Math.max(0, Math.round(Number(valorTotal || 0) * 100));
  const valorBase = Math.round(totalCentavos / quantidade) / 100;
  if (quantidade === 1) return `1x de ${formatCurrency(totalCentavos / 100)}`;
  return `${quantidade}x de ${formatCurrency(valorBase)}`;
}

export function ResumoParcelamentoCartao({ formaPagamento, parcelasCartao, valorTotal, valoresParcelasCartao, className = "" }: {
  formaPagamento: string;
  parcelasCartao?: number;
  valoresParcelasCartao?: number[];
  valorTotal: number;
  className?: string;
}) {
  if (formaPagamento !== "cartao_credito") return null;
  const quantidade = normalizarQuantidadeParcelas(parcelasCartao);
  return <div data-testid="resumo-parcelamento-cartao" className={`rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-bold text-blue-950 ${className}`}>
    <span className="block font-black uppercase">Cartão de crédito · {quantidade}x</span>
    <span className="block">{descreverParcelamentoCartao(valorTotal, quantidade, valoresParcelasCartao)} · Total {formatCurrency(valorTotal)}</span>
  </div>;
}

export function ParcelamentoCartaoSelect({ formaPagamento, parcelas, onChange, valorTotal, className = "", disabled = false }: {
  disabled?: boolean;
  formaPagamento: string;
  parcelas: number;
  onChange: (parcelas: number) => void;
  valorTotal?: number;
  className?: string;
}) {
  if (formaPagamento !== "cartao_credito") return null;
  const quantidade = normalizarQuantidadeParcelas(parcelas);
  return <div className={`max-w-xs ${className}`}>
    <label className="block text-[10px] font-black uppercase text-blue-800">
      Parcelamento
      <select disabled={disabled} value={quantidade} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-950 disabled:opacity-50">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((numero) => <option key={numero} value={numero}>{numero === 1 ? '1x (sem parcelamento)' : `${numero}x`}</option>)}
      </select>
    </label>
    {Number(valorTotal || 0) > 0 && <p className="mt-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold normal-case text-blue-900">{descreverParcelamentoCartao(Number(valorTotal), quantidade)} · Total {formatCurrency(Number(valorTotal))}</p>}
  </div>;
}
