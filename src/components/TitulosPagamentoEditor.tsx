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

  const total = useMemo(() => titulos.reduce((soma, titulo) => soma + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0), [titulos]);
  if (!habilitado) return null;

  const atualizar = (indice: number, alteracao: Partial<TituloRecebimento>) => onChange(titulos.map((titulo, atual) => atual === indice ? { ...titulo, ...alteracao, tipo: formaPagamento as TituloRecebimento["tipo"] } : titulo));
  const adicionar = () => {
    const anterior = [...titulos].reverse().find((titulo) => titulo.status !== "recusado");
    onChange([...titulos, novoTitulo(formaPagamento, 0, anterior?.nomeTitular || (terceiro ? "" : clienteNome), anterior?.documentoTitular || (terceiro ? "" : (clienteDocumento || "")))]);
  };

  return <section className="rounded-xl border border-sky-300 bg-sky-50 p-2.5">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-xs font-black uppercase text-sky-950">{boleto ? "Duplicatas (boletos)" : "Cheques"}</h3><p className="text-[11px] font-semibold text-sky-800">Informe uma linha para cada {boleto ? "boleto" : "cheque"} recebido.</p></div>
      <button type="button" onClick={adicionar} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-sky-800 px-2.5 text-[10px] font-black uppercase text-white"><Plus size={13}/>Adicionar linha</button>
    </div>
    <div className="space-y-2">
      {titulos.map((titulo, indice) => <div key={titulo.id || `${formaPagamento}-${indice}`} className="rounded-lg border border-sky-200 bg-white p-2">
        <div className="grid items-end gap-1.5 lg:grid-cols-[24px_minmax(150px,1.5fr)_minmax(135px,1fr)_110px_132px_minmax(135px,1fr)_28px]">
          <span className={`pb-2 text-center text-[10px] font-black ${titulo.status === "recusado" ? "text-red-700" : "text-sky-800"}`}>{titulo.status === "recusado" ? "R" : indice + 1}</span>
          <label className="text-[9px] font-black uppercase text-slate-600">Nome<input required disabled={titulo.status === "recusado"} value={titulo.nomeTitular} onChange={(e) => atualizar(indice, { nomeTitular: e.target.value.slice(0, 160) })} className="mt-0.5 min-h-8 w-full rounded-md border border-slate-300 px-2 text-xs font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[9px] font-black uppercase text-slate-600">CPF/CNPJ<input required disabled={titulo.status === "recusado"} value={titulo.documentoTitular} onChange={(e) => atualizar(indice, { documentoTitular: e.target.value.slice(0, 24) })} className="mt-0.5 min-h-8 w-full rounded-md border border-slate-300 px-2 text-xs font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[9px] font-black uppercase text-slate-600">Valor<input required disabled={titulo.status === "recusado"} type="number" min="0.01" step="0.01" value={titulo.valor || ""} onChange={(e) => atualizar(indice, { valor: Number(e.target.value) })} className="mt-0.5 min-h-8 w-full rounded-md border border-slate-300 px-2 text-right font-mono text-xs font-black disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[9px] font-black uppercase text-slate-600">Vencimento<input required disabled={titulo.status === "recusado"} type="date" value={titulo.vencimento} onChange={(e) => atualizar(indice, { vencimento: e.target.value })} className="mt-0.5 min-h-8 w-full rounded-md border border-slate-300 px-1.5 text-xs font-bold disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[9px] font-black uppercase text-slate-600">Nº {boleto ? "boleto" : "cheque"}<input required disabled={titulo.status === "recusado"} value={titulo.numeroDocumento} onChange={(e) => atualizar(indice, { numeroDocumento: e.target.value.slice(0, 80) })} className="mt-0.5 min-h-8 w-full rounded-md border border-slate-300 px-2 text-xs font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
          <button type="button" disabled={titulos.length === 1 || titulo.status === "recusado"} onClick={() => onChange(titulos.filter((_, atual) => atual !== indice))} aria-label={`Excluir linha ${indice + 1}`} className="mb-0.5 inline-flex h-8 w-7 items-center justify-center rounded-md text-red-700 hover:bg-red-50 disabled:invisible"><Trash2 size={14}/></button>
        </div>
        <label className="mt-1.5 block text-[9px] font-black uppercase text-slate-600">Observação <span className="font-bold text-slate-400">{titulo.status === "recusado" ? "(título recusado)" : "(opcional)"}</span><input disabled={titulo.status === "recusado"} value={titulo.observacao || ""} onChange={(e) => atualizar(indice, { observacao: e.target.value.slice(0, 300) })} placeholder={`Detalhe deste ${boleto ? "boleto" : "cheque"}`} className="mt-0.5 min-h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
      </div>)}
    </div>
    <div className="mt-2 flex justify-end rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-900">
      <span>Total a contabilizar: {formatCurrency(total)}</span>
    </div>
  </section>;
}
