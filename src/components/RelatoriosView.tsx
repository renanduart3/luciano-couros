import React, { useState, useEffect } from "react";
import { 
  Calendar, FileSpreadsheet, Printer, TrendingUp, DollarSign, Percent, ArrowUpRight, ReceiptText, AlertTriangle
} from "lucide-react";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export function RelatoriosView() {
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Last 30 days by default
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    if (dataInicio > dataFim) {
      setError("A data inicial não pode ser posterior à data final.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rawData = await api.getRelatorios({ startDate: dataInicio, endDate: dataFim });
      
      // Calculate dynamic stats from raw data arrays
      const faturamentoTotal = rawData.vendas.reduce((acc: number, v: any) => acc + v.totalLiquido, 0);
      const custoTotal = rawData.itensVendidos.reduce((acc: number, item: any) => acc + item.custoTotal, 0);
      const lucroBruto = faturamentoTotal - custoTotal;
      const margemLucro = faturamentoTotal > 0 ? (lucroBruto / faturamentoTotal) * 100 : 0;
      const totalRecebidoPeriodo = rawData.pagamentos.reduce((acc: number, p: any) => acc + p.valor, 0);
      const descontosConcedidos = rawData.vendas.reduce((acc: number, v: any) => acc + Number(v.desconto || 0), 0);
      const ticketMedio = rawData.vendas.length > 0 ? faturamentoTotal / rawData.vendas.length : 0;

      const topProdutos = (rawData.rankings?.produtos || []).map((p: any) => ({
        descricao: p.descricao,
        totalReceita: p.totalValor,
        totalLucro: p.totalLucro,
        margem: p.totalValor > 0 ? (p.totalLucro / p.totalValor) * 100 : 0
      })).slice(0, 5);

      const topClientes = (rawData.rankings?.clientes || []).map((c: any) => ({
        clienteNome: c.clienteNome,
        clienteTelefone: c.clienteTelefone,
        totalComprado: c.totalComprado,
        saldoDevedor: c.saldoDevedor
      })).slice(0, 5);

      // Group daily billing chronologically
      const dailyMap: Record<string, number> = {};
      rawData.vendas.forEach((v: any) => {
        const dStr = formatDate(v.data);
        dailyMap[dStr] = (dailyMap[dStr] || 0) + v.totalLiquido;
      });
      const historicoFaturamento = Object.entries(dailyMap).map(([dateStr, total]) => ({
        dataStr: dateStr,
        total
      })).reverse();

      // Group payment methods
      const paymentMap: Record<string, number> = {};
      rawData.pagamentos.forEach((p: any) => {
        paymentMap[p.formaPagamento] = (paymentMap[p.formaPagamento] || 0) + p.valor;
      });
      const metodosPagamento = Object.entries(paymentMap).map(([metodo, total]) => ({
        metodo,
        total
      }));

      setReportData({
        resumo: {
          faturamentoTotal,
          custoTotal,
          lucroBruto,
          margemLucro,
          totalRecebidoPeriodo,
          descontosConcedidos,
          ticketMedio
        },
        carteiraVencida: rawData.carteiraVencida || { quantidade: 0, total: 0, ate7Dias: 0, de8a30Dias: 0, mais30Dias: 0 },
        topProdutos,
        topClientes,
        historicoFaturamento,
        metodosPagamento
      });
    } catch (err: any) {
      setError(err.message || "Erro ao gerar relatórios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [dataInicio, dataFim]);

  const handleExportCSV = () => {
    if (!reportData) return;
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    // Build the CSV string
    let csvContent = "\uFEFF"; // BOM for Excel encoding compatibility
    
    // 1. Title & Range
    csvContent += `RELATÓRIO FINANCEIRO GERENCIAL;;;\n`;
    csvContent += `Período:;${formatDate(dataInicio)} a ${formatDate(dataFim)};;\n\n`;

    // 2. Metrics Table
    csvContent += `MÉTRICA;VALOR;;\n`;
    csvContent += `Faturamento Líquido;${reportData.resumo.faturamentoTotal};;\n`;
    csvContent += `Lucro Bruto;${reportData.resumo.lucroBruto};;\n`;
    csvContent += `Margem Lucro;${reportData.resumo.margemLucro.toFixed(2).replace(".", ",")};%\n`;
    csvContent += `Ticket Médio;${reportData.resumo.ticketMedio};;\n`;
    csvContent += `Descontos Concedidos;${reportData.resumo.descontosConcedidos};;\n`;
    csvContent += `Total Recebido (Caixa);${reportData.resumo.totalRecebidoPeriodo};;\n`;
    csvContent += `Carteira Vencida Atual;${reportData.carteiraVencida.total};;\n\n`;

    // 3. Top Products
    csvContent += `RANKING: MATERIAIS POR LUCRO BRUTO;;;\n`;
    csvContent += `Posição;Descrição;Receita (R$);Lucro Bruto (R$);Margem (%)\n`;
    reportData.topProdutos.forEach((p: any, idx: number) => {
      csvContent += `${idx + 1};${csvCell(p.descricao)};${p.totalReceita};${p.totalLucro};${p.margem.toFixed(2).replace(".", ",")}\n`;
    });
    csvContent += `\n`;

    // 4. Top Clients
    csvContent += `RANKING: CLIENTES MAIORES COMPRADORES;;;\n`;
    csvContent += `Posição;Nome do Cliente;Telefone;Total Comprado (R$);Saldo Aberto (R$)\n`;
    reportData.topClientes.forEach((c: any, idx: number) => {
      csvContent += `${idx + 1};${csvCell(c.clienteNome)};${csvCell(c.clienteTelefone || "")};${c.totalComprado};${c.saldoDevedor}\n`;
    });

    // Download blob
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Relatorio_Luciano_Couros_${dataInicio}_${dataFim}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Relatórios Gerenciais</h2>
          <p className="text-slate-500 text-sm mt-0.5">Vendas, rentabilidade, recebimentos e saúde da carteira.</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200/50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold shadow-sm transition-colors"
          >
            <FileSpreadsheet size={16} /> Exportar Planilha (CSV)
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
          >
            <Printer size={16} /> Imprimir Relatório
          </button>
        </div>
      </div>

      {/* Date Filters - Hide on print */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row items-center gap-4 print:hidden">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Calendar size={16} className="text-slate-500" />
          Filtro do Período:
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="date" 
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-sm px-3.5 py-2 rounded-xl text-slate-900 outline-none font-bold focus:border-emerald-500"
          />
          <span className="text-slate-400 text-xs font-bold">até</span>
          <input 
            type="date" 
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-sm px-3.5 py-2 rounded-xl text-slate-900 outline-none font-bold focus:border-emerald-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Processando métricas e agregando gráficos...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : !reportData ? null : (
        <div className="space-y-8">
          
          {/* Printable Report Title Header */}
          <div className="hidden print:block text-center border-b border-dashed border-slate-200 pb-4 mb-6">
            <h1 className="text-xl font-bold uppercase tracking-tight">Relatório de Gestão Comercial</h1>
            <p className="text-xs text-slate-500">Luciano Couros</p>
            <p className="text-xs text-slate-400 mt-1">Período Selecionado: {formatDate(dataInicio)} a {formatDate(dataFim)}</p>
          </div>

          {/* KPI Widget Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-2 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendas Líquidas</span>
                <span className="p-1 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={14} /></span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-black text-slate-950 tracking-tighter leading-none" title={formatCurrency(reportData.resumo.faturamentoTotal)}>{formatCurrency(reportData.resumo.faturamentoTotal)}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Após descontos</p>
            </div>

            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-2 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ticket Médio</span>
                <span className="p-1 bg-blue-50 text-blue-600 rounded-lg"><ReceiptText size={14} /></span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-black text-slate-900 tracking-tighter leading-none" title={formatCurrency(reportData.resumo.ticketMedio)}>{formatCurrency(reportData.resumo.ticketMedio)}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Valor médio por venda</p>
            </div>

            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-2 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lucro Bruto</span>
                <span className="p-1 bg-teal-50 text-teal-700 rounded-lg"><DollarSign size={14} /></span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-black text-teal-600 tracking-tighter leading-none" title={formatCurrency(reportData.resumo.lucroBruto)}>{formatCurrency(reportData.resumo.lucroBruto)}</p>
              <p className="text-[10px] text-teal-500 font-bold flex items-center gap-1">
                <Percent size={12} /> Margem de {reportData.resumo.margemLucro.toFixed(1)}%
              </p>
            </div>

            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-2 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entradas Caixa</span>
                <span className="p-1 bg-emerald-50 text-emerald-600 rounded-lg"><ArrowUpRight size={14} /></span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-black text-emerald-700 tracking-tighter leading-none" title={formatCurrency(reportData.resumo.totalRecebidoPeriodo)}>{formatCurrency(reportData.resumo.totalRecebidoPeriodo)}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Total recebido</p>
            </div>

            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-2 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descontos</span>
                <span className="p-1 bg-amber-50 text-amber-600 rounded-lg"><Percent size={14} /></span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-black text-amber-600 tracking-tighter leading-none" title={formatCurrency(reportData.resumo.descontosConcedidos)}>{formatCurrency(reportData.resumo.descontosConcedidos)}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Concedidos no período</p>
            </div>

            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-2 overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carteira Vencida</span>
                <span className="p-1 bg-red-50 text-red-600 rounded-lg"><AlertTriangle size={14} /></span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-black text-red-600 tracking-tighter leading-none" title={formatCurrency(reportData.carteiraVencida.total)}>{formatCurrency(reportData.carteiraVencida.total)}</p>
              <p className="text-[10px] text-slate-400 font-semibold">{reportData.carteiraVencida.quantidade} contas atrasadas</p>
            </div>

          </div>

          {/* Charts Row - Hide on print if charts don't render perfectly */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
            
            {/* Daily billing curve */}
            <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Evolução do Faturamento Diário</h4>
              <div className="h-[280px] w-full">
                {reportData.historicoFaturamento.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">Sem dados de faturamento para o período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.historicoFaturamento} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="dataStr" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip formatter={(value) => [`R$ ${parseFloat(value as string).toFixed(2)}`, "Faturamento"]} />
                      <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFaturamento)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Compact cash and receivables summary */}
            <div className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Atrasos atuais</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2 text-amber-800"><span>Até 7 dias</span><strong>{formatCurrency(reportData.carteiraVencida.ate7Dias)}</strong></div>
                  <div className="flex justify-between rounded-lg bg-orange-50 px-3 py-2 text-orange-800"><span>8 a 30 dias</span><strong>{formatCurrency(reportData.carteiraVencida.de8a30Dias)}</strong></div>
                  <div className="flex justify-between rounded-lg bg-red-50 px-3 py-2 text-red-800"><span>Mais de 30 dias</span><strong>{formatCurrency(reportData.carteiraVencida.mais30Dias)}</strong></div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Recebimentos por meio</h4>
                {reportData.metodosPagamento.length === 0 ? (
                  <p className="text-slate-400 text-xs">Nenhum pagamento no período.</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {reportData.metodosPagamento.map((item: any) => (
                      <div key={item.metodo} className="flex justify-between items-center">
                        <span className="text-slate-500 font-semibold uppercase">{item.metodo.replace(/_/g, " ")}</span>
                        <strong className="text-slate-900">{formatCurrency(item.total)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Rankings Grid (Top Products / Top Clients) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Top Sold Materials */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp size={15} className="text-emerald-600" />
                Materiais por Lucro Bruto
              </h4>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                      <th className="p-3">Descrição do Material</th>
                      <th className="p-3 text-right">Receita</th>
                      <th className="p-3 text-right">Lucro Bruto</th>
                      <th className="p-3 text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {reportData.topProdutos.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 font-medium">Sem vendas no período.</td>
                      </tr>
                    ) : (
                      reportData.topProdutos.map((p: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/20">
                          <td className="p-3 font-semibold text-slate-900">{p.descricao}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(p.totalReceita)}</td>
                          <td className={`p-3 text-right font-mono font-extrabold ${p.totalLucro >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatCurrency(p.totalLucro)}</td>
                          <td className="p-3 text-right font-bold text-slate-700">{p.margem.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Buyers */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={15} className="text-emerald-600" />
                Clientes Maiores Compradores
              </h4>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                      <th className="p-3">Nome do Cliente</th>
                      <th className="p-3">Telefone</th>
                      <th className="p-3 text-right">Total Comprado</th>
                      <th className="p-3 text-right">Saldo Aberto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {reportData.topClientes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 font-medium">Sem compras registradas no período.</td>
                      </tr>
                    ) : (
                      reportData.topClientes.map((c: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/20">
                          <td className="p-3 font-bold text-slate-900">{c.clienteNome}</td>
                          <td className="p-3 text-slate-500 font-medium">{c.clienteTelefone || "-"}</td>
                          <td className="p-3 text-right font-mono font-extrabold text-emerald-800">{formatCurrency(c.totalComprado)}</td>
                          <td className={`p-3 text-right font-mono font-bold ${c.saldoDevedor > 0 ? "text-amber-700" : "text-slate-400"}`}>{formatCurrency(c.saldoDevedor)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
