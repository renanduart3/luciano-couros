import React, { useState, useEffect } from "react";
import { Search, Plus, Trash2, Save, ShoppingBag, X, Calendar, Filter } from "lucide-react";
import { Fornecedor, Produto, Compra } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";

export function ComprasView() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toggle register screen vs list screen
  const [modoCadastro, setModoCadastro] = useState(false);

  // Form State (Cadastro)
  const [fornecedorId, setFornecedorId] = useState("");
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().split("T")[0]);
  const [descontoGeral, setDescontoGeral] = useState("0");
  const [observacao, setObservacao] = useState("");

  // Items draft
  const [itensRascunho, setItensRascunho] = useState<any[]>([]);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [custoUnitario, setCustoUnitario] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [compList, fornList, prodList] = await Promise.all([
        api.getCompras(),
        api.getFornecedores(),
        api.getProdutos()
      ]);
      setCompras(compList);
      setFornecedores(fornList.filter(f => f.ativo === 1));
      setProdutos(prodList.filter(p => p.ativo === 1));
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados de compras.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectProduto = (id: string) => {
    setProdutoId(id);
    const prod = produtos.find(p => p.id === id);
    if (prod) {
      const unidadeCompraDiferente = prod.unidadeCompra && prod.unidadeCompra !== (prod.unidadeVenda || prod.unidade);
      const fator = unidadeCompraDiferente ? Number(prod.fatorConversao || 1) : 1;
      setCustoUnitario((prod.custoPadrao * fator).toFixed(2).replace(".", ","));
    }
  };

  const handleAddItem = () => {
    if (!produtoId) {
      alert("Por favor, selecione um produto.");
      return;
    }
    const prod = produtos.find(p => p.id === produtoId);
    if (!prod) return;

    const qty = parseBrazilianNumber(quantidade);
    const cost = parseBrazilianNumber(custoUnitario);

    if (qty <= 0) {
      alert("A quantidade deve ser maior que zero.");
      return;
    }

    if (cost < 0) {
      alert("O custo unitário não pode ser negativo.");
      return;
    }

    const itemTotal = qty * cost;

    setItensRascunho(prev => [
      ...prev,
      {
        produtoId,
        nome: prod.nome,
        codigo: prod.codigo,
        quantidade: qty,
        unidade: prod.unidadeCompra || prod.unidadeVenda || prod.unidade,
        custoUnitario: cost,
        total: itemTotal
      }
    ]);

    // Reset item selectors
    setProdutoId("");
    setQuantidade("1");
    setCustoUnitario("");
  };

  const handleRemoveItem = (idx: number) => {
    setItensRascunho(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotalCompra = itensRascunho.reduce((acc, it) => acc + it.total, 0);
  const descGeral = parseBrazilianNumber(descontoGeral);
  const totalCompra = Math.max(0, subtotalCompra - descGeral);

  const handleSaveCompra = async () => {
    if (!fornecedorId) {
      alert("Por favor, selecione o fornecedor.");
      return;
    }
    if (itensRascunho.length === 0) {
      alert("Adicione pelo menos um material à compra.");
      return;
    }

    try {
      const payload = {
        fornecedorId,
        data: dataCompra,
        desconto: descGeral,
        items: itensRascunho.map(it => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          unidade: it.unidade,
          custoUnitario: it.custoUnitario
        })),
        observacao: observacao || undefined
      };

      await api.createCompra(payload);

      // Reset Form and reload
      setFornecedorId("");
      setDataCompra(new Date().toISOString().split("T")[0]);
      setDescontoGeral("0");
      setObservacao("");
      setItensRascunho([]);
      setModoCadastro(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar a compra.");
    }
  };

  const handleCancelCompra = async (id: string) => {
    if (confirm("Deseja realmente cancelar esta compra? O status do custo do produto não será revertido automaticamente, mas a compra será anulada.")) {
      try {
        await api.cancelarCompra(id);
        fetchData();
      } catch (err: any) {
        alert(err.message || "Erro ao cancelar compra.");
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Compras (Entrada de Estoque)</h2>
          <p className="text-slate-500 text-sm mt-0.5">Registro de aquisição de matérias-primas e atualização de custo médio histórico.</p>
        </div>
        
        <button 
          onClick={() => {
            setModoCadastro(!modoCadastro);
            setItensRascunho([]);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all ${
            modoCadastro 
              ? "bg-slate-900 text-white hover:bg-slate-800" 
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {modoCadastro ? "Voltar ao Histórico" : "Registrar Nova Compra (NF)"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Buscando banco de compras...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : modoCadastro ? (
        
        /* FORM CADASTRO COMPRA */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (8 cols): Supplier selection and item picker */}
          <div className="xl:col-span-8 space-y-6">
            
            {/* Header info */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
                1. Fornecedor e Data
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Fornecedor *</label>
                  <select 
                    value={fornecedorId}
                    onChange={(e) => setFornecedorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3 py-2.5 rounded-xl font-bold text-slate-700 outline-none"
                  >
                    <option value="">Selecione o Fornecedor...</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Data da Compra *</label>
                  <input 
                    type="date" 
                    value={dataCompra}
                    onChange={(e) => setDataCompra(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl text-slate-900 outline-none font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Restock items */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
                2. Adicionar Materiais
              </label>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Selecionar Material</label>
                  <select 
                    value={produtoId}
                    onChange={(e) => handleSelectProduto(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3 py-2.5 rounded-xl font-bold text-slate-700 outline-none"
                  >
                    <option value="">Buscar material no catálogo...</option>
                    {produtos.map(p => (
                      <option key={p.id} value={p.id}>{p.nome} ({p.unidadeCompra || p.unidadeVenda || p.unidade})</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Quantidade</label>
                  <input 
                    type="text" 
                    value={quantidade}
                    placeholder="1"
                    onChange={(e) => setQuantidade(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl text-slate-900 outline-none font-bold"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Custo Unitário da NF (R$)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={custoUnitario}
                      placeholder="0,00"
                      onChange={(e) => setCustoUnitario(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl text-slate-900 font-bold outline-none"
                    />
                    <button 
                      type="button"
                      onClick={handleAddItem}
                      className="px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-md flex items-center justify-center"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden mt-4">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold text-xs uppercase border-b border-slate-100">
                      <th className="p-3.5">Material</th>
                      <th className="p-3.5 text-center">Quantidade</th>
                      <th className="p-3.5 text-right">Custo Unitário</th>
                      <th className="p-3.5 text-right font-bold">Total do Item</th>
                      <th className="p-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {itensRascunho.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-medium text-sm">
                          Nenhum material adicionado a esta compra ainda.
                        </td>
                      </tr>
                    ) : (
                      itensRascunho.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3.5">
                            <p className="font-bold text-slate-900">{it.nome}</p>
                            {it.codigo && <p className="text-[10px] text-slate-400 font-mono">Cód: {it.codigo}</p>}
                          </td>
                          <td className="p-3.5 text-center font-bold">
                            {formatDecimal(it.quantidade)} <span className="text-[10px] text-slate-400 uppercase">{it.unidade}</span>
                          </td>
                          <td className="p-3.5 text-right font-mono">{formatCurrency(it.custoUnitario)}</td>
                          <td className="p-3.5 text-right font-mono font-extrabold text-slate-900">{formatCurrency(it.total)}</td>
                          <td className="p-3.5 text-center">
                            <button 
                              type="button" 
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Checkout and finalize */}
          <div className="xl:col-span-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
            <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
              3. Fechamento da Entrada
            </label>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-400 font-medium">
                <span>Subtotal Itens:</span>
                <span className="font-bold text-slate-800">{formatCurrency(subtotalCompra)}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400 font-medium">Desconto da NF (R$):</span>
                <input 
                  type="text" 
                  value={descontoGeral}
                  onChange={(e) => setDescontoGeral(e.target.value)}
                  className="w-24 text-right bg-slate-50 border border-slate-200 text-sm font-bold px-2 py-1.5 rounded-lg text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>

              <hr className="border-slate-100 my-2" />

              <div className="flex justify-between items-center text-base py-1">
                <span className="font-bold text-slate-900">Total Pago à Vista:</span>
                <span className="text-lg font-extrabold text-slate-950">{formatCurrency(totalCompra)}</span>
              </div>
            </div>

            <hr className="border-slate-100" />

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Observações da Compra</label>
              <textarea 
                rows={3}
                value={observacao}
                placeholder="Ex: Nota Fiscal nº 3254, pagamento faturado..."
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs px-3.5 py-2.5 rounded-xl text-slate-900 focus:border-emerald-500 outline-none"
              />
            </div>

            <button 
              type="button"
              onClick={handleSaveCompra}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-[0.98]"
            >
              <Save size={18} /> Salvar Entrada de Compra
            </button>
          </div>

        </div>

      ) : (
        
        /* LIST PAST PURCHASES */
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4">Data</th>
                  <th className="p-4">Fornecedor</th>
                  <th className="p-4 text-right font-bold">Total Geral</th>
                  <th className="p-4">Observações</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {compras.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                      Nenhuma compra restocada cadastrada.
                    </td>
                  </tr>
                ) : (
                  compras.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-slate-500 font-mono text-xs">{formatDate(c.data)}</td>
                      <td className="p-4 font-bold text-slate-900">{c.fornecedorNome}</td>
                      <td className="p-4 text-right font-mono font-extrabold text-slate-900">{formatCurrency(c.total)}</td>
                      <td className="p-4 text-slate-500 text-xs italic truncate max-w-[200px]">{c.observacao || "-"}</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleCancelCompra(c.id)}
                          className="px-2.5 py-1.5 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg inline-flex items-center gap-1 text-xs font-bold transition-all"
                        >
                          <Trash2 size={13} /> Cancelar Compra
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
