import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calendar, FileSpreadsheet, HandCoins, Printer, RefreshCw, ShoppingBag, TrendingUp, Truck, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { Cliente, Fornecedor, Produto } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";

type AbaRelatorio = "geral" | "clientes" | "fornecedores" | "vales";

const iso = (data: Date) => data.toISOString().slice(0, 10);
const inicioPadrao = () => { const data = new Date(); data.setDate(data.getDate() - 30); return iso(data); };
const hoje = () => iso(new Date());
const csvCelula = (valor: unknown) => `"${String(valor ?? "").replace(/"/g, '""')}"`;

export function RelatoriosView() {
  const [aba, setAba] = useState<AbaRelatorio>("geral");
  const [dataInicio, setDataInicio] = useState(inicioPadrao);
  const [dataFim, setDataFim] = useState(hoje);
  const [clienteId, setClienteId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [situacaoCliente, setSituacaoCliente] = useState("todos");
  const [valeStatus, setValeStatus] = useState("abertos");
  const [vencimentoInicio, setVencimentoInicio] = useState("");
  const [vencimentoFim, setVencimentoFim] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [dados, setDados] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getClientes(), api.getFornecedores(), api.getProdutos()])
      .then(([listaClientes, listaFornecedores, listaProdutos]) => {
        setClientes(listaClientes.filter((item) => item.ativo === 1));
        setFornecedores(listaFornecedores.filter((item) => item.ativo === 1));
        setProdutos(listaProdutos.filter((item) => item.ativo === 1));
      })
      .catch((err) => setError(err.message || "Não foi possível carregar os filtros."));
  }, []);

  const carregar = async () => {
    if (dataInicio && dataFim && dataInicio > dataFim) {
      setError("A data inicial não pode ser posterior à data final.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setDados(await api.getRelatorios({
        startDate: dataInicio,
        endDate: dataFim,
        clienteId: aba === "clientes" || aba === "vales" ? clienteId : undefined,
        fornecedorId: aba === "fornecedores" ? fornecedorId : undefined,
        produtoId: aba === "fornecedores" ? produtoId : undefined,
        formaPagamento: aba === "geral" ? formaPagamento : undefined,
        valeStatus: aba === "vales" ? valeStatus : undefined,
        vencimentoInicio: aba === "vales" ? vencimentoInicio : undefined,
        vencimentoFim: aba === "vales" ? vencimentoFim : undefined,
      }));
    } catch (err: any) {
      setError(err.message || "Erro ao gerar os relatórios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [aba, dataInicio, dataFim, clienteId, fornecedorId, produtoId, formaPagamento, valeStatus, vencimentoInicio, vencimentoFim]);

  const geral = useMemo(() => {
    if (!dados) return null;
    const faturamento = dados.vendas.reduce((total: number, venda: any) => total + Number(venda.totalLiquido), 0);
    const custo = dados.itensVendidos.reduce((total: number, item: any) => total + Number(item.custoTotal), 0);
    const recebido = dados.pagamentos.reduce((total: number, pagamento: any) => total + Number(pagamento.valor), 0);
    const lucro = faturamento - custo;
    const porDia = new Map<string, number>();
    dados.vendas.slice().reverse().forEach((venda: any) => porDia.set(venda.data, (porDia.get(venda.data) || 0) + Number(venda.totalLiquido)));
    const meios = new Map<string, number>();
    dados.pagamentos.forEach((pagamento: any) => meios.set(pagamento.formaPagamento, (meios.get(pagamento.formaPagamento) || 0) + Number(pagamento.valor)));
    return {
      faturamento, custo, recebido, lucro,
      margem: faturamento ? lucro / faturamento * 100 : 0,
      ticket: dados.vendas.length ? faturamento / dados.vendas.length : 0,
      vendas: dados.vendas.length,
      historico: [...porDia].map(([data, total]) => ({ data: formatDate(data), total })),
      meios: [...meios].map(([nome, total]) => ({ nome, total })),
      produtos: (dados.rankings?.produtos || []).slice(0, 10),
    };
  }, [dados]);

  const linhasClientes = useMemo(() => {
    const linhas = dados?.clientesResumo || [];
    if (situacaoCliente === "com_saldo") return linhas.filter((item: any) => Number(item.saldoDevedor) > 0);
    if (situacaoCliente === "com_bonus") return linhas.filter((item: any) => Number(item.saldoBonus) > 0);
    if (situacaoCliente === "sem_movimento") return linhas.filter((item: any) => Number(item.totalVendas) === 0);
    return linhas;
  }, [dados, situacaoCliente]);

  const linhasFornecedores = useMemo(() => {
    const mapa = new Map<string, any>();
    for (const item of dados?.comprasFornecedores || []) {
      const atual = mapa.get(item.fornecedorId) || { fornecedorId: item.fornecedorId, fornecedorNome: item.fornecedorNome, telefone: item.fornecedorTelefone, compras: new Map<string, number>(), produtos: new Set<string>(), itens: 0, ultimaCompra: "" };
      atual.compras.set(item.compraId, Number(item.totalCompra));
      atual.produtos.add(item.produtoId);
      atual.itens += 1;
      if (!atual.ultimaCompra || item.data > atual.ultimaCompra) atual.ultimaCompra = item.data;
      mapa.set(item.fornecedorId, atual);
    }
    return [...mapa.values()].map((item) => ({ ...item, quantidadeCompras: item.compras.size, totalComprado: [...item.compras.values()].reduce((a: number, b: number) => a + b, 0), quantidadeProdutos: item.produtos.size })).sort((a, b) => b.totalComprado - a.totalComprado);
  }, [dados]);

  const resumoVales = useMemo(() => {
    const vales = dados?.vales || [];
    return {
      quantidade: vales.length,
      totalOriginal: vales.reduce((total: number, vale: any) => total + Number(vale.totalLiquido), 0),
      saldo: vales.reduce((total: number, vale: any) => total + Number(vale.saldoRestante), 0),
      vencido: vales.filter((vale: any) => Number(vale.diasAtraso) > 0).reduce((total: number, vale: any) => total + Number(vale.saldoRestante), 0),
    };
  }, [dados]);

  const periodoRapido = (dias: number) => {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - dias);
    setDataInicio(iso(inicio));
    setDataFim(iso(fim));
  };

  const exportarCsv = () => {
    if (!dados) return;
    let csv = "\uFEFF";
    if (aba === "clientes") {
      csv += "CLIENTE;TELEFONE;VENDAS;TOTAL COMPRADO;RECEBIDO;SALDO DEVEDOR;BÔNUS;ÚLTIMA COMPRA\n";
      linhasClientes.forEach((item: any) => { csv += `${csvCelula(item.clienteNome)};${csvCelula(item.clienteTelefone)};${item.totalVendas};${item.totalComprado};${item.totalRecebido};${item.saldoDevedor};${item.saldoBonus};${item.ultimaCompra}\n`; });
    } else if (aba === "fornecedores") {
      csv += "FORNECEDOR;TELEFONE;COMPRAS;TOTAL COMPRADO;PRODUTOS;ÚLTIMA COMPRA\n";
      linhasFornecedores.forEach((item: any) => { csv += `${csvCelula(item.fornecedorNome)};${csvCelula(item.telefone)};${item.quantidadeCompras};${item.totalComprado};${item.quantidadeProdutos};${item.ultimaCompra}\n`; });
    } else if (aba === "vales") {
      csv += "DOCUMENTO;CLIENTE;EMISSÃO;VENCIMENTO;TOTAL;PAGO;SALDO;SITUAÇÃO;DIAS EM ATRASO\n";
      (dados.vales || []).forEach((item: any) => { csv += `${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.data};${item.vencimento};${item.totalLiquido};${item.valorPago};${item.saldoRestante};${item.status};${item.diasAtraso}\n`; });
    } else {
      csv += "MÉTRICA;VALOR\n";
      csv += `FATURAMENTO;${geral?.faturamento || 0}\nRECEBIDO;${geral?.recebido || 0}\nCUSTO;${geral?.custo || 0}\nLUCRO;${geral?.lucro || 0}\nMARGEM;${geral?.margem || 0}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_${aba}_${dataInicio}_${dataFim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const Card = ({ titulo, valor, destaque = "text-slate-950" }: { titulo: string; valor: string; destaque?: string }) => <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><p className="text-xs font-black text-slate-600">{titulo}</p><p className={`mt-2 text-xl font-black ${destaque}`}>{valor}</p></div>;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div><h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Relatórios</h1><p className="mt-1 text-sm font-bold text-slate-600">Consultas comerciais e financeiras separadas por área.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={exportarCsv} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-400 bg-white px-4 text-xs font-black text-slate-900"><FileSpreadsheet size={16} /> Exportar CSV</button><button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white"><Printer size={16} /> Imprimir</button></div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm sm:flex print:hidden">
        {([['geral', TrendingUp, 'Visão geral'], ['clientes', Users, 'Clientes'], ['fornecedores', Truck, 'Fornecedores'], ['vales', HandCoins, 'Vales']] as const).map(([id, Icone, nome]) => <button key={id} data-testid={`relatorio-aba-${id}`} onClick={() => { setAba(id); setClienteId(""); setFornecedorId(""); setProdutoId(""); }} className={`module-tab justify-center whitespace-nowrap ${aba === id ? "module-tab-active" : ""}`}><Icone size={17} />{nome}</button>)}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-black text-slate-700">EMISSÃO DE<input data-testid="relatorio-data-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 block min-h-11 rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950" /></label>
          <label className="text-xs font-black text-slate-700">ATÉ<input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="mt-1 block min-h-11 rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950" /></label>
          <div className="flex flex-wrap gap-2"><button onClick={() => periodoRapido(7)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">7 DIAS</button><button onClick={() => periodoRapido(30)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">30 DIAS</button><button onClick={() => periodoRapido(90)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">90 DIAS</button></div>
          <button onClick={carregar} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white"><RefreshCw size={16} />Atualizar</button>
        </div>

        {aba === "geral" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">FORMA DE PAGAMENTO<select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODAS</option><option value="avista_dinheiro">À VISTA DINHEIRO</option><option value="avista_debito">À VISTA DÉBITO</option><option value="pix">PIX</option><option value="cartao_credito">CARTÃO CRÉDITO</option><option value="cheque_emitente">CHEQUE EMITENTE</option><option value="cheque_terceiro">CHEQUE TERCEIRO</option></select></label></div>}
        {aba === "clientes" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-filtro-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS CLIENTES</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">SITUAÇÃO<select value={situacaoCliente} onChange={(e) => setSituacaoCliente(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="todos">TODOS</option><option value="com_saldo">COM SALDO DEVEDOR</option><option value="com_bonus">COM BÔNUS</option><option value="sem_movimento">SEM COMPRA NO PERÍODO</option></select></label></div>}
        {aba === "fornecedores" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">FORNECEDOR<select data-testid="relatorio-filtro-fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS FORNECEDORES</option>{fornecedores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">PRODUTO / MATERIAL<select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS PRODUTOS</option>{produtos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "vales" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-vale-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS CLIENTES</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">SITUAÇÃO<select data-testid="relatorio-vale-status" value={valeStatus} onChange={(e) => setValeStatus(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="todos">TODOS</option><option value="abertos">EM ABERTO</option><option value="vencidos">VENCIDOS</option><option value="a_vencer">A VENCER</option><option value="quitados">QUITADOS</option></select></label><label className="text-xs font-black text-slate-700">VENCIMENTO DE<input type="date" value={vencimentoInicio} onChange={(e) => setVencimentoInicio(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold" /></label><label className="text-xs font-black text-slate-700">VENCIMENTO ATÉ<input type="date" value={vencimentoFim} onChange={(e) => setVencimentoFim(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold" /></label></div>}
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 font-black text-red-900"><AlertTriangle size={18} />{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-300 bg-white p-12 text-center font-black text-slate-600">PROCESSANDO RELATÓRIO...</div> : dados && <>
        {aba === "geral" && geral && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card titulo="FATURAMENTO" valor={formatCurrency(geral.faturamento)} destaque="text-emerald-800" /><Card titulo="RECEBIDO NO PERÍODO" valor={formatCurrency(geral.recebido)} destaque="text-blue-800" /><Card titulo="LUCRO BRUTO" valor={formatCurrency(geral.lucro)} destaque={geral.lucro >= 0 ? "text-emerald-800" : "text-red-800"} /><Card titulo="MARGEM / TICKET" valor={`${geral.margem.toFixed(1)}% • ${formatCurrency(geral.ticket)}`} /></div><div className="grid gap-5 lg:grid-cols-[2fr_1fr]"><div className="rounded-2xl border border-slate-300 bg-white p-4"><h3 className="mb-4 font-black text-slate-950">FATURAMENTO POR DIA</h3><div className="h-72">{geral.historico.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={geral.historico}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(valor) => formatCurrency(Number(valor))} /><Area dataKey="total" stroke="#047857" fill="#d1fae5" /></AreaChart></ResponsiveContainer> : <p className="p-10 text-center font-bold text-slate-500">SEM VENDAS NO PERÍODO.</p>}</div></div><div className="rounded-2xl border border-slate-300 bg-white p-4"><h3 className="mb-4 font-black text-slate-950">RECEBIMENTOS POR MEIO</h3><div className="space-y-2">{geral.meios.map((item) => <div key={item.nome} className="flex justify-between gap-3 rounded-lg bg-slate-100 p-3 text-xs font-black"><span>{item.nome.replaceAll("_", " ")}</span><span>{formatCurrency(item.total)}</span></div>)}</div></div></div><div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white"><table className="w-full min-w-[650px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">MATERIAL</th><th className="p-3 text-right">VENDAS</th><th className="p-3 text-right">RECEITA</th><th className="p-3 text-right">CUSTO</th><th className="p-3 text-right">LUCRO</th></tr></thead><tbody className="divide-y">{geral.produtos.map((item: any) => <tr key={item.produtoId}><td className="p-3 font-black">{item.descricao}</td><td className="p-3 text-right">{item.totalVendas}</td><td className="p-3 text-right font-bold">{formatCurrency(item.totalValor)}</td><td className="p-3 text-right">{formatCurrency(item.totalCusto)}</td><td className="p-3 text-right font-black text-emerald-800">{formatCurrency(item.totalLucro)}</td></tr>)}</tbody></table></div></div>}

        {aba === "clientes" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card titulo="CLIENTES LISTADOS" valor={String(linhasClientes.length)} /><Card titulo="COMPRAS NO PERÍODO" valor={formatCurrency(linhasClientes.reduce((t: number, i: any) => t + Number(i.totalComprado), 0))} /><Card titulo="SALDO DEVEDOR ATUAL" valor={formatCurrency(linhasClientes.reduce((t: number, i: any) => t + Number(i.saldoDevedor), 0))} destaque="text-amber-800" /><Card titulo="BÔNUS ATUAL" valor={formatCurrency(linhasClientes.reduce((t: number, i: any) => t + Number(i.saldoBonus), 0))} destaque="text-emerald-800" /></div><TabelaClientes linhas={linhasClientes} /></div>}

        {aba === "fornecedores" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Card titulo="FORNECEDORES COM COMPRA" valor={String(linhasFornecedores.length)} /><Card titulo="COMPRAS REGISTRADAS" valor={String(linhasFornecedores.reduce((t: number, i: any) => t + i.quantidadeCompras, 0))} /><Card titulo="TOTAL COMPRADO" valor={formatCurrency(linhasFornecedores.reduce((t: number, i: any) => t + i.totalComprado, 0))} destaque="text-blue-800" /></div><TabelaFornecedores linhas={linhasFornecedores} /></div>}

        {aba === "vales" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card titulo="VALES LISTADOS" valor={String(resumoVales.quantidade)} /><Card titulo="VALOR ORIGINAL" valor={formatCurrency(resumoVales.totalOriginal)} /><Card titulo="SALDO EM ABERTO" valor={formatCurrency(resumoVales.saldo)} destaque="text-amber-800" /><Card titulo="SALDO VENCIDO" valor={formatCurrency(resumoVales.vencido)} destaque="text-red-800" /></div><TabelaVales linhas={dados.vales || []} /></div>}
      </>}
    </section>
  );
}

function TabelaClientes({ linhas }: { linhas: any[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">CLIENTE</th><th className="p-3 text-left">TELEFONE</th><th className="p-3 text-right">VENDAS</th><th className="p-3 text-right">COMPRADO</th><th className="p-3 text-right">RECEBIDO</th><th className="p-3 text-right">DÍVIDA ATUAL</th><th className="p-3 text-right">BÔNUS</th><th className="p-3 text-right">ÚLTIMA COMPRA</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item) => <tr key={item.clienteId}><td className="p-3 font-black text-slate-950">{item.clienteNome}</td><td className="p-3 font-bold text-slate-600">{item.clienteTelefone || "—"}</td><td className="p-3 text-right font-bold">{item.totalVendas}</td><td className="p-3 text-right font-black">{formatCurrency(item.totalComprado)}</td><td className="p-3 text-right text-blue-800">{formatCurrency(item.totalRecebido)}</td><td className="p-3 text-right font-black text-amber-800">{formatCurrency(item.saldoDevedor)}</td><td className="p-3 text-right font-black text-emerald-800">{formatCurrency(item.saldoBonus)}</td><td className="p-3 text-right">{item.ultimaCompra ? formatDate(item.ultimaCompra) : "—"}</td></tr>) : <tr><td colSpan={8} className="p-10 text-center font-bold text-slate-500">NENHUM CLIENTE NESTE FILTRO.</td></tr>}</tbody></table></div>;
}

function TabelaFornecedores({ linhas }: { linhas: any[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">FORNECEDOR</th><th className="p-3 text-left">TELEFONE</th><th className="p-3 text-right">COMPRAS</th><th className="p-3 text-right">PRODUTOS</th><th className="p-3 text-right">TOTAL COMPRADO</th><th className="p-3 text-right">ÚLTIMA COMPRA</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item) => <tr key={item.fornecedorId}><td className="p-3 font-black">{item.fornecedorNome}</td><td className="p-3 font-bold text-slate-600">{item.telefone || "—"}</td><td className="p-3 text-right">{item.quantidadeCompras}</td><td className="p-3 text-right">{item.quantidadeProdutos}</td><td className="p-3 text-right font-black text-blue-800">{formatCurrency(item.totalComprado)}</td><td className="p-3 text-right">{formatDate(item.ultimaCompra)}</td></tr>) : <tr><td colSpan={6} className="p-10 text-center font-bold text-slate-500">NENHUMA COMPRA DE FORNECEDOR NESTE FILTRO.</td></tr>}</tbody></table></div>;
}

function TabelaVales({ linhas }: { linhas: any[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">DOCUMENTO</th><th className="p-3 text-left">CLIENTE</th><th className="p-3 text-left">EMISSÃO</th><th className="p-3 text-left">VENCIMENTO</th><th className="p-3 text-right">TOTAL</th><th className="p-3 text-right">PAGO</th><th className="p-3 text-right">SALDO</th><th className="p-3 text-center">SITUAÇÃO</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item) => <tr key={item.id}><td className="p-3 font-mono font-black">#{item.numeroSequencial}</td><td className="p-3 font-black">{item.clienteNome}</td><td className="p-3">{formatDate(item.data)}</td><td className="p-3">{formatDate(item.vencimento)}</td><td className="p-3 text-right font-bold">{formatCurrency(item.totalLiquido)}</td><td className="p-3 text-right text-blue-800">{formatCurrency(item.valorPago)}</td><td className="p-3 text-right font-black text-amber-800">{formatCurrency(item.saldoRestante)}</td><td className="p-3 text-center">{item.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">QUITADO</span> : item.diasAtraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-800">{item.diasAtraso} DIAS ATRASADO</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">EM ABERTO</span>}</td></tr>) : <tr><td colSpan={8} className="p-10 text-center font-bold text-slate-500">NENHUM VALE NESTE FILTRO.</td></tr>}</tbody></table></div>;
}
