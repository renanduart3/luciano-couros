import React, { useEffect, useMemo, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TituloRecebimento } from "../types";
import { api } from "../lib/api";
import { ehDuplicata, ehTituloPagamento, ehTituloTerceiro } from "../lib/pagamentos";

import { sugerirValores } from "../lib/distribuicaoPagamento";
import { somarMesesVencimento } from "../lib/datasPagamento";
import { formatCurrency } from "../lib/utils";
import { ClienteDocumentoLookupInput } from "./ClienteDocumentoLookupInput";

interface Props {
  formaPagamento: string;
  clienteId: string;
  clienteNome: string;
  clienteDocumento?: string;
  valorPagamento: number;
  titulos: TituloRecebimento[];
  onChange: (titulos: TituloRecebimento[]) => void;
  referenciaPagamento?: string;
  limiteLinhas?: number;
  editarStatus?: boolean;
}

const novoTitulo = (tipo: string, valor: number, nome = "", documento = ""): TituloRecebimento => ({
  tipo: tipo as TituloRecebimento["tipo"],
  nomeTitular: nome,
  documentoTitular: documento,
  valor: Math.max(0, Math.round(valor * 100) / 100),
  vencimento: "",
  numeroDocumento: "",
});

export function TitulosPagamentoEditor({ formaPagamento, clienteId, clienteNome, clienteDocumento, valorPagamento, titulos, onChange, referenciaPagamento, limiteLinhas = 12, editarStatus = false }: Props) {
  const habilitado = ehTituloPagamento(formaPagamento);
  const terceiro = ehTituloTerceiro(formaPagamento);
  const boleto = ehDuplicata(formaPagamento);
  const valorAnterior = useRef(valorPagamento);

  useEffect(() => {
    valorAnterior.current = valorPagamento;
    if (habilitado && titulos.length) onChange(sugerirValores(titulos, valorPagamento));
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
  }, [habilitado, formaPagamento, clienteId, clienteNome, clienteDocumento, terceiro, titulos.length, valorPagamento]);

  const total = useMemo(() => titulos.reduce((soma, titulo) => soma + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0), [titulos]);
  if (!habilitado) return null;

  const atualizar = (indice: number, alteracao: Partial<TituloRecebimento>) => onChange(titulos.map((titulo, atual) => atual === indice ? { ...titulo, ...alteracao, valorManual: alteracao.valor !== undefined ? true : titulo.valorManual, tipo: formaPagamento as TituloRecebimento["tipo"] } : titulo));
  const adicionar = () => {
    if (titulos.length >= limiteLinhas) return;
    const anterior = [...titulos].reverse().find((titulo) => titulo.status !== "recusado");
    const dataAnterior = [...titulos].reverse().find(t => t.vencimento)?.vencimento || '';
    const novo = novoTitulo(formaPagamento, 0, anterior?.nomeTitular || (terceiro ? "" : clienteNome), anterior?.documentoTitular || (terceiro ? "" : (clienteDocumento || "")));
    novo.vencimento = somarMesesVencimento(dataAnterior);
    onChange(sugerirValores([...titulos, novo], valorPagamento));
  };

  const atingiuLimite = titulos.length >= limiteLinhas;
  const possuiLegadoAcimaDoLimite = titulos.length > limiteLinhas;

  return <section className="payment-compact rounded-lg border border-sky-300 bg-sky-50 p-2">
    <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
      <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-black uppercase text-sky-950">{boleto ? "Duplicatas (boletos)" : "Cheques"}</h3>{referenciaPagamento && <span className="rounded-md border border-blue-300 bg-blue-700 px-2 py-1 text-[10px] font-black uppercase text-white">{referenciaPagamento}</span>}</div></div>
      <div className="flex items-end gap-2">
        <span className="text-xs font-bold text-emerald-900">Total dos títulos: {formatCurrency(total)}</span>
        <button type="button" onClick={adicionar} disabled={atingiuLimite} title={atingiuLimite ? `Limite de ${limiteLinhas} títulos atingido` : undefined} className="inline-flex h-7 items-center gap-1 rounded-md bg-sky-800 px-2 text-[9px] font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-400"><Plus size={12}/>Adicionar linha ({Math.min(titulos.length, limiteLinhas)}/{limiteLinhas})</button>
      </div>
    </div>
    {possuiLegadoAcimaDoLimite && <p className="mb-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-900">Este pagamento antigo possui {titulos.length} títulos. Eles podem ser editados, mas não é possível adicionar novas linhas.</p>}
    <div className="space-y-1.5">
      {titulos.map((titulo, indice) => <div key={titulo.id || `${formaPagamento}-${indice}`} className="rounded-md border border-sky-200 bg-white p-1.5">
        {titulo.valorOriginal !== undefined && Math.abs(titulo.valorOriginal - titulo.valor) > 0.005 && <p className="mb-1 text-[10px] text-slate-500">Valor original: {formatCurrency(titulo.valorOriginal)}</p>}
        {editarStatus && <div className="mb-2 flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-bold">Status do título {indice + 1}<select aria-label={`Status do título ${indice + 1}`} value={titulo.status || "aguardando"} onChange={e => atualizar(indice, { status: e.target.value as TituloRecebimento["status"], dataCompensacao: e.target.value === "compensado" ? titulo.dataCompensacao : undefined })} className="ml-2 h-8 rounded border border-slate-300 bg-white px-2"><option value="aguardando">Aguardando compensação</option><option value="compensado">Pago</option><option value="recusado">Recusado</option></select></label>
          {titulo.status === "compensado" && <label className="text-[10px] font-bold">Compensação<input aria-label={`Compensação do título ${indice + 1}`} type="date" value={titulo.dataCompensacao || ""} onChange={e => atualizar(indice, { dataCompensacao: e.target.value })} className="ml-2 h-8 rounded border border-slate-300 px-2"/></label>}
        </div>}
        <div className="grid grid-cols-2 items-start gap-1.5 md:grid-cols-4 xl:grid-cols-[64px_minmax(130px,1.3fr)_minmax(115px,1fr)_90px_132px_100px_minmax(110px,1fr)_26px]">
          <span title={referenciaPagamento || undefined} className={`mt-[14px] inline-flex h-7 items-center justify-center rounded border px-1 text-center text-[9px] font-black ${titulo.status === "recusado" ? "border-red-200 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{titulo.status === "recusado" ? "RECUSADO" : referenciaPagamento || `TÍTULO ${indice + 1}`}</span>
          <label className="text-[10px] font-black uppercase text-slate-600">Nome<input required disabled={titulo.status === "recusado"} value={titulo.nomeTitular} onChange={(e) => atualizar(indice, { nomeTitular: e.target.value.slice(0, 160) })} className="titulo-pagamento-input mt-0.5 h-7 w-full rounded border border-slate-300 px-1.5 text-[11px] font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
          <ClienteDocumentoLookupInput label="CPF/CNPJ" required disabled={titulo.status === "recusado"} value={titulo.documentoTitular} onChange={(documentoTitular) => atualizar(indice, { documentoTitular })} onClienteEncontrado={(nomeTitular) => atualizar(indice, { nomeTitular })} labelClassName="text-[10px] font-black uppercase text-slate-600" inputClassName="titulo-pagamento-input mt-0.5 h-7 w-full rounded border border-slate-300 px-1.5 text-[11px] font-bold normal-case disabled:bg-red-50 disabled:text-red-800" />
          <label className="text-[10px] font-black uppercase text-slate-600">Recebido<input required disabled={titulo.status === "recusado"} type="number" min="0.01" step="0.01" value={titulo.valor || ""} onChange={(e) => atualizar(indice, { valor: Number(e.target.value) })} className="titulo-pagamento-input mt-0.5 h-7 w-full rounded border border-slate-300 px-1.5 text-right font-mono text-[11px] font-black disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[10px] font-black uppercase text-slate-600">Vencimento<input required disabled={titulo.status === "recusado"} type="date" value={titulo.vencimento} onChange={(e) => atualizar(indice, { vencimento: e.target.value })} className="titulo-pagamento-input mt-0.5 h-7 w-full rounded border border-slate-300 px-1 text-[10px] font-bold disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[10px] font-black uppercase text-slate-600">Nº {boleto ? "boleto" : "cheque"}<input required disabled={titulo.status === "recusado"} value={titulo.numeroDocumento} onChange={(e) => atualizar(indice, { numeroDocumento: e.target.value.slice(0, 80) })} className="titulo-pagamento-input mt-0.5 h-7 w-full rounded border border-slate-300 px-1.5 text-[11px] font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
          <label className="text-[10px] font-black uppercase text-slate-600">Observação <span className="font-bold text-slate-400">{titulo.status === "recusado" ? "(recusado)" : referenciaPagamento ? `(${referenciaPagamento.toLowerCase()})` : "(opcional)"}</span><input disabled={titulo.status === "recusado"} value={titulo.observacao || ""} onChange={(e) => atualizar(indice, { observacao: e.target.value.slice(0, 300) })} placeholder={referenciaPagamento || "Observação"} className="titulo-pagamento-input mt-0.5 h-7 w-full rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-bold normal-case disabled:bg-red-50 disabled:text-red-800" /></label>
          <button type="button" disabled={titulos.length === 1 || titulo.status === "recusado"} onClick={() => onChange(sugerirValores(titulos.filter((_, atual) => atual !== indice), valorPagamento))} aria-label={`Excluir linha ${indice + 1}`} className="mt-[14px] inline-flex h-7 w-6 items-center justify-center rounded text-red-700 hover:bg-red-50 disabled:invisible"><Trash2 size={13}/></button>
        </div>
      </div>)}
    </div>
  </section>;
}
