import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, FileSpreadsheet, HandCoins, KeyRound, Lock, Printer, RefreshCw, ShoppingCart, TrendingUp, Truck, Unlock, Users, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { Cliente, Fornecedor, Produto, SegurancaStatus, Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { ValeDetalhesModal } from "./ValeDetalhesModal";

type AbaRelatorio = "geral" | "vendas" | "clientes" | "fornecedores" | "vales";
type CategoriaItemCliente = "metros" | "unidades";

const iso = (data: Date) => data.toISOString().slice(0, 10);
const inicioPadrao = () => { const data = new Date(); data.setDate(data.getDate() - 30); return iso(data); };
const hoje = () => iso(new Date());
const csvCelula = (valor: unknown) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
const ehItemEmMetros = (item: { unidade?: string }) => String(item.unidade || "").toLocaleLowerCase("pt-BR").includes("metro");

function useListaProgressiva<T>(itens: T[], chaveReset: string, lote = 30) {
  const [limite, setLimite] = useState(lote);
  const marcadorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setLimite(lote); }, [chaveReset, lote]);
  useEffect(() => {
    if (limite >= itens.length || !marcadorRef.current) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) {
        setLimite((atual) => Math.min(atual + lote, itens.length));
      }
    }, { rootMargin: "500px 0px", threshold: 0.01 });
    observador.observe(marcadorRef.current);
    return () => observador.disconnect();
  }, [itens.length, limite, lote]);

  return {
    itensVisiveis: itens.slice(0, limite),
    marcadorRef,
    exibidos: Math.min(limite, itens.length),
    total: itens.length,
  };
}

function MarcadorListaProgressiva({ marcadorRef, exibidos, total }: { marcadorRef: React.RefObject<HTMLDivElement | null>; exibidos: number; total: number }) {
  if (total === 0) return null;
  return <div ref={marcadorRef} className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 print:hidden">{exibidos < total ? `Carregando mais registros… ${exibidos} de ${total}` : `${total} registro(s) exibido(s)`}</div>;
}

