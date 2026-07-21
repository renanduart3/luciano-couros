import React, { useState, useEffect } from "react";
import { Search, Plus, Edit2, Trash2, X, Tag, Ruler, DollarSign, RefreshCw, TrendingUp } from "lucide-react";
import { Produto } from "../types";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/utils";

export function ProdutosView() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Produto | null>(null);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [unidade, setUnidade] = useState<"metro" | "unidade" | "quilograma" | "rolo" | "peça">("metro");
  const [unidadeCompra, setUnidadeCompra] = useState<string>("rolo");
  const [unidadeVenda, setUnidadeVenda] = useState<string>("metro");
  const [fatorConversao, setFatorConversao] = useState<string>("50");
  const [venderUnidadeCompra, setVenderUnidadeCompra] = useState(false);
  const [custoCompra, setCustoCompra] = useState<string>("200,00");
  const [precoVendaPadrao, setPrecoVendaPadrao] = useState("");
  const [custoPadrao, setCustoPadrao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [formError, setFormError] = useState("");

  const fetchProdutos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProdutos();
      setProdutos(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar materiais/produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProdutos();
  }, []);

  const handleOpenForm = (prod?: Produto) => {
    if (prod) {
      setEditingProd(prod);
      setNome(prod.nome);
      setCodigo(prod.codigo || "");
      setUnidade(prod.unidade);
      
      const uCompra = prod.unidadeCompra || prod.unidade || "rolo";
      const uVenda = prod.unidadeVenda || prod.unidade || "metro";
      const fConversao = prod.fatorConversao || 1;
      setUnidadeCompra(uCompra);
      setUnidadeVenda(uVenda);
      setFatorConversao(fConversao.toString().replace(".", ","));
      setVenderUnidadeCompra(prod.venderUnidadeCompra === 1);
      
      const purchaseCost = prod.custoPadrao * fConversao;
      setCustoCompra(purchaseCost.toFixed(2).replace(".", ","));
      setCustoPadrao(prod.custoPadrao.toString().replace(".", ","));
      setPrecoVendaPadrao(prod.precoVendaPadrao.toString().replace(".", ","));
      setAtivo(prod.ativo === 1);
    } else {
      setEditingProd(null);
      setNome("");
      setCodigo("");
      setUnidade("metro");
      setUnidadeCompra("rolo");
      setUnidadeVenda("metro");
      setFatorConversao("50");
      setVenderUnidadeCompra(false);
      setCustoCompra("200,00");
      setCustoPadrao("4,00");
      setPrecoVendaPadrao("10,00");
      setAtivo(true);
    }
    setFormError("");
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!nome.trim()) {
      setFormError("O nome é obrigatório.");
      return;
    }

    const precoVenda = parseFloat(precoVendaPadrao.replace(/\./g, "").replace(",", "."));
    const conversion = parseFloat(fatorConversao.replace(/\./g, "").replace(",", "."));
    const custo = parseFloat(custoPadrao.replace(/\./g, "").replace(",", "."));

    if (isNaN(precoVenda) || precoVenda < 0) {
      setFormError("Preço de venda inválido. Não pode ser negativo.");
      return;
    }

    if (isNaN(custo) || custo < 0) {
      setFormError("Custo unitário calculado inválido. Verifique o custo de compra e o fator de conversão.");
      return;
    }

    if (isNaN(conversion) || conversion <= 0) {
      setFormError("O fator de conversão deve ser maior que zero.");
      return;
    }

    try {
      const data = {
        nome: nome.trim(),
        codigo: codigo.trim() || undefined,
        unidade: unidadeVenda as any,
        unidadeCompra,
        unidadeVenda,
        fatorConversao: conversion,
        venderUnidadeCompra: unidadeCompra !== unidadeVenda && venderUnidadeCompra ? 1 : 0,
        precoVendaPadrao: precoVenda,
        custoPadrao: custo,
        ativo: ativo ? 1 : 0
      };

      if (editingProd) {
        await api.updateProduto(editingProd.id, data);
      } else {
        await api.createProduto(data);
      }

      setFormOpen(false);
      fetchProdutos();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja realmente arquivar/excluir este material?")) {
      try {
        await api.deleteProduto(id);
        fetchProdutos();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir.");
      }
    }
  };

  const filtered = produtos.filter(p => 
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.codigo && p.codigo.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Materiais e Produtos</h2>
          <p className="text-slate-500 text-sm mt-0.5">Gerenciamento do catálogo de tecidos, aviamentos, couro e insumos vendidos por metro ou unidade.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition-all"
        >
          <Plus size={16} /> Novo Material
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
          <span className="pl-3.5 text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text"
            placeholder="Pesquisar por nome do material ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full text-slate-900 bg-transparent py-2.5 px-3 text-sm outline-none font-medium placeholder-slate-400"
          />
        </div>
      </div>

      {/* Table List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Buscando banco de materiais...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4">Material / Referência</th>
                  <th className="p-4 text-right">Preço de Venda</th>
                  <th className="p-4 text-center">Situação</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 font-medium">
                      Nenhum material cadastrado ou localizado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{p.nome}</p>
                        {p.codigo ? (
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">REF: {p.codigo}</p>
                        ) : (
                          <p className="text-[10px] text-slate-300 italic mt-0.5">Sem código</p>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="text-right">
                          <span className="font-mono font-extrabold text-slate-900">{formatCurrency(p.precoVendaPadrao)}</span>
                          <span className="text-[10px] text-slate-400 ml-1">/ {p.unidadeVenda || p.unidade}</span>
                        </div>
                        {p.unidadeCompra && p.unidadeVenda && p.unidadeCompra !== p.unidadeVenda && (
                          <div className="text-[10px] text-slate-400 font-medium">
                            Compra: 1 {p.unidadeCompra} = {p.fatorConversao} {p.unidadeVenda}
                            {p.venderUnidadeCompra === 1 && (
                              <span className="ml-1 font-bold text-emerald-600">• venda por {p.unidadeCompra} liberada</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${
                          p.ativo === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {p.ativo === 1 ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => handleOpenForm(p)}
                            className="px-2.5 py-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-150 rounded-lg inline-flex items-center gap-1 font-bold text-xs bg-slate-50 border border-slate-200/50 transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={13} /> Editar
                          </button>
                          <button 
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {formOpen && (() => {
        // Dynamic calculations for pricing intelligence
        const conversionNum = parseFloat(fatorConversao.replace(/\./g, "").replace(",", ".")) || 1;
        const pCostNum = parseFloat(custoCompra.replace(/\./g, "").replace(",", ".")) || 0;
        const calculatedCostNum = pCostNum / conversionNum;
        
        const salePriceNum = parseFloat(precoVendaPadrao.replace(/\./g, "").replace(",", ".")) || 0;
        
        const marginNum = salePriceNum > 0 ? ((salePriceNum - calculatedCostNum) / salePriceNum) * 100 : 0;
        const minimumPriceNum = calculatedCostNum / 0.85;
        
        let statusText = "Excelente Rentabilidade";
        let statusClass = "text-emerald-600";
        let statusDescription = `Excelente margem de lucro de ${marginNum.toFixed(1)}%. Você está cobrando de forma saudável sobre este material.`;
        
        if (marginNum < 0) {
          statusText = "Prejuízo!";
          statusClass = "text-red-600 font-extrabold";
          statusDescription = "Atenção: O preço de venda está abaixo do custo unitário do material! Você terá prejuízo real em cada venda.";
        } else if (marginNum < 15) {
          statusText = "Margem Perigosa";
          statusClass = "text-red-500 font-extrabold";
          statusDescription = `Sua margem está muito baixa (${marginNum.toFixed(1)}%). Evite dar qualquer desconto sobre este item para não gerar prejuízos.`;
        } else if (marginNum < 35) {
          statusText = "Margem Aceitável";
          statusClass = "text-amber-500 font-extrabold";
          statusDescription = `Margem saudável de ${marginNum.toFixed(1)}%. Você pode conceder até no máximo ${(marginNum - 15).toFixed(1)}% de desconto para ainda manter 15% de rentabilidade.`;
        }
        
        const handleCustoCompraChange = (val: string) => {
          setCustoCompra(val);
          const cost = parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
          const factor = parseFloat(fatorConversao.replace(/\./g, "").replace(",", ".")) || 1;
          setCustoPadrao((cost / factor).toFixed(2).replace(".", ","));
        };

        const handleFatorChange = (val: string) => {
          setFatorConversao(val);
          const factor = parseFloat(val.replace(/\./g, "").replace(",", ".")) || 1;
          const cost = parseFloat(custoCompra.replace(/\./g, "").replace(",", ".")) || 0;
          setCustoPadrao((cost / factor).toFixed(2).replace(".", ","));
        };

        return (
          <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-4xl border border-slate-100 shadow-2xl overflow-hidden animate-fade-in my-8">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-extrabold text-slate-900 text-base">
                  {editingProd ? `Editar Material: ${editingProd.nome}` : "Cadastrar Novo Material"}
                </h3>
                <button onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Coluna Esquerda: Dados Cadastrais */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-400 uppercase">Nome / Descrição do Material *</label>
                      <input 
                        type="text" 
                        value={nome}
                        placeholder="Ex: Tecido Tricoline 100% Algodão Lilás"
                        onChange={(e) => setNome(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase">Código de Referência</label>
                        <input 
                          type="text" 
                          value={codigo}
                          placeholder="Ex: TRI-220"
                          onChange={(e) => setCodigo(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase">Unidade de Compra</label>
                        <select 
                          value={unidadeCompra}
                          onChange={(e) => setUnidadeCompra(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-700 outline-none"
                        >
                          <option value="metro">Metro (m)</option>
                          <option value="unidade">Unidade (un)</option>
                          <option value="quilograma">Quilograma (kg)</option>
                          <option value="rolo">Rolo</option>
                          <option value="peça">Peça</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase">Unidade de Venda</label>
                        <select 
                          value={unidadeVenda}
                          onChange={(e) => setUnidadeVenda(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-700 outline-none"
                        >
                          <option value="metro">Metro (m)</option>
                          <option value="unidade">Unidade (un)</option>
                          <option value="quilograma">Quilograma (kg)</option>
                          <option value="rolo">Rolo</option>
                          <option value="peça">Peça</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase">Fator de Conversão</label>
                        <input 
                          type="text" 
                          value={fatorConversao}
                          placeholder="50"
                          onChange={(e) => handleFatorChange(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-900 focus:border-emerald-500 outline-none"
                          required
                        />
                        <p className="text-[9px] text-slate-400 leading-tight mt-0.5">Quantas un. de venda vêm em 1 un. de compra.</p>
                      </div>
                    </div>

                    {unidadeCompra !== unidadeVenda && (
                      <label className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={venderUnidadeCompra}
                          onChange={(e) => setVenderUnidadeCompra(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-emerald-600"
                        />
                        <span>
                          <span className="block text-xs font-extrabold text-emerald-800">
                            Permitir venda por {unidadeCompra} inteiro
                          </span>
                          <span className="block text-[10px] leading-relaxed text-emerald-700/80">
                            Na venda, o operador poderá escolher {unidadeVenda} ou {unidadeCompra}. O preço por {unidadeCompra} será calculado pelo fator de conversão.
                          </span>
                        </span>
                      </label>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase">Custo de Compra (R$)</label>
                        <input 
                          type="text" 
                          value={custoCompra}
                          placeholder="200,00"
                          onChange={(e) => handleCustoCompraChange(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-900 focus:border-emerald-500 outline-none"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400/80 uppercase">Custo Unitário de Venda (R$)</label>
                        <input 
                          type="text" 
                          value={custoPadrao}
                          disabled
                          className="w-full bg-slate-100 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-500 outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase">Preço de Venda Padrão (R$)</label>
                        <input 
                          type="text" 
                          value={precoVendaPadrao}
                          placeholder="10,00"
                          onChange={(e) => setPrecoVendaPadrao(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-emerald-700 focus:border-emerald-500 outline-none"
                          required
                        />
                      </div>

                      <div className="flex items-end pb-3">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="ativo" 
                            checked={ativo}
                            onChange={(e) => setAtivo(e.target.checked)}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                          />
                          <label htmlFor="ativo" className="text-xs font-bold text-slate-600 uppercase cursor-pointer">Material Ativo</label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coluna Direita: resumo objetivo de preço */}
                  <div className="space-y-4">
                    <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4.5 space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs uppercase tracking-wider">
                        <TrendingUp size={16} className="text-emerald-600 shrink-0" />
                        <span>Resumo de Preço</span>
                      </div>

                      {/* Indicadores essenciais */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white border border-slate-200/50 rounded-xl p-3 text-center shadow-xs">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Margem Bruta</span>
                          <span className={`text-base font-black ${marginNum < 15 ? 'text-red-500' : marginNum < 35 ? 'text-amber-500' : 'text-emerald-600'}`}>
                            {marginNum.toFixed(1)}%
                          </span>
                        </div>
                        <div className="bg-white border border-slate-200/50 rounded-xl p-3 text-center shadow-xs">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Preço mínimo (15%)</span>
                          <span className="text-base font-black text-slate-800">
                            {formatCurrency(minimumPriceNum)}
                          </span>
                        </div>
                      </div>

                      <div className={`bg-white border rounded-xl p-3.5 ${marginNum < 15 ? "border-red-200" : marginNum < 35 ? "border-amber-200" : "border-emerald-200"}`}>
                        <p className={`text-xs font-extrabold ${statusClass}`}>{statusText}</p>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">{statusDescription}</p>
                      </div>
                    </div>
                  </div>

                </div>

                {formError && <p className="text-sm text-red-600 font-semibold mt-4">{formError}</p>}

                <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setFormOpen(false)}
                    className="px-5 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold rounded-xl text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
                  >
                    {editingProd ? "Salvar Alterações" : "Cadastrar Material"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
