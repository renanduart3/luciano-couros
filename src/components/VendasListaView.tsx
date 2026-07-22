import React, { useState, useEffect } from "react";
import { 
  Search, Trash2, Printer, Eye, X, AlertTriangle, Calendar, Filter, Clock, FileText 
} from "lucide-react";
import { Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";

interface VendasListaViewProps {
  onRefreshStats?: () => void;
  selectedSaleId?: string | null;
  onClearSelectedSaleId?: () => void;
}

export function VendasListaView({ onRefreshStats, selectedSaleId, onClearSelectedSaleId }: VendasListaViewProps) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active viewing sale
  const [vendaDetalhada, setVendaDetalhada] = useState<Venda | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const fetchVendas = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getVendas();
      setVendas(data);

      // If there's an external selection from dashboard
      if (selectedSaleId) {
        const found = data.find(v => v.id === selectedSaleId);
        if (found) {
          setVendaDetalhada(found);
        }
        if (onClearSelectedSaleId) {
          onClearSelectedSaleId();
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro ao carregar lista de vendas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendas();
  }, [selectedSaleId]);

  // Filter sales
  const filteredVendas = vendas.filter(v => {
    const matchesBusca = 
      v.numeroSequencial.toString().includes(busca) ||
      (v.clienteNome && v.clienteNome.toLowerCase().includes(busca.toLowerCase())) ||
      (v.observacoes && v.observacoes.toLowerCase().includes(busca.toLowerCase()));
    
    const matchesStatus = 
      statusFiltro === "todas" || 
      v.status === statusFiltro;

    return matchesBusca && matchesStatus;
  });

  const handleCancelVenda = async (id: string) => {
    setCanceling(true);
    try {
      await api.cancelarVenda(id);
      setVendaDetalhada(null);
      setShowConfirmCancel(false);
      fetchVendas();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      alert(err.message || "Erro ao cancelar venda.");
    } finally {
      setCanceling(false);
    }
  };

  const triggerPrintDetail = () => {
    window.print();
  };

  return (
    <div id="sales-list-view" className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Vendas Realizadas</h2>
          <p className="text-slate-500 text-sm mt-0.5">Histórico geral, cancelamentos e segunda via de recibos.</p>
        </div>
        <button 
          onClick={fetchVendas}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200/50 transition-colors"
        >
          Atualizar Lista
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 relative">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <span className="pl-3.5 text-slate-400">
              <Search size={16} />
            </span>
            <input 
              type="text"
              placeholder="Buscar por número da venda ou nome do cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full text-slate-900 bg-transparent py-2.5 px-3 text-sm outline-none font-medium placeholder-slate-400"
            />
          </div>
        </div>

        <div className="md:col-span-4 flex items-center bg-white border border-slate-200 rounded-xl px-3 focus-within:border-emerald-500">
          <Filter size={16} className="text-slate-400 mr-2" />
          <select 
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            className="w-full text-slate-700 bg-transparent py-2.5 text-sm outline-none font-bold"
          >
            <option value="todas">Todos os Status</option>
            <option value="paga">Pagas</option>
            <option value="pendente">Pendentes (Saldos)</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>
      </div>

      {/* Main Grid/Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Carregando livro de vendas...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-800 rounded-xl border border-red-200">{error}</div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4 text-center">Venda / Data</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4 text-right font-bold">Valor Total</th>
                  <th className="p-4 text-center">Situação</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredVendas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                      Nenhuma venda localizada com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredVendas.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-center">
                        <p className="font-extrabold text-slate-900">#{v.numeroSequencial}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatDate(v.data)}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{v.clienteNome}</p>
                        {v.clienteTelefone && <p className="text-[10px] text-slate-400 font-medium">{v.clienteTelefone}</p>}
                      </td>
                      <td className="p-4 text-right font-mono font-extrabold text-slate-900">{formatCurrency(v.totalLiquido)}</td>
                      <td className="p-4 text-center">
                        {v.status === "paga" ? (
                          <span className="inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-800">
                            Pago
                          </span>
                        ) : v.status === "pendente" ? (
                          <span className="inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full bg-amber-100 text-amber-800" title={`Falta faturar: ${formatCurrency(v.saldoRestante)}`}>
                            A receber ({formatCurrency(v.saldoRestante)})
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full bg-red-100 text-red-800">
                            Cancelado
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => setVendaDetalhada(v)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg inline-flex items-center gap-1.5 font-bold text-xs transition-colors"
                        >
                          <Eye size={14} /> Detalhes
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

      {/* Sale Detail / Receipt Printable Overlay Modal */}
      {vendaDetalhada && (
        <div id="print-sale-detail-overlay" className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          {/* Main modal container */}
          <div className="w-full max-w-[230mm] rounded-2xl bg-slate-200 p-3 shadow-2xl animate-fade-in print:max-w-none print:bg-white print:p-0 print:shadow-none">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:hidden">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-slate-900 text-white rounded-lg">
                  <FileText size={16} />
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">Detalhes da Venda #{vendaDetalhada.numeroSequencial}</h3>
              </div>
              <button 
                onClick={() => {
                  setVendaDetalhada(null);
                  setShowConfirmCancel(false);
                }} 
                className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Receipt Printable content */}
            <div id="print-receipt-detail" className="space-y-3 print:space-y-0">
              <VendaComprovante venda={vendaDetalhada} />

              {/* Confirm Cancellation Dialog Box */}
              {showConfirmCancel ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3 print:hidden">
                  <div className="flex items-start gap-2.5 text-red-800">
                    <AlertTriangle size={20} className="shrink-0 text-red-600 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm">Tem certeza de que deseja CANCELAR esta venda?</h4>
                      <p className="text-xs text-red-700 mt-1">
                        Esta ação é irreversível. A venda será marcada como cancelada/excluída, todos os pagamentos vinculados serão estornados automaticamente e o estoque/saldos do cliente serão reajustados para refletir este estorno.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end text-xs font-bold">
                    <button 
                      onClick={() => setShowConfirmCancel(false)}
                      className="px-3.5 py-2 text-slate-600 hover:bg-red-100/40 rounded-lg transition-colors"
                    >
                      Não, manter venda
                    </button>
                    <button 
                      disabled={canceling}
                      onClick={() => handleCancelVenda(vendaDetalhada.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md transition-colors disabled:opacity-50"
                    >
                      {canceling ? "Cancelando..." : "Sim, confirmar cancelamento"}
                    </button>
                  </div>
                </div>
              ) : (
                vendaDetalhada.status !== "cancelada" && (
                  <div className="flex justify-start print:hidden">
                    <button 
                      type="button"
                      onClick={() => setShowConfirmCancel(true)}
                      className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl border border-transparent hover:border-red-200/50 transition-colors"
                    >
                      <Trash2 size={14} /> Cancelar / Excluir Venda
                    </button>
                  </div>
                )
              )}

            </div>

            {/* Action buttons (Footer) */}
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end bg-slate-50 print:hidden">
              <button 
                onClick={triggerPrintDetail}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors"
              >
                <Printer size={16} /> Imprimir Comprovante
              </button>
              <button 
                onClick={() => {
                  setVendaDetalhada(null);
                  setShowConfirmCancel(false);
                }}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl text-sm transition-colors"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
