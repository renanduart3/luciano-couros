import React, { useEffect, useMemo, useState } from "react";
import { Link2, Package, Plus, RefreshCw } from "lucide-react";
import { Fornecedor, FornecedorProduto, Produto } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";

export function FornecedorProdutosView() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [catalogo, setCatalogo] = useState<FornecedorProduto[]>([]);
  const [produtoId, setProdutoId] = useState("");
  const [codigoFornecedor, setCodigoFornecedor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

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
    setCodigoFornecedor("");
    setObservacao("");
    setFeedback("");
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
    setSaving(true);
    setFeedback("");
    try {
      await api.vincularFornecedorProduto(fornecedorId, {
        produtoId,
        codigoFornecedor: codigoFornecedor.trim() || undefined,
        observacao: observacao.trim() || undefined
      });
      setCatalogo(await api.getFornecedorProdutos(fornecedorId));
      setProdutoId("");
      setCodigoFornecedor("");
      setObservacao("");
      setFeedback("Produto vinculado. O custo será confirmado quando uma compra for registrada.");
    } catch (error: any) {
      setFeedback(error.message || "Não foi possível vincular o produto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && fornecedores.length === 0) return <div className="py-20 text-center font-bold text-slate-600">Carregando catálogo...</div>;

  return (
    <div className="space-y-6">
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
              <label className="lg:col-span-5"><span className="mb-1 block text-xs font-extrabold text-slate-700">Produto *</span><select required value={produtoId} onChange={(event) => setProdutoId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold"><option value="">Selecione no cadastro central...</option>{produtosDisponiveis.map((produto) => <option key={produto.id} value={produto.id}>{produto.nome} — {produto.codigo || "sem referência"}</option>)}</select></label>
              <label className="lg:col-span-3"><span className="mb-1 block text-xs font-extrabold text-slate-700">Código no fornecedor</span><input value={codigoFornecedor} onChange={(event) => setCodigoFornecedor(event.target.value)} placeholder="Opcional" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold" /></label>
              <label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-slate-700">Observação</span><input value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Opcional" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold" /></label>
              <button disabled={saving || !produtoId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:bg-slate-300 lg:col-span-2"><Plus size={16} /> {saving ? "Salvando" : "Vincular"}</button>
            </div>
            {feedback && <p className="mt-3 text-xs font-bold text-slate-700">{feedback}</p>}
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-4"><div><h3 className="font-black text-slate-950">Catálogo deste fornecedor</h3><p className="text-xs text-slate-600">Custos abaixo vêm somente de compras efetivamente registradas.</p></div><button type="button" aria-label="Atualizar catálogo" onClick={() => carregarCatalogo(fornecedorId)} className="rounded-xl border border-slate-300 p-2 text-slate-700"><RefreshCw size={16} /></button></div>
            {catalogo.length === 0 ? <div className="p-10 text-center"><Package className="mx-auto text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-600">Nenhum produto vinculado.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-4">Produto</th><th className="p-4">Código fornecedor</th><th className="p-4 text-right">Último custo</th><th className="p-4">Última compra</th><th className="p-4 text-center">Compras</th></tr></thead><tbody className="divide-y divide-slate-200">{catalogo.map((item) => <tr key={item.produtoId}><td className="p-4"><p className="font-extrabold text-slate-950">{item.produtoNome}</p><p className="text-xs text-slate-600">REF. {item.produtoCodigo || "SEM REFERÊNCIA"} • {item.unidade}</p></td><td className="p-4 font-mono font-bold">{item.codigoFornecedor || "—"}</td><td className="p-4 text-right font-mono font-black">{item.ultimoCusto == null ? "Ainda não comprado" : formatCurrency(item.ultimoCusto)}</td><td className="p-4 font-bold">{item.ultimaCompraEm ? formatDate(item.ultimaCompraEm) : "Sem compra"}</td><td className="p-4 text-center font-black">{Number(item.comprasRealizadas || 0)}</td></tr>)}</tbody></table></div>}
          </div>
        </>
      )}
    </div>
  );
}
