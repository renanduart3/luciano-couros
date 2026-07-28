import React, { useState, useEffect } from "react";
import { 
  Search, Trash2, Printer, Eye, Filter, FileText, Pencil, X
} from "lucide-react";
import { Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { paginate, Pagination } from "./Pagination";
import { useConfirmacao } from "./ConfirmacaoDialog";

const PAGE_SIZE = 12;

interface VendasListaViewProps {
  onRefreshStats?: () => void;
  selectedSaleId?: string | null;
  onClearSelectedSaleId?: () => void;
  onEditarVenda?: (venda: Venda) => void;
}

export function VendasListaView({ onRefreshStats, selectedSaleId, onClearSelectedSaleId, onEditarVenda }: VendasListaViewProps) {
  const confirmacao = useConfirmacao();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active viewing sale
  const [vendaDetalhada, setVendaDetalhada] = useState<Venda | null>(null);
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
  useEffect(() => { setPage(1); }, [busca, statusFiltro]);

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
  const vendasPagina = paginate<Venda>(filteredVendas, page, PAGE_SIZE);

  const handleCancelVenda = async (id: string) => {
    setCanceling(true);
    try {
      await api.cancelarVenda(id);
      setVendaDetalhada(null);
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
      {confirmacao.dialogo}
      
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
                  vendasPagina.map((v) => (
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
                        <div className="flex flex-wrap justify-center gap-1.5">
                          <button onClick={() => setVendaDetalhada(v)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900"><Eye size={14} /> Detalhe</button>
                          {v.status !== "cancelada" && <button onClick={() => onEditarVenda?.(v)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition-colors hover:bg-blue-100"><Pencil size={14} /> Editar</button>}
                          {v.status !== "cancelada" && <button disabled={canceling} onClick={async () => { if (await confirmacao.confirmar({ titulo: "Cancelar venda", mensagem: `Excluir a venda #${v.numeroSequencial}? Ela permanecerá registrada como cancelada no histórico.`, textoConfirmar: "Cancelar venda" })) void handleCancelVenda(v.id); }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"><Trash2 size={14} /> Excluir</button>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} totalItems={filteredVendas.length} onPageChange={setPage} />
        </div>
      )}

      {/* Sale Detail / Receipt Printable Overlay Modal */}
      {vendaDetalhada && (
        <div id="print-sale-detail-overlay" className="fixed inset-0 z-40 flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-slate-200 p-3 shadow-2xl animate-fade-in sm:max-w-[calc(100vw-3rem)] print:max-w-none print:overflow-visible print:bg-white print:p-0 print:shadow-none">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 p-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-slate-900 p-1.5 text-white"><FileText size={16} /></span>
                <h3 className="text-base font-extrabold text-slate-900">Detalhes da Venda #{vendaDetalhada.numeroSequencial}</h3>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={triggerPrintDetail} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase text-white hover:bg-emerald-700"><Printer size={16} /> Imprimir</button>
                <button type="button" onClick={() => setVendaDetalhada(null)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase text-slate-700 hover:bg-slate-100"><X size={16} /> Fechar</button>
              </div>
            </div>
            <div id="print-receipt-detail" className="max-w-full overflow-x-auto print:overflow-visible">
              <VendaComprovante venda={vendaDetalhada} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
