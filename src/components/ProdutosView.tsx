import React, { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { Fornecedor, Produto } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";
import { paginate, Pagination } from "./Pagination";

const PAGE_SIZE = 10;
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Produto | null>(null);
  const [nome, setNome] = useState("");
  const [referencia, setReferencia] = useState("");
  const [unidade, setUnidade] = useState("metro");
  const [precoVendaPadrao, setPrecoVendaPadrao] = useState("");
  const [custoPadrao, setCustoPadrao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorIds, setFornecedorIds] = useState<string[]>([]);
  const [buscaFornecedor, setBuscaFornecedor] = useState("");
  const [fornecedorDropdownAberto, setFornecedorDropdownAberto] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchProdutos = async () => {
    setLoading(true);
    setError(null);
    try { setProdutos(await api.getProdutos()); }
    catch (err: any) { setError(err.message || "Erro ao carregar materiais/produtos."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchProdutos();
    api.getFornecedores()
      .then((lista) => setFornecedores(lista.filter((fornecedor) => fornecedor.ativo === 1)))
      .catch(() => setFornecedores([]));
  }, []);
  useEffect(() => { setPage(1); }, [busca]);

  const handleOpenForm = async (produto?: Produto) => {
    setEditingProd(produto || null);
    setNome(produto?.nome || "");
    setReferencia(produto?.codigo || "");
    setUnidade(produto?.unidade || "metro");
    setPrecoVendaPadrao(produto ? Number(produto.precoVendaPadrao).toFixed(2).replace(".", ",") : "");
    setCustoPadrao(produto ? Number(produto.custoPadrao).toFixed(2).replace(".", ",") : "");
    setFornecedorIds([]);
    setBuscaFornecedor("");
    setFornecedorDropdownAberto(false);
    setAtivo(produto ? produto.ativo === 1 : true);
    setFormError("");
    setFormOpen(true);
    if (produto) {
      try {
        const vinculados = await api.getProdutoFornecedores(produto.id);
        setFornecedorIds(vinculados.map((item) => item.fornecedorId));
      } catch {
        setFormError("Não foi possível carregar os fornecedores vinculados.");
      }
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    const preco = parseBrazilianNumber(precoVendaPadrao);
    const custo = parseBrazilianNumber(custoPadrao);
    if (!nome.trim()) return setFormError("O nome é obrigatório.");
    if (!Number.isFinite(preco) || preco < 0) return setFormError("Informe um preço-base válido.");
    if (!Number.isFinite(custo) || custo < 0) return setFormError("Informe um preço de custo válido.");

    const payload = {
      nome: nome.trim(),
      codigo: referencia.trim() || undefined,
      unidade,
      precoVendaPadrao: preco,
      custoPadrao: custo,
      fornecedorIds,
      ativo: ativo ? 1 : 0,
    };

    try {
      if (editingProd) await api.updateProduto(editingProd.id, payload);
      else await api.createProduto(payload);
      setFormOpen(false);
      await fetchProdutos();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar o material.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente arquivar este material?")) return;
    try { await api.deleteProduto(id); await fetchProdutos(); }
    catch (err: any) { alert(err.message || "Erro ao arquivar o material."); }
  };

  const filtrados = useMemo(() => produtos.filter((produto) =>
    produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (produto.codigo || "").toLowerCase().includes(busca.toLowerCase())
  ), [produtos, busca]);
  const paginaProdutos = paginate<Produto>(filtrados, page, PAGE_SIZE);
  const fornecedoresFiltrados = fornecedores.filter((fornecedor) =>
    !fornecedorIds.includes(fornecedor.id) &&
    fornecedor.nome.toLowerCase().includes(buscaFornecedor.trim().toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Materiais e Produtos</h2>
          <p className="mt-0.5 text-sm text-slate-500">Catálogo-base do sistema. Preços especiais e estratégia comercial são definidos por cliente.</p>
        </div>
        <button onClick={() => handleOpenForm()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-700 sm:w-auto">
          <Plus size={16} /> Novo material
        </button>
      </div>

      <div className="flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-emerald-500">
        <Search size={16} className="ml-3.5 text-slate-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por nome ou referência..." className="w-full bg-transparent px-3 py-3 text-sm font-medium outline-none" />
      </div>

      {loading ? <div className="py-20 text-center text-sm font-medium text-slate-500">Carregando materiais...</div> :
      error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> :
      filtrados.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm text-slate-400">Nenhum material localizado.</div> :
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase text-slate-400">
              <tr><th className="p-4">Material / referência</th><th className="p-4">Unidade</th><th className="p-4 text-right">Custo atual</th><th className="p-4 text-right">Preço-base</th><th className="p-4">Último fornecedor</th><th className="p-4 text-center">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginaProdutos.map((produto) => <tr key={produto.id} className="hover:bg-slate-50/60">
                <td className="p-4"><p className="font-bold text-slate-900">{produto.nome}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">REF: {produto.codigo || "SEM REFERÊNCIA"}</p></td>
                <td className="p-4 text-xs font-bold uppercase text-slate-600">{produto.unidade}</td>
                <td className="p-4 text-right"><p className="font-mono font-extrabold text-slate-900">{formatCurrency(produto.custoPadrao)}</p><p className="text-[10px] text-slate-400">{produto.custoOrigem === "compra" && produto.ultimaCompraEm ? `Compra em ${formatDate(produto.ultimaCompraEm)}` : "Informado manualmente"}</p></td>
                <td className="p-4 text-right font-mono font-extrabold text-emerald-700">{formatCurrency(produto.precoVendaPadrao)}</td>
                <td className="p-4 text-xs font-semibold text-slate-600">{produto.ultimoFornecedorNome || "Não informado"}</td>
                <td className="p-4"><div className="flex justify-center gap-1"><button title="Editar" onClick={() => handleOpenForm(produto)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Edit2 size={15} /></button><button title="Arquivar" onClick={() => handleDelete(produto.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} totalItems={filtrados.length} onPageChange={setPage} />
      </div>}

      {formOpen && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><h3 className="font-extrabold text-slate-900">{editingProd ? "Editar material" : "Cadastrar material"}</h3><button onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
          <form onSubmit={handleSave} className="space-y-5 p-5 sm:p-6">
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Nome / descrição *</span><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold outline-none focus:border-emerald-500" required /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Referência</span><span className="flex items-center rounded-xl border border-slate-200 bg-slate-50"><Tag size={15} className="ml-3 text-slate-400" /><input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex: NAPA-FLY-01" className="w-full bg-transparent px-3 py-3 text-sm font-bold uppercase outline-none" /></span></label>
              <label><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Unidade *</span><select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold">{UNIDADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Preço de custo *</span><input value={custoPadrao} inputMode="decimal" onChange={(e) => setCustoPadrao(e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-lg font-black text-amber-900 outline-none" required /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase text-slate-500">Preço-base do produto *</span><input value={precoVendaPadrao} inputMode="decimal" onChange={(e) => setPrecoVendaPadrao(e.target.value)} placeholder="0,00" className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-lg font-black text-emerald-800 outline-none" required /></label>
            </div>
            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-xs font-bold uppercase text-slate-500">Fornecedores do produto</legend>
              {fornecedores.length === 0 ? <p className="text-xs font-semibold text-slate-500">Cadastre um fornecedor para criar vínculos.</p> : <div className="space-y-2">
                {fornecedorIds.length > 0 && <div className="flex flex-wrap gap-2">{fornecedorIds.map((id) => {
                  const fornecedor = fornecedores.find((item) => item.id === id);
                  return fornecedor ? <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-900">{fornecedor.nome}<button type="button" aria-label={`Remover fornecedor ${fornecedor.nome}`} onClick={() => setFornecedorIds((atuais) => atuais.filter((item) => item !== id))} className="rounded p-0.5 hover:bg-emerald-200"><X size={13} /></button></span> : null;
                })}</div>}
                <div className="relative">
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50"><Search size={15} className="ml-3 text-slate-400" /><input value={buscaFornecedor} onFocus={() => setFornecedorDropdownAberto(true)} onChange={(event) => { setBuscaFornecedor(event.target.value); setFornecedorDropdownAberto(true); }} placeholder="Digite o nome do fornecedor..." className="w-full bg-transparent px-3 py-3 text-sm font-bold outline-none" /></div>
                  {fornecedorDropdownAberto && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {fornecedoresFiltrados.length > 0 ? fornecedoresFiltrados.map((fornecedor) => <button key={fornecedor.id} type="button" onClick={() => { setFornecedorIds((atuais) => atuais.includes(fornecedor.id) ? atuais : [...atuais, fornecedor.id]); setBuscaFornecedor(""); setFornecedorDropdownAberto(true); }} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-emerald-50">{fornecedor.nome}</button>) : <p className="p-3 text-xs font-semibold text-slate-500">Nenhum fornecedor encontrado.</p>}
                  </div>}
                </div>
              </div>}
            </fieldset>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-emerald-600" /><span className="text-xs font-bold text-slate-700">Material ativo</span></label>
            {formError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{formError}</p>}
            <div className="flex gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={() => setFormOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Cancelar</button><button type="submit" className="flex-[1.4] rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white">{editingProd ? "Salvar alterações" : "Cadastrar material"}</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
