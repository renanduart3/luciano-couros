import React, { useEffect, useState } from "react";
import { Edit2, Plus, Search, Tag, Trash2, TrendingUp, X } from "lucide-react";
import { Produto } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";

const UNIDADES = [
  { value: "metro", label: "Metro (m)" },
  { value: "unidade", label: "Unidade (un)" },
  { value: "quilograma", label: "Quilograma (kg)" },
  { value: "rolo", label: "Rolo" },
  { value: "peca", label: "Peça" },
];

export function ProdutosView() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Produto | null>(null);
  const [nome, setNome] = useState("");
  const [referencia, setReferencia] = useState("");
  const [unidade, setUnidade] = useState("metro");
  const [precoVendaPadrao, setPrecoVendaPadrao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [formError, setFormError] = useState("");

  const fetchProdutos = async () => {
    setLoading(true);
    setError(null);
    try {
      setProdutos(await api.getProdutos());
    } catch (err: any) {
      setError(err.message || "Erro ao carregar materiais/produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProdutos();
  }, []);

  const handleOpenForm = (produto?: Produto) => {
    setEditingProd(produto || null);
    setNome(produto?.nome || "");
    setReferencia(produto?.codigo || "");
    setUnidade(produto?.unidade || "metro");
    setPrecoVendaPadrao(produto ? Number(produto.precoVendaPadrao).toFixed(2).replace(".", ",") : "");
    setAtivo(produto ? produto.ativo === 1 : true);
    setFormError("");
    setFormOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    const preco = parseBrazilianNumber(precoVendaPadrao);
    if (!nome.trim()) return setFormError("O nome é obrigatório.");
    if (!unidade) return setFormError("A unidade é obrigatória.");
    if (!Number.isFinite(preco) || preco < 0) return setFormError("Informe um preço de venda válido.");

    const payload = {
      nome: nome.trim(),
      codigo: referencia.trim() || undefined,
      unidade,
      precoVendaPadrao: preco,
      custoPadrao: editingProd?.custoPadrao || 0,
      ativo: ativo ? 1 : 0,
    };

    try {
      if (editingProd) await api.updateProduto(editingProd.id, payload);
      else await api.createProduto(payload as any);
      setFormOpen(false);
      await fetchProdutos();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar o material.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente arquivar este material?")) return;
    try {
      await api.deleteProduto(id);
      await fetchProdutos();
    } catch (err: any) {
      alert(err.message || "Erro ao arquivar o material.");
    }
  };

  const filtrados = produtos.filter((produto) =>
    produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (produto.codigo || "").toLowerCase().includes(busca.toLowerCase())
  );

  const custoAtual = Number(editingProd?.custoPadrao || 0);
  const precoAtual = parseBrazilianNumber(precoVendaPadrao);
  const margem = precoAtual > 0 ? ((precoAtual - custoAtual) / precoAtual) * 100 : 0;

  const resumoCusto = (produto: Produto) => (
    <div>
      <p className="font-mono font-extrabold text-slate-900">{formatCurrency(produto.custoPadrao)}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        {produto.ultimaCompraEm ? `Compra de ${formatDate(produto.ultimaCompraEm)}` : "Sem compra registrada"}
      </p>
      {produto.ultimoFornecedorNome && <p className="text-[10px] font-semibold text-slate-500">{produto.ultimoFornecedorNome}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Materiais e Produtos</h2>
          <p className="mt-0.5 text-sm text-slate-500">Uma única unidade para compra e venda. O custo vem sempre da última compra válida.</p>
        </div>
        <button onClick={() => handleOpenForm()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-700 sm:w-auto sm:py-2.5">
          <Plus size={16} /> Novo Material
        </button>
      </div>

      <div className="flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-emerald-500">
        <Search size={16} className="ml-3.5 text-slate-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por nome ou referência..." className="w-full bg-transparent px-3 py-3 text-sm font-medium text-slate-900 outline-none" />
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm font-medium text-slate-500">Carregando materiais...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm text-slate-400">Nenhum material localizado.</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase text-slate-400">
                <tr><th className="p-4">Material / Referência</th><th className="p-4">Unidade</th><th className="p-4 text-right">Último custo</th><th className="p-4 text-right">Preço de venda</th><th className="p-4 text-center">Situação</th><th className="p-4 text-center">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((produto) => (
                  <tr key={produto.id} className="hover:bg-slate-50/60">
                    <td className="p-4"><p className="font-bold text-slate-900">{produto.nome}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">REF: {produto.codigo || "SEM REFERÊNCIA"}</p></td>
                    <td className="p-4 text-xs font-bold uppercase text-slate-600">{produto.unidade}</td>
                    <td className="p-4 text-right">{resumoCusto(produto)}</td>
                    <td className="p-4 text-right font-mono font-extrabold text-emerald-700">{formatCurrency(produto.precoVendaPadrao)}</td>
                    <td className="p-4 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${produto.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{produto.ativo ? "ATIVO" : "ARQUIVADO"}</span></td>
                    <td className="p-4 text-center"><div className="flex justify-center gap-1"><button aria-label={`Editar ${produto.nome}`} onClick={() => handleOpenForm(produto)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Edit2 size={15} /></button><button aria-label={`Arquivar ${produto.nome}`} onClick={() => handleDelete(produto.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtrados.map((produto) => (
              <article key={produto.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-extrabold text-slate-900">{produto.nome}</h3><p className="mt-1 font-mono text-[10px] text-slate-400">REF: {produto.codigo || "SEM REFERÊNCIA"}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{produto.unidade}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-[9px] font-bold uppercase text-slate-400">Último custo</p>{resumoCusto(produto)}</div><div className="text-right"><p className="text-[9px] font-bold uppercase text-slate-400">Preço de venda</p><p className="font-mono font-black text-emerald-700">{formatCurrency(produto.precoVendaPadrao)}</p></div></div>
                <div className="mt-3 flex gap-2"><button onClick={() => handleOpenForm(produto)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white"><Edit2 size={14} /> Editar</button><button aria-label={`Arquivar ${produto.nome}`} onClick={() => handleDelete(produto.id)} className="rounded-xl border border-red-200 px-3 text-red-600"><Trash2 size={15} /></button></div>
              </article>
            ))}
          </div>
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="produto-form-titulo" className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h3 id="produto-form-titulo" className="font-extrabold text-slate-900">{editingProd ? "Editar material" : "Cadastrar material"}</h3>
              <button aria-label="Fechar cadastro" onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-5 p-5 sm:p-6">
              <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Nome / descrição *</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold outline-none focus:border-emerald-500" required /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Referência</label><div className="flex items-center rounded-xl border border-slate-200 bg-slate-50"><Tag size={15} className="ml-3 text-slate-400" /><input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex: NAPA-FLY-01" className="w-full bg-transparent px-3 py-3 text-sm font-bold uppercase outline-none" /></div></div>
                <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Unidade de compra e venda *</label><select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold outline-none">{UNIDADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Preço padrão de venda *</label><input value={precoVendaPadrao} inputMode="decimal" onChange={(e) => setPrecoVendaPadrao(e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-lg font-black text-emerald-800 outline-none focus:border-emerald-500" required /></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"><p className="text-[10px] font-bold uppercase text-slate-400">Último custo comprado</p><p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(custoAtual)}</p><p className="text-[10px] text-slate-500">{editingProd?.ultimaCompraEm ? `${formatDate(editingProd.ultimaCompraEm)} • ${editingProd.ultimoFornecedorNome || "Fornecedor não informado"}` : "Será definido ao registrar a primeira compra."}</p></div>
              </div>
              {editingProd && custoAtual > 0 && precoAtual > 0 && <div className={`flex items-center justify-between rounded-xl border p-3 ${margem < 15 ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><span className="flex items-center gap-2 text-xs font-bold"><TrendingUp size={15} /> Margem sobre o último custo</span><strong>{margem.toFixed(1)}%</strong></div>}
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-emerald-600" /><span className="text-xs font-bold text-slate-700">Material ativo para novas vendas e compras</span></label>
              {formError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{formError}</p>}
              <div className="flex gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={() => setFormOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Cancelar</button><button type="submit" className="flex-[1.4] rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white">{editingProd ? "Salvar alterações" : "Cadastrar material"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
