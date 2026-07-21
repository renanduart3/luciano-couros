import React, { useState, useEffect } from "react";
import { DollarSign, TrendingUp, AlertTriangle, Calendar, Clock, ArrowUpRight, Phone } from "lucide-react";
import { DashboardStats } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";

interface DashboardViewProps {
  onNavigateToView: (view: string) => void;
  onSelectVenda?: (vendaId: string) => void; // Optional callback to view specific sale details
}

export function DashboardView({ onNavigateToView, onSelectVenda }: DashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboard();
      setStats(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados do painel.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        <p className="text-slate-500 mt-4 font-medium">Carregando painel financeiro...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-lg my-4">
        <h3 className="font-bold text-lg">Erro ao carregar dados</h3>
        <p className="mt-1 text-sm">{error}</p>
        <button 
          onClick={fetchStats}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Painel Principal</h2>
          <p className="text-slate-500 text-sm mt-0.5">Visão operacional e financeira em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onNavigateToView("venda-rapida")}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-950/10 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <DollarSign size={16} />
            Nova Venda
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* KPI 1: Vendas Hoje */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendas Hoje</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Calendar size={16} />
            </span>
          </div>
          <div className="mt-2.5 space-y-1">
            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-slate-900 tracking-tighter leading-none" title={formatCurrency(stats.vendas_hoje.total)}>
              {formatCurrency(stats.vendas_hoje.total)}
            </h3>
            <p className="text-xs text-emerald-600 font-semibold mt-1">
              {stats.vendas_hoje.count} {stats.vendas_hoje.count === 1 ? "venda realizada" : "vendas realizadas"}
            </p>
          </div>
        </div>

        {/* KPI 2: Recebido Hoje */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recebido Hoje</span>
            <span className="p-1.5 bg-sky-50 text-sky-700 rounded-lg">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="mt-2.5 space-y-1">
            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-slate-900 tracking-tighter leading-none" title={formatCurrency(stats.recebido_hoje)}>
              {formatCurrency(stats.recebido_hoje)}
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">Entradas em caixa hoje</p>
          </div>
        </div>

        {/* KPI 3: Valor Pendente */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">A Receber (Total)</span>
            <span className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="mt-2.5 space-y-1">
            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tighter text-amber-600 leading-none" title={formatCurrency(stats.valor_pendente)}>
              {formatCurrency(stats.valor_pendente)}
            </h3>
            <p className="text-xs text-amber-700 font-medium mt-1">Saldos pendentes ativos</p>
            {stats.valor_vencido > 0 && (
              <p className="text-[10px] text-red-600 font-bold">{formatCurrency(stats.valor_vencido)} já vencidos</p>
            )}
          </div>
        </div>

        {/* KPI 4: Vendas no Mês */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Faturado no Mês</span>
            <span className="p-1.5 bg-purple-50 text-purple-700 rounded-lg">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="mt-2.5 space-y-1">
            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-slate-900 tracking-tighter leading-none" title={formatCurrency(stats.vendas_mes.total)}>
              {formatCurrency(stats.vendas_mes.total)}
            </h3>
            <p className="text-xs text-purple-700 font-semibold mt-1">
              {stats.vendas_mes.count} {stats.vendas_mes.count === 1 ? "venda" : "vendas"}
            </p>
          </div>
        </div>

        {/* KPI 5: Lucro Bruto Mês */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lucro Bruto (Mês)</span>
            <span className="p-1.5 bg-teal-50 text-teal-700 rounded-lg">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="mt-2.5 space-y-1">
            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-emerald-600 tracking-tighter leading-none" title={formatCurrency(stats.lucro_mes)}>
              {formatCurrency(stats.lucro_mes)}
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">Lucro bruto sobre vendas</p>
          </div>
        </div>

        {/* KPI 6: Ticket Médio Mês */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ticket Médio</span>
            <span className="p-1.5 bg-rose-50 text-rose-700 rounded-lg">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="mt-2.5 space-y-1">
            <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-slate-900 tracking-tighter leading-none" title={formatCurrency(stats.ticket_medio_mes)}>
              {formatCurrency(stats.ticket_medio_mes)}
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">Valor médio por venda no mês</p>
          </div>
        </div>

      </div>

      {/* Main Panel grid: Left side is Alerts & Overdue, Right side is Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: Clients with Overdue Accounts */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Clientes com Pagamento Vencido
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Contas que exigem cobrança</p>
            </div>
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
              {stats.vencidos.length} {stats.vencidos.length === 1 ? "atraso" : "atrasos"}
            </span>
          </div>

          {stats.vencidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mb-3">
                <DollarSign size={24} />
              </div>
              <p className="text-sm font-semibold text-slate-800">Tudo em dia!</p>
              <p className="text-xs text-slate-400 mt-0.5">Não há clientes com pagamentos atrasados.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
              {stats.vencidos.map((venc) => (
                <div key={venc.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{venc.clienteNome}</h4>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500 mt-1">
                      <span className="font-semibold text-amber-700">Venda #{venc.numeroSequencial}</span>
                      <span>Vencimento: <strong className="text-red-600">{formatDate(venc.vencimento)}</strong></span>
                      {venc.clienteTelefone && (
                        <span className="flex items-center gap-1">
                          <Phone size={12} /> {venc.clienteTelefone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-medium">Saldo Restante</p>
                      <p className="text-sm font-extrabold text-red-600">{formatCurrency(venc.saldoRestante)}</p>
                    </div>
                    <button 
                      onClick={() => onNavigateToView("pagamentos")}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200/50 transition-all"
                    >
                      Receber
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Recent Sales */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Últimas Vendas</h3>
              <p className="text-xs text-slate-500 mt-0.5">Vendas finalizadas ou parciais de hoje e recentes</p>
            </div>
            <button 
              onClick={() => onNavigateToView("vendas")}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
            >
              Ver Todas <ArrowUpRight size={14} />
            </button>
          </div>

          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
            {stats.ultimas_vendas.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                Nenhuma venda registrada ainda.
              </div>
            ) : (
              stats.ultimas_vendas.map((venda) => (
                <div 
                  key={venda.id} 
                  onClick={() => onSelectVenda && onSelectVenda(venda.id)}
                  className="p-3.5 hover:bg-slate-50/80 rounded-xl border border-slate-100/50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">Venda #{venda.numeroSequencial}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        venda.status === "paga" 
                          ? "bg-emerald-100 text-emerald-800" 
                          : venda.status === "pendente" 
                          ? "bg-amber-100 text-amber-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {venda.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium truncate max-w-[180px]">{venda.clienteNome}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock size={10} /> {formatDate(venda.data)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-slate-900">{formatCurrency(venda.totalLiquido)}</p>
                    {venda.saldoRestante > 0 && (
                      <p className="text-[10px] font-medium text-amber-600">Falta {formatCurrency(venda.saldoRestante)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
