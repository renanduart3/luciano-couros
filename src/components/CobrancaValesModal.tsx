import React, { useMemo, useState } from "react";
import { Camera, CheckCircle2, MinusCircle, Printer, WalletCards, X } from "lucide-react";
import { Venda } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";

interface Props {
  clienteNome: string;
  vales: Venda[];
  valesDoCliente: Venda[];
  onClose: () => void;
}

interface DevolucaoSelecionavel {
  chave: string;
  valeNumero: number;
  data: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  totalCredito: number;
}

const hojeIso = () => new Date().toISOString().slice(0, 10);
const creditoDevolvido = (vale: Venda) => (vale.devolucoes || []).reduce((total, devolucao) => total + Number(devolucao.abatimentoVale), 0);

export function CobrancaValesModal({ clienteNome, vales, valesDoCliente, onClose }: Props) {
  const [devolucoesSelecionadas, setDevolucoesSelecionadas] = useState<Set<string>>(new Set());
  const devolucoes = useMemo<DevolucaoSelecionavel[]>(() => valesDoCliente.flatMap((vale) =>
    (vale.devolucoes || []).flatMap((devolucao) => (devolucao.items || []).map((item) => ({
      chave: `${devolucao.id}:${item.id}`,
      valeNumero: vale.numeroSequencial,
      data: devolucao.data,
      descricao: item.descricao || "Item devolvido",
      quantidade: Number(item.quantidade),
      unidade: item.unidade || "UN",
      totalCredito: Number(item.totalCredito),
    })))
  ).sort((a, b) => b.data.localeCompare(a.data)), [valesDoCliente]);

  // A devolução já reduz o saldo persistido. Para o demonstrativo seletivo,
  // recompomos a base e abatemos somente os itens que o usuário marcar.
  const totalVales = vales.reduce((total, vale) => total + Number(vale.saldoRestante) + creditoDevolvido(vale), 0);
  const totalDevolucoes = devolucoes.reduce((total, item) => total + (devolucoesSelecionadas.has(item.chave) ? item.totalCredito : 0), 0);
  const totalGeral = Math.max(0, totalVales - totalDevolucoes);

  const alternarDevolucao = (chave: string) => setDevolucoesSelecionadas((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave);
    return proximo;
  });

  return <div id="print-cobranca-vales" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-cobranca-vales" className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="print:hidden flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div><h2 id="titulo-cobranca-vales" className="font-black uppercase text-slate-950">Demonstrativo para cobrança</h2><p className="text-xs font-bold text-slate-500">Selecione devoluções, confira e faça o screenshot para enviar ao cliente.</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar cobrança" className="rounded-lg p-2 text-slate-600 hover:bg-white"><X size={20}/></button>
      </div>

      <div className="overflow-y-auto bg-slate-200 p-2 sm:p-3 print:overflow-visible print:bg-white print:p-0">
        {devolucoes.length > 0 && <div className="print:hidden mx-auto mb-2 max-w-[760px] rounded-lg border border-violet-300 bg-violet-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-violet-900"><MinusCircle size={16}/> Selecione os itens devolvidos que devem abater esta cobrança</div>
          <div className="grid gap-1.5 sm:grid-cols-2">{devolucoes.map((item) => {
            const marcada = devolucoesSelecionadas.has(item.chave);
            return <label key={item.chave} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${marcada ? "border-violet-500 bg-white" : "border-violet-200 bg-violet-50"}`}>
              <input type="checkbox" checked={marcada} onChange={() => alternarDevolucao(item.chave)} className="mt-0.5 h-4 w-4 accent-violet-700"/>
              <span className="min-w-0 flex-1"><strong className="block uppercase">{item.descricao}</strong><span className="font-bold text-slate-600">VALE #{item.valeNumero} • {formatDate(item.data)} • {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade}</span></span>
              <strong className="font-mono text-violet-900">− {formatCurrency(item.totalCredito)}</strong>
            </label>;
          })}</div>
        </div>}
        <section className="mx-auto max-w-[760px] overflow-hidden rounded-lg border-2 border-slate-900 bg-white text-slate-950 shadow-sm print:shadow-none">
          <header className="flex items-start justify-between gap-4 bg-slate-900 px-4 py-3 text-white">
            <div><div className="flex items-center gap-2"><WalletCards size={20}/><strong className="text-base font-black uppercase">Vales em aberto</strong></div><p className="mt-1 text-xs font-bold text-slate-300">DEMONSTRATIVO DE COBRANÇA</p></div>
            <div className="text-right text-xs font-black"><span className="block text-slate-300">DATA ATUAL</span>{formatDate(hojeIso())}</div>
          </header>
          <div className="border-b-2 border-slate-900 bg-amber-50 px-4 py-3"><span className="text-[11px] font-black uppercase text-amber-800">Cliente</span><h3 className="text-lg font-black uppercase text-slate-950">{clienteNome}</h3></div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[540px] text-sm">
              <thead className="bg-slate-100 text-[11px] font-black uppercase"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Emissão</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Total do vale</th><th className="p-2 text-right">Em aberto</th></tr></thead>
              <tbody className="divide-y divide-slate-200">{vales.map((vale) => <tr key={vale.id}><td className="p-2 font-mono font-black">#{vale.numeroSequencial}</td><td className="p-2 font-bold">{formatDate(vale.data)}</td><td className="p-2 font-black text-amber-800">{vale.vencimento ? formatDate(vale.vencimento) : "—"}</td><td className="p-2 text-right font-mono font-bold">{formatCurrency(Number(vale.totalLiquido) + creditoDevolvido(vale))}</td><td className="p-2 text-right font-mono font-black">{formatCurrency(Number(vale.saldoRestante) + creditoDevolvido(vale))}</td></tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-slate-900 bg-slate-100"><td colSpan={4} className="p-2 text-right text-xs font-black uppercase">Subtotal dos vales</td><td className="p-2 text-right font-mono text-base font-black">{formatCurrency(totalVales)}</td></tr></tfoot>
            </table>
          </div>
          <div className="divide-y divide-slate-300 sm:hidden">{vales.map((vale) => <div key={vale.id} className="grid grid-cols-2 gap-x-3 gap-y-1 p-3 text-xs">
            <div><span className="block text-[10px] font-black uppercase text-slate-500">Vale / emissão</span><strong className="font-mono text-sm">#{vale.numeroSequencial}</strong> • {formatDate(vale.data)}</div>
            <div className="text-right"><span className="block text-[10px] font-black uppercase text-slate-500">Vencimento</span><strong className="text-amber-800">{vale.vencimento ? formatDate(vale.vencimento) : "—"}</strong></div>
            <div><span className="block text-[10px] font-black uppercase text-slate-500">Total do vale</span><strong>{formatCurrency(Number(vale.totalLiquido) + creditoDevolvido(vale))}</strong></div>
            <div className="text-right"><span className="block text-[10px] font-black uppercase text-slate-500">Em aberto</span><strong className="font-mono text-sm">{formatCurrency(Number(vale.saldoRestante) + creditoDevolvido(vale))}</strong></div>
          </div>)}<div className="flex items-center justify-between border-t-2 border-slate-900 bg-slate-100 p-3 text-xs font-black uppercase"><span>Subtotal dos vales</span><strong className="font-mono text-base">{formatCurrency(totalVales)}</strong></div></div>

          {totalDevolucoes > 0 && <div className="border-t-2 border-violet-300 bg-violet-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-violet-900"><MinusCircle size={16}/> Itens devolvidos abatidos</div>
            <div className="grid gap-1.5 sm:grid-cols-2">{devolucoes.filter((item) => devolucoesSelecionadas.has(item.chave)).map((item) => <div key={item.chave} className="flex items-start gap-2 rounded-lg border border-violet-300 bg-white p-2 text-xs"><span className="min-w-0 flex-1"><strong className="block uppercase">{item.descricao}</strong><span className="font-bold text-slate-600">VALE #{item.valeNumero} • {formatDate(item.data)} • {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade}</span></span><strong className="font-mono text-violet-900">− {formatCurrency(item.totalCredito)}</strong></div>)}</div>
            {totalDevolucoes > 0 && <p className="mt-2 text-right text-sm font-black text-violet-900">ABATIMENTOS: − {formatCurrency(totalDevolucoes)}</p>}
          </div>}

          <footer className="flex items-center justify-between gap-3 border-t-2 border-slate-900 bg-emerald-100 px-4 py-4"><span className="flex items-center gap-2 text-sm font-black uppercase text-emerald-950"><CheckCircle2 size={20}/> Total geral</span><strong className="font-mono text-2xl font-black text-emerald-950">{formatCurrency(totalGeral)}</strong></footer>
        </section>
      </div>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
        <p className="flex items-center gap-2 text-xs font-bold text-slate-600"><Camera size={16}/> Pronto para screenshot no celular ou computador.</p>
        <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black uppercase">Fechar</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white"><Printer size={16}/> Imprimir / PDF</button></div>
      </div>
    </div>
  </div>;
}
