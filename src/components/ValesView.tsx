import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, Eye, Filter, HandCoins, History, WalletCards, X } from "lucide-react";
import { Cliente, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { CarteiraClienteView } from "./CarteiraClienteView";
import { ValeDetalhesModal } from "./ValeDetalhesModal";
import { Pagination, paginate } from "./Pagination";

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
  const [tab, setTab] = useState<"abertos" | "recebimentos">("abertos");
  const [vales, setVales] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [valeDetalhado, setValeDetalhado] = useState<Venda | null>(null);
  const [numeroVale, setNumeroVale] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("abertos");
  const [vencimentoInicio, setVencimentoInicio] = useState("");
  const [vencimentoFim, setVencimentoFim] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.getVendas(), api.getClientes()])
      .then(([vendas, listaClientes]) => {
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
        setClientes(listaClientes.filter((cliente) => cliente.ativo === 1));
      })
      .catch((err) => active && setError(err.message || "Não foi possível carregar os vales."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [numeroVale, clienteId, status, vencimentoInicio, vencimentoFim]);

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
  };

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
      {valeDetalhado && <ValeDetalhesModal vale={valeDetalhado} onClose={() => setValeDetalhado(null)} onUpdated={(atualizado) => { if (atualizado) { setVales((atuais) => atuais.map((vale) => vale.id === atualizado.id ? atualizado : vale)); setValeDetalhado(atualizado); } else { setVales((atuais) => atuais.map((vale) => vale.id === valeDetalhado.id ? { ...vale, status: "cancelada", saldoRestante: 0 } : vale)); setValeDetalhado(null); } onRefreshStats?.(); }} />}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Vales</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Cobrança, consulta e recebimento dos débitos dos clientes.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button type="button" onClick={() => setTab("abertos")} className={`module-tab ${tab === "abertos" ? "module-tab-active" : ""}`}><WalletCards size={17} /> Cobranças</button>
          <button type="button" onClick={() => setTab("recebimentos")} className={`module-tab ${tab === "recebimentos" ? "module-tab-active" : ""}`}><History size={17} /> Recebimentos</button>
        </div>
      </div>

      {tab === "recebimentos" ? (
        <CarteiraClienteView onRefreshStats={onRefreshStats} />
      ) : (
        <>
          <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xs font-black uppercase text-slate-700"><Filter size={16} /> Filtrar cobranças</h2><button type="button" onClick={limparFiltros} className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-slate-900"><X size={14} /> Limpar</button></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-[10px] font-black uppercase text-slate-600">Número do vale<input data-testid="vale-filtro-numero" type="text" inputMode="numeric" value={numeroVale} onChange={(event) => setNumeroVale(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ex.: 123" className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950" /></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Cliente<select value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950"><option value="">Todos os clientes</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={status} onChange={(event) => setStatus(event.target.value as FiltroStatus)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950"><option value="abertos">Em aberto</option><option value="vencidos">Vencidos</option><option value="a_vencer">A vencer</option><option value="quitados">Quitados</option><option value="cancelados">Cancelados</option><option value="todos">Todos</option></select></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Vencimento de<input type="date" value={vencimentoInicio} onChange={(event) => setVencimentoInicio(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950" /></label>
              <label className="text-[10px] font-black uppercase text-slate-600">Vencimento até<input type="date" value={vencimentoFim} onChange={(event) => setVencimentoFim(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-950" /></label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold uppercase text-slate-400">Documentos filtrados</p><p className="mt-2 text-2xl font-black text-slate-950">{valesFiltrados.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold uppercase text-slate-400">Saldo em aberto</p><p className="mt-2 text-2xl font-black text-slate-950">{formatCurrency(totais.aberto)}</p></div>
            <div className={`rounded-2xl border p-4 shadow-sm ${totais.quantidadeVencida ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}><p className={`text-xs font-extrabold uppercase ${totais.quantidadeVencida ? "text-red-500" : "text-emerald-600"}`}>Saldo vencido</p><p className={`mt-2 text-2xl font-black ${totais.quantidadeVencida ? "text-red-800" : "text-emerald-800"}`}>{formatCurrency(totais.vencido)}</p><p className="mt-1 text-xs font-bold opacity-70">{totais.quantidadeVencida} {totais.quantidadeVencida === 1 ? "vale vencido" : "vales vencidos"}</p></div>
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
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold uppercase text-slate-500"><tr><th className="p-3">Documento</th><th className="p-3">Cliente</th><th className="p-3">Vencimento</th><th className="p-3">Situação</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Pago</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-center">Ações</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {valesPagina.map((vale) => {
                        const atraso = diasEmAtraso(vale.vencimento);
                        return <tr key={vale.id} className="hover:bg-slate-50"><td className="p-3 font-mono font-extrabold text-slate-700">#{vale.numeroSequencial}</td><td className="p-3 font-extrabold text-slate-950">{vale.clienteNome || "Cliente não informado"}</td><td className="p-3 text-slate-600">{vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"}</td><td className="p-3">{vale.status === "cancelada" ? <span className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-extrabold text-slate-700">Cancelado</span> : vale.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-extrabold text-emerald-700">Quitado</span> : atraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-extrabold text-red-700">{atraso} dias em atraso</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-700">A vencer</span>}</td><td className="p-3 text-right font-mono font-bold">{formatCurrency(vale.totalLiquido)}</td><td className="p-3 text-right font-mono text-blue-800">{formatCurrency(vale.valorPago)}</td><td className="p-3 text-right font-mono text-base font-black text-slate-950">{formatCurrency(vale.saldoRestante)}</td><td className="p-3 text-center"><button type="button" onClick={() => void abrirDetalhesVale(vale)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Eye size={15} /> Detalhes</button></td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-100 md:hidden">
                  {valesPagina.map((vale) => {
                    const atraso = diasEmAtraso(vale.vencimento);
                    return <article key={vale.id} className="space-y-3 p-4"><div className="min-w-0"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-400">VALE #{vale.numeroSequencial}</p><h2 className="mt-1 text-base font-black text-slate-950">{vale.clienteNome || "Cliente não informado"}</h2></div><p className="font-mono text-lg font-black text-slate-950">{formatCurrency(vale.saldoRestante)}</p></div><div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><span className="inline-flex items-center gap-1"><CalendarClock size={14} /> {vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"}</span>{vale.status === "cancelada" ? <span className="rounded-lg bg-slate-200 px-2 py-1 text-slate-700">Cancelado</span> : vale.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-700">Quitado</span> : atraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-red-700">{atraso} dias em atraso</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-700">A vencer</span>}</div></div><button type="button" onClick={() => void abrirDetalhesVale(vale)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-black uppercase text-white"><Eye size={15} /> Ver itens e comprovante</button></article>;
                  })}
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} totalItems={valesFiltrados.length} onPageChange={setPage} alwaysVisible />
              </div>
            </>
          )}

          <button type="button" onClick={() => setTab("recebimentos")} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 font-extrabold text-white shadow-md hover:bg-emerald-700 sm:ml-auto sm:w-auto"><HandCoins size={18} /> Registrar recebimento</button>
        </>
      )}
    </section>
  );
}
