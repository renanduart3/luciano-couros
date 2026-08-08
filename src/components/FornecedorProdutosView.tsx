import React, { useEffect, useMemo, useState } from "react";
import { Link2, Package, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { Fornecedor, FornecedorProduto, Produto } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";
import { useConfirmacao } from "./ConfirmacaoDialog";
import { useEhGerente } from "../auth/AuthContext";

export function FornecedorProdutosView() {
  const confirmacao = useConfirmacao();
  const gerente = useEhGerente();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [catalogo, setCatalogo] = useState<FornecedorProduto[]>([]);
  const [produtoId, setProdutoId] = useState("");
  const [custoFornecedor, setCustoFornecedor] = useState("");
  const [precoVendaFornecedor, setPrecoVendaFornecedor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState<FornecedorProduto | null>(null);
  const [edicaoCusto, setEdicaoCusto] = useState("");
  const [edicaoPrecoVenda, setEdicaoPrecoVenda] = useState("");
  const [edicaoObservacao, setEdicaoObservacao] = useState("");
  const [edicaoPin, setEdicaoPin] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");

  useEffect(() => {
    Promise.all([api.getFornecedores(), api.getProdutos()])
      .then(([fornecedorLista, produtoLista]) => {
        setFornecedores(fornecedorLista.filter((item) => item.ativo === 1));
        setProdutos(produtoLista.filter((item) => item.ativo === 1));
      })
      .finally(() => setLoading(false));
  }, []);

  const carregarCatalogo = async (id: string) => {
    setFornecedorId(id);
    setProdutoId("");
    setCustoFornecedor("");
    setPrecoVendaFornecedor("");
    setObservacao("");
    setFeedback("");
    setEditando(null);
    setEdicaoPin("");
    setErroEdicao("");
    if (!id) return setCatalogo([]);
    setLoading(true);
    try {
      setCatalogo(await api.getFornecedorProdutos(id));
    } finally {
      setLoading(false);
    }
  };

  const produtosDisponiveis = useMemo(() => {
    const vinculados = new Set(catalogo.map((item) => item.produtoId));
    return produtos.filter((produto) => !vinculados.has(produto.id));
  }, [produtos, catalogo]);

  const vincularProduto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fornecedorId || !produtoId) return;
    const custo = Number(custoFornecedor.replace(",", "."));
    const precoVenda = Number(precoVendaFornecedor.replace(",", "."));
    if (!Number.isFinite(custo) || custo < 0 || !Number.isFinite(precoVenda) || precoVenda < 0) {
      setFeedback("Informe custo e preço-base de venda válidos.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await api.vincularFornecedorProduto(fornecedorId, {
        produtoId,
        custoFornecedor: custo,
        precoVendaFornecedor: precoVenda,
        observacao: observacao.trim() || undefined
      });
      setCatalogo(await api.getFornecedorProdutos(fornecedorId));
      setProdutoId("");
      setCustoFornecedor("");
      setPrecoVendaFornecedor("");
      setObservacao("");
      setFeedback("Produto vinculado com a configuração comercial do fornecedor.");
    } catch (error: any) {
      setFeedback(error.message || "Não foi possível vincular o produto.");
    } finally {
      setSaving(false);
    }
  };

  const desvincularProduto = async (item: FornecedorProduto) => {
    if (!await confirmacao.confirmar({
      titulo: "Remover produto do fornecedor",
      mensagem: `Remover ${item.produtoNome} da lista de produtos associados? O histórico de compras será preservado.`,
      textoConfirmar: "Remover associação"
    })) return;
    setSaving(true);
    setFeedback("");
    try {
      await api.desvincularFornecedorProduto(fornecedorId, item.produtoId);
      setCatalogo(await api.getFornecedorProdutos(fornecedorId));
      setFeedback("Produto removido da associação. Uma nova compra poderá vinculá-lo novamente automaticamente.");
    } catch (error: any) {
      setFeedback(error.message || "Não foi possível remover a associação.");
    } finally {
      setSaving(false);
    }
  };

  const iniciarEdicao = (item: FornecedorProduto) => {
    setEditando(item);
    setEdicaoCusto(String(Number(item.custoFornecedor ?? item.ultimoCustoCompra ?? 0)).replace(".", ","));
    setEdicaoPrecoVenda(String(Number(item.precoVendaFornecedor ?? item.precoVendaPadrao ?? 0)).replace(".", ","));
    setEdicaoObservacao(item.observacao || "");
    setEdicaoPin("");
    setErroEdicao("");
  };

  const salvarEdicao = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editando) return;
    const custo = parseBrazilianNumber(edicaoCusto);
    const precoVenda = parseBrazilianNumber(edicaoPrecoVenda);
    if (!Number.isFinite(custo) || custo < 0 || !Number.isFinite(precoVenda) || precoVenda < 0) {
      return setErroEdicao("Informe custo e preço-base válidos.");
    }
    if (edicaoPin.length < 4 || edicaoPin.length > 64) return setErroEdicao("Informe o PIN do administrador.");
    setSaving(true);
    setErroEdicao("");
    try {
      await api.atualizarFornecedorProduto(fornecedorId, editando.produtoId, {
        custoFornecedor: custo,
        precoVendaFornecedor: precoVenda,
        observacao: edicaoObservacao.trim() || undefined,
        pin: edicaoPin
      });
      setCatalogo(await api.getFornecedorProdutos(fornecedorId));
      setEditando(null);
      setEdicaoPin("");
      setFeedback("Valores do produto atualizados com autorização administrativa.");
    } catch (error: any) {
      setEdicaoPin("");
      setErroEdicao(error.message || "Não foi possível atualizar os valores do produto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && fornecedores.length === 0) return <div className="py-20 text-center font-bold text-slate-600">Carregando catálogo...</div>;

  return (
    <div className="space-y-6">
      {confirmacao.dialogo}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-black text-slate-950">Produtos por fornecedor</h2>
        <p className="mt-1 text-sm text-slate-600">O vínculo é opcional. Produtos cadastrados manualmente continuam disponíveis para venda mesmo sem fornecedor.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-xs font-extrabold text-slate-700">Fornecedor</label>
        <select value={fornecedorId} onChange={(event) => carregarCatalogo(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950">
          <option value="">Selecione o fornecedor...</option>
          {fornecedores.map((fornecedor) => <option key={fornecedor.id} value={fornecedor.id}>{fornecedor.nome}</option>)}
        </select>
      </div>

      {fornecedorId && (
        <>
          <form onSubmit={vincularProduto} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Link2 size={18} className="text-emerald-700" /><h3 className="font-black text-slate-950">Vincular produto existente</h3></div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
              <label className="lg:col-span-4"><span className="mb-1 block text-xs font-extrabold text-slate-700">Produto *</span><select required value={produtoId} onChange={(event) => { const id = event.target.value; const produto = produtos.find((item) => item.id === id); setProdutoId(id); setCustoFornecedor(produto ? String(produto.custoPadrao) : ""); setPrecoVendaFornecedor(produto ? String(produto.precoVendaPadrao) : ""); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold"><option value="">Selecione no cadastro central...</option>{produtosDisponiveis.map((produto) => <option key={produto.id} value={produto.id}>{produto.nome} — {produto.codigo || "sem referência"}</option>)}</select></label>
              <div className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-slate-700">REF. do fornecedor</span><div className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-mono font-black text-blue-900">{fornecedores.find((item) => item.id === fornecedorId)?.referencia || "SEM REF."}</div></div>
              <label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-slate-700">Custo *</span><input required inputMode="decimal" value={custoFornecedor} onChange={(event) => setCustoFornecedor(event.target.value)} placeholder="0,00" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold" /></label>
              <label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-slate-700">Preço-base *</span><input required inputMode="decimal" value={precoVendaFornecedor} onChange={(event) => setPrecoVendaFornecedor(event.target.value)} placeholder="0,00" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold" /></label>
              <button disabled={saving || !produtoId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:bg-slate-300 lg:col-span-2"><Plus size={16} /> {saving ? "Salvando" : "Vincular"}</button>
            </div>
            {feedback && <p className="mt-3 text-xs font-bold text-slate-700">{feedback}</p>}
          </form>

          {editando && <form onSubmit={salvarEdicao} className="rounded-2xl border border-blue-300 bg-blue-50 p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Pencil size={17} className="text-blue-800" /><h3 className="font-black text-blue-950">Editar valores de {editando.produtoNome}</h3></div><p className="mt-1 text-xs font-bold text-blue-700">A alteração será salva somente após validar o PIN do administrador.</p></div><button type="button" aria-label="Fechar edição" onClick={() => { setEditando(null); setEdicaoPin(""); setErroEdicao(""); }} className="rounded-lg border border-blue-200 bg-white p-2 text-blue-800"><X size={16} /></button></div>
            <div className="grid gap-3 lg:grid-cols-12 lg:items-end">
              <label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-blue-950">Custo *</span><input required inputMode="decimal" value={edicaoCusto} onChange={(event) => { setEdicaoCusto(event.target.value); setErroEdicao(""); }} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-bold" /></label>
              <label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-blue-950">Preço-base *</span><input required inputMode="decimal" value={edicaoPrecoVenda} onChange={(event) => { setEdicaoPrecoVenda(event.target.value); setErroEdicao(""); }} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-bold" /></label>
              <label className="lg:col-span-4"><span className="mb-1 block text-xs font-extrabold text-blue-950">Observação</span><input value={edicaoObservacao} onChange={(event) => setEdicaoObservacao(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-bold" /></label>
              <label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-blue-950">PIN administrador *</span><input required type="password" autoComplete="off" value={edicaoPin} onChange={(event) => { setEdicaoPin(event.target.value.slice(0, 64)); setErroEdicao(""); }} className="w-full rounded-xl border border-blue-300 bg-white px-3 py-3 text-center text-sm font-black tracking-widest" /></label>
              <button disabled={saving || !edicaoPin} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 text-xs font-black text-white disabled:opacity-40 lg:col-span-2"><ShieldCheck size={16} /> {saving ? "Validando" : "Validar e salvar"}</button>
            </div>
            {erroEdicao && <p className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-xs font-bold text-red-800">{erroEdicao}</p>}
          </form>}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-4"><div><h3 className="font-black text-slate-950">Catálogo deste fornecedor</h3><p className="text-xs text-slate-600">A configuração comercial principal é mantida no cadastro do produto.</p></div><button type="button" aria-label="Atualizar catálogo" onClick={() => carregarCatalogo(fornecedorId)} className="rounded-xl border border-slate-300 p-2 text-slate-700"><RefreshCw size={16} /></button></div>
            {catalogo.length === 0 ? <div className="p-10 text-center"><Package className="mx-auto text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-600">Nenhum produto vinculado.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr><th className="p-4">Produto</th><th className="p-4">REF. fornecedor</th><th className="p-4 text-right">Custo configurado</th><th className="p-4 text-right">Preço-base</th><th className="p-4">Última compra</th><th className="p-4 text-center">Compras</th><th className="p-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-200">{catalogo.map((item) => <tr key={item.produtoId}><td className="p-4"><p className="font-extrabold text-slate-950">{item.produtoNome}</p><p className="text-xs text-slate-600">REF. {item.produtoCodigo || "SEM REFERÊNCIA"} • {item.unidade}</p></td><td className="p-4 font-mono font-bold">{item.fornecedorReferencia || "—"}</td><td className="p-4 text-right font-mono font-black">{formatCurrency(Number(item.custoFornecedor || 0))}</td><td className="p-4 text-right font-mono font-black">{formatCurrency(Number(item.precoVendaFornecedor || 0))}</td><td className="p-4 font-bold">{item.ultimaCompraEm ? formatDate(item.ultimaCompraEm) : "Sem compra"}</td><td className="p-4 text-center font-black">{Number(item.comprasRealizadas || 0)}</td><td className="p-4"><div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => iniciarEdicao(item)} aria-label={`Editar valores de ${item.produtoNome}`} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 disabled:opacity-40"><Pencil size={14}/> Editar</button>{gerente && <button type="button" disabled={saving} onClick={() => desvincularProduto(item)} aria-label={`Remover associação de ${item.produtoNome}`} className="rounded-lg border border-red-200 p-2 text-red-700 disabled:opacity-40"><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table></div>}
          </div>
        </>
      )}
    </div>
  );
}
