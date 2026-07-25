import React, { useEffect, useState } from "react";
import { CalendarClock, FileText, List, Pencil, Printer, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { Produto, Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { api } from "../lib/api";
import { ParcelaValeRascunho, ParcelasValeEditor } from "./ParcelasValeEditor";

interface ValeDetalhesModalProps {
  vale: Venda;
  onClose: () => void;
  onUpdated?: (vale: Venda | null) => void;
}

export function ValeDetalhesModal({ vale, onClose, onUpdated }: ValeDetalhesModalProps) {
  const [aba, setAba] = useState<"itens" | "comprovante">("itens");
  const [modo, setModo] = useState<"editar" | "venda" | "devolver" | "cancelar" | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaValeRascunho[]>([]);
  const [observacoes, setObservacoes] = useState(vale.observacoes || "");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [dataDevolucao, setDataDevolucao] = useState(new Date().toISOString().slice(0, 10));
  const [quantidadesDevolucao, setQuantidadesDevolucao] = useState<Record<string, string>>({});
  const [resultadoDevolucao, setResultadoDevolucao] = useState("");
  const [dataVenda, setDataVenda] = useState(vale.data);
  const [descontoVenda, setDescontoVenda] = useState(String(vale.desconto || ""));
  const [itensVendaEdicao, setItensVendaEdicao] = useState<Array<{ id: string; produtoId: string; descricao: string; unidade: string; quantidade: string; precoUnitario: string; desconto: string; quantidadeDevolvida: number }>>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const itens = vale.items || [];

  useEffect(() => {
    setParcelas((vale.parcelas || []).map((parcela) => ({
      vencimento: parcela.vencimento,
      valor: Number(parcela.valor).toFixed(2).replace(".", ",")
    })));
    setObservacoes(vale.observacoes || "");
    setDataVenda(vale.data);
    setDescontoVenda(vale.desconto ? String(vale.desconto).replace(".", ",") : "");
    setItensVendaEdicao((vale.items || []).map((item) => ({
      id: item.id,
      produtoId: item.produtoId,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: String(item.quantidade).replace(".", ","),
      precoUnitario: String(item.precoUnitario).replace(".", ","),
      desconto: item.desconto ? String(item.desconto).replace(".", ",") : "",
      quantidadeDevolvida: Number(item.quantidadeDevolvida || 0)
    })));
  }, [vale]);

  useEffect(() => {
    api.getProdutos().then(setProdutos).catch(() => setProdutos([]));
  }, []);

  const imprimir = () => {
    setAba("comprovante");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const salvarPlanejamento = async () => {
    if (!/^\d{4,8}$/.test(pin)) return setErro("Informe o PIN administrativo de 4 a 8 números.");
    setSalvando(true);
    setErro("");
    try {
      const atualizado = await api.updateVale(vale.id, {
        pin,
        observacoes,
        parcelas: parcelas.map((parcela) => ({
          vencimento: parcela.vencimento,
          valor: Number(parcela.valor.replace(/\./g, "").replace(",", "."))
        }))
      });
      setModo(null);
      setPin("");
      onUpdated?.(atualizado);
    } catch (error: any) {
      setPin("");
      setErro(error.message || "Não foi possível alterar o vale.");
    } finally {
      setSalvando(false);
    }
  };

  const cancelarVale = async () => {
    if (!/^\d{4,8}$/.test(pin)) return setErro("Informe o PIN administrativo de 4 a 8 números.");
    setSalvando(true);
    setErro("");
    try {
      await api.cancelarVale(vale.id, pin, motivo);
      onUpdated?.(null);
    } catch (error: any) {
      setPin("");
      setErro(error.message || "Não foi possível cancelar o vale.");
    } finally {
      setSalvando(false);
    }
  };

  const devolverItens = async () => {
    if (!/^\d{4,8}$/.test(pin)) return setErro("Informe o PIN administrativo de 4 a 8 números.");
    const selecionados = itens
      .map((item) => ({
        itemVendaId: item.id,
        quantidade: Number(String(quantidadesDevolucao[item.id] || "").replace(",", "."))
      }))
      .filter((item) => Number.isFinite(item.quantidade) && item.quantidade > 0);
    if (selecionados.length === 0) return setErro("Informe a quantidade de ao menos um item.");

    setSalvando(true);
    setErro("");
    try {
      const resultado = await api.createDevolucaoVenda(vale.id, {
        data: dataDevolucao,
        observacoes: motivo,
        pin,
        items: selecionados
      });
      setModo(null);
      setPin("");
      setMotivo("");
      setQuantidadesDevolucao({});
      setResultadoDevolucao(
        `${formatCurrency(resultado.abatimentoVale)} abatido do vale` +
        (resultado.bonusGerado > 0 ? ` e ${formatCurrency(resultado.bonusGerado)} creditado como bônus.` : ".")
      );
      onUpdated?.(resultado.venda);
    } catch (error: any) {
      setPin("");
      setErro(error.message || "Não foi possível registrar a devolução.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarVenda = async () => {
    if (!/^\d{4,8}$/.test(pin)) return setErro("Informe o PIN administrativo de 4 a 8 números.");
    if (itensVendaEdicao.length === 0) return setErro("A venda precisa manter ao menos um item.");
    const numero = (valor: string) => Number(valor.replace(/\./g, "").replace(",", ".") || 0);
    setSalvando(true);
    setErro("");
    try {
      const atualizada = await api.updateVendaVale(vale.id, {
        pin,
        data: dataVenda,
        desconto: numero(descontoVenda),
        observacoes,
        items: itensVendaEdicao.map((item) => ({
          id: item.id,
          produtoId: item.produtoId,
          quantidade: numero(item.quantidade),
          precoUnitario: numero(item.precoUnitario),
          desconto: numero(item.desconto)
        }))
      });
      setModo(null);
      setPin("");
      setResultadoDevolucao("Venda e vale atualizados. O comprovante já pode ser reimpresso.");
      onUpdated?.(atualizada);
    } catch (error: any) {
      setPin("");
      setErro(error.message || "Não foi possível alterar a venda.");
    } finally {
      setSalvando(false);
    }
  };

  const adicionarProdutoVenda = () => {
    const produto = produtos.find((item) => item.id === produtoParaAdicionar);
    if (!produto || itensVendaEdicao.some((item) => item.produtoId === produto.id)) return;
    setItensVendaEdicao((atuais) => [...atuais, {
      id: `novo_${produto.id}`,
      produtoId: produto.id,
      descricao: produto.nome,
      unidade: produto.unidade,
      quantidade: "",
      precoUnitario: String(produto.precoVendaPadrao || "").replace(".", ","),
      desconto: "",
      quantidadeDevolvida: 0
    }]);
    setProdutoParaAdicionar("");
  };

  return (
    <div id="print-vale-detail-overlay" className="fixed inset-0 z-[80] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-100 p-2 text-amber-800"><FileText size={20} /></span>
            <div>
              <h2 className="font-black uppercase text-slate-950">Vale #{vale.numeroSequencial}</h2>
              <p className="text-xs font-bold text-slate-500">{vale.clienteNome || "Cliente não informado"} • {formatDate(vale.data)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAba("itens")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "itens" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><List size={16} /> Detalhes</button>
            <button type="button" onClick={() => setAba("comprovante")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "comprovante" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><FileText size={16} /> Comprovante</button>
            {onUpdated && vale.status !== "cancelada" && <button type="button" onClick={() => { setModo("venda"); setErro(""); setPin(""); setResultadoDevolucao(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-3 text-xs font-black uppercase text-cyan-900 sm:flex-none"><Pencil size={15} /> Venda</button>}
            {onUpdated && vale.status !== "cancelada" && itens.some((item) => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005) && <button type="button" onClick={() => { setModo("devolver"); setErro(""); setPin(""); setResultadoDevolucao(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 text-xs font-black uppercase text-violet-800 sm:flex-none"><RotateCcw size={15} /> Devolver</button>}
            {onUpdated && vale.status !== "cancelada" && <button type="button" onClick={() => { setModo("cancelar"); setErro(""); setPin(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-black uppercase text-red-800 sm:flex-none"><Trash2 size={15} /> Cancelar</button>}
            <button type="button" onClick={imprimir} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-black uppercase text-white sm:flex-none"><Printer size={16} /> Imprimir</button>
            <button type="button" aria-label="Fechar detalhes do vale" onClick={onClose} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-slate-600"><X size={18} /></button>
          </div>
        </header>

        {aba === "itens" ? (
          <div className="space-y-4 p-3 sm:p-5 print:hidden">
            {resultadoDevolucao && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><span>{resultadoDevolucao}</span><button type="button" onClick={imprimir} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 font-black uppercase text-white"><Printer size={14} /> Imprimir vale atualizado</button></div>}

            {modo === "venda" && <div className="space-y-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-cyan-950">Alterar venda vinculada</h3><p className="text-xs font-semibold text-cyan-800">Quantidade, preço, desconto, data e observações serão atualizados somente após validar o PIN. Itens já devolvidos continuam no histórico.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-cyan-900"><X size={17} /></button></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={produtoParaAdicionar} onChange={(event) => setProdutoParaAdicionar(event.target.value)} className="min-h-11 flex-1 rounded-xl border border-cyan-200 bg-white px-3 text-sm font-bold">
                  <option value="">Adicionar outro produto...</option>
                  {produtos.filter((produto) => !itensVendaEdicao.some((item) => item.produtoId === produto.id)).map((produto) => <option key={produto.id} value={produto.id}>{produto.nome} — {formatCurrency(produto.precoVendaPadrao)}</option>)}
                </select>
                <button type="button" disabled={!produtoParaAdicionar} onClick={adicionarProdutoVenda} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 text-xs font-black uppercase text-cyan-900 disabled:opacity-40">Adicionar item</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-cyan-200 bg-white">
                <table className="w-full min-w-[760px] text-xs">
                  <thead><tr className="border-b border-cyan-100 bg-cyan-50 font-black uppercase text-cyan-900"><th className="p-3 text-left">Material</th><th className="p-3 text-right">Quantidade</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Desc. item</th><th className="w-12 p-3"></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{itensVendaEdicao.map((item, index) => <tr key={item.id}>
                    <td className="p-3"><strong className="text-slate-950">{item.descricao}</strong>{item.quantidadeDevolvida > 0 && <span className="block text-[9px] font-bold text-violet-700">{formatDecimal(item.quantidadeDevolvida)} {item.unidade} já devolvido(s)</span>}</td>
                    <td className="p-2"><input type="text" inputMode="decimal" value={item.quantidade} onChange={(event) => setItensVendaEdicao((atuais) => atuais.map((atual, posicao) => posicao === index ? { ...atual, quantidade: event.target.value } : atual))} className="min-h-10 w-full rounded-lg border border-cyan-200 px-2 text-right font-mono font-black" /></td>
                    <td className="p-2"><input type="text" inputMode="decimal" value={item.precoUnitario} onChange={(event) => setItensVendaEdicao((atuais) => atuais.map((atual, posicao) => posicao === index ? { ...atual, precoUnitario: event.target.value } : atual))} className="min-h-10 w-full rounded-lg border border-cyan-200 px-2 text-right font-mono font-black" /></td>
                    <td className="p-2"><input type="text" inputMode="decimal" value={item.desconto} placeholder="0" onChange={(event) => setItensVendaEdicao((atuais) => atuais.map((atual, posicao) => posicao === index ? { ...atual, desconto: event.target.value } : atual))} className="min-h-10 w-full rounded-lg border border-cyan-200 px-2 text-right font-mono font-black" /></td>
                    <td className="p-2 text-center"><button type="button" disabled={item.quantidadeDevolvida > 0} title={item.quantidadeDevolvida > 0 ? "Item com devolução deve permanecer no histórico" : "Remover item da venda"} onClick={() => setItensVendaEdicao((atuais) => atuais.filter((_, posicao) => posicao !== index))} className="rounded-lg p-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={16} /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="grid gap-2 sm:grid-cols-3"><label className="text-[10px] font-black uppercase text-cyan-900">Data da venda<input type="date" value={dataVenda} onChange={(event) => setDataVenda(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-cyan-200 bg-white px-3 text-sm font-bold" /></label><label className="text-[10px] font-black uppercase text-cyan-900">Desconto geral<input type="text" inputMode="decimal" value={descontoVenda} onChange={(event) => setDescontoVenda(event.target.value)} placeholder="0" className="mt-1 min-h-11 w-full rounded-xl border border-cyan-200 bg-white px-3 text-right font-mono font-black" /></label><label className="text-[10px] font-black uppercase text-cyan-900">Observações<input value={observacoes} onChange={(event) => setObservacoes(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-cyan-200 bg-white px-3 text-sm font-bold normal-case" /></label></div>
              <div className="flex flex-col gap-2 sm:flex-row"><input type="password" inputMode="numeric" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 8)); setErro(""); }} placeholder="PIN administrativo" className="min-h-11 flex-1 rounded-xl border border-cyan-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={salvarVenda} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-900 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Validar e salvar venda</button></div>
              {erro && <p className="rounded-lg border border-red-200 bg-white p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

            {modo === "devolver" && <div className="space-y-3 rounded-2xl border border-violet-300 bg-violet-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-violet-950">Devolver itens do vale #{vale.numeroSequencial}</h3><p className="text-xs font-semibold text-violet-800">O valor abate primeiro o saldo do vale. Qualquer excedente pago entra como bônus na carteira do cliente.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-violet-800"><X size={17} /></button></div>
              <div className="overflow-hidden rounded-xl border border-violet-200 bg-white">
                <div className="divide-y divide-slate-100">
                  {itens.filter((item) => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005).map((item) => {
                    const disponivel = Number(item.quantidadeDisponivel ?? item.quantidade);
                    return <label key={item.id} className="grid grid-cols-[1fr_120px] items-center gap-3 p-3 text-xs">
                      <span><strong className="block text-slate-950">{item.descricao}</strong><span className="font-bold text-slate-500">Disponível: {formatDecimal(disponivel)} {item.unidade}</span></span>
                      <input type="number" min="0" max={disponivel} step="0.01" value={quantidadesDevolucao[item.id] || ""} onChange={(event) => { setQuantidadesDevolucao((atuais) => ({ ...atuais, [item.id]: event.target.value })); setErro(""); }} placeholder="0" className="min-h-10 rounded-lg border border-violet-200 px-3 text-right font-mono font-black" />
                    </label>;
                  })}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-black uppercase text-violet-900">Data da devolução<input type="date" value={dataDevolucao} onChange={(event) => setDataDevolucao(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" /></label><label className="text-[10px] font-black uppercase text-violet-900">Observação<input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo ou detalhes (opcional)" className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case" /></label></div>
              <div className="flex flex-col gap-2 sm:flex-row"><input type="password" inputMode="numeric" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 8)); setErro(""); }} placeholder="PIN administrativo" className="min-h-11 flex-1 rounded-xl border border-violet-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={devolverItens} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Validar devolução</button></div>
              {erro && <p className="rounded-lg border border-red-200 bg-white p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

            {modo === "cancelar" && <div className="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-red-950">Cancelar vale #{vale.numeroSequencial}</h3><p className="text-xs font-semibold text-red-800">Ele sairá da contabilidade ativa, mas continuará disponível no histórico.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-red-800"><X size={17} /></button></div>
              <input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo do cancelamento (opcional)" className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm font-bold" />
              <div className="flex flex-col gap-2 sm:flex-row"><input type="password" inputMode="numeric" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 8)); setErro(""); }} placeholder="PIN administrativo" className="min-h-11 flex-1 rounded-xl border border-red-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={cancelarVale} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Confirmar cancelamento</button></div>
              {erro && <p className="rounded-lg border border-red-200 bg-white p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              <Resumo titulo="Valor original" valor={formatCurrency(vale.totalLiquido)} />
              <Resumo titulo="Valor pago" valor={formatCurrency(vale.valorPago)} destaque="text-blue-800" />
              <Resumo titulo="Saldo atual" valor={formatCurrency(vale.saldoRestante)} destaque="text-amber-800" />
              <Resumo titulo="Itens" valor={String(itens.length)} />
              <Resumo titulo="Vencimento" valor={vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"} icone />
            </div>

            {(vale.parcelas || []).length > 0 && <div className={`overflow-hidden rounded-xl border ${modo === "editar" ? "border-blue-300 bg-blue-50" : "border-amber-300 bg-white"}`}>
              <div className={`flex items-center justify-between gap-3 border-b px-3 py-2 ${modo === "editar" ? "border-blue-200 bg-blue-100" : "border-amber-200 bg-amber-50"}`}>
                <h3 className={`text-xs font-black uppercase ${modo === "editar" ? "text-blue-950" : "text-amber-900"}`}>Períodos de pagamento</h3>
                {onUpdated && vale.status !== "cancelada" && (modo === "editar"
                  ? <button type="button" onClick={() => { setModo(null); setErro(""); setPin(""); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-blue-900"><X size={13} /> Cancelar edição</button>
                  : <button type="button" onClick={() => { setModo("editar"); setErro(""); setPin(""); }} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-amber-900"><Pencil size={13} /> Alterar parcelas</button>)}
              </div>
              {modo === "editar" ? <div className="space-y-3 p-3">
                <ParcelasValeEditor total={Number(vale.totalLiquido)} parcelas={parcelas} onChange={setParcelas} compacto />
                <label className="block text-[10px] font-black uppercase text-blue-900">Observações<textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold normal-case" /></label>
                <div className="flex flex-col gap-2 sm:flex-row"><input type="password" inputMode="numeric" value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 8)); setErro(""); }} placeholder="PIN administrativo" className="min-h-11 flex-1 rounded-xl border border-blue-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={salvarPlanejamento} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Validar e salvar parcelas</button></div>
                {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-800">{erro}</p>}
              </div> : <div className="divide-y divide-slate-100">{vale.parcelas!.map((parcela) => <div key={parcela.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 p-3 text-xs"><strong className="text-amber-900">{parcela.numero}ª</strong><div><p className="font-black text-slate-900">{formatDate(parcela.vencimento)}</p><p className="text-[10px] font-bold text-slate-500">{parcela.status === "paga" ? "Quitada" : parcela.status === "cancelada" ? "Cancelada" : "Em aberto"}</p></div><div className="text-right"><strong className="font-mono text-sm text-slate-950">{formatCurrency(parcela.valor)}</strong><p className="text-[10px] font-bold text-slate-500">Saldo {formatCurrency(parcela.saldo)}</p></div></div>)}</div>}
            </div>}

            <div className="hidden overflow-x-auto rounded-xl border border-slate-300 bg-white md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-100 text-xs font-black uppercase text-slate-600">
                  <tr><th className="p-3 text-left">Ref.</th><th className="p-3 text-left">Material</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-left">Un.</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {itens.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/50">
                      <td className="p-3 font-mono text-xs font-bold text-slate-500">{item.referencia || "—"}</td>
                      <td className="p-3 font-black text-slate-950">{item.descricao}</td>
                      <td className="p-3 text-right font-mono font-black">{formatDecimal(item.quantidadeDisponivel ?? item.quantidade)}{Number(item.quantidadeDevolvida || 0) > 0 && <span className="block text-[9px] text-violet-700">devolvido: {formatDecimal(item.quantidadeDevolvida!)}</span>}</td>
                      <td className="p-3 font-bold text-slate-600">{item.unidade}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(item.precoUnitario)}</td>
                      <td className="p-3 text-right font-mono font-black">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white md:hidden">
              {itens.map((item) => (
                <article key={item.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-950">{item.descricao}</strong><strong className="shrink-0 font-mono text-sm">{formatCurrency(item.total)}</strong></div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500"><span>{item.referencia || "Sem referência"}</span><span>{formatDecimal(item.quantidade)} {item.unidade} × {formatCurrency(item.precoUnitario)}</span></div>
                </article>
              ))}
            </div>

            {itens.length === 0 && <p className="rounded-xl border border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">Nenhum item encontrado para esta venda.</p>}
            {vale.observacoes && <div className="rounded-xl border border-slate-300 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Observações</span><p className="mt-1 text-sm font-bold text-slate-800">{vale.observacoes}</p></div>}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto p-2 sm:p-4 print:overflow-visible print:p-0">
            <VendaComprovante venda={vale} />
          </div>
        )}
      </div>
    </div>
  );
}

function Resumo({ titulo, valor, destaque = "text-slate-950", icone = false }: { titulo: string; valor: string; destaque?: string; icone?: boolean }) {
  return <div className="rounded-xl border border-slate-300 bg-white p-3"><span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">{icone && <CalendarClock size={13} />}{titulo}</span><strong className={`mt-1 block text-base ${destaque}`}>{valor}</strong></div>;
}
