import React, { useEffect, useMemo, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TituloRecebimento } from "../types";
import { api } from "../lib/api";
import { ehDuplicata, ehTituloPagamento, ehTituloTerceiro } from "../lib/pagamentos";

import { somarMesesVencimento } from "../lib/datasPagamento";
import { formatCurrency, todayLocalIso } from "../lib/utils";
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

const novoTitulo = (tipo: string, nome = "", documento = ""): TituloRecebimento => ({
  tipo: tipo as TituloRecebimento["tipo"],
  nomeTitular: nome,
  documentoTitular: documento,
  valor: 0,
  valorManual: true,
  vencimento: "",
  numeroDocumento: "",
});

export function TitulosPagamentoEditor({ formaPagamento, clienteId, clienteNome, clienteDocumento, titulos, onChange, referenciaPagamento, limiteLinhas = 12, editarStatus = false }: Props) {
  const habilitado = ehTituloPagamento(formaPagamento);
  const terceiro = ehTituloTerceiro(formaPagamento);
  const boleto = ehDuplicata(formaPagamento);
  // Consultas de várias células podem terminar antes do próximo render.
  // Acumule as alterações para uma resposta não apagar o nome de outra linha.
  const titulosAtuais = useRef(titulos);
  titulosAtuais.current = titulos;
  const publicarTitulos = (itens: TituloRecebimento[]) => {
    titulosAtuais.current = itens;
    onChange(itens);
  };
  const gradeRef = useRef<HTMLDivElement>(null);
  const focarNovaLinha = useRef(false);
  useEffect(() => {
    if (focarNovaLinha.current) {
      gradeRef.current?.querySelector<HTMLInputElement>("tbody tr:last-child input")?.focus();
      focarNovaLinha.current = false;
    }
  }, [titulos.length]);

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
          terceiro ? ultimo.nomeTitular : clienteNome,
          terceiro ? ultimo.documentoTitular : (clienteDocumento || ultimo.documentoTitular)
        )]);
      })
      .catch(() => {
        if (ativo) onChange([novoTitulo(formaPagamento, terceiro ? "" : clienteNome, terceiro ? "" : (clienteDocumento || ""))]);
      });
    return () => { ativo = false; };
  }, [habilitado, formaPagamento, clienteId, clienteNome, clienteDocumento, terceiro, titulos.length]);

  const total = useMemo(() => titulos.reduce((soma, titulo) => soma + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0), [titulos]);
  if (!habilitado) return null;

  const atualizar = (indice: number, alteracao: Partial<TituloRecebimento>) => {
    if (alteracao.vencimento && alteracao.vencimento > todayLocalIso() && alteracao.vencimento !== titulosAtuais.current[indice]?.vencimento) {
      alteracao = {...alteracao, status: "aguardando", dataCompensacao: undefined};
    }
    publicarTitulos(titulosAtuais.current.map((titulo, atual) => atual === indice ? { ...titulo, ...alteracao, valorManual: alteracao.valor !== undefined ? true : titulo.valorManual, tipo: formaPagamento as TituloRecebimento["tipo"] } : titulo));
  };
  const adicionar = () => {
    if (titulos.length >= limiteLinhas) return;
    const anterior = [...titulos].reverse().find((titulo) => titulo.status !== "recusado");
    const dataAnterior = [...titulos].reverse().find(t => t.vencimento)?.vencimento || '';
    const novo = novoTitulo(formaPagamento, anterior?.nomeTitular || (terceiro ? "" : clienteNome), anterior?.documentoTitular || (terceiro ? "" : (clienteDocumento || "")));
    novo.vencimento = somarMesesVencimento(dataAnterior);
    focarNovaLinha.current = true;
    publicarTitulos([...titulosAtuais.current, novo]);
  };

  const atingiuLimite = titulos.length >= limiteLinhas;
  const possuiLegadoAcimaDoLimite = titulos.length > limiteLinhas;

  const campo = "titulo-pagamento-input h-9 w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-xs text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-sky-600 disabled:text-red-700";
  const cabecalhos = ["#", "Nome", "CPF/CNPJ", "Valor (R$)", "Vencimento", boleto ? "Nº boleto" : "Nº cheque", "Obs.", ...(editarStatus ? ["Situação", "Compensação"] : []), ""];

  return <section className="titulos-planilha min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-sky-50 px-3 py-2">
      <div><h3 className="text-sm font-bold text-sky-950">{boleto ? "Boletos" : "Cheques"}{referenciaPagamento && <span className="ml-2 text-xs font-normal text-slate-600">· {referenciaPagamento}</span>}</h3><p className="mt-1 text-xs text-slate-600">Um documento por linha. Use Tab para avançar entre as células.</p></div>
      <button type="button" onClick={adicionar} disabled={atingiuLimite} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-sky-800 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"><Plus size={14}/>Adicionar linha</button>
    </div>
    {possuiLegadoAcimaDoLimite && <p className="bg-amber-50 px-3 py-2 text-xs text-amber-900">Este pagamento antigo possui {titulos.length} títulos. Eles podem ser editados, mas não é possível adicionar novas linhas.</p>}
    <div ref={gradeRef} className="max-h-[50vh] overflow-auto" role="region" aria-label={`Planilha de ${boleto ? "boletos" : "cheques"}`} tabIndex={0}>
      <table className={`w-full border-collapse text-left text-xs ${editarStatus ? "min-w-[1080px]" : "min-w-[860px]"}`}>
        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700"><tr>{cabecalhos.map((nome, i) => <th key={i} scope="col" className="border-b border-r border-slate-300 px-2 py-2 font-bold whitespace-nowrap">{nome || <span className="sr-only">Excluir</span>}</th>)}</tr></thead>
        <tbody>{titulos.map((titulo, indice) => {
          const recusado = titulo.status === "recusado";
          const rotulo = (nome: string) => `${nome}, linha ${indice + 1}`;
          return <tr key={titulo.id || `${formaPagamento}-${indice}`} className={`border-b border-slate-200 ${recusado ? "bg-red-50" : "even:bg-slate-50 focus-within:bg-sky-50"}`}>
            <th scope="row" className="w-9 border-r border-slate-200 bg-slate-100 px-2 text-center font-normal text-slate-500">{indice + 1}</th>
            <td className="min-w-32 border-r border-slate-200"><input aria-label={rotulo("Nome")} required disabled={recusado} value={titulo.nomeTitular} onChange={e => atualizar(indice, { nomeTitular: e.target.value.slice(0, 160) })} className={campo}/></td>
            <td className="w-36 border-r border-slate-200"><ClienteDocumentoLookupInput label={rotulo("CPF/CNPJ")} hideLabel required disabled={recusado} value={titulo.documentoTitular} onChange={documentoTitular => atualizar(indice, { documentoTitular })} onClienteEncontrado={nomeTitular => atualizar(indice, { nomeTitular })} labelClassName="block" inputClassName={campo}/></td>
            <td className="w-24 border-r border-slate-200"><input aria-label={rotulo("Valor")} required disabled={recusado} type="number" min="0.01" step="0.01" value={titulo.valor || ""} onChange={e => atualizar(indice, { valor: Number(e.target.value) })} className={`${campo} text-right font-mono font-bold`}/>{titulo.valorOriginal !== undefined && Math.abs(titulo.valorOriginal - titulo.valor) > 0.005 && <span className="block px-2 pb-1 text-[10px] text-slate-500">Original: {formatCurrency(titulo.valorOriginal)}</span>}</td>
            <td className="w-32 border-r border-slate-200"><input aria-label={rotulo("Vencimento")} required disabled={recusado} type="date" value={titulo.vencimento} onChange={e => atualizar(indice, { vencimento: e.target.value })} className={campo}/></td>
            <td className="w-24 border-r border-slate-200"><input aria-label={rotulo(boleto ? "Número do boleto" : "Número do cheque")} required disabled={recusado} value={titulo.numeroDocumento} onChange={e => atualizar(indice, { numeroDocumento: e.target.value.slice(0, 80) })} className={campo}/></td>
            <td className="min-w-40 border-r border-slate-200"><input aria-label={rotulo("Observação")} disabled={recusado} value={titulo.observacao || ""} onChange={e => atualizar(indice, { observacao: e.target.value.slice(0, 300) })} placeholder="Opcional" className={campo}/></td>
            {editarStatus && <><td className="w-36 border-r border-slate-200"><select aria-label={rotulo("Situação")} value={titulo.status || "aguardando"} onChange={e => atualizar(indice, { status: e.target.value as TituloRecebimento["status"], dataCompensacao: e.target.value === "compensado" ? titulo.dataCompensacao : undefined })} className={campo}><option value="aguardando">Aguardando</option><option value="compensado">Confirmado</option><option value="recusado">Recusado</option></select></td><td className="min-w-32 border-r border-slate-200">{titulo.status === "compensado" && <input aria-label={rotulo("Compensação")} type="date" value={titulo.dataCompensacao || ""} onChange={e => atualizar(indice, { dataCompensacao: e.target.value })} className={campo}/>}</td></>}
            <td className="w-10 text-center"><button type="button" disabled={titulos.length === 1 || recusado} onClick={() => publicarTitulos(titulosAtuais.current.filter((_, atual) => atual !== indice))} aria-label={`Excluir linha ${indice + 1}`} className="inline-flex h-8 w-8 items-center justify-center rounded text-red-700 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-sky-600 disabled:invisible"><Trash2 size={14}/></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">{titulos.length} de {limiteLinhas} linhas{atingiuLimite ? " · Limite atingido" : ""}</span><span className="font-bold text-slate-900">Total: <span className="ml-2 font-mono text-sm">{formatCurrency(total)}</span></span></footer>
  </section>;
}
