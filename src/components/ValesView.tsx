import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckSquare2, Coins, Eye, FileClock, Filter, HandCoins, Landmark, MessageCircle, WalletCards, X } from "lucide-react";
import { Cliente, OrdemCobranca, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { ValeDetalhesModal } from "./ValeDetalhesModal";
import { Pagination, paginate } from "./Pagination";
import { CobrancaValesModal } from "./CobrancaValesModal";
import { OrdemCobrancaDetalhesModal, OrdensCobrancaView } from "./OrdensCobrancaView";
import { PagamentoValesModal } from "./PagamentoValesModal";
import { ChequesView } from "./ChequesView";

interface ValesViewProps {
  onRefreshStats?: () => void;
}

type FiltroStatus = "abertos" | "vencidos" | "a_vencer" | "quitados" | "cancelados" | "todos";

const PAGE_SIZE = 10;
const hojeIso = () => new Date().toISOString().slice(0, 10);

const diasEmAtraso = (vencimento?: string) => {
  if (!vencimento || vencimento >= hojeIso()) return 0;
  const inicio = new Date(`${vencimento}T12:00:00`).getTime();
  const fim = new Date(`${hojeIso()}T12:00:00`).getTime();
  return Math.max(0, Math.floor((fim - inicio) / 86_400_000));
};

const estaEmAberto = (vale: Venda) => vale.status === "pendente" && Number(vale.saldoRestante) > 0.005;

export function ValesView({ onRefreshStats }: ValesViewProps) {
  const [tab, setTab] = useState<"abertos" | "ordens" | "cheques">("abertos");
  const [vales, setVales] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ordens, setOrdens] = useState<OrdemCobranca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [valeDetalhado, setValeDetalhado] = useState<Venda | null>(null);
  const [numeroVale, setNumeroVale] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("abertos");
  const [vencimentoInicio, setVencimentoInicio] = useState("");
  const [vencimentoFim, setVencimentoFim] = useState("");
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [cobrancaAberta, setCobrancaAberta] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [ordensRefreshKey, setOrdensRefreshKey] = useState(0);
  const [ordemDetalhada, setOrdemDetalhada] = useState<OrdemCobranca | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.getVendas(), api.getClientes(), api.getOrdensCobranca()])
      .then(([vendas, listaClientes, listaOrdens]) => {
        if (!active) return;
        setVales(
          vendas
            .filter((venda) => Boolean(venda.vencimento))
            .sort((a, b) =>
              b.data.localeCompare(a.data)
              || Number(b.numeroSequencial) - Number(a.numeroSequencial)
              || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
            )
        );
        setClientes(listaClientes);
        setOrdens(listaOrdens);
      })
      .catch((err) => active && setError(err.message || "Não foi possível carregar os vales."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [numeroVale, clienteId, status, vencimentoInicio, vencimentoFim]);

  useEffect(() => {
    setSelecionados(new Set());
    if (clienteId) setStatus("abertos");
  }, [clienteId]);

  const clientesFiltro = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string }>(clientes.map((cliente) => [cliente.id, { id: cliente.id, nome: cliente.nome }]));
    vales.forEach((vale) => {
      if (!mapa.has(vale.clienteId)) mapa.set(vale.clienteId, { id: vale.clienteId, nome: vale.clienteNome || "Cliente não informado" });
    });
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [clientes, vales]);

  const valesFiltrados = useMemo(() => vales.filter((vale) => {
    const numeroBuscado = numeroVale.replace(/\D/g, "").replace(/^0+/, "");
    if (numeroBuscado && String(vale.numeroSequencial) !== numeroBuscado) return false;
    if (clienteId && vale.clienteId !== clienteId) return false;
    if (vencimentoInicio && (!vale.vencimento || vale.vencimento < vencimentoInicio)) return false;
    if (vencimentoFim && (!vale.vencimento || vale.vencimento > vencimentoFim)) return false;
    const aberto = estaEmAberto(vale);
    const atrasado = aberto && diasEmAtraso(vale.vencimento) > 0;
    if (status === "abertos" && !aberto) return false;
    if (status === "vencidos" && !atrasado) return false;
    if (status === "a_vencer" && (!aberto || atrasado)) return false;
    if (status === "quitados" && vale.status !== "paga") return false;
    if (status === "cancelados" && vale.status !== "cancelada") return false;
    return true;
  }), [vales, numeroVale, clienteId, status, vencimentoInicio, vencimentoFim]);

  const valesPagina = paginate<Venda>(valesFiltrados, page, PAGE_SIZE);
  const valesSelecionados = useMemo(() => vales.filter((vale) => selecionados.has(vale.id)), [vales, selecionados]);
  const clienteSelecionado = clientesFiltro.find((cliente) => cliente.id === clienteId);
  const valesDoCliente = useMemo(() => clienteId ? vales.filter((vale) => vale.clienteId === clienteId) : [], [vales, clienteId]);
  const ordemAtivaPorVale = useMemo(() => {
    const mapa = new Map<string, OrdemCobranca>();
    ordens.filter((ordem) => ordem.status === "aberta").forEach((ordem) => ordem.vales.filter((vale) => Number(vale.saldo) > 0.005).forEach((vale) => mapa.set(vale.vendaId, ordem)));
    return mapa;
  }, [ordens]);
  useEffect(() => {
    const ultimaPagina = Math.max(1, Math.ceil(valesFiltrados.length / PAGE_SIZE));
    setPage((paginaAtual) => Math.min(paginaAtual, ultimaPagina));
  }, [valesFiltrados.length]);

  const totais = useMemo(() => {
    const abertos = valesFiltrados.filter(estaEmAberto);
    const vencidos = abertos.filter((vale) => diasEmAtraso(vale.vencimento) > 0);
    return {
      aberto: abertos.reduce((total, vale) => total + Number(vale.saldoRestante), 0),
      vencido: vencidos.reduce((total, vale) => total + Number(vale.saldoRestante), 0),
      quantidadeVencida: vencidos.length,
    };
  }, [valesFiltrados]);

  const limparFiltros = () => {
    setNumeroVale("");
    setClienteId("");
    setStatus("abertos");
    setVencimentoInicio("");
    setVencimentoFim("");
    setSelecionados(new Set());
  };

  const alternarVale = (vale: Venda) => setSelecionados((atuais) => {
    const proximo = new Set(atuais);
    if (proximo.has(vale.id)) proximo.delete(vale.id); else proximo.add(vale.id);
    return proximo;
  });

  const abrirDetalhesVale = async (vale: Venda) => {
    setError("");
    try {
      let atualizado: Venda;
      try {
        atualizado = await api.getVenda(vale.id);
      } catch {
        const vendasAtualizadas = await api.getVendas();
        const valeAtualizado = vendasAtualizadas.find((item) => item.id === vale.id);
        if (!valeAtualizado) throw new Error("Vale não encontrado.");
        atualizado = valeAtualizado;
      }
      setVales((atuais) => atuais.map((item) => item.id === atualizado.id ? atualizado : item));
      setValeDetalhado(atualizado);
    } catch (err: any) {
      setError(err.message || "Não foi possível carregar as parcelas deste vale.");
    }
  };

  return (
    <section id="vales-view" className="space-y-5">
      {valeDetalhado && <ValeDetalhesModal vale={valeDetalhado} ordemCobranca={ordemAtivaPorVale.get(valeDetalhado.id)} onOpenOrdem={() => { const ordem = ordemAtivaPorVale.get(valeDetalhado.id); if (ordem) { setValeDetalhado(null); setOrdemDetalhada(ordem); } }} onClose={() => setValeDetalhado(null)} onUpdated={(atualizado) => { if (atualizado) { setVales((atuais) => atuais.map((vale) => vale.id === atualizado.id ? atualizado : vale)); setValeDetalhado(atualizado); api.getOrdensCobranca().then(setOrdens); } else { setVales((atuais) => atuais.map((vale) => vale.id === valeDetalhado.id ? { ...vale, status: "cancelada", saldoRestante: 0 } : vale)); setValeDetalhado(null); } onRefreshStats?.(); }} />}
      {ordemDetalhada && (
        <OrdemCobrancaDetalhesModal
          ordem={ordemDetalhada}
          onClose={() => setOrdemDetalhada(null)}
          onChanged={(atualizada) => {
            setOrdemDetalhada(atualizada);
            setOrdens((atuais) => atuais.map((ordem) => ordem.id === atualizada.id ? atualizada : ordem));
            api.getVendas().then((vendas) => setVales(vendas.filter((venda) => Boolean(venda.vencimento))));
          }}
        />
      )}
      {cobrancaAberta && clienteSelecionado && <CobrancaValesModal clienteId={clienteSelecionado.id} clienteNome={clienteSelecionado.nome} vales={valesSelecionados} valesDoCliente={valesDoCliente} onClose={() => { setCobrancaAberta(false); setSelecionados(new Set()); }} onSaved={(ordem) => { setOrdens((atuais) => [ordem, ...atuais]); setOrdensRefreshKey((atual) => atual + 1); }} />}
      {pagamentoAberto && clienteSelecionado && <PagamentoValesModal clienteId={clienteSelecionado.id} clienteNome={clienteSelecionado.nome} clienteDocumento={clientes.find((cliente) => cliente.id === clienteSelecionado.id)?.documento} vales={valesSelecionados} onClose={() => { setPagamentoAberto(false); setSelecionados(new Set()); }} onSaved={async () => { const [vendasAtualizadas, ordensAtualizadas] = await Promise.all([api.getVendas(), api.getOrdensCobranca()]); setVales(vendasAtualizadas.filter((venda) => Boolean(venda.vencimento))); setOrdens(ordensAtualizadas); onRefreshStats?.(); }} />}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Vales</h1>
        </div>
        <div className="grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:w-auto sm:gap-2">
          <button type="button" onClick={() => setTab("abertos")} className={`module-tab min-w-0 !gap-1 !px-2 !text-[11px] sm:!gap-2 sm:!px-3 sm:!text-sm ${tab === "abertos" ? "module-tab-active" : ""}`}><WalletCards size={16} /> Cobranças</button>
          <button type="button" onClick={() => setTab("ordens")} className={`module-tab min-w-0 !gap-1 !px-2 !text-[11px] sm:!gap-2 sm:!px-3 sm:!text-sm ${tab === "ordens" ? "module-tab-active" : ""}`}><FileClock size={16} /> Ordens</button>
          <button type="button" onClick={() => setTab("cheques")} className={`module-tab min-w-0 !gap-1 !px-2 !text-[11px] sm:!gap-2 sm:!px-3 sm:!text-sm ${tab === "cheques" ? "module-tab-active" : ""}`}><Landmark size={16} /> Cheques</button>
        </div>
      </div>

      {tab === "ordens" ? (
        <OrdensCobrancaView refreshKey={ordensRefreshKey} />
      ) : tab === "cheques" ? (
        <ChequesView
          onOpenVale={(vendaId) => {
            const vale = vales.find((item) => item.id === vendaId);
            if (vale) void abrirDetalhesVale(vale);
          }}
          onOpenOrdem={(ordemId) => {
            const ordem = ordens.find((item) => item.id === ordemId);
            if (ordem) setOrdemDetalhada(ordem);
          }}
          onChanged={() => {
            Promise.all([api.getVendas(), api.getOrdensCobranca()]).then(([vendasAtualizadas, ordensAtualizadas]) => {
              setVales(vendasAtualizadas.filter((venda) => Boolean(venda.vencimento)));
              setOrdens(ordensAtualizadas);
            });
          }}
        />
      ) : (
        <>
          <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xs font-black uppercase text-slate-700"><Filter size={16} /> Filtrar cobranças</h2><button type="button" onClick={limparFiltros} className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-slate-900"><X size={14} /> Limpar</button></div>
            <div className="grid grid-flow-row-dense grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-[10px] font-black uppercase text-slate-600">Número do vale<input data-testid="vale-filtro-numero" type="text" inputMode="numeric" value={numeroVale} onChange={(event) => setNumeroVale(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ex.: 123" className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950" /></label>
              <label className="col-span-2 text-[11px] font-black uppercase text-slate-600 md:col-span-1">Cliente<select value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold uppercase text-slate-950"><option value="">Todos os clientes</option>{clientesFiltro.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={status} onChange={(event) => setStatus(event.target.value as FiltroStatus)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950"><option value="abertos">Em aberto</option><option value="vencidos">Vencidos</option><option value="a_vencer">A vencer</option><option value="quitados">Quitados</option><option value="cancelados">Cancelados</option><option value="todos">Todos</option></select></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Vencimento de<input type="date" value={vencimentoInicio} onChange={(event) => setVencimentoInicio(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950" /></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Vencimento até<input type="date" value={vencimentoFim} onChange={(event) => setVencimentoFim(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950" /></label>
            </div>
          </div>

          {clienteId && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5">
            <div><p className="text-xs font-black uppercase text-emerald-950">Selecione os vales em aberto para cobrar</p><p className="text-xs font-bold text-emerald-700">{selecionados.size} selecionado(s) • {formatCurrency(valesSelecionados.reduce((total, vale) => total + Number(vale.saldoRestante), 0))}</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSelecionados(new Set(valesFiltrados.filter(estaEmAberto).map((vale) => vale.id)))} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-black uppercase text-emerald-900"><CheckSquare2 size={16}/> Selecionar abertos</button><button type="button" disabled={selecionados.size === 0} onClick={() => setPagamentoAberto(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"><Coins size={16}/> Registrar pagamento</button><button type="button" disabled={selecionados.size === 0} onClick={() => setCobrancaAberta(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"><MessageCircle size={16}/> Gerar ordem</button></div>
          </div>}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold uppercase text-slate-400">Documentos filtrados</p><p className="mt-2 text-2xl font-black text-slate-950">{valesFiltrados.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold uppercase text-slate-400">Saldo em aberto</p><p className="mt-2 text-2xl font-black text-slate-950">{formatCurrency(totais.aberto)}</p></div>
            <div className={`col-span-2 rounded-2xl border p-4 shadow-sm sm:col-span-1 ${totais.quantidadeVencida ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}><p className={`text-xs font-extrabold uppercase ${totais.quantidadeVencida ? "text-red-500" : "text-emerald-600"}`}>Saldo vencido</p><p className={`mt-2 text-2xl font-black ${totais.quantidadeVencida ? "text-red-800" : "text-emerald-800"}`}>{formatCurrency(totais.vencido)}</p><p className="mt-1 text-xs font-bold opacity-70">{totais.quantidadeVencida} {totais.quantidadeVencida === 1 ? "vale vencido" : "vales vencidos"}</p></div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500">Carregando vales...</div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertCircle size={18} /> {error}</div>
          ) : valesFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center"><HandCoins className="mx-auto text-emerald-600" size={34} /><p className="mt-3 font-extrabold text-emerald-950">Nenhum vale neste filtro</p></div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold uppercase text-slate-500"><tr>{clienteId && <th className="p-2 text-center">Cobrar</th>}<th className="p-2">Documento</th><th className="p-2">Cliente</th><th className="p-2">Emissão</th><th className="p-2">Situação</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Pago</th><th className="p-2">Último pagamento</th><th className="p-2 text-center">Ações</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {valesPagina.map((vale) => {
                        const atraso = diasEmAtraso(vale.vencimento);
                        const ordemAtiva = ordemAtivaPorVale.get(vale.id);
                        return <tr key={vale.id} className={selecionados.has(vale.id) ? "bg-emerald-50" : "hover:bg-slate-50"}>{clienteId && <td className="p-2 text-center"><input aria-label={`Selecionar vale ${vale.numeroSequencial}`} type="checkbox" checked={selecionados.has(vale.id)} disabled={!estaEmAberto(vale)} onChange={() => alternarVale(vale)} className="h-5 w-5 accent-emerald-700"/></td>}<td className="p-2"><span className="font-mono font-extrabold text-slate-700">#{vale.numeroSequencial}</span>{ordemAtiva && <button type="button" onClick={() => setOrdemDetalhada(ordemAtiva)} className="ml-2 rounded-md bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-800 hover:bg-blue-200">ORDEM #{ordemAtiva.numeroSequencial}</button>}</td><td className="p-2 font-extrabold text-slate-950">{vale.clienteNome || "Cliente não informado"}</td><td className="p-2 font-bold text-slate-700">{formatDate(vale.data)}</td><td className="p-2">{vale.status === "cancelada" ? <span className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-extrabold text-slate-700">Cancelado</span> : vale.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-extrabold text-emerald-700">Quitado</span> : atraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-extrabold text-red-700">{atraso} dias em atraso</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-700">A vencer</span>}</td><td className="p-2 text-right font-mono font-bold">{formatCurrency(vale.totalLiquido)}</td><td className="p-2 text-right font-mono text-blue-800">{formatCurrency(vale.valorPago)}</td><td className="p-2 font-bold text-slate-700">{vale.ultimoPagamentoData ? formatDate(vale.ultimoPagamentoData) : "—"}</td><td className="p-2 text-center"><button type="button" onClick={() => void abrirDetalhesVale(vale)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Eye size={15} /> Detalhes</button></td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-100 md:hidden">
                  {valesPagina.map((vale) => {
                    const atraso = diasEmAtraso(vale.vencimento);
                    const ordemAtiva = ordemAtivaPorVale.get(vale.id);
                    return <article key={vale.id} className={`space-y-2 p-3 ${selecionados.has(vale.id) ? "bg-emerald-50" : ""}`}><div className="flex items-start gap-3">{clienteId && <input aria-label={`Selecionar vale ${vale.numeroSequencial}`} type="checkbox" checked={selecionados.has(vale.id)} disabled={!estaEmAberto(vale)} onChange={() => alternarVale(vale)} className="mt-1 h-6 w-6 shrink-0 accent-emerald-700"/>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-400">VALE #{vale.numeroSequencial}</p>{ordemAtiva && <button type="button" onClick={() => setOrdemDetalhada(ordemAtiva)} className="mt-1 rounded-md bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-800">ORDEM #{ordemAtiva.numeroSequencial}</button>}<h2 className="mt-1 text-base font-black uppercase text-slate-950">{vale.clienteNome || "Cliente não informado"}</h2></div><div className="text-right"><p className="text-[9px] font-black uppercase text-slate-400">Total</p><p className="font-mono text-lg font-black text-slate-950">{formatCurrency(vale.totalLiquido)}</p></div></div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><span className="inline-flex items-center gap-1"><CalendarClock size={14} /> Emissão {formatDate(vale.data)}</span><span>Último pagamento: {vale.ultimoPagamentoData ? formatDate(vale.ultimoPagamentoData) : "—"}</span>{vale.status === "cancelada" ? <span className="rounded-lg bg-slate-200 px-2 py-1 text-slate-700">Cancelado</span> : vale.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-700">Quitado</span> : atraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-red-700">{atraso} dias em atraso</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-700">A vencer</span>}</div></div></div><button type="button" onClick={() => void abrirDetalhesVale(vale)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Eye size={15} /> Ver itens e comprovante</button></article>;
                  })}
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} totalItems={valesFiltrados.length} onPageChange={setPage} alwaysVisible />
              </div>
            </>
          )}

        </>
      )}
    </section>
  );
}
