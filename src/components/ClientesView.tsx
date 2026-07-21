import React, { useState, useEffect } from "react";
import { 
  Search, Plus, Edit2, Trash2, X, Eye, Phone, MapPin, FileText, TrendingUp, AlertCircle, RefreshCw, MessageCircle 
} from "lucide-react";
import { Cliente, Venda, Pagamento } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";

interface ClientesViewProps {
  onRefreshStats?: () => void;
}

export function ClientesView({ onRefreshStats }: ClientesViewProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editingCli, setEditingCli] = useState<Cliente | null>(null);
  
  // Client Form Fields
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(false);
  const [documento, setDocumento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [formError, setFormError] = useState("");

  // Customer History Modal State
  const [activeHistory, setActiveHistory] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchClientes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getClientes();
      setClientes(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const handleOpenForm = (cli?: Cliente) => {
    if (cli) {
      setEditingCli(cli);
      setNome(cli.nome);
      setTelefone(cli.telefone || "");
      setIsWhatsapp(cli.isWhatsapp === 1);
      setDocumento(cli.documento || "");
      setEndereco(cli.endereco || "");
      setObservacoes(cli.observacoes || "");
      setAtivo(cli.ativo === 1);
    } else {
      setEditingCli(null);
      setNome("");
      setTelefone("");
      setIsWhatsapp(false);
      setDocumento("");
      setEndereco("");
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
      const cliData = {
        nome: nome.trim(),
        telefone: telefone.trim() || undefined,
        isWhatsapp: isWhatsapp ? 1 : 0,
        documento: documento.trim() || undefined,
        endereco: endereco.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        ativo: ativo ? 1 : 0
      };

      if (editingCli) {
        await api.updateCliente(editingCli.id, cliData);
      } else {
        await api.createCliente(cliData);
      }

      setFormOpen(false);
      fetchClientes();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja realmente arquivar/excluir este cliente?")) {
      try {
        await api.deleteCliente(id);
        fetchClientes();
        if (onRefreshStats) onRefreshStats();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir.");
      }
    }
  };

  const handleViewHistory = async (cli: Cliente) => {
    setLoadingHistory(true);
    try {
      const data = await api.getClienteHistorico(cli.id);
      setActiveHistory(data);
    } catch (err: any) {
      alert(err.message || "Erro ao carregar perfil do cliente.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone && c.telefone.includes(busca)) ||
    (c.documento && c.documento.includes(busca))
  );

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Clientes</h2>
          <p className="text-slate-500 text-sm mt-0.5">Gestão de contatos, histórico de compras, saldos devedores e estatísticas.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition-all"
        >
          <Plus size={16} /> Cadastrar Cliente
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
          <span className="pl-3.5 text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text"
            placeholder="Pesquisar por nome, telefone ou documento (CPF/CNPJ)..."
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
          <p className="text-slate-500 mt-4 text-sm font-medium">Buscando banco de clientes...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4">Nome / Observações</th>
                  <th className="p-4">Contato</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredClientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 font-medium">
                      Nenhum cliente cadastrado ou localizado.
                    </td>
                  </tr>
                ) : (
                  filteredClientes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 text-sm">{c.nome}</p>
                        {c.observacoes && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5 max-w-[240px] truncate" title={c.observacoes}>
                            "{c.observacoes}"
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        {c.telefone ? (
                          <span className="flex items-center gap-1.5 text-slate-600 font-medium text-xs">
                            <Phone size={13} className="text-slate-400" /> {c.telefone}
                            {c.isWhatsapp === 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const clean = c.telefone!.replace(/\D/g, "");
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
                          c.ativo === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {c.ativo === 1 ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleViewHistory(c)}
                            className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                            title="Ficha Completa"
                          >
                            <Eye size={14} /> <span>Ficha</span>
                          </button>
                          <button 
                            onClick={() => handleOpenForm(c)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button 
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
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

      {/* Add/Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-100 shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingCli ? `Editar Cliente: ${editingCli.nome}` : "Cadastrar Novo Cliente"}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && <p className="text-sm text-red-600 font-semibold">{formError}</p>}
              
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Nome Completo *</label>
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
                  <label className="block text-xs font-bold text-slate-400 uppercase">Telefone</label>
                  <input 
                    type="text" 
                    value={telefone}
                    placeholder="(11) 98765-4321"
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
                  <label className="block text-xs font-bold text-slate-400 uppercase">Documento (CPF / CNPJ)</label>
                  <input 
                    type="text" 
                    value={documento}
                    placeholder="123.456.789-00"
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Endereço Residencial/Comercial</label>
                <input 
                  type="text" 
                  value={endereco}
                  placeholder="Rua, Número, Bairro - Cidade/UF"
                  onChange={(e) => setEndereco(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Observações Complementares</label>
                <textarea 
                  rows={2}
                  value={observacoes}
                  placeholder="Informações sobre as preferências do cliente..."
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
                <label htmlFor="ativo" className="text-xs font-bold text-slate-600 uppercase">Cliente Ativo para Operações</label>
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
                  {editingCli ? "Salvar Alterações" : "Cadastrar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Full History Modal ("Ficha do Cliente") */}
      {activeHistory && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl border border-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-600 text-white rounded-lg">
                  <FileText size={16} />
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">Ficha de Perfil: {activeHistory.cliente.nome}</h3>
              </div>
              <button onClick={() => setActiveHistory(null)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable history body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              
              {/* Profile statistics cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Comprado</p>
                  <p className="text-base font-extrabold text-slate-900 mt-1">{formatCurrency(activeHistory.estatisticas.totalComprado)}</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente desde</p>
                  <p className="text-base font-extrabold text-slate-900 mt-1">{formatDate(activeHistory.cliente.createdAt)}</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pago</p>
                  <p className="text-base font-extrabold text-emerald-700 mt-1">{formatCurrency(activeHistory.estatisticas.totalPago)}</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Pendente</p>
                  <p className={`text-base font-extrabold mt-1 ${activeHistory.estatisticas.saldoPendente > 0 ? "text-amber-600" : "text-slate-500"}`}>
                    {formatCurrency(activeHistory.estatisticas.saldoPendente)}
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lucro Gerado</p>
                  <p className="text-base font-extrabold text-teal-600 mt-1">{formatCurrency(activeHistory.estatisticas.lucroBruto)}</p>
                </div>

              </div>

              {/* Products Ranking */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-slate-500" />
                  Produtos preferidos por valor
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                        <th className="p-3">Material</th>
                        <th className="p-3 text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeHistory.produtosMaisComprados.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-slate-400">Sem itens registrados ainda.</td>
                        </tr>
                      ) : (
                        activeHistory.produtosMaisComprados.map((p: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/20">
                            <td className="p-3 font-semibold text-slate-800">{p.descricao}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(p.totalValor)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Full History of Sales */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-500" />
                  Histórico de Vendas
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 sticky top-0">
                        <th className="p-3 text-center">Venda</th>
                        <th className="p-3">Data</th>
                        <th className="p-3 text-right">Total Líquido</th>
                        <th className="p-3 text-right">Valor Pago</th>
                        <th className="p-3 text-right">Saldo Restante</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeHistory.vendas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">Nenhuma compra cadastrada.</td>
                        </tr>
                      ) : (
                        activeHistory.vendas.map((v: Venda) => (
                          <tr key={v.id} className="hover:bg-slate-50/20">
                            <td className="p-3 text-center font-extrabold text-slate-900">#{v.numeroSequencial}</td>
                            <td className="p-3 font-mono">{formatDate(v.data)}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(v.totalLiquido)}</td>
                            <td className="p-3 text-right font-mono text-emerald-700">{formatCurrency(v.valorPago)}</td>
                            <td className="p-3 text-right font-mono text-amber-600 font-bold">
                              {v.saldoRestante > 0 ? formatCurrency(v.saldoRestante) : "-"}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                v.status === "paga" ? "bg-emerald-100 text-emerald-800" : v.status === "pendente" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                              }`}>
                                {v.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Full History of Payments */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-slate-500" />
                  Histórico de Pagamentos
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 sticky top-0">
                        <th className="p-3">Data</th>
                        <th className="p-3 text-right">Valor Pago</th>
                        <th className="p-3">Forma</th>
                        <th className="p-3">Venda Vinculada</th>
                        <th className="p-3">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeHistory.pagamentos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-400">Nenhum pagamento registrado.</td>
                        </tr>
                      ) : (
                        activeHistory.pagamentos.map((p: Pagamento) => (
                          <tr key={p.id} className="hover:bg-slate-50/20">
                            <td className="p-3 font-mono">{formatDate(p.data)}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCurrency(p.valor)}</td>
                            <td className="p-3 font-bold text-slate-700 uppercase">{p.formaPagamento}</td>
                            <td className="p-3">
                              {p.vendaSequencial ? (
                                <span className="font-semibold text-slate-500">Venda #{p.vendaSequencial}</span>
                              ) : (
                                <span className="text-slate-400">Amortização de Saldo</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-500 truncate max-w-[250px]" title={p.observacao}>{p.observacao || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
              <button 
                onClick={() => setActiveHistory(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Fechar Ficha
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
