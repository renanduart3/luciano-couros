import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Camera, CheckCircle2, Loader2, MinusCircle, Printer, Save, WalletCards, X } from "lucide-react";
import { OrdemCobranca, Venda } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";
import { api } from "../lib/api";

interface Props {
  clienteId: string;
  clienteNome: string;
  vales: Venda[];
  valesDoCliente: Venda[];
  onClose: () => void;
  onSaved?: (ordem: OrdemCobranca) => void;
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
const adicionarMeses = (data: string, meses: number) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  const ultimoDia = new Date(ano, mes + meses, 0).getDate();
  return new Date(ano, mes - 1 + meses, Math.min(dia, ultimoDia), 12).toISOString().slice(0, 10);
};
const creditoDevolvido = (vale: Venda) => (vale.devolucoes || []).reduce((total, devolucao) => total + Number(devolucao.abatimentoVale), 0);

export function CobrancaValesModal({ clienteId, clienteNome, vales, valesDoCliente, onClose, onSaved }: Props) {
  const [configurando, setConfigurando] = useState(true);
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(1);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => adicionarMeses(hojeIso(), 1));
  const [parcelasPlanejadas, setParcelasPlanejadas] = useState<Array<{ vencimento: string; valor: number }>>([]);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ordem, setOrdem] = useState<OrdemCobranca | null>(null);
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
  const totalDocumentos = vales.reduce((total, vale) => total + Number(vale.totalLiquido) + creditoDevolvido(vale), 0);
  const totalDevolucoes = devolucoes.reduce((total, item) => total + item.totalCredito, 0);
  const totalGeral = Math.max(0, totalVales - totalDevolucoes);

  useEffect(() => {
    const quantidade = Math.max(1, Math.min(36, quantidadeParcelas || 1));
    const totalCentavos = Math.round(totalGeral * 100);
    const base = Math.floor(totalCentavos / quantidade);
    const resto = totalCentavos - base * quantidade;
    setParcelasPlanejadas(Array.from({ length: quantidade }, (_, index) => ({
      vencimento: adicionarMeses(primeiroVencimento, index),
      valor: (base + (index < resto ? 1 : 0)) / 100,
    })));
  }, [quantidadeParcelas, primeiroVencimento, totalGeral]);

  const atualizarParcela = (index: number, campo: "vencimento" | "valor", valor: string) => {
    setParcelasPlanejadas((atuais) => atuais.map((parcela, posicao) => posicao === index
      ? { ...parcela, [campo]: campo === "valor" ? Number(valor) : valor }
      : parcela));
  };

  const registrarOrdem = async () => {
    setError("");
    const soma = Math.round(parcelasPlanejadas.reduce((total, parcela) => total + Number(parcela.valor), 0) * 100) / 100;
    if (Math.abs(soma - totalGeral) > 0.01) {
      setError(`A soma das parcelas deve ser ${formatCurrency(totalGeral)}.`);
      return;
    }
    setSaving(true);
    try {
      const criada = await api.createOrdemCobranca({
        clienteId,
        dataEmissao: hojeIso(),
        vendaIds: vales.map((vale) => vale.id),
        observacao,
        parcelas: parcelasPlanejadas,
      });
      setOrdem(criada);
      setConfigurando(false);
      onSaved?.(criada);
    } catch (err: any) {
      setError(err.message || "Não foi possível registrar a ordem de cobrança.");
    } finally {
      setSaving(false);
    }
  };

  return <div id="print-cobranca-vales" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-cobranca-vales" className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="print:hidden flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div><h2 id="titulo-cobranca-vales" className="font-black uppercase text-slate-950">Demonstrativo para cobrança</h2></div>
        <button type="button" onClick={onClose} aria-label="Fechar cobrança" className="rounded-lg p-2 text-slate-600 hover:bg-white"><X size={20}/></button>
      </div>

      {configurando ? <div className="overflow-y-auto bg-slate-100 p-3 sm:p-5">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-emerald-700">1. Conferir negociação</p><h3 className="mt-1 text-lg font-black uppercase text-slate-950">{clienteNome}</h3><p className="text-sm font-bold text-slate-600">{vales.length} vale(s) selecionado(s)</p></div><strong className="font-mono text-2xl font-black text-emerald-800">{formatCurrency(totalGeral)}</strong></div>
            <div className="mt-3 flex flex-wrap gap-2">{vales.map((vale) => <span key={vale.id} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{Number(vale.valorPago) > 0.005 ? "RESTANTE DO " : ""}VALE #{vale.numeroSequencial} · {formatCurrency(vale.saldoRestante)}</span>)}</div>
          </div>

          {devolucoes.length > 0 && <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-violet-900"><MinusCircle size={16}/> Abatimentos que entrarão nesta cobrança</div>
            <div className="grid gap-2 sm:grid-cols-2">{devolucoes.map((item) => {
              return <div key={item.chave} className="flex items-start gap-2 rounded-lg border border-violet-300 bg-white p-2 text-xs"><CheckCircle2 className="mt-0.5 shrink-0 text-violet-700" size={15}/><span className="min-w-0 flex-1"><strong className="block uppercase">{item.descricao}</strong><span className="font-bold text-slate-600">VALE #{item.valeNumero} · {formatDate(item.data)} · já abatido</span></span><strong className="font-mono text-violet-900">− {formatCurrency(item.totalCredito)}</strong></div>;
            })}</div>
          </div>}

          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><CalendarDays className="text-emerald-700" size={20}/><p className="text-xs font-black uppercase text-emerald-700">2. Planejar próximos pagamentos</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black uppercase text-slate-600">Quantidade de parcelas<input type="number" min={1} max={36} value={quantidadeParcelas} onChange={(event) => setQuantidadeParcelas(Math.max(1, Math.min(36, Number(event.target.value) || 1)))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base font-black text-slate-950"/></label>
              <label className="text-xs font-black uppercase text-slate-600">Primeiro vencimento<input type="date" value={primeiroVencimento} onChange={(event) => setPrimeiroVencimento(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 font-bold text-slate-950"/></label>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-300"><table className="w-full text-sm"><thead className="bg-slate-900 text-[11px] font-black uppercase text-white"><tr><th className="p-2 text-left">Parcela</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Valor previsto</th></tr></thead><tbody className="divide-y divide-slate-200">{parcelasPlanejadas.map((parcela, index) => <tr key={index}><td className="p-2 font-black">{index + 1}/{parcelasPlanejadas.length}</td><td className="p-2"><input type="date" value={parcela.vencimento} onChange={(event) => atualizarParcela(index, "vencimento", event.target.value)} className="min-h-9 rounded-lg border border-slate-300 px-2 font-bold"/></td><td className="p-2 text-right"><input type="number" min="0.01" step="0.01" value={parcela.valor} onChange={(event) => atualizarParcela(index, "valor", event.target.value)} className="min-h-9 w-32 rounded-lg border border-slate-300 px-2 text-right font-mono font-black"/></td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-900 bg-slate-100"><td colSpan={2} className="p-2 text-right text-xs font-black uppercase">Total planejado</td><td className="p-2 text-right font-mono font-black">{formatCurrency(parcelasPlanejadas.reduce((total, parcela) => total + Number(parcela.valor), 0))}</td></tr></tfoot></table></div>
            <label className="mt-4 block text-xs font-black uppercase text-slate-600">Observação da negociação<textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows={2} placeholder="Ex.: acordo feito por telefone" className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm font-bold normal-case text-slate-950"/></label>
          </div>
          {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-black text-red-800">{error}</div>}
        </div>
      </div> : <div className="overflow-y-auto bg-slate-200 p-2 sm:p-3 print:overflow-visible print:bg-white print:p-0">
        {devolucoes.length > 0 && <div className="print:hidden mx-auto mb-2 max-w-[760px] rounded-lg border border-violet-300 bg-violet-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-violet-900"><MinusCircle size={16}/> Itens devolvidos já abatidos nesta cobrança</div>
          <div className="grid gap-1.5 sm:grid-cols-2">{devolucoes.map((item) => {
            return <div key={item.chave} className="flex items-start gap-2 rounded-lg border border-violet-300 bg-white p-2 text-xs">
              <CheckCircle2 className="mt-0.5 shrink-0 text-violet-700" size={15}/>
              <span className="min-w-0 flex-1"><strong className="block uppercase">{item.descricao}</strong><span className="font-bold text-slate-600">VALE #{item.valeNumero} • {formatDate(item.data)} • {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade}</span></span>
              <strong className="font-mono text-violet-900">− {formatCurrency(item.totalCredito)}</strong>
            </div>;
          })}</div>
        </div>}
        <section className="mx-auto max-w-[760px] overflow-hidden rounded-lg border-2 border-slate-900 bg-white text-slate-950 shadow-sm print:shadow-none">
          <header className="flex items-start justify-between gap-4 bg-slate-900 px-4 py-3 text-white">
            <div><div className="flex items-center gap-2"><WalletCards size={20}/><strong className="text-base font-black uppercase">Ordem de cobrança #{ordem?.numeroSequencial}</strong></div><p className="mt-1 text-xs font-bold text-slate-300">VALES EM ABERTO · NEGOCIAÇÃO REGISTRADA</p></div>
            <div className="text-right text-xs font-black"><span className="block text-slate-300">DATA DA ORDEM</span>{formatDate(ordem?.dataEmissao || hojeIso())}</div>
          </header>
          <div className="border-b-2 border-slate-900 bg-amber-50 px-4 py-3"><span className="text-[11px] font-black uppercase text-amber-800">Cliente</span><h3 className="text-lg font-black uppercase text-slate-950">{clienteNome}</h3></div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-slate-100 text-[11px] font-black uppercase"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Emissão</th><th className="p-2 text-right">Total do vale</th></tr></thead>
              <tbody className="divide-y divide-slate-200">{vales.map((vale) => <tr key={vale.id}><td className="p-2 font-mono font-black">#{vale.numeroSequencial}</td><td className="p-2 font-bold">{formatDate(vale.data)}</td><td className="p-2 text-right font-mono font-black">{formatCurrency(Number(vale.totalLiquido) + creditoDevolvido(vale))}</td></tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-slate-900 bg-slate-100"><td colSpan={2} className="p-2 text-right text-xs font-black uppercase">Total dos vales selecionados</td><td className="p-2 text-right font-mono text-base font-black">{formatCurrency(totalDocumentos)}</td></tr></tfoot>
            </table>
          </div>
          <div className="divide-y divide-slate-300 sm:hidden">{vales.map((vale) => <div key={vale.id} className="flex items-center justify-between gap-3 p-3 text-xs"><div><span className="block text-[10px] font-black uppercase text-slate-500">Vale / emissão</span><strong className="font-mono text-sm">#{vale.numeroSequencial}</strong> • {formatDate(vale.data)}</div><div className="text-right"><span className="block text-[10px] font-black uppercase text-slate-500">Total do vale</span><strong className="font-mono text-sm">{formatCurrency(Number(vale.totalLiquido) + creditoDevolvido(vale))}</strong></div></div>)}<div className="flex items-center justify-between border-t-2 border-slate-900 bg-slate-100 p-3 text-xs font-black uppercase"><span>Total dos vales selecionados</span><strong className="font-mono text-base">{formatCurrency(totalDocumentos)}</strong></div></div>

          {totalDevolucoes > 0 && <div className="border-t-2 border-violet-300 bg-violet-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-violet-900"><MinusCircle size={16}/> Itens devolvidos abatidos</div>
            <div className="grid gap-1.5 sm:grid-cols-2">{devolucoes.map((item) => <div key={item.chave} className="flex items-start gap-2 rounded-lg border border-violet-300 bg-white p-2 text-xs"><span className="min-w-0 flex-1"><strong className="block uppercase">{item.descricao}</strong><span className="font-bold text-slate-600">VALE #{item.valeNumero} • {formatDate(item.data)} • {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade}</span></span><strong className="font-mono text-violet-900">− {formatCurrency(item.totalCredito)}</strong></div>)}</div>
            {totalDevolucoes > 0 && <p className="mt-2 text-right text-sm font-black text-violet-900">ABATIMENTOS: − {formatCurrency(totalDevolucoes)}</p>}
          </div>}

          <div className="border-t-2 border-slate-900 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-800"><CalendarDays size={16}/> Próximos pagamentos combinados</div>
            <div className="overflow-hidden rounded-lg border border-slate-300"><table className="w-full text-xs"><thead className="bg-slate-100 font-black uppercase text-slate-600"><tr><th className="p-1.5 text-left">Parcela</th><th className="p-1.5 text-left">Vencimento</th><th className="p-1.5 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-200">{(ordem?.parcelas || parcelasPlanejadas).slice(0, 12).map((parcela, index) => <tr key={"id" in parcela ? parcela.id : index}><td className="p-1.5 font-black">{index + 1}/{ordem?.parcelas.length || parcelasPlanejadas.length}</td><td className="p-1.5 font-bold">{formatDate(parcela.vencimento)}</td><td className="p-1.5 text-right font-mono font-black">{formatCurrency(parcela.valor)}</td></tr>)}</tbody></table></div>
            {(ordem?.parcelas.length || parcelasPlanejadas.length) > 12 && <p className="mt-1 text-right text-[10px] font-bold text-slate-500">Demais parcelas permanecem registradas no sistema.</p>}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t-2 border-slate-900 bg-emerald-100 px-4 py-4"><span className="flex items-center gap-2 text-sm font-black uppercase text-emerald-950"><CheckCircle2 size={20}/> Total geral</span><strong className="font-mono text-2xl font-black text-emerald-950">{formatCurrency(totalGeral)}</strong></footer>
        </section>
      </div>}

      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
        {!configurando && <p className="flex items-center gap-2 text-xs font-bold text-slate-600"><Camera size={16}/> Ordem #{ordem?.numeroSequencial} registrada e pronta para envio.</p>}
        <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black uppercase">Fechar</button>{configurando ? <button type="button" onClick={() => void registrarOrdem()} disabled={saving || totalGeral <= 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}Registrar e gerar demonstrativo</button> : <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white"><Printer size={16}/> Imprimir / PDF</button>}</div>
      </div>
    </div>
  </div>;
}
