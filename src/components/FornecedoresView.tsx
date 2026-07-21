import React, { useState, useEffect } from "react";
import { Search, Plus, Edit2, Trash2, X, Phone, FileText, ShoppingCart, MessageCircle } from "lucide-react";
import { Fornecedor } from "../types";
import { api } from "../lib/api";

export function FornecedoresView() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [editingFor, setEditingFor] = useState<Fornecedor | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(false);
  const [documento, setDocumento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [formError, setFormError] = useState("");

  const fetchFornecedores = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFornecedores();
      setFornecedores(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar fornecedores.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFornecedores();
  }, []);

  const handleOpenForm = (forn?: Fornecedor) => {
    if (forn) {
      setEditingFor(forn);
      setNome(forn.nome);
      setTelefone(forn.telefone || "");
      setIsWhatsapp(forn.isWhatsapp === 1);
      setDocumento(forn.documento || "");
      setObservacoes(forn.observacoes || "");
      setAtivo(forn.ativo === 1);
    } else {
      setEditingFor(null);
      setNome("");
      setTelefone("");
      setIsWhatsapp(false);
      setDocumento("");
      setObservacoes("");
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

    try {
      const data = {
        nome: nome.trim(),
        telefone: telefone.trim() || undefined,
        isWhatsapp: isWhatsapp ? 1 : 0,
        documento: documento.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        ativo: ativo ? 1 : 0
      };

      if (editingFor) {
        await api.updateFornecedor(editingFor.id, data);
      } else {
        await api.createFornecedor(data);
      }

      setFormOpen(false);
      fetchFornecedores();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja realmente arquivar/excluir este fornecedor?")) {
      try {
        await api.deleteFornecedor(id);
        fetchFornecedores();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir.");
      }
    }
  };

  const filtered = fornecedores.filter(f => 
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (f.telefone && f.telefone.includes(busca)) ||
    (f.documento && f.documento.includes(busca))
  );

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Fornecedores</h2>
          <p className="text-slate-500 text-sm mt-0.5">Gestão de fornecedores de materiais e produtos.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition-all"
        >
          <Plus size={16} /> Cadastrar Fornecedor
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
            placeholder="Pesquisar fornecedor por nome, telefone ou CNPJ..."
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
          <p className="text-slate-500 mt-4 text-sm font-medium">Buscando fornecedores...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4">Fornecedor / Descrição</th>
                  <th className="p-4">Documento (CNPJ/CPF)</th>
                  <th className="p-4">Contato</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                      Nenhum fornecedor cadastrado ou localizado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 text-sm">{f.nome}</p>
                        {f.observacoes && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5 max-w-[240px] truncate" title={f.observacoes}>
                            "{f.observacoes}"
                          </p>
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs text-slate-500">
                        {f.documento || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-4">
                        {f.telefone ? (
                          <span className="flex items-center gap-1.5 text-slate-600 font-medium text-xs">
                            <Phone size={13} className="text-slate-400" /> {f.telefone}
                            {f.isWhatsapp === 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const clean = f.telefone!.replace(/\D/g, "");
                                  const withCountryCode = clean.length <= 11 ? `55${clean}` : clean;
                                  window.open(`https://wa.me/${withCountryCode}`, "_blank");
                                }}
                                className="inline-flex items-center ml-1 p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                                title="Abrir no WhatsApp Web"
                              >
                                <MessageCircle size={15} className="fill-emerald-100" />
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${
                          f.ativo === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {f.ativo === 1 ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleOpenForm(f)}
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold"
                            title="Editar"
                          >
                            <Edit2 size={15} /> <span>Editar</span>
                          </button>
                          <button 
                            onClick={() => handleDelete(f.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold"
                            title="Excluir"
                          >
                            <Trash2 size={15} /> <span>Excluir</span>
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
      {formOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-100 shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingFor ? `Editar Fornecedor: ${editingFor.nome}` : "Cadastrar Novo Fornecedor"}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && <p className="text-sm text-red-600 font-semibold">{formError}</p>}
              
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Razão Social / Nome Fantasia *</label>
                <input 
                  type="text" 
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Telefone de Contato</label>
                  <input 
                    type="text" 
                    value={telefone}
                    placeholder="(11) 3444-6666"
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                  />
                  <div className="flex items-center gap-1.5 pt-1">
                    <input 
                      type="checkbox" 
                      id="isWhatsapp" 
                      checked={isWhatsapp}
                      onChange={(e) => setIsWhatsapp(e.target.checked)}
                      className="h-3.5 w-3.5 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                    />
                    <label htmlFor="isWhatsapp" className="text-[11px] font-bold text-slate-500 uppercase cursor-pointer">É WhatsApp</label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Documento (CNPJ / CPF)</label>
                  <input 
                    type="text" 
                    value={documento}
                    placeholder="12.345.678/0001-99"
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Observações Complementares / Materiais Comprados</label>
                <textarea 
                  rows={3}
                  value={observacoes}
                  placeholder="Ex: Fornecedor principal de linhas e viés de couro..."
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="ativo" 
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                />
                <label htmlFor="ativo" className="text-xs font-bold text-slate-600 uppercase">Fornecedor Ativo</label>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
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
                  {editingFor ? "Salvar Alterações" : "Cadastrar Fornecedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
