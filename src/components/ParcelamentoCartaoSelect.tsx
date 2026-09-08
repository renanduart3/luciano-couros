import React from "react";
import { formatCurrency } from "../lib/utils";

export function normalizarQuantidadeParcelas(parcelas: number | undefined) {
  const quantidade = Number(parcelas || 1);
  return Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 12 ? quantidade : 1;
}

export function descreverParcelamentoCartao(valorTotal: number, parcelas: number | undefined, valores?: number[]) {
  if (valores?.length) return valores.map((v, i) => `${i + 1}ª ${formatCurrency(v)}`).join(' · ');
  const quantidade = normalizarQuantidadeParcelas(parcelas);
  const totalCentavos = Math.max(0, Math.round(Number(valorTotal || 0) * 100));
  const valorBaseCentavos = Math.floor(totalCentavos / quantidade);
  const parcelasComCentavoExtra = totalCentavos % quantidade;
  const valorBase = valorBaseCentavos / 100;
  if (quantidade === 1) return `1x de ${formatCurrency(totalCentavos / 100)}`;
  if (parcelasComCentavoExtra === 0) return `${quantidade}x de ${formatCurrency(valorBase)}`;
  const parcelasBase = quantidade - parcelasComCentavoExtra;
  const partes = [`${parcelasComCentavoExtra}x de ${formatCurrency(valorBase + 0.01)}`];
  if (parcelasBase > 0) partes.push(`${parcelasBase}x de ${formatCurrency(valorBase)}`);
  return partes.join(" + ");
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

export function ParcelamentoCartaoSelect({ formaPagamento, parcelas, onChange, valorTotal, className = "" }: {
  formaPagamento: string;
  parcelas: number;
  onChange: (parcelas: number) => void;
  valorTotal?: number;
  className?: string;
}) {
  if (formaPagamento !== "cartao_credito") return null;
  const quantidade = normalizarQuantidadeParcelas(parcelas);
  return <div className={className}>
    <label className="block text-[10px] font-black uppercase text-blue-800">
      Parcelas no cartão
      <select value={quantidade} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-black text-blue-950">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((numero) => <option key={numero} value={numero}>{numero}x</option>)}
      </select>
    </label>
    {Number(valorTotal || 0) > 0 && <p className="mt-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold normal-case text-blue-900">{descreverParcelamentoCartao(Number(valorTotal), quantidade)} · Total {formatCurrency(Number(valorTotal))}</p>}
  </div>;
}
