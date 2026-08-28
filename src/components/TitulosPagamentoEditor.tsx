import React, { useEffect, useMemo, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TituloRecebimento } from "../types";
import { api } from "../lib/api";
import { ehDuplicata, ehTituloPagamento, ehTituloTerceiro } from "../lib/pagamentos";
import { formatCurrency } from "../lib/utils";

interface Props {
  formaPagamento: string;
  clienteId: string;
  clienteNome: string;
  clienteDocumento?: string;
  valorPagamento: number;
  titulos: TituloRecebimento[];
  onChange: (titulos: TituloRecebimento[]) => void;
}

const novoTitulo = (tipo: string, valor: number, nome = "", documento = ""): TituloRecebimento => ({
  tipo: tipo as TituloRecebimento["tipo"],
  nomeTitular: nome,
  documentoTitular: documento,
  valor: Math.max(0, Math.round(valor * 100) / 100),
  vencimento: "",
  numeroDocumento: "",
});

export function TitulosPagamentoEditor({ formaPagamento, clienteId, clienteNome, clienteDocumento, valorPagamento, titulos, onChange }: Props) {
  const habilitado = ehTituloPagamento(formaPagamento);
  const terceiro = ehTituloTerceiro(formaPagamento);
  const boleto = ehDuplicata(formaPagamento);
  const valorAnterior = useRef(valorPagamento);

  useEffect(() => {
    const anterior = valorAnterior.current;
    valorAnterior.current = valorPagamento;
    if (habilitado && titulos.length === 1 && (Math.abs(Number(titulos[0].valor || 0) - anterior) <= 0.005 || Number(titulos[0].valor || 0) === 0)) {
      onChange([{ ...titulos[0], valor: Math.max(0, Math.round(valorPagamento * 100) / 100) }]);
    }
  }, [valorPagamento]);

  useEffect(() => {
    if (!habilitado) {
      if (titulos.length) onChange([]);
      return;
    }
    if (titulos.length && titulos.every((titulo) => titulo.tipo === formaPagamento)) return;
    let ativo = true;
    api.getUltimoTituloCliente(clienteId, formaPagamento)
      .then((ultimo) => {
        if (!ativo) return;
        onChange([novoTitulo(
          formaPagamento,
          valorPagamento,
          terceiro ? ultimo.nomeTitular : clienteNome,
          terceiro ? ultimo.documentoTitular : (clienteDocumento || ultimo.documentoTitular)
        )]);
      })
      .catch(() => {
        if (ativo) onChange([novoTitulo(formaPagamento, valorPagamento, terceiro ? "" : clienteNome, terceiro ? "" : (clienteDocumento || ""))]);
      });
    return () => { ativo = false; };
  }, [habilitado, formaPagamento, clienteId, clienteNome, clienteDocumento, terceiro]);

  const total = useMemo(() => titulos.reduce((soma, titulo) => soma + Number(titulo.valor || 0), 0), [titulos]);
  const diferenca = Math.round((valorPagamento - total) * 100) / 100;
  if (!habilitado) return null;

  const atualizar = (indice: number, alteracao: Partial<TituloRecebimento>) => onChange(titulos.map((titulo, atual) => atual === indice ? { ...titulo, ...alteracao, tipo: formaPagamento as TituloRecebimento["tipo"] } : titulo));
  const adicionar = () => {
    const anterior = titulos[titulos.length - 1];
    onChange([...titulos, novoTitulo(formaPagamento, 0, anterior?.nomeTitular || (terceiro ? "" : clienteNome), anterior?.documentoTitular || (terceiro ? "" : (clienteDocumento || "")))]);
  };

  return <section className="rounded-xl border border-sky-300 bg-sky-50 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-xs font-black uppercase text-sky-950">{boleto ? "Duplicatas (boletos)" : "Cheques"}</h3><p className="text-[11px] font-semibold text-sky-800">Informe uma linha para cada {boleto ? "boleto" : "cheque"} recebido.</p></div>
      <button type="button" onClick={adicionar} className="inline-flex items-center gap-1 rounded-lg bg-sky-800 px-3 py-2 text-[11px] font-black uppercase text-white"><Plus size={14}/>Adicionar linha</button>
    </div>
    <div className="space-y-3">
      {titulos.map((titulo, indice) => <div key={titulo.id || `${formaPagamento}-${indice}`} className="grid gap-2 rounded-lg border border-sky-200 bg-white p-3 md:grid-cols-12">
        <div className="md:col-span-12 flex items-center justify-between"><span className="text-[10px] font-black uppercase text-sky-800">{boleto ? "Boleto" : "Cheque"} {indice + 1}</span>{titulos.length > 1 && <button type="button" onClick={() => onChange(titulos.filter((_, atual) => atual !== indice))} aria-label={`Excluir linha ${indice + 1}`} className="rounded p-1 text-red-700 hover:bg-red-50"><Trash2 size={15}/></button>}</div>
        <label className="text-[10px] font-black uppercase text-slate-600 md:col-span-4">Nome {terceiro ? "do terceiro" : "do cliente"}<input required value={titulo.nomeTitular} onChange={(e) => atualizar(indice, { nomeTitular: e.target.value.slice(0, 160) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold normal-case" /></label>
        <label className="text-[10px] font-black uppercase text-slate-600 md:col-span-3">CPF/CNPJ {terceiro ? "do terceiro" : ""}<input required value={titulo.documentoTitular} onChange={(e) => atualizar(indice, { documentoTitular: e.target.value.slice(0, 24) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold normal-case" /></label>
        <label className="text-[10px] font-black uppercase text-slate-600 md:col-span-2">Valor<input required type="number" min="0.01" step="0.01" value={titulo.valor || ""} onChange={(e) => atualizar(indice, { valor: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right font-mono text-sm font-black" /></label>
        <label className="text-[10px] font-black uppercase text-slate-600 md:col-span-3">Vencimento<input required type="date" value={titulo.vencimento} onChange={(e) => atualizar(indice, { vencimento: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" /></label>
        <label className="text-[10px] font-black uppercase text-slate-600 md:col-span-5">Número do {boleto ? "boleto" : "cheque"}<input required value={titulo.numeroDocumento} onChange={(e) => atualizar(indice, { numeroDocumento: e.target.value.slice(0, 80) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold normal-case" /></label>
      </div>)}
    </div>
    <div className={`mt-3 flex flex-wrap justify-end gap-4 rounded-lg px-3 py-2 text-xs font-black ${Math.abs(diferenca) <= 0.005 ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>
      <span>Total dos títulos: {formatCurrency(total)}</span><span>Pagamento: {formatCurrency(valorPagamento)}</span>{Math.abs(diferenca) > 0.005 && <span>Diferença: {formatCurrency(diferenca)}</span>}
    </div>
  </section>;
}
