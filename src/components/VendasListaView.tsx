import React, { useState, useEffect } from "react";
import { 
  Search, Trash2, Printer, Eye, X, AlertTriangle, Filter, FileText, KeyRound, Pencil, RotateCcw, WalletCards
} from "lucide-react";
import { Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { paginate, Pagination } from "./Pagination";

const PAGE_SIZE = 12;

interface VendasListaViewProps {
  onRefreshStats?: () => void;
  selectedSaleId?: string | null;
  onClearSelectedSaleId?: () => void;
  onEditarVenda?: (venda: Venda) => void;
}

export function VendasListaView({ onRefreshStats, selectedSaleId, onClearSelectedSaleId, onEditarVenda }: VendasListaViewProps) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active viewing sale
  const [vendaDetalhada, setVendaDetalhada] = useState<Venda | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [devolucaoOpen, setDevolucaoOpen] = useState(false);
  const [devolucaoQuantidades, setDevolucaoQuantidades] = useState<Record<string, string>>({});
  const [devolucaoData, setDevolucaoData] = useState(() => new Date().toISOString().split("T")[0]);
  const [devolucaoObservacoes, setDevolucaoObservacoes] = useState("");
  const [devolucaoPin, setDevolucaoPin] = useState("");
  const [devolucaoErro, setDevolucaoErro] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);

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

  const valorCreditoPrevisto = vendaDetalhada?.items?.reduce((total, item) => {
    const quantidade = Number((devolucaoQuantidades[item.id] || "0").replace(",", "."));
    const descontoRateado = Number(vendaDetalhada.subtotal) > 0
      ? Number(vendaDetalhada.desconto || 0) * (Number(item.total) / Number(vendaDetalhada.subtotal))
      : 0;
    const unitarioLiquido = (Number(item.total) - descontoRateado) / Number(item.quantidade);
    return total + (Number.isFinite(quantidade) ? quantidade * unitarioLiquido : 0);
  }, 0) || 0;

  const registrarDevolucao = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vendaDetalhada) return;
    const items = (vendaDetalhada.items || []).map((item) => ({
      itemVendaId: item.id,
      quantidade: Number((devolucaoQuantidades[item.id] || "0").replace(",", "."))
    })).filter((item) => item.quantidade > 0);
    if (items.length === 0) {
      setDevolucaoErro("Informe a quantidade devolvida de pelo menos um item.");
      return;
    }
    setDevolvendo(true);
    setDevolucaoErro("");
    try {
      const resultado = await api.createDevolucaoVenda(vendaDetalhada.id, {
        data: devolucaoData,
        observacoes: devolucaoObservacoes.trim() || undefined,
        pin: devolucaoPin,
        items
      });
      const atualizadas = await api.getVendas();
      setVendas(atualizadas);
      setVendaDetalhada(atualizadas.find((venda) => venda.id === vendaDetalhada.id) || null);
      setDevolucaoOpen(false);
      setDevolucaoQuantidades({});
      setDevolucaoPin("");
      setDevolucaoObservacoes("");
      alert(`Devolução registrada. ${formatCurrency(resultado.valorCredito)} creditados na carteira do cliente.`);
      onRefreshStats?.();
    } catch (err: any) {
      setDevolucaoErro(err.message || "Não foi possível registrar a devolução.");
    } finally {
      setDevolvendo(false);
    }
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
                          {v.status !== "cancelada" && <button disabled={canceling} onClick={() => { if (window.confirm(`Excluir a venda #${v.numeroSequencial}? Ela permanecerá registrada como cancelada no histórico.`)) void handleCancelVenda(v.id); }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"><Trash2 size={14} /> Excluir</button>}
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
          {/* Main modal container */}
          <div className="w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-slate-200 p-3 shadow-2xl animate-fade-in sm:max-w-[calc(100vw-3rem)] print:max-w-none print:overflow-visible print:bg-white print:p-0 print:shadow-none">
            
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
            <div id="print-receipt-detail" className="max-w-full space-y-3 overflow-x-auto print:space-y-0 print:overflow-visible">
              <VendaComprovante venda={vendaDetalhada} />

              {vendaDetalhada.devolucoes && vendaDetalhada.devolucoes.length > 0 && (
                <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 print:hidden">
                  <h4 className="flex items-center gap-2 text-sm font-black text-violet-950"><WalletCards size={17} /> Créditos gerados por devolução</h4>
                  <div className="mt-3 space-y-2">
                    {vendaDetalhada.devolucoes.map((devolucao) => (
                      <div key={devolucao.id} className="rounded-lg bg-white p-3 text-xs ring-1 ring-violet-100">
                        <div className="flex justify-between gap-3"><strong>{formatDate(devolucao.data)}</strong><strong className="text-violet-800">{formatCurrency(devolucao.valorCredito)}</strong></div>
                        <p className="mt-1 text-slate-600">{devolucao.items.map((item) => `${formatDecimal(item.quantidade)} ${item.unidade} de ${item.descricao}`).join(" • ")}</p>
                        {devolucao.observacoes && <p className="mt-1 text-slate-500">{devolucao.observacoes}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {devolucaoOpen && (
                <form onSubmit={registrarDevolucao} className="space-y-4 rounded-xl border border-violet-300 bg-white p-4 print:hidden">
                  <div className="flex items-center justify-between"><div><h4 className="font-black text-slate-950">Registrar devolução</h4><p className="text-xs text-slate-500">O valor vira crédito na carteira deste cliente.</p></div><button type="button" onClick={() => setDevolucaoOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={17} /></button></div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="p-3 text-left">Item</th><th className="p-3 text-right">Vendido</th><th className="p-3 text-right">Já devolvido</th><th className="p-3 text-right">Devolver agora</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{(vendaDetalhada.items || []).map((item) => {
                        const disponivel = Number(item.quantidadeDisponivel ?? item.quantidade);
                        return <tr key={item.id}><td className="p-3"><strong>{item.descricao}</strong><span className="ml-2 text-xs text-slate-500">{item.unidade}</span></td><td className="p-3 text-right font-mono">{formatDecimal(item.quantidade)}</td><td className="p-3 text-right font-mono">{formatDecimal(Number(item.quantidadeDevolvida || 0))}</td><td className="p-3 text-right"><input disabled={disponivel <= 0} value={devolucaoQuantidades[item.id] || ""} onChange={(event) => setDevolucaoQuantidades((atual) => ({ ...atual, [item.id]: event.target.value }))} placeholder="0" className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right font-black disabled:bg-slate-100" /><small className="ml-2 text-slate-400">máx. {formatDecimal(disponivel)}</small></td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Data</span><input required type="date" value={devolucaoData} onChange={(event) => setDevolucaoData(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-bold" /></label>
                    <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Motivo / observação</span><input value={devolucaoObservacoes} onChange={(event) => setDevolucaoObservacoes(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-bold" /></label>
                    <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">PIN administrativo</span><div className="relative"><KeyRound size={16} className="absolute left-3 top-3 text-slate-400" /><input required type="password" inputMode="numeric" value={devolucaoPin} onChange={(event) => setDevolucaoPin(event.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 font-black tracking-widest" /></div></label>
                  </div>
                  {devolucaoErro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{devolucaoErro}</p>}
                  <div className="flex flex-col items-stretch justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center"><strong className="text-violet-900">Crédito previsto: {formatCurrency(valorCreditoPrevisto)}</strong><button disabled={devolvendo} type="submit" className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><RotateCcw size={16} className="mr-2 inline" /> {devolvendo ? "Registrando..." : "Confirmar devolução e crédito"}</button></div>
                </form>
              )}

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
                  <div className="flex flex-wrap justify-between gap-2 print:hidden">
                    <button type="button" onClick={() => { setDevolucaoOpen(true); setDevolucaoErro(""); }} className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white"><RotateCcw size={15} /> Registrar devolução</button>
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