export function RelatoriosView() {
  const [aba, setAba] = useState<AbaRelatorio>("geral");
  const [dataInicio, setDataInicio] = useState(inicioPadrao);
  const [dataFim, setDataFim] = useState(hoje);
  const [clienteId, setClienteId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [valeStatus, setValeStatus] = useState("abertos");
  const [vencimentoInicio, setVencimentoInicio] = useState("");
  const [vencimentoFim, setVencimentoFim] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [dados, setDados] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);
  const [dadosClienteLiberados, setDadosClienteLiberados] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErro, setPinErro] = useState("");
  const [categoriaCliente, setCategoriaCliente] = useState<CategoriaItemCliente>("metros");
  const [valeDetalhado, setValeDetalhado] = useState<Venda | null>(null);

  useEffect(() => {
    Promise.all([api.getClientes(), api.getFornecedores(), api.getProdutos(), api.getSegurancaStatus()])
      .then(([listaClientes, listaFornecedores, listaProdutos, segurancaStatus]) => {
        // Relatórios históricos também precisam localizar clientes hoje inativos.
        setClientes(listaClientes);
        setFornecedores(listaFornecedores.filter((item) => item.ativo === 1));
        setProdutos(listaProdutos.filter((item) => item.ativo === 1));
        setSeguranca(segurancaStatus);
      })
      .catch((err) => setError(err.message || "Não foi possível carregar os filtros."));
  }, []);

  useEffect(() => {
    setDadosClienteLiberados(false);
    setCategoriaCliente("metros");
  }, [clienteId, dataInicio, dataFim]);

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
        clienteId: aba === "vendas" || aba === "clientes" || aba === "vales" ? clienteId : undefined,
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
      produtos: [...(dados.rankings?.produtos || [])].sort((a: any, b: any) =>
        Number(b.totalVendas) - Number(a.totalVendas) || Number(b.totalValor) - Number(a.totalValor)
      ),
    };
  }, [dados]);

  const linhasVendas = useMemo(() => {
    const linhas = (dados?.clientesResumo || []).filter((item: any) => Number(item.totalVendas) > 0);
    if (clienteId) return linhas;
    const total = linhas.reduce((resumo: any, item: any) => ({
      ...resumo,
      totalVendas: resumo.totalVendas + Number(item.totalVendas),
      totalComprado: resumo.totalComprado + Number(item.totalComprado),
      totalRecebido: resumo.totalRecebido + Number(item.totalRecebido),
      ultimaCompra: !resumo.ultimaCompra || item.ultimaCompra > resumo.ultimaCompra ? item.ultimaCompra : resumo.ultimaCompra,
    }), { clienteId: "todos", clienteCodigo: "—", clienteNome: "TODOS", totalVendas: 0, totalComprado: 0, totalRecebido: 0, ultimaCompra: "" });
    return [total, ...linhas];
  }, [dados, clienteId]);

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

  const analiseCliente = useMemo(() => {
    const itens = clienteId ? (dados?.itensVendidos || []) : [];
    const vendas = clienteId ? (dados?.vendas || []) : [];
    const itensMetros = itens.filter(ehItemEmMetros);
    const itensUnidades = itens.filter((item: any) => !ehItemEmMetros(item));
    const quantidadeMetros = itensMetros.reduce((total: number, item: any) => total + Number(item.quantidade), 0);
    const quantidadeUnidades = itensUnidades.reduce((total: number, item: any) => total + Number(item.quantidade), 0);
    const valorBruto = vendas.reduce((total: number, venda: any) => total + Number(venda.subtotal), 0);
    const desconto = vendas.reduce((total: number, venda: any) => total + Number(venda.desconto), 0);
    const valorLiquido = vendas.reduce((total: number, venda: any) => total + Number(venda.totalLiquido), 0);
    const custo = itens.reduce((total: number, item: any) => total + Number(item.custoTotal), 0);
    const lucro = valorLiquido - custo;
    return {
      itens, itensMetros, itensUnidades, quantidadeMetros, quantidadeUnidades,
      totalVendas: vendas.length, totalItensVenda: itens.length,
      valorBruto, desconto, valorLiquido, custo, lucro,
      margem: valorLiquido > 0 ? lucro / valorLiquido * 100 : 0
    };
  }, [dados, clienteId]);
  const resumoClienteGeral = useMemo(() => {
    const resumo = dados?.clienteResumoGeral || {};
    const valorLiquido = Number(resumo.valorLiquido || 0);
    const custo = Number(resumo.custoTotal || 0);
    return {
      totalVendas: Number(resumo.totalVendas || 0),
      totalItensVenda: Number(resumo.totalItensVenda || 0),
      quantidadeMetros: Number(resumo.quantidadeMetros || 0),
      quantidadeUnidades: Number(resumo.quantidadeUnidades || 0),
      valorLiquido,
      custo,
      lucro: valorLiquido - custo,
    };
  }, [dados]);
  const itensCategoriaCliente = categoriaCliente === "metros" ? analiseCliente.itensMetros : analiseCliente.itensUnidades;
  const chaveProgressiva = `${aba}:${dataInicio}:${dataFim}:${clienteId}:${fornecedorId}:${produtoId}:${formaPagamento}:${valeStatus}:${vencimentoInicio}:${vencimentoFim}`;
  const produtosProgressivos = useListaProgressiva<any>(geral?.produtos || [], `${chaveProgressiva}:produtos`, 20);
  const vendasProgressivas = useListaProgressiva<any>(linhasVendas, `${chaveProgressiva}:vendas`, 30);
  const clienteProgressivo = useListaProgressiva<any>(itensCategoriaCliente, `${chaveProgressiva}:cliente:${categoriaCliente}`, 40);
  const fornecedoresProgressivos = useListaProgressiva<any>(linhasFornecedores, `${chaveProgressiva}:fornecedores`, 30);
  const valesProgressivos = useListaProgressiva<Venda>(dados?.vales || [], `${chaveProgressiva}:vales`, 30);

  const desbloquearAnaliseCliente = async (event: React.FormEvent) => {
    event.preventDefault();
    setPinErro("");
    try {
      await api.verificarPinAdministrador(pin, "relatorio_cliente_custo_lucro");
      setDadosClienteLiberados(true);
      setPinOpen(false);
      setPin("");
    } catch (err: any) {
      setPinErro(err.message || "PIN inválido.");
    }
  };

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
    if (aba === "vendas") {
      csv += "CÓDIGO CLIENTE;CLIENTE;VENDAS;VALOR TOTAL;VALOR RECEBIDO;DATA DA ÚLTIMA VENDA\n";
      linhasVendas.forEach((item: any) => { csv += `${item.clienteCodigo || item.clienteId};${csvCelula(item.clienteNome)};${item.totalVendas};${item.totalComprado};${item.totalRecebido};${item.ultimaCompra}\n`; });
    } else if (aba === "clientes") {
      csv += dadosClienteLiberados
        ? "DATA;VENDA;CLIENTE;QUANTIDADE;UNIDADE;MATERIAL;PREÇO UNITÁRIO;VALOR DA VENDA;CUSTO;LUCRO;LUCRO POR QUANTIDADE;FORNECEDOR\n"
        : "DATA;VENDA;CLIENTE;QUANTIDADE;UNIDADE;MATERIAL;PREÇO UNITÁRIO\n";
      analiseCliente.itens.forEach((item: any) => {
        const lucro = Number(item.valorVendaLiquido) - Number(item.custoTotal);
        const lucroPorQuantidade = Number(item.quantidade) > 0 ? lucro / Number(item.quantidade) : 0;
        csv += dadosClienteLiberados
          ? `${item.data};${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.quantidade};${csvCelula(item.unidade)};${csvCelula(item.descricao)};${item.precoUnitario};${item.valorVendaLiquido};${item.custoTotal};${lucro};${lucroPorQuantidade};${csvCelula(item.fornecedorNome)}\n`
          : `${item.data};${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.quantidade};${csvCelula(item.unidade)};${csvCelula(item.descricao)};${item.precoUnitario}\n`;
      });
      csv += `\nTOTAL DE VENDAS;${analiseCliente.totalVendas}\nITENS DE VENDA;${analiseCliente.totalItensVenda}\nMETROS VENDIDOS;${analiseCliente.quantidadeMetros}\nUNIDADES / OUTROS;${analiseCliente.quantidadeUnidades}\nVALOR BRUTO;${analiseCliente.valorBruto}\nDESCONTO;${analiseCliente.desconto}\nVALOR LÍQUIDO;${analiseCliente.valorLiquido}\n`;
    } else if (aba === "fornecedores") {
      csv += "FORNECEDOR;TELEFONE;COMPRAS;TOTAL COMPRADO;PRODUTOS;ÚLTIMA COMPRA\n";
      linhasFornecedores.forEach((item: any) => { csv += `${csvCelula(item.fornecedorNome)};${csvCelula(item.telefone)};${item.quantidadeCompras};${item.totalComprado};${item.quantidadeProdutos};${item.ultimaCompra}\n`; });
    } else if (aba === "vales") {
      csv += "DOCUMENTO;CLIENTE;EMISSÃO;VENCIMENTO;TOTAL;PAGO;SALDO;SITUAÇÃO;DIAS EM ATRASO\n";
      (dados.vales || []).forEach((item: any) => { csv += `${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.data};${item.vencimento};${item.totalLiquido};${item.valorPago};${item.saldoRestante};${item.status};${item.diasAtraso}\n`; });
      csv += "\nITENS DOS VALES\nDOCUMENTO;CLIENTE;REFERÊNCIA;MATERIAL;QUANTIDADE;UNIDADE;PREÇO UNITÁRIO;TOTAL DO ITEM\n";
      (dados.vales || []).forEach((vale: any) => {
        (vale.items || []).forEach((item: any) => {
          csv += `${vale.numeroSequencial};${csvCelula(vale.clienteNome)};${csvCelula(item.referencia)};${csvCelula(item.descricao)};${item.quantidade};${csvCelula(item.unidade)};${item.precoUnitario};${item.total}\n`;
        });
      });
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
    <section id="relatorios-view" className="space-y-5">
      {valeDetalhado && <ValeDetalhesModal vale={valeDetalhado} onClose={() => setValeDetalhado(null)} />}
      {pinOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <form onSubmit={desbloquearAnaliseCliente} role="dialog" aria-modal="true" aria-labelledby="pin-relatorio-cliente" className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 p-5">
              <div className="flex gap-3"><span className="rounded-xl bg-slate-900 p-2 text-white"><KeyRound size={19} /></span><div><h3 id="pin-relatorio-cliente" className="font-black">Dados administrativos</h3><p className="mt-1 text-xs text-slate-500">Custo, lucro, fornecedor e margem.</p></div></div>
              <button type="button" aria-label="Fechar PIN" onClick={() => setPinOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              {seguranca?.pinConfigurado ? <input type="password" autoFocus value={pin} onChange={(event) => { setPin(event.target.value.slice(0, 64)); setPinErro(""); }} aria-label="Senha do gerente para o relatório de cliente" placeholder="Digite a senha do gerente" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-black tracking-widest" /> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">Configure a senha do gerente em Configurações.</p>}
              {pinErro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{pinErro}</p>}
            </div>
            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={() => setPinOpen(false)} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black">Cancelar</button>{seguranca?.pinConfigurado && <button type="submit" className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white">Desbloquear</button>}</div>
          </form>
        </div>
      )}
      <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div><h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Relatórios</h1><p className="mt-1 text-sm font-bold text-slate-600">Consultas comerciais e financeiras separadas por área.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={exportarCsv} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-400 bg-white px-4 text-xs font-black text-slate-900"><FileSpreadsheet size={16} /> Exportar CSV</button><button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white"><Printer size={16} /> Imprimir</button></div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm sm:flex print:hidden">
        {([['geral', TrendingUp, 'Visão geral'], ['vendas', ShoppingCart, 'Vendas'], ['clientes', Users, 'Clientes'], ['fornecedores', Truck, 'Fornecedores'], ['vales', HandCoins, 'Vales']] as const).map(([id, Icone, nome]) => <button key={id} data-testid={`relatorio-aba-${id}`} onClick={() => { setAba(id); setClienteId(""); setFornecedorId(""); setProdutoId(""); }} className={`module-tab justify-center whitespace-nowrap uppercase ${aba === id ? "module-tab-active" : ""}`}><Icone size={17} />{nome}</button>)}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-3 shadow-sm print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-[calc(50%-0.25rem)] min-w-0 text-xs font-black text-slate-700 md:w-auto">EMISSÃO DE<input data-testid="relatorio-data-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950" /></label>
          <label className="w-[calc(50%-0.25rem)] min-w-0 text-xs font-black text-slate-700 md:w-auto">ATÉ<input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950" /></label>
          {aba === "geral" && <label className="w-full text-xs font-black text-slate-700 md:w-56">FORMA DE PAGAMENTO<select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODAS</option><option value="avista_dinheiro">À VISTA DINHEIRO</option><option value="avista_debito">À VISTA DÉBITO</option><option value="pix">PIX</option><option value="cartao_credito">CARTÃO CRÉDITO</option><option value="cheque_emitente">CHEQUE EMITENTE</option><option value="cheque_terceiro">CHEQUE TERCEIRO</option></select></label>}
          <div className="flex flex-wrap gap-2"><button onClick={() => periodoRapido(7)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">7 DIAS</button><button onClick={() => periodoRapido(30)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">30 DIAS</button><button onClick={() => periodoRapido(90)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">90 DIAS</button></div>
          <button onClick={carregar} aria-label="Atualizar relatório" className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold uppercase text-slate-400 hover:border-slate-300 hover:text-slate-600"><RefreshCw size={15} />Atualizar</button>
        </div>

        {aba === "vendas" && <div className="grid gap-2 md:grid-cols-2"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-vendas-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "clientes" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-filtro-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">SELECIONE UM CLIENTE</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "fornecedores" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">FORNECEDOR<select data-testid="relatorio-filtro-fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS FORNECEDORES</option>{fornecedores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">PRODUTO / MATERIAL<select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS PRODUTOS</option>{produtos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "vales" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-vale-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS CLIENTES</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">SITUAÇÃO<select data-testid="relatorio-vale-status" value={valeStatus} onChange={(e) => setValeStatus(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="todos">TODOS</option><option value="abertos">EM ABERTO</option><option value="vencidos">VENCIDOS</option><option value="a_vencer">A VENCER</option><option value="quitados">QUITADOS</option></select></label><label className="text-xs font-black text-slate-700">VENCIMENTO DE<input type="date" value={vencimentoInicio} onChange={(e) => setVencimentoInicio(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold" /></label><label className="text-xs font-black text-slate-700">VENCIMENTO ATÉ<input type="date" value={vencimentoFim} onChange={(e) => setVencimentoFim(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold" /></label></div>}
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 font-black text-red-900"><AlertTriangle size={18} />{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-300 bg-white p-12 text-center font-black text-slate-600">PROCESSANDO RELATÓRIO...</div> : dados && <>
        {aba === "geral" && geral && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card titulo="FATURAMENTO" valor={formatCurrency(geral.faturamento)} destaque="text-emerald-800" />
              <Card titulo="RECEBIDO NO PERÍODO" valor={formatCurrency(geral.recebido)} destaque="text-blue-800" />
              <Card titulo="LUCRO BRUTO" valor={formatCurrency(geral.lucro)} destaque={geral.lucro >= 0 ? "text-emerald-800" : "text-red-800"} />
              <Card titulo="MARGEM / TICKET" valor={`${geral.margem.toFixed(1)}% • ${formatCurrency(geral.ticket)}`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
              <div className="rounded-2xl border border-slate-300 bg-white p-4">
                <h3 className="mb-4 font-black text-slate-950">FATURAMENTO POR DIA</h3>
                <div className="h-72">
                  {geral.historico.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={geral.historico}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="data" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip formatter={(valor) => formatCurrency(Number(valor))} />
                        <Area dataKey="total" stroke="#047857" fill="#d1fae5" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <p className="p-10 text-center font-bold text-slate-500">SEM VENDAS NO PERÍODO.</p>}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-300 bg-white p-4">
                <h3 className="mb-4 font-black text-slate-950">RECEBIMENTOS POR MEIO</h3>
                <div className="space-y-2">
                  {geral.meios.map((item) => <div key={item.nome} className="flex justify-between gap-3 rounded-lg bg-slate-100 p-3 text-xs font-black"><span>{item.nome.replaceAll("_", " ")}</span><span>{formatCurrency(item.total)}</span></div>)}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border-2 border-amber-400 bg-white shadow-lg shadow-amber-100">
              <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-gradient-to-r from-amber-100 via-yellow-50 to-white p-3">
                <div><h3 className="text-base font-black text-amber-950">MATERIAIS MAIS VENDIDOS</h3><p className="text-xs font-bold text-amber-800">Ranking por quantidade de vendas no período.</p></div>
                <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-slate-950">DESTAQUE</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-sm">
                  <thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">MATERIAL</th><th className="p-3 text-right">QUANTIDADE</th><th className="p-3 text-right">VENDAS</th><th className="p-3 text-right">RECEITA</th><th className="p-3 text-right">CUSTO</th><th className="p-3 text-right">LUCRO</th></tr></thead>
                  <tbody className="divide-y">{produtosProgressivos.itensVisiveis.length ? produtosProgressivos.itensVisiveis.map((item: any, index: number) => <tr key={`${item.produtoId}-${item.unidade}`} className={index < 3 ? "bg-amber-50/60" : ""}><td className="p-3 font-black"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] text-slate-950">{index + 1}</span>{item.descricao}</td><td className="whitespace-nowrap p-3 text-right font-mono font-black text-slate-800">{formatDecimal(Number(item.totalQuantidade))} <span className="text-[10px] uppercase text-slate-500">{item.unidade}</span></td><td className="p-3 text-right text-base font-black text-amber-900">{item.totalVendas}</td><td className="p-3 text-right font-bold">{formatCurrency(item.totalValor)}</td><td className="p-3 text-right">{formatCurrency(item.totalCusto)}</td><td className="p-3 text-right font-black text-emerald-800">{formatCurrency(item.totalLucro)}</td></tr>) : <tr><td colSpan={6} className="p-10 text-center font-bold text-slate-500">NENHUM MATERIAL VENDIDO NO PERÍODO.</td></tr>}</tbody>
                </table>
              </div>
              <MarcadorListaProgressiva {...produtosProgressivos} />
            </div>

          </div>
        )}

        {aba === "vendas" && <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-emerald-50 p-3"><h3 className="font-black text-emerald-950">VENDAS POR CLIENTE</h3><p className="text-xs font-bold text-emerald-800">Valores agregados conforme o período selecionado. A linha TODOS consolida a carteira.</p></div>
          <TabelaVendas linhas={vendasProgressivas.itensVisiveis} />
          <MarcadorListaProgressiva {...vendasProgressivas} />
        </div>}

        {aba === "clientes" && <div className="space-y-4">
          {!clienteId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Users size={34} className="mx-auto text-slate-300" /><p className="mt-3 font-black text-slate-700">Selecione um cliente para carregar os itens vendidos no período.</p></div>
          ) : (
            <>
              <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-3">
                <div><h3 className="font-black text-blue-950">TOTAL GERAL DO CLIENTE</h3><p className="text-xs font-bold text-blue-700">Histórico completo, sem limitar pelo filtro de datas.</p></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Card titulo="METROS VENDIDOS" valor={formatDecimal(resumoClienteGeral.quantidadeMetros)} destaque="text-emerald-800" /><Card titulo="UNIDADES / OUTROS" valor={formatDecimal(resumoClienteGeral.quantidadeUnidades)} /><Card titulo="VENDAS" valor={String(resumoClienteGeral.totalVendas)} /><Card titulo="ITENS DE VENDA" valor={String(resumoClienteGeral.totalItensVenda)} /><Card titulo="VALOR LÍQUIDO GERAL" valor={formatCurrency(resumoClienteGeral.valorLiquido)} destaque="text-blue-800" /></div>
              </section>
              <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-black text-slate-950">Itens vendidos para o cliente</h3><p className="mt-1 text-xs font-bold text-slate-500">{formatDate(dataInicio)} até {formatDate(dataFim)}</p></div>
                  {dadosClienteLiberados ? <button type="button" onClick={() => setDadosClienteLiberados(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-800"><Unlock size={15} /> Custo visível</button> : <button type="button" onClick={() => { setPin(""); setPinErro(""); setPinOpen(true); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Lock size={15} /> Custo</button>}
                </div>
                <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-white p-2 print:hidden"><button type="button" onClick={() => setCategoriaCliente("metros")} className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${categoriaCliente === "metros" ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"}`}>Vendidos em metros ({analiseCliente.itensMetros.length})</button><button type="button" onClick={() => setCategoriaCliente("unidades")} className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${categoriaCliente === "unidades" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}>Unidades / outros ({analiseCliente.itensUnidades.length})</button></div>
                <TabelaItensCliente linhas={clienteProgressivo.itensVisiveis} liberado={dadosClienteLiberados} />
                <MarcadorListaProgressiva {...clienteProgressivo} />
                <section className="space-y-3 border-t-2 border-slate-300 bg-slate-100 p-4">
                  <div><h4 className="font-black text-slate-950">TOTAL DO PERÍODO FILTRADO</h4><p className="text-xs font-bold text-slate-600">Somente vendas entre {formatDate(dataInicio)} e {formatDate(dataFim)}.</p></div>
                  <div className={`grid gap-2 text-xs font-black sm:grid-cols-2 ${dadosClienteLiberados ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}><span className="rounded-lg bg-white p-3">VENDAS: {analiseCliente.totalVendas}</span><span className="rounded-lg bg-white p-3">ITENS DE VENDA: {analiseCliente.totalItensVenda}</span><span className="rounded-lg bg-emerald-50 p-3 text-emerald-900">METROS: {formatDecimal(analiseCliente.quantidadeMetros)}</span><span className="rounded-lg bg-blue-50 p-3 text-blue-900">UNIDADES / OUTROS: {formatDecimal(analiseCliente.quantidadeUnidades)}</span><span className="rounded-lg bg-white p-3">VALOR BRUTO: {formatCurrency(analiseCliente.valorBruto)}</span><span className="rounded-lg bg-white p-3">DESCONTO: {formatCurrency(analiseCliente.desconto)}</span><span className="rounded-lg bg-white p-3">TOTAL LÍQUIDO: {formatCurrency(analiseCliente.valorLiquido)}</span>{dadosClienteLiberados && <><span className="rounded-lg bg-white p-3">CUSTO: {formatCurrency(analiseCliente.custo)}</span><span className="rounded-lg bg-emerald-50 p-3 text-emerald-900">LUCRO / MARGEM: {formatCurrency(analiseCliente.lucro)} • {analiseCliente.margem.toFixed(1)}%</span></>}</div>
                </section>
              </div>
            </>
          )}
        </div>}

        {aba === "fornecedores" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Card titulo="FORNECEDORES COM COMPRA" valor={String(linhasFornecedores.length)} /><Card titulo="COMPRAS REGISTRADAS" valor={String(linhasFornecedores.reduce((t: number, i: any) => t + i.quantidadeCompras, 0))} /><Card titulo="TOTAL COMPRADO" valor={formatCurrency(linhasFornecedores.reduce((t: number, i: any) => t + i.totalComprado, 0))} destaque="text-blue-800" /></div><div className="overflow-hidden rounded-2xl border border-slate-300 bg-white"><TabelaFornecedores linhas={fornecedoresProgressivos.itensVisiveis} /><MarcadorListaProgressiva {...fornecedoresProgressivos} /></div></div>}

        {aba === "vales" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card titulo="VALES LISTADOS" valor={String(resumoVales.quantidade)} /><Card titulo="VALOR ORIGINAL" valor={formatCurrency(resumoVales.totalOriginal)} /><Card titulo="SALDO EM ABERTO" valor={formatCurrency(resumoVales.saldo)} destaque="text-amber-800" /><Card titulo="SALDO VENCIDO" valor={formatCurrency(resumoVales.vencido)} destaque="text-red-800" /></div><div className="overflow-hidden rounded-2xl border border-slate-300 bg-white"><TabelaVales linhas={valesProgressivos.itensVisiveis} onDetalhes={setValeDetalhado} /><MarcadorListaProgressiva {...valesProgressivos} /></div></div>}
      </>}
    </section>
  );
}

function TabelaVendas({ linhas }: { linhas: any[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-2.5 text-left">CÓD. CLIENTE</th><th className="p-2.5 text-left">NOME CLIENTE</th><th className="p-2.5 text-right">VENDAS</th><th className="p-2.5 text-right">VALOR TOTAL DA VENDA</th><th className="p-2.5 text-right">VALOR RECEBIDO</th><th className="p-2.5 text-right">DATA DA VENDA</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item) => <tr key={item.clienteId} className={item.clienteId === "todos" ? "bg-emerald-100 text-emerald-950" : "hover:bg-slate-50"}><td className="p-2.5 font-mono font-black">{item.clienteCodigo || String(item.clienteId).slice(-6).toUpperCase()}</td><td className="p-2.5 font-black">{item.clienteNome}</td><td className="p-2.5 text-right font-black">{item.totalVendas}</td><td className="p-2.5 text-right font-mono text-base font-black">{formatCurrency(item.totalComprado)}</td><td className="p-2.5 text-right font-mono font-black text-blue-800">{formatCurrency(item.totalRecebido)}</td><td className="p-2.5 text-right font-bold">{item.ultimaCompra ? formatDate(item.ultimaCompra) : "—"}</td></tr>) : <tr><td colSpan={6} className="p-10 text-center font-bold text-slate-500">NENHUMA VENDA NESTE FILTRO.</td></tr>}</tbody></table></div>;
}

function TabelaItensCliente({ linhas, liberado }: { linhas: any[]; liberado: boolean }) {
  const colunas = liberado ? 12 : 6;
  return <div className="overflow-x-auto"><table className={`w-full text-xs ${liberado ? "min-w-[1180px]" : "min-w-[720px]"}`}><thead className="bg-white font-black uppercase text-slate-500"><tr><th className="p-2.5 text-left">Data</th><th className="p-2.5 text-left">Venda</th><th className="p-2.5 text-right">Qtd.</th><th className="p-2.5 text-left">Unid.</th><th className="p-2.5 text-left">Artigo / material</th><th className="p-2.5 text-right">V. unitário</th>{liberado && <><th className="p-2.5 text-right">V. venda</th><th className="bg-slate-100 p-2.5 text-right">Custo</th><th className="bg-slate-100 p-2.5 text-right">Lucro</th><th className="bg-slate-100 p-2.5 text-right">Lucro / qtd.</th><th className="bg-slate-100 p-2.5 text-left">Fornecedor</th><th className="bg-slate-100 p-2.5 text-right">Margem</th></>}</tr></thead><tbody className="divide-y divide-slate-200">{linhas.length ? linhas.map((item) => {
    const valorVenda = Number(item.valorVendaLiquido || 0);
    const custo = Number(item.custoTotal || 0);
    const lucro = valorVenda - custo;
    const lucroPorQuantidade = Number(item.quantidade) > 0 ? lucro / Number(item.quantidade) : 0;
    const margem = valorVenda > 0 ? lucro / valorVenda * 100 : 0;
    return <tr key={item.id} className="hover:bg-amber-50/50"><td className="p-2.5 font-mono">{formatDate(item.data)}</td><td className="p-2.5 font-mono font-black">#{item.numeroSequencial}</td><td className="p-2.5 text-right font-mono font-black">{Number(item.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td><td className="p-2.5 font-bold">{item.unidade}</td><td className="p-2.5 font-black text-slate-900">{item.descricao}</td><td className="p-2.5 text-right font-mono">{formatCurrency(item.precoUnitario)}</td>{liberado && <><td className="p-2.5 text-right font-mono font-black">{formatCurrency(valorVenda)}</td><td className="bg-slate-50 p-2.5 text-right font-mono">{formatCurrency(custo)}</td><td className="bg-slate-50 p-2.5 text-right font-mono font-black">{formatCurrency(lucro)}</td><td className="bg-slate-50 p-2.5 text-right font-mono font-black text-emerald-800">{formatCurrency(lucroPorQuantidade)}</td><td className="bg-slate-50 p-2.5 font-bold">{item.fornecedorNome || "Sem compra registrada"}</td><td className="bg-slate-50 p-2.5 text-right font-mono font-black">{margem.toFixed(1)}%</td></>}</tr>;
  }) : <tr><td colSpan={colunas} className="p-12 text-center font-bold text-slate-500">Nenhum item vendido para este cliente no período.</td></tr>}</tbody></table></div>;
}

function TabelaFornecedores({ linhas }: { linhas: any[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">FORNECEDOR</th><th className="p-3 text-left">TELEFONE</th><th className="p-3 text-right">COMPRAS</th><th className="p-3 text-right">PRODUTOS</th><th className="p-3 text-right">TOTAL COMPRADO</th><th className="p-3 text-right">ÚLTIMA COMPRA</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item) => <tr key={item.fornecedorId}><td className="p-3 font-black">{item.fornecedorNome}</td><td className="p-3 font-bold text-slate-600">{item.telefone || "—"}</td><td className="p-3 text-right">{item.quantidadeCompras}</td><td className="p-3 text-right">{item.quantidadeProdutos}</td><td className="p-3 text-right font-black text-blue-800">{formatCurrency(item.totalComprado)}</td><td className="p-3 text-right">{formatDate(item.ultimaCompra)}</td></tr>) : <tr><td colSpan={6} className="p-10 text-center font-bold text-slate-500">NENHUMA COMPRA DE FORNECEDOR NESTE FILTRO.</td></tr>}</tbody></table></div>;
}

function TabelaVales({ linhas, onDetalhes }: { linhas: Venda[]; onDetalhes: (vale: Venda) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">DOCUMENTO</th><th className="p-3 text-left">CLIENTE</th><th className="p-3 text-left">EMISSÃO</th><th className="p-3 text-left">VENCIMENTO</th><th className="p-3 text-right">TOTAL</th><th className="p-3 text-right">PAGO</th><th className="p-3 text-right">SALDO</th><th className="p-3 text-center">SITUAÇÃO</th><th className="p-3 text-center print:hidden">AÇÕES</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item: any) => <tr key={item.id}><td className="p-3 font-mono font-black">#{item.numeroSequencial}</td><td className="p-3 font-black">{item.clienteNome}</td><td className="p-3">{formatDate(item.data)}</td><td className="p-3">{formatDate(item.vencimento)}</td><td className="p-3 text-right font-bold">{formatCurrency(item.totalLiquido)}</td><td className="p-3 text-right text-blue-800">{formatCurrency(item.valorPago)}</td><td className="p-3 text-right font-black text-amber-800">{formatCurrency(item.saldoRestante)}</td><td className="p-3 text-center">{item.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">QUITADO</span> : item.diasAtraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-800">{item.diasAtraso} DIAS ATRASADO</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">EM ABERTO</span>}</td><td className="p-3 text-center print:hidden"><button type="button" onClick={() => onDetalhes(item)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Eye size={15} /> Detalhes</button></td></tr>) : <tr><td colSpan={9} className="p-10 text-center font-bold text-slate-500">NENHUM VALE NESTE FILTRO.</td></tr>}</tbody></table></div>;
}
