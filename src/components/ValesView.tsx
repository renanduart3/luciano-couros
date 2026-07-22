import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, HandCoins, History, WalletCards } from "lucide-react";
import { Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { PagamentosView } from "./PagamentosView";

interface ValesViewProps {
  onRefreshStats?: () => void;
}

const hojeIso = () => new Date().toISOString().slice(0, 10);

const diasEmAtraso = (vencimento?: string) => {
  if (!vencimento || vencimento >= hojeIso()) return 0;
  const inicio = new Date(`${vencimento}T12:00:00`).getTime();
  const fim = new Date(`${hojeIso()}T12:00:00`).getTime();
  return Math.max(0, Math.floor((fim - inicio) / 86_400_000));
};

export function ValesView({ onRefreshStats }: ValesViewProps) {
  const [tab, setTab] = useState<"abertos" | "recebimentos">("abertos");
  const [vales, setVales] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getVendas()
      .then((vendas) => {
        if (!active) return;
        setVales(
          vendas
            .filter((venda) => venda.status === "pendente" && Number(venda.saldoRestante) > 0)
            .sort((a, b) => (a.vencimento || "9999-12-31").localeCompare(b.vencimento || "9999-12-31"))
        );
      })
      .catch((err) => active && setError(err.message || "Não foi possível carregar os vales."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const totais = useMemo(() => {
    const vencidos = vales.filter((vale) => diasEmAtraso(vale.vencimento) > 0);
    return {
      aberto: vales.reduce((total, vale) => total + Number(vale.saldoRestante), 0),
      vencido: vencidos.reduce((total, vale) => total + Number(vale.saldoRestante), 0),
      quantidadeVencida: vencidos.length,
    };
  }, [vales]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Vales</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Contas a receber, baixas e histórico financeiro dos clientes.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button type="button" onClick={() => setTab("abertos")} className={`module-tab ${tab === "abertos" ? "module-tab-active" : ""}`}><WalletCards size={17} /> Em aberto</button>
          <button type="button" onClick={() => setTab("recebimentos")} className={`module-tab ${tab === "recebimentos" ? "module-tab-active" : ""}`}><History size={17} /> Recebimentos</button>
        </div>
      </div>

      {tab === "recebimentos" ? (
        <PagamentosView onRefreshStats={onRefreshStats} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold uppercase text-slate-400">Vales em aberto</p><p className="mt-2 text-2xl font-black text-slate-950">{vales.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold uppercase text-slate-400">Saldo a receber</p><p className="mt-2 text-2xl font-black text-slate-950">{formatCurrency(totais.aberto)}</p></div>
            <div className={`rounded-2xl border p-4 shadow-sm ${totais.quantidadeVencida ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}><p className={`text-xs font-extrabold uppercase ${totais.quantidadeVencida ? "text-red-500" : "text-emerald-600"}`}>Saldo vencido</p><p className={`mt-2 text-2xl font-black ${totais.quantidadeVencida ? "text-red-800" : "text-emerald-800"}`}>{formatCurrency(totais.vencido)}</p><p className="mt-1 text-xs font-bold opacity-70">{totais.quantidadeVencida} {totais.quantidadeVencida === 1 ? "vale vencido" : "vales vencidos"}</p></div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500">Carregando vales...</div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertCircle size={18} /> {error}</div>
          ) : vales.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center"><HandCoins className="mx-auto text-emerald-600" size={34} /><p className="mt-3 font-extrabold text-emerald-950">Nenhum vale em aberto</p><p className="mt-1 text-sm text-emerald-800">Todos os débitos dos clientes estão quitados.</p></div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold uppercase text-slate-500"><tr><th className="p-4">Documento</th><th className="p-4">Cliente</th><th className="p-4">Emissão</th><th className="p-4">Vencimento</th><th className="p-4">Situação</th><th className="p-4 text-right">Saldo</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {vales.map((vale) => {
                      const atraso = diasEmAtraso(vale.vencimento);
                      return <tr key={vale.id} className="hover:bg-slate-50"><td className="p-4 font-mono font-extrabold text-slate-700">#{vale.numeroSequencial}</td><td className="p-4 font-extrabold text-slate-950">{vale.clienteNome || "Cliente não informado"}</td><td className="p-4 text-slate-600">{formatDate(vale.data)}</td><td className="p-4 text-slate-600">{vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"}</td><td className="p-4">{atraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-extrabold text-red-700">{atraso} dias em atraso</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-700">Em aberto</span>}</td><td className="p-4 text-right font-mono text-base font-black text-slate-950">{formatCurrency(vale.saldoRestante)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {vales.map((vale) => {
                  const atraso = diasEmAtraso(vale.vencimento);
                  return <article key={vale.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-400">VALE #{vale.numeroSequencial}</p><h2 className="mt-1 text-base font-black text-slate-950">{vale.clienteNome || "Cliente não informado"}</h2></div><p className="font-mono text-lg font-black text-slate-950">{formatCurrency(vale.saldoRestante)}</p></div><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500"><span className="inline-flex items-center gap-1"><CalendarClock size={14} /> {vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"}</span>{atraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-red-700">{atraso} dias em atraso</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-amber-700">Em aberto</span>}</div></article>;
                })}
              </div>
            </div>
          )}

          <button type="button" onClick={() => setTab("recebimentos")} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 font-extrabold text-white shadow-md hover:bg-emerald-700 sm:ml-auto sm:w-auto"><HandCoins size={18} /> Registrar recebimento</button>
        </>
      )}
    </section>
  );
}
