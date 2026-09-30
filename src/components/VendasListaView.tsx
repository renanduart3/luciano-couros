import React, { useState, useEffect } from "react";
import { 
  Search, Trash2, Printer, Eye, Filter, FileText, Pencil, X, ShieldCheck, RotateCcw
} from "lucide-react";
import { Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, todayLocalIso } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { paginate, Pagination } from "./Pagination";
import { useEhGerente } from "../auth/AuthContext";
import { ResumoParcelamentoCartao } from "./ParcelamentoCartaoSelect";
import { BonusVendaDestaque } from "./BonusVendaDestaque";

const PAGE_SIZE = 12;

interface VendasListaViewProps {
  onRefreshStats?: () => void;
  selectedSaleId?: string | null;
  onClearSelectedSaleId?: () => void;
  onEditarVenda?: (venda: Venda) => void;
}

export function VendasListaView({ onRefreshStats, selectedSaleId, onClearSelectedSaleId, onEditarVenda }: VendasListaViewProps) {
  const gerente = useEhGerente();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active viewing sale
  const [vendaDetalhada, setVendaDetalhada] = useState<Venda | null>(null);
  const [vendaCancelamento, setVendaCancelamento] = useState<Venda | null>(null);
  const [pinCancelamento, setPinCancelamento] = useState("");
  const [erroCancelamento, setErroCancelamento] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [vendaDevolucao, setVendaDevolucao] = useState<Venda | null>(null);
  const [quantidadesDevolucao, setQuantidadesDevolucao] = useState<Record<string, string>>({});
  const [dataDevolucao, setDataDevolucao] = useState(todayLocalIso());
  const [observacaoDevolucao, setObservacaoDevolucao] = useState("");
  const [pinDevolucao, setPinDevolucao] = useState("");
  const [erroDevolucao, setErroDevolucao] = useState("");
  const [resultadoDevolucao, setResultadoDevolucao] = useState("");
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

  const handleCancelVenda = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vendaCancelamento) return;
    setCanceling(true);
    setErroCancelamento("");
    try {
      await api.cancelarVenda(vendaCancelamento.id, pinCancelamento);
      setVendaDetalhada(null);
      setVendaCancelamento(null);
      setPinCancelamento("");
      await fetchVendas();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setErroCancelamento(err.message || "Erro ao cancelar venda.");
    } finally {
      setCanceling(false);
    }
  };

  const abrirDevolucao = async (venda: Venda) => {
    setErroDevolucao("");
    setResultadoDevolucao("");
    setQuantidadesDevolucao({});
    setPinDevolucao("");
    setObservacaoDevolucao("");
    setDataDevolucao(todayLocalIso());
    try { setVendaDevolucao(await api.getVenda(venda.id)); }
    catch (err: any) { setError(err.message || "Não foi possível carregar a venda."); }
  };

  const confirmarDevolucao = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vendaDevolucao) return;
    setDevolvendo(true);
    setErroDevolucao("");
    try {
      const itens = (vendaDevolucao.items || []).flatMap((item) => {
        const texto = (quantidadesDevolucao[item.id] || "").trim().replace(",", ".");
        if (!texto) return [];
        const quantidade = Number(texto);
        if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > Number(item.quantidadeDisponivel ?? item.quantidade) + 0.000001) {
          throw new Error(`Confira a quantidade de ${item.descricao}.`);
        }
        return [{ itemVendaId: item.id, quantidade }];
      });
      if (itens.length === 0) throw new Error("Informe a quantidade de ao menos um produto.");
      const resultado = await api.createDevolucaoVenda(vendaDevolucao.id, {
        data: dataDevolucao, observacoes: observacaoDevolucao, pin: pinDevolucao, items: itens
      });
      setVendaDevolucao(null);
      setVendaDetalhada(resultado.venda);
      setResultadoDevolucao(`${formatCurrency(resultado.valorCredito)} devolvido. ${resultado.bonusGerado > 0.005 ? `${formatCurrency(resultado.bonusGerado)} disponível como crédito para o cliente.` : ""}`);
      await fetchVendas();
      onRefreshStats?.();
    } catch (err: any) {
      setPinDevolucao("");
      setErroDevolucao(err.message || "Não foi possível registrar a devolução.");
    } finally { setDevolvendo(false); }
  };

  const triggerPrintDetail = () => {
    window.print();
  };

  return (
    <div id="sales-list-view" className="space-y-6">
      {vendaDevolucao && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-3 print:hidden">
          <form onSubmit={(event) => { void confirmarDevolucao(event); }} role="dialog" aria-modal="true" aria-labelledby="devolver-venda-titulo" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div><h3 id="devolver-venda-titulo" className="font-black text-slate-950">Devolver produtos da venda #{vendaDevolucao.numeroSequencial}</h3><p className="text-xs text-slate-600">Informe somente as quantidades devolvidas nesta operação.</p></div>
              <button type="button" aria-label="Fechar devolução" onClick={() => setVendaDevolucao(null)} className="rounded-lg p-2 text-slate-700"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">{(vendaDevolucao.items || []).filter(item => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005).map(item => (
                <label key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <span className="min-w-0 flex-1"><strong className="block truncate text-slate-950">{item.descricao}</strong><small className="text-slate-600">Disponível: {formatDecimal(item.quantidadeDisponivel ?? item.quantidade)} {item.unidade}</small></span>
                  <input type="number" min="0" max={Number(item.quantidadeDisponivel ?? item.quantidade)} step="any" inputMode="decimal" value={quantidadesDevolucao[item.id] || ""} onChange={event => { setQuantidadesDevolucao(atuais => ({ ...atuais, [item.id]: event.target.value })); setErroDevolucao(""); }} aria-label={`Quantidade devolvida de ${item.descricao}`} placeholder="0" className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right font-bold" />
                </label>
              ))}</div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Data da devolução<input required type="date" value={dataDevolucao} onChange={event => setDataDevolucao(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label><label className="text-xs font-bold text-slate-700">Observação (opcional)<input maxLength={100} value={observacaoDevolucao} onChange={event => setObservacaoDevolucao(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label></div>
              <label className="block text-xs font-bold text-slate-700">Senha do administrador<input required type="password" autoComplete="off" value={pinDevolucao} onChange={event => setPinDevolucao(event.target.value.slice(0, 64))} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
              <p className="text-xs text-slate-600">Em vendas já pagas, o valor devolvido fica registrado como crédito do cliente no sistema.</p>
              {erroDevolucao && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{erroDevolucao}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setVendaDevolucao(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cancelar</button><button type="submit" disabled={devolvendo || !pinDevolucao} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{devolvendo ? "Registrando..." : "Confirmar devolução"}</button></div>
          </form>
        </div>
      )}
      {vendaCancelamento && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <form onSubmit={handleCancelVenda} role="dialog" aria-modal="true" aria-labelledby="cancelar-venda-titulo" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-red-200 bg-red-50 p-5">
              <div className="flex gap-3"><span className="rounded-xl bg-red-700 p-2 text-white"><Trash2 size={19} /></span><div><h3 id="cancelar-venda-titulo" className="font-black text-red-950">Cancelar venda #{vendaCancelamento.numeroSequencial}</h3><p className="mt-1 text-xs font-semibold text-red-800">A venda ficará registrada como cancelada no histórico.</p></div></div>
              <button type="button" aria-label="Fechar cancelamento" onClick={() => { setVendaCancelamento(null); setPinCancelamento(""); setErroCancelamento(""); }} className="rounded-lg p-2 text-red-700 hover:bg-white"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm font-bold text-slate-700">Digite a senha do gerente para confirmar o cancelamento.</p>
              <input type="password" autoFocus autoComplete="off" value={pinCancelamento} onChange={(event) => { setPinCancelamento(event.target.value.slice(0, 64)); setErroCancelamento(""); }} aria-label="Senha do gerente para cancelar venda" placeholder="Senha do gerente" className="w-full rounded-xl border border-red-300 px-4 py-3 text-center text-lg font-black tracking-widest outline-none focus:border-red-600" />
              {erroCancelamento && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{erroCancelamento}</p>}
            </div>
            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 p-4"><button type="button" disabled={canceling} onClick={() => { setVendaCancelamento(null); setPinCancelamento(""); setErroCancelamento(""); }} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black disabled:opacity-50">Voltar</button><button type="submit" disabled={canceling || !pinCancelamento} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><ShieldCheck size={17} /> {canceling ? "Cancelando..." : "Confirmar"}</button></div>
          </form>
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Vendas Realizadas</h2>
          <p className="text-slate-500 text-sm mt-0.5">Histórico geral, devoluções, cancelamentos e segunda via de recibos. Devoluções exigem senha administrativa.</p>
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
                        <BonusVendaDestaque venda={v} className="mt-1" />
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{v.clienteNome}</p>
                        {v.clienteTelefone && <p className="text-[10px] text-slate-400 font-medium">{v.clienteTelefone}</p>}
                      </td>
                      <td className="p-4 text-right font-mono font-extrabold text-slate-900"><span>{formatCurrency(v.totalLiquido)}</span><ResumoParcelamentoCartao formaPagamento={v.formaPagamento || ""} parcelasCartao={v.parcelasCartao} valorTotal={v.valorPago} className="mt-1 text-left font-sans" /></td>
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
                          {v.status !== "cancelada" && (v.items || []).some(item => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005) && <button type="button" onClick={() => { void abrirDevolucao(v); }} title="Devolver produtos (requer senha administrativa)" className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100"><RotateCcw size={14} /> Devolver</button>}
                          {v.status !== "cancelada" && <button onClick={() => onEditarVenda?.(v)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition-colors hover:bg-blue-100"><Pencil size={14} /> Editar</button>}
                          {gerente && v.status !== "cancelada" && <button disabled={canceling} onClick={() => { setVendaCancelamento(v); setPinCancelamento(""); setErroCancelamento(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"><Trash2 size={14} /> Excluir</button>}
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
              <div className="flex flex-wrap justify-end gap-2">
                <BonusVendaDestaque venda={vendaDetalhada} />
                {vendaDetalhada.status !== "cancelada" && (vendaDetalhada.items || []).some(item => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005) && <button type="button" onClick={() => { void abrirDevolucao(vendaDetalhada); }} title="Devolver produtos (requer senha administrativa)" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 text-xs font-black uppercase text-violet-800"><RotateCcw size={16} /> Devolver produtos</button>}
                <button type="button" onClick={triggerPrintDetail} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase text-white hover:bg-emerald-700"><Printer size={16} /> Imprimir</button>
                <button type="button" onClick={() => setVendaDetalhada(null)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase text-slate-700 hover:bg-slate-100"><X size={16} /> Fechar</button>
              </div>
            </div>
            {resultadoDevolucao && <p className="m-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 print:hidden">{resultadoDevolucao}</p>}
            <div id="print-receipt-detail" className="max-w-full overflow-x-auto print:overflow-visible">
              <VendaComprovante venda={vendaDetalhada} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
