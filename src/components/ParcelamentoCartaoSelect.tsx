import React from "react";

export function ParcelamentoCartaoSelect({ formaPagamento, parcelas, onChange, className = "" }: {
  formaPagamento: string;
  parcelas: number;
  onChange: (parcelas: number) => void;
  className?: string;
}) {
  if (formaPagamento !== "cartao_credito") return null;
  return <label className={`block text-[10px] font-black uppercase text-blue-800 ${className}`}>
    Parcelas no cartão
    <select value={parcelas} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-black text-blue-950">
      {Array.from({ length: 12 }, (_, index) => index + 1).map((quantidade) => <option key={quantidade} value={quantidade}>{quantidade}x</option>)}
    </select>
  </label>;
}
