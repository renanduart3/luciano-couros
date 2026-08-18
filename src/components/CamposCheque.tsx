import React from "react";
import { DadosCheque, ehCheque, ehChequeTerceiro } from "../lib/pagamentos";

interface Props {
  formaPagamento: string;
  dados: DadosCheque;
  onChange: (dados: DadosCheque) => void;
  documentoCliente?: string;
}

export function CamposCheque({ formaPagamento, dados, onChange, documentoCliente }: Props) {
  if (!ehCheque(formaPagamento)) return null;
  const alterar = (campo: keyof DadosCheque, valor: string) => onChange({ ...dados, [campo]: valor });
  return <div className="grid gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="text-[10px] font-black uppercase text-sky-900">Vencimento<input type="date" value={dados.vencimento} onChange={(event) => alterar("vencimento", event.target.value)} className="mt-1 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 font-bold" /></label>
    <label className="text-[10px] font-black uppercase text-sky-900">CPF/CNPJ do titular<input value={dados.cpfTitular} onChange={(event) => alterar("cpfTitular", event.target.value.slice(0, 24))} placeholder={documentoCliente || "CPF/CNPJ"} className="mt-1 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 font-bold" /></label>
    {ehChequeTerceiro(formaPagamento) && <label className="text-[10px] font-black uppercase text-sky-900">CPF/CNPJ do terceiro<input value={dados.cpfTerceiro} onChange={(event) => alterar("cpfTerceiro", event.target.value.slice(0, 24))} placeholder="CPF/CNPJ DO TERCEIRO" className="mt-1 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 font-bold" /></label>}
    <label className="text-[10px] font-black uppercase text-sky-900">Banco<input value={dados.banco} onChange={(event) => alterar("banco", event.target.value.slice(0, 80))} placeholder="BANCO" className="mt-1 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 font-bold" /></label>
    <label className="text-[10px] font-black uppercase text-sky-900">Nº do cheque<input value={dados.numeroCheque} onChange={(event) => alterar("numeroCheque", event.target.value.slice(0, 40))} placeholder="NÚMERO" className="mt-1 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 font-bold" /></label>
  </div>;
}
