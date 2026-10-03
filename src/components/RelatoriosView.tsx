import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, FileSpreadsheet, HandCoins, KeyRound, Lock, Printer, RefreshCw, ShoppingCart, TrendingUp, Truck, Unlock, Users, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, RelatorioConsumoMateriais } from "../lib/api";
import { Cliente, Fornecedor, Produto, SegurancaStatus, Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { ValeDetalhesModal } from "./ValeDetalhesModal";
import { Pagination, paginate } from "./Pagination";

type AbaRelatorio = "geral" | "vendas" | "clientes" | "materiais_cliente" | "fornecedores" | "vales";
type CategoriaItemCliente = "metros" | "unidades";
type OpcaoOrdenacao = { value: string; label: string; administrativo?: boolean };
const VENDAS_POR_PAGINA = 20;
const MATERIAIS_POR_PAGINA = 30;

const ORDENACOES_RELATORIO: Record<AbaRelatorio, OpcaoOrdenacao[]> = {
  geral: [
    { value: "quantidade_desc", label: "Quantidade (maior)" }, { value: "quantidade_asc", label: "Quantidade (menor)" },
    { value: "nome_asc", label: "Material (A–Z)" }, { value: "nome_desc", label: "Material (Z–A)" },
    { value: "vendas_desc", label: "Nº de vendas (maior)" }, { value: "valor_desc", label: "Receita (maior)" },
    { value: "custo_desc", label: "Custo (maior)", administrativo: true }, { value: "lucro_desc", label: "Lucro (maior)", administrativo: true },
  ],
  vendas: [
    { value: "data_desc", label: "Data (mais recente)" }, { value: "data_asc", label: "Data (mais antiga)" },
    { value: "cliente_asc", label: "Cliente (A–Z)" }, { value: "cliente_desc", label: "Cliente (Z–A)" },
    { value: "valor_desc", label: "Valor (maior)" }, { value: "valor_asc", label: "Valor (menor)" },
    { value: "quantidade_desc", label: "Quantidade (maior)" }, { value: "custo_desc", label: "Custo (maior)", administrativo: true },
    { value: "lucro_desc", label: "Lucro (maior)", administrativo: true },
  ],
  clientes: [
    { value: "data_desc", label: "Data (mais recente)" }, { value: "data_asc", label: "Data (mais antiga)" },
    { value: "nome_asc", label: "Material (A–Z)" }, { value: "nome_desc", label: "Material (Z–A)" },
    { value: "quantidade_desc", label: "Quantidade (maior)" }, { value: "quantidade_asc", label: "Quantidade (menor)" },
    { value: "valor_desc", label: "Valor unitário (maior)" }, { value: "valor_asc", label: "Valor unitário (menor)" },
    { value: "lucro_desc", label: "Lucro (maior)", administrativo: true },
  ],
  materiais_cliente: [
    { value: "quantidade_desc", label: "Quantidade (maior)" }, { value: "quantidade_asc", label: "Quantidade (menor)" },
    { value: "material_asc", label: "Material (A–Z)" }, { value: "material_desc", label: "Material (Z–A)" },
    { value: "cliente_asc", label: "Cliente (A–Z)" }, { value: "cliente_desc", label: "Cliente (Z–A)" },
    { value: "codigo_asc", label: "Código (crescente)" }, { value: "vendas_desc", label: "Nº de vendas (maior)" },
    { value: "data_desc", label: "Última compra (recente)" }, { value: "data_asc", label: "Última compra (antiga)" },
    { value: "valor_desc", label: "Valor vendido (maior)" }, { value: "valor_asc", label: "Valor vendido (menor)" },
  ],
  fornecedores: [
    { value: "valor_desc", label: "Total comprado (maior)" }, { value: "valor_asc", label: "Total comprado (menor)" },
    { value: "nome_asc", label: "Fornecedor (A–Z)" }, { value: "nome_desc", label: "Fornecedor (Z–A)" },
    { value: "quantidade_desc", label: "Nº de compras (maior)" }, { value: "produtos_desc", label: "Nº de produtos (maior)" },
    { value: "data_desc", label: "Última compra (recente)" }, { value: "data_asc", label: "Última compra (antiga)" },
  ],
  vales: [
    { value: "vencimento_asc", label: "Vencimento (mais próximo)" }, { value: "vencimento_desc", label: "Vencimento (mais distante)" },
    { value: "emissao_desc", label: "Emissão (mais recente)" }, { value: "emissao_asc", label: "Emissão (mais antiga)" },
    { value: "cliente_asc", label: "Cliente (A–Z)" }, { value: "cliente_desc", label: "Cliente (Z–A)" },
    { value: "valor_desc", label: "Valor total (maior)" }, { value: "saldo_desc", label: "Saldo (maior)" },
    { value: "pago_desc", label: "Recebido (maior)" }, { value: "atraso_desc", label: "Dias em atraso (maior)" },
  ],
};

const ORDENACAO_PADRAO: Record<AbaRelatorio, string> = {
  geral: "quantidade_desc", vendas: "data_desc", clientes: "data_desc", materiais_cliente: "quantidade_desc",
  fornecedores: "valor_desc", vales: "vencimento_asc",
};
const compararTexto = (a: unknown, b: unknown) => String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true, sensitivity: "base" });
const compararNumero = (a: unknown, b: unknown) => Number(a || 0) - Number(b || 0);

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
  const [produtosRelatorio, setProdutosRelatorio] = useState<Produto[]>([]);
  const [dados, setDados] = useState<any | null>(null);
  const [dadosMateriais, setDadosMateriais] = useState<RelatorioConsumoMateriais | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMateriais, setLoadingMateriais] = useState(false);
  const [error, setError] = useState("");
  const [erroMateriais, setErroMateriais] = useState("");
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);
  const [dadosClienteLiberados, setDadosClienteLiberados] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErro, setPinErro] = useState("");
  const [categoriaCliente, setCategoriaCliente] = useState<CategoriaItemCliente>("metros");
  const [valeDetalhado, setValeDetalhado] = useState<Venda | null>(null);
  const [paginaVendas, setPaginaVendas] = useState(1);
  const [paginaMateriais, setPaginaMateriais] = useState(1);
  const [unidadeMateriais, setUnidadeMateriais] = useState("");
  const [ordenacoes, setOrdenacoes] = useState<Record<AbaRelatorio, string>>({ ...ORDENACAO_PADRAO });
  const ordenacaoAtual = ordenacoes[aba];

  useEffect(() => {
    Promise.all([api.getClientes(), api.getFornecedores(), api.getProdutos(), api.getSegurancaStatus()])
      .then(([listaClientes, listaFornecedores, listaProdutos, segurancaStatus]) => {
        // Relatórios históricos também precisam localizar clientes hoje inativos.
        setClientes(listaClientes);
        setFornecedores(listaFornecedores.filter((item) => item.ativo === 1));
        setProdutos(listaProdutos.filter((item) => item.ativo === 1));
        setProdutosRelatorio(listaProdutos);
        setSeguranca(segurancaStatus);
      })
      .catch((err) => setError(err.message || "Não foi possível carregar os filtros."));
  }, []);

  useEffect(() => {
    setDadosClienteLiberados(false);
    setCategoriaCliente("metros");
    setPaginaVendas(1);
  }, [clienteId, dataInicio, dataFim]);

  useEffect(() => { setPaginaVendas(1); }, [ordenacoes.vendas]);

  useEffect(() => { setPaginaMateriais(1); }, [dataInicio, dataFim, clienteId, produtoId, unidadeMateriais, ordenacoes.materiais_cliente]);

  const carregar = async () => {
    if (aba === "materiais_cliente") return;
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

  const carregarMateriais = async () => {
    if (aba !== "materiais_cliente") return;
    if (dataInicio && dataFim && dataInicio > dataFim) {
      setErroMateriais("A data inicial não pode ser posterior à data final.");
      return;
    }
    setLoadingMateriais(true);
    setErroMateriais("");
    try {
      const resposta = await api.getRelatorioConsumoMateriais({
        startDate: dataInicio,
        endDate: dataFim,
        clienteId: clienteId || undefined,
        produtoId: produtoId || undefined,
        unidade: unidadeMateriais || undefined,
        ordenacao: ordenacoes.materiais_cliente,
        page: paginaMateriais,
        pageSize: MATERIAIS_POR_PAGINA,
      });
      setDadosMateriais(resposta);
      if (resposta.page !== paginaMateriais) setPaginaMateriais(resposta.page);
    } catch (err: any) {
      setErroMateriais(err.message || "Erro ao analisar o consumo de materiais.");
    } finally {
      setLoadingMateriais(false);
    }
  };

  useEffect(() => { carregarMateriais(); }, [aba, dataInicio, dataFim, clienteId, produtoId, unidadeMateriais, ordenacoes.materiais_cliente, paginaMateriais]);

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
      produtos: [...(dados.rankings?.produtos || [])],
    };
  }, [dados]);

  const produtosGeraisOrdenados = useMemo(() => [...(geral?.produtos || [])].sort((a: any, b: any) => {
    if (ordenacaoAtual === "quantidade_asc") return compararNumero(a.totalQuantidade, b.totalQuantidade) || compararTexto(a.descricao, b.descricao);
    if (ordenacaoAtual === "nome_asc") return compararTexto(a.descricao, b.descricao);
    if (ordenacaoAtual === "nome_desc") return compararTexto(b.descricao, a.descricao);
    if (ordenacaoAtual === "vendas_desc") return compararNumero(b.totalVendas, a.totalVendas) || compararTexto(a.descricao, b.descricao);
    if (ordenacaoAtual === "valor_desc") return compararNumero(b.totalValor, a.totalValor) || compararTexto(a.descricao, b.descricao);
    if (ordenacaoAtual === "custo_desc") return compararNumero(b.totalCusto, a.totalCusto) || compararTexto(a.descricao, b.descricao);
    if (ordenacaoAtual === "lucro_desc") return compararNumero(b.totalLucro, a.totalLucro) || compararTexto(a.descricao, b.descricao);
    return compararNumero(b.totalQuantidade, a.totalQuantidade) || compararTexto(a.descricao, b.descricao);
  }), [geral, ordenacaoAtual]);

  const linhasVendas = useMemo(() => {
    const itensPorVenda = new Map<string, any[]>();
    for (const item of dados?.itensVendidos || []) itensPorVenda.set(item.vendaId, [...(itensPorVenda.get(item.vendaId) || []), item]);
    const linhas = (dados?.vendas || []).map((venda: any) => {
      const itens = itensPorVenda.get(venda.id) || [];
      const itensMetros = itens.filter(ehItemEmMetros);
      const itensUnidades = itens.filter((item: any) => !ehItemEmMetros(item));
      const metragem = itensMetros.reduce((total: number, item: any) => total + Number(item.quantidade || 0), 0);
      const unidades = itensUnidades.reduce((total: number, item: any) => total + Number(item.quantidade || 0), 0);
      const baseValorMetros = itensMetros.reduce((total: number, item: any) => total + Number(item.valorVendaLiquido || 0), 0);
      const baseValorUnidades = itensUnidades.reduce((total: number, item: any) => total + Number(item.valorVendaLiquido || 0), 0);
      const custo = itens.reduce((total: number, item: any) => total + Number(item.custoTotal || 0), 0);
      const totalVenda = Number(venda.totalLiquido || 0);
      const baseValorItens = baseValorMetros + baseValorUnidades;
      // Concilia descontos e arredondamentos para que os dois grupos sempre
      // recomponham exatamente o valor total registrado na venda.
      const fatorConciliacao = baseValorItens > 0 ? totalVenda / baseValorItens : 0;
      const valorMetros = baseValorMetros * fatorConciliacao;
      const valorUnidades = baseValorUnidades * fatorConciliacao;
      return { ...venda, metragem, unidades, valorMetros, valorUnidades, custo, lucro: totalVenda - custo };
    });
    return linhas.sort((a: any, b: any) => {
      if (ordenacaoAtual === "data_asc") return compararTexto(a.data, b.data) || compararNumero(a.numeroSequencial, b.numeroSequencial);
      if (ordenacaoAtual === "cliente_asc") return compararTexto(a.clienteNome, b.clienteNome) || compararTexto(b.data, a.data);
      if (ordenacaoAtual === "cliente_desc") return compararTexto(b.clienteNome, a.clienteNome) || compararTexto(b.data, a.data);
      if (ordenacaoAtual === "valor_desc") return compararNumero(b.totalLiquido, a.totalLiquido) || compararTexto(b.data, a.data);
      if (ordenacaoAtual === "valor_asc") return compararNumero(a.totalLiquido, b.totalLiquido) || compararTexto(b.data, a.data);
      if (ordenacaoAtual === "quantidade_desc") return compararNumero(Number(b.metragem) + Number(b.unidades), Number(a.metragem) + Number(a.unidades)) || compararTexto(b.data, a.data);
      if (ordenacaoAtual === "custo_desc") return compararNumero(b.custo, a.custo) || compararTexto(b.data, a.data);
      if (ordenacaoAtual === "lucro_desc") return compararNumero(b.lucro, a.lucro) || compararTexto(b.data, a.data);
      return compararTexto(b.data, a.data) || compararNumero(b.numeroSequencial, a.numeroSequencial);
    });
  }, [dados, ordenacaoAtual]);

  const resumoVendas = useMemo(() => linhasVendas.reduce((resumo: any, venda: any) => ({
    quantidade: resumo.quantidade + 1,
    valorBruto: resumo.valorBruto + Number(venda.subtotal || 0),
    desconto: resumo.desconto + Number(venda.desconto || 0),
    total: resumo.total + Number(venda.totalLiquido || 0),
    metragem: resumo.metragem + Number(venda.metragem || 0),
    unidades: resumo.unidades + Number(venda.unidades || 0),
    valorMetros: resumo.valorMetros + Number(venda.valorMetros || 0),
    valorUnidades: resumo.valorUnidades + Number(venda.valorUnidades || 0),
    custo: resumo.custo + Number(venda.custo || 0),
    lucro: resumo.lucro + Number(venda.lucro || 0),
  }), { quantidade: 0, valorBruto: 0, desconto: 0, total: 0, metragem: 0, unidades: 0, valorMetros: 0, valorUnidades: 0, custo: 0, lucro: 0 }), [linhasVendas]);

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
    return [...mapa.values()].map((item) => ({ ...item, quantidadeCompras: item.compras.size, totalComprado: [...item.compras.values()].reduce((a: number, b: number) => a + b, 0), quantidadeProdutos: item.produtos.size })).sort((a, b) => {
      if (ordenacaoAtual === "valor_asc") return compararNumero(a.totalComprado, b.totalComprado) || compararTexto(a.fornecedorNome, b.fornecedorNome);
      if (ordenacaoAtual === "nome_asc") return compararTexto(a.fornecedorNome, b.fornecedorNome);
      if (ordenacaoAtual === "nome_desc") return compararTexto(b.fornecedorNome, a.fornecedorNome);
      if (ordenacaoAtual === "quantidade_desc") return compararNumero(b.quantidadeCompras, a.quantidadeCompras) || compararTexto(a.fornecedorNome, b.fornecedorNome);
      if (ordenacaoAtual === "produtos_desc") return compararNumero(b.quantidadeProdutos, a.quantidadeProdutos) || compararTexto(a.fornecedorNome, b.fornecedorNome);
      if (ordenacaoAtual === "data_desc") return compararTexto(b.ultimaCompra, a.ultimaCompra) || compararTexto(a.fornecedorNome, b.fornecedorNome);
      if (ordenacaoAtual === "data_asc") return compararTexto(a.ultimaCompra, b.ultimaCompra) || compararTexto(a.fornecedorNome, b.fornecedorNome);
      return compararNumero(b.totalComprado, a.totalComprado) || compararTexto(a.fornecedorNome, b.fornecedorNome);
    });
  }, [dados, ordenacaoAtual]);

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
  const itensClienteOrdenados = useMemo(() => [...analiseCliente.itens].sort((a: any, b: any) => {
    const ordenacao = ordenacoes.clientes;
    const lucroA = Number(a.valorVendaLiquido || 0) - Number(a.custoTotal || 0);
    const lucroB = Number(b.valorVendaLiquido || 0) - Number(b.custoTotal || 0);
    if (ordenacao === "data_asc") return compararTexto(a.data, b.data) || compararNumero(a.numeroSequencial, b.numeroSequencial);
    if (ordenacao === "nome_asc") return compararTexto(a.descricao, b.descricao) || compararTexto(b.data, a.data);
    if (ordenacao === "nome_desc") return compararTexto(b.descricao, a.descricao) || compararTexto(b.data, a.data);
    if (ordenacao === "quantidade_desc") return compararNumero(b.quantidade, a.quantidade) || compararTexto(b.data, a.data);
    if (ordenacao === "quantidade_asc") return compararNumero(a.quantidade, b.quantidade) || compararTexto(b.data, a.data);
    if (ordenacao === "valor_desc") return compararNumero(b.precoUnitario, a.precoUnitario) || compararTexto(b.data, a.data);
    if (ordenacao === "valor_asc") return compararNumero(a.precoUnitario, b.precoUnitario) || compararTexto(b.data, a.data);
    if (ordenacao === "lucro_desc") return compararNumero(lucroB, lucroA) || compararTexto(b.data, a.data);
    return compararTexto(b.data, a.data) || compararNumero(b.numeroSequencial, a.numeroSequencial);
  }), [analiseCliente.itens, ordenacoes.clientes]);
  const itensCategoriaCliente = itensClienteOrdenados.filter((item: any) => categoriaCliente === "metros" ? ehItemEmMetros(item) : !ehItemEmMetros(item));

  const valesOrdenados = useMemo(() => [...(dados?.vales || [])].sort((a: any, b: any) => {
    const ordenacao = ordenacoes.vales;
    if (ordenacao === "vencimento_desc") return compararTexto(b.vencimento, a.vencimento) || compararTexto(b.data, a.data);
    if (ordenacao === "emissao_desc") return compararTexto(b.data, a.data) || compararNumero(b.numeroSequencial, a.numeroSequencial);
    if (ordenacao === "emissao_asc") return compararTexto(a.data, b.data) || compararNumero(a.numeroSequencial, b.numeroSequencial);
    if (ordenacao === "cliente_asc") return compararTexto(a.clienteNome, b.clienteNome) || compararTexto(a.vencimento, b.vencimento);
    if (ordenacao === "cliente_desc") return compararTexto(b.clienteNome, a.clienteNome) || compararTexto(a.vencimento, b.vencimento);
    if (ordenacao === "valor_desc") return compararNumero(b.totalLiquido, a.totalLiquido) || compararTexto(a.vencimento, b.vencimento);
    if (ordenacao === "saldo_desc") return compararNumero(b.saldoRestante, a.saldoRestante) || compararTexto(a.vencimento, b.vencimento);
    if (ordenacao === "pago_desc") return compararNumero(b.valorPago, a.valorPago) || compararTexto(a.vencimento, b.vencimento);
    if (ordenacao === "atraso_desc") return compararNumero(b.diasAtraso, a.diasAtraso) || compararTexto(a.vencimento, b.vencimento);
    return compararTexto(a.vencimento, b.vencimento) || compararTexto(b.data, a.data);
  }), [dados, ordenacoes.vales]);

  const chaveProgressiva = `${aba}:${dataInicio}:${dataFim}:${clienteId}:${fornecedorId}:${produtoId}:${formaPagamento}:${valeStatus}:${vencimentoInicio}:${vencimentoFim}:${ordenacaoAtual}`;
  const produtosProgressivos = useListaProgressiva<any>(produtosGeraisOrdenados, `${chaveProgressiva}:produtos`, 20);
  const vendasPaginadas = paginate<any>(linhasVendas, paginaVendas, VENDAS_POR_PAGINA);
  const clienteProgressivo = useListaProgressiva<any>(itensCategoriaCliente, `${chaveProgressiva}:cliente:${categoriaCliente}`, 40);
  const fornecedoresProgressivos = useListaProgressiva<any>(linhasFornecedores, `${chaveProgressiva}:fornecedores`, 30);
  const valesProgressivos = useListaProgressiva<Venda>(valesOrdenados, `${chaveProgressiva}:vales`, 30);

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
      recebido: vales.reduce((total: number, vale: any) => total + Number(vale.valorPago), 0),
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

  const exportarCsv = async () => {
    if (!dados && aba !== "materiais_cliente") return;
    let csv = "\uFEFF";
    if (aba === "vendas") {
      csv += "CÓD. VENDA;CLIENTE;VALOR TOTAL;M;R$ METRO;UN;R$ UN;CUSTO;LUCRO;DATA\n";
      linhasVendas.forEach((item: any) => { csv += `${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.totalLiquido};${item.metragem};${item.valorMetros};${item.unidades};${item.valorUnidades};${item.custo};${item.lucro};${item.data}\n`; });
    } else if (aba === "clientes") {
      csv += dadosClienteLiberados
        ? "DATA;VENDA;CLIENTE;QUANTIDADE;UNIDADE;MATERIAL;PREÇO UNITÁRIO;VALOR DA VENDA;CUSTO;LUCRO;LUCRO POR QUANTIDADE;FORNECEDOR\n"
        : "DATA;VENDA;CLIENTE;QUANTIDADE;UNIDADE;MATERIAL;PREÇO UNITÁRIO\n";
      itensClienteOrdenados.forEach((item: any) => {
        const lucro = Number(item.valorVendaLiquido) - Number(item.custoTotal);
        const lucroPorQuantidade = Number(item.quantidade) > 0 ? lucro / Number(item.quantidade) : 0;
        csv += dadosClienteLiberados
          ? `${item.data};${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.quantidade};${csvCelula(item.unidade)};${csvCelula(item.descricao)};${item.precoUnitario};${item.valorVendaLiquido};${item.custoTotal};${lucro};${lucroPorQuantidade};${csvCelula(item.fornecedorNome)}\n`
          : `${item.data};${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.quantidade};${csvCelula(item.unidade)};${csvCelula(item.descricao)};${item.precoUnitario}\n`;
      });
      csv += `\nTOTAL DE VENDAS;${analiseCliente.totalVendas}\nITENS DE VENDA;${analiseCliente.totalItensVenda}\nMETROS VENDIDOS;${analiseCliente.quantidadeMetros}\nUNIDADES / OUTROS;${analiseCliente.quantidadeUnidades}\nVALOR BRUTO;${analiseCliente.valorBruto}\nDESCONTO;${analiseCliente.desconto}\nVALOR LÍQUIDO;${analiseCliente.valorLiquido}\n`;
    } else if (aba === "materiais_cliente") {
      try {
        const exportacao = await api.getRelatorioConsumoMateriais({
          startDate: dataInicio,
          endDate: dataFim,
          clienteId: clienteId || undefined,
          produtoId: produtoId || undefined,
          unidade: unidadeMateriais || undefined,
          ordenacao: ordenacoes.materiais_cliente,
          exportar: true,
        });
        csv += "CÓD. CLIENTE;CLIENTE;CÓD. PRODUTO;PRODUTO;FORNECEDOR(ES);QUANTIDADE;UNIDADE;VENDAS;MÉDIA POR VENDA;PRIMEIRA COMPRA;ÚLTIMA COMPRA;VALOR VENDIDO\n";
        exportacao.items.forEach((item) => {
          csv += `${csvCelula(item.clienteCodigo)};${csvCelula(item.clienteNome)};${csvCelula(item.produtoCodigo)};${csvCelula(item.produtoNome)};${csvCelula(item.fornecedorNome || "Não identificado")};${item.totalQuantidade};${csvCelula(item.unidade)};${item.totalVendas};${item.mediaPorVenda};${item.primeiraCompra};${item.ultimaCompra};${item.totalValor}\n`;
        });
      } catch (err: any) {
        setErroMateriais(err.message || "Não foi possível exportar o consumo de materiais.");
        return;
      }
    } else if (aba === "fornecedores") {
      csv += "FORNECEDOR;TELEFONE;COMPRAS;TOTAL COMPRADO;PRODUTOS;ÚLTIMA COMPRA\n";
      linhasFornecedores.forEach((item: any) => { csv += `${csvCelula(item.fornecedorNome)};${csvCelula(item.telefone)};${item.quantidadeCompras};${item.totalComprado};${item.quantidadeProdutos};${item.ultimaCompra}\n`; });
    } else if (aba === "vales") {
      csv += "DOCUMENTO;CLIENTE;EMISSÃO;VENCIMENTO;VALOR;RECEBIDO;RESTANTE;SITUAÇÃO;DIAS EM ATRASO\n";
      valesOrdenados.forEach((item: any) => { csv += `${item.numeroSequencial};${csvCelula(item.clienteNome)};${item.data};${item.vencimento};${item.totalLiquido};${item.valorPago};${item.saldoRestante};${item.status};${item.diasAtraso}\n`; });
      csv += "\nITENS DOS VALES\nDOCUMENTO;CLIENTE;REFERÊNCIA;MATERIAL;QUANTIDADE;UNIDADE;PREÇO UNITÁRIO;TOTAL DO ITEM\n";
      valesOrdenados.forEach((vale: any) => {
        (vale.items || []).forEach((item: any) => {
          csv += `${vale.numeroSequencial};${csvCelula(vale.clienteNome)};${csvCelula(item.referencia)};${csvCelula(item.descricao)};${item.quantidade};${csvCelula(item.unidade)};${item.precoUnitario};${item.total}\n`;
        });
      });
    } else {
      csv += "MÉTRICA;VALOR\n";
      csv += `FATURAMENTO;${geral?.faturamento || 0}\nRECEBIDO;${geral?.recebido || 0}\nCUSTO;${geral?.custo || 0}\nLUCRO;${geral?.lucro || 0}\nMARGEM;${geral?.margem || 0}\n`;
      csv += "\nMATERIAIS\nMATERIAL;QUANTIDADE;UNIDADE;VENDAS;RECEITA;CUSTO;LUCRO\n";
      produtosGeraisOrdenados.forEach((item: any) => { csv += `${csvCelula(item.descricao)};${item.totalQuantidade};${csvCelula(item.unidade)};${item.totalVendas};${item.totalValor};${item.totalCusto};${item.totalLucro}\n`; });
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_${aba === "materiais_cliente" ? "consumo_materiais" : aba}_${dataInicio}_${dataFim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const Card = ({ titulo, valor, destaque = "text-slate-950" }: { titulo: string; valor: string; destaque?: string }) => <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><p className="text-xs font-black text-slate-600">{titulo}</p><p className={`mt-2 text-xl font-black ${destaque}`}>{valor}</p></div>;
  const CardResumo = ({ titulo, valor, destaque = "text-slate-950" }: { titulo: string; valor: string; destaque?: string }) => <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="truncate text-[10px] font-black uppercase text-slate-500" title={titulo}>{titulo}</p><p className={`whitespace-nowrap text-sm font-black ${destaque}`}>{valor}</p></div>;
  const resumoConsumo = dadosMateriais?.resumo;
  const variacaoConsumo = resumoConsumo?.variacaoValorPercentual;
  const tituloInsightConsumo = produtoId
    ? (clienteId ? "Relação entre cliente e material" : "Clientes que mais levam este material")
    : (clienteId ? "Materiais preferidos deste cliente" : "Materiais líderes por unidade");

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
        {([['geral', TrendingUp, 'Visão geral'], ['vendas', ShoppingCart, 'Vendas'], ['fornecedores', Truck, 'Fornecedores'], ['vales', HandCoins, 'Vales']] as const).map(([id, Icone, nome]) => <button key={id} data-testid={`relatorio-aba-${id}`} onClick={() => { setAba(id); setClienteId(""); setFornecedorId(""); setProdutoId(""); }} className={`module-tab justify-center whitespace-nowrap uppercase ${(id === "vendas" ? aba === "vendas" || aba === "clientes" || aba === "materiais_cliente" : aba === id) ? "module-tab-active" : ""}`}><Icone size={17} />{nome}</button>)}
      </div>

      {(aba === "vendas" || aba === "clientes" || aba === "materiais_cliente") && <div className="grid grid-cols-3 gap-1 rounded-xl border border-blue-200 bg-blue-50 p-1 print:hidden"><button type="button" data-testid="relatorio-subaba-vendas" onClick={() => setAba("vendas")} className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase sm:px-3 sm:text-xs ${aba === "vendas" ? "bg-blue-700 text-white shadow-sm" : "bg-white text-slate-700"}`}>Vendas por período</button><button type="button" data-testid="relatorio-subaba-itens-cliente" onClick={() => setAba("clientes")} className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase sm:px-3 sm:text-xs ${aba === "clientes" ? "bg-blue-700 text-white shadow-sm" : "bg-white text-slate-700"}`}><Users size={15} className="mr-1.5 hidden sm:inline" />Histórico do cliente</button><button type="button" data-testid="relatorio-subaba-materiais-cliente" onClick={() => setAba("materiais_cliente")} className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase sm:px-3 sm:text-xs ${aba === "materiais_cliente" ? "bg-blue-700 text-white shadow-sm" : "bg-white text-slate-700"}`}>Consumo de materiais</button></div>}

      <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-3 shadow-sm print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-[calc(50%-0.25rem)] min-w-0 text-xs font-black text-slate-700 md:w-auto">EMISSÃO DE<input data-testid="relatorio-data-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950" /></label>
          <label className="w-[calc(50%-0.25rem)] min-w-0 text-xs font-black text-slate-700 md:w-auto">ATÉ<input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950" /></label>
          {aba === "geral" && <label className="w-full text-xs font-black text-slate-700 md:w-56">FORMA DE PAGAMENTO<select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODAS</option><option value="avista_dinheiro">À VISTA DINHEIRO</option><option value="avista_debito">À VISTA DÉBITO</option><option value="pix">PIX</option><option value="cartao_credito">CARTÃO CRÉDITO</option><option value="cheque_emitente">CHEQUE EMITENTE</option><option value="cheque_terceiro">CHEQUE TERCEIRO</option></select></label>}
          <label className="w-full text-xs font-black text-slate-700 md:w-60">ORDENAR POR<select data-testid="relatorio-ordenacao" value={ordenacaoAtual} onChange={(e) => setOrdenacoes((atuais) => ({ ...atuais, [aba]: e.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold">{ORDENACOES_RELATORIO[aba].filter((opcao) => aba !== "clientes" || dadosClienteLiberados || !opcao.administrativo).map((opcao) => <option key={opcao.value} value={opcao.value}>{opcao.label.toUpperCase()}</option>)}</select></label>
          <div className="flex flex-wrap gap-2"><button onClick={() => periodoRapido(7)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">7 DIAS</button><button onClick={() => periodoRapido(30)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">30 DIAS</button><button onClick={() => periodoRapido(90)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">90 DIAS</button></div>
          <button onClick={aba === "materiais_cliente" ? carregarMateriais : carregar} aria-label="Atualizar relatório" className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold uppercase text-slate-400 hover:border-slate-300 hover:text-slate-600"><RefreshCw size={15} />Atualizar</button>
        </div>

        {aba === "vendas" && <div className="grid gap-2 md:grid-cols-2"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-vendas-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "clientes" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-filtro-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">SELECIONE UM CLIENTE</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "materiais_cliente" && <div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-filtro-materiais-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS CLIENTES</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">MATERIAL / PRODUTO<select data-testid="relatorio-filtro-material" value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS MATERIAIS</option>{produtosRelatorio.map((item) => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} — ` : ""}{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">UNIDADE<select data-testid="relatorio-filtro-unidade" value={unidadeMateriais} onChange={(e) => setUnidadeMateriais(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODAS AS UNIDADES</option>{[...new Set<string>(produtosRelatorio.map((item) => item.unidade).filter(Boolean))].sort(compararTexto).map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label></div>}
        {aba === "fornecedores" && <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-black text-slate-700">FORNECEDOR<select data-testid="relatorio-filtro-fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS FORNECEDORES</option>{fornecedores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">PRODUTO / MATERIAL<select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS PRODUTOS</option>{produtos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}
        {aba === "vales" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-black text-slate-700">CLIENTE<select data-testid="relatorio-vale-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="">TODOS OS CLIENTES</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs font-black text-slate-700">SITUAÇÃO<select data-testid="relatorio-vale-status" value={valeStatus} onChange={(e) => setValeStatus(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold"><option value="todos">TODOS</option><option value="abertos">EM ABERTO</option><option value="vencidos">VENCIDOS</option><option value="a_vencer">A VENCER</option><option value="quitados">QUITADOS</option></select></label><label className="text-xs font-black text-slate-700">VENCIMENTO DE<input type="date" value={vencimentoInicio} onChange={(e) => setVencimentoInicio(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold" /></label><label className="text-xs font-black text-slate-700">VENCIMENTO ATÉ<input type="date" value={vencimentoFim} onChange={(e) => setVencimentoFim(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold" /></label></div>}
      </div>

      {(aba === "materiais_cliente" ? erroMateriais || error : error) && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 font-black text-red-900"><AlertTriangle size={18} />{aba === "materiais_cliente" ? erroMateriais || error : error}</div>}
      {(aba === "materiais_cliente" ? loadingMateriais : loading) ? <div className="rounded-2xl border border-slate-300 bg-white p-12 text-center font-black text-slate-600">PROCESSANDO RELATÓRIO...</div> : (dados || aba === "materiais_cliente") && <>
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

        {aba === "vendas" && <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            <TabelaVendas linhas={vendasPaginadas} />
            <Pagination page={paginaVendas} pageSize={VENDAS_POR_PAGINA} totalItems={linhasVendas.length} onPageChange={setPaginaVendas} alwaysVisible />
          </div>
          <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-[11px] font-black uppercase text-slate-600">Resumo do período</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><CardResumo titulo="Valor líquido" valor={formatCurrency(resumoVendas.total)} destaque="text-blue-800" /><CardResumo titulo="Valor bruto" valor={formatCurrency(resumoVendas.valorBruto)} /><CardResumo titulo="Desconto" valor={formatCurrency(resumoVendas.desconto)} /><CardResumo titulo="Custo" valor={formatCurrency(resumoVendas.custo)} /><CardResumo titulo="Lucro" valor={formatCurrency(resumoVendas.lucro)} destaque={resumoVendas.lucro >= 0 ? "text-emerald-800" : "text-red-800"} /><CardResumo titulo="Vendas" valor={String(resumoVendas.quantidade)} /><CardResumo titulo="Metros" valor={`${formatDecimal(resumoVendas.metragem)} m`} destaque="text-amber-800" /><CardResumo titulo="Unidades" valor={`${formatDecimal(resumoVendas.unidades)} un`} destaque="text-violet-800" /><CardResumo titulo="R$ em metros" valor={formatCurrency(resumoVendas.valorMetros)} destaque="text-amber-800" /><CardResumo titulo="R$ em unidades" valor={formatCurrency(resumoVendas.valorUnidades)} destaque="text-violet-800" /></div>
          </section>
        </div>}

        {aba === "clientes" && <div className="space-y-4">
          {!clienteId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Users size={34} className="mx-auto text-slate-300" /><p className="mt-3 font-black text-slate-700">Selecione um cliente para carregar os itens vendidos no período.</p></div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-black text-slate-950">Histórico detalhado de itens do cliente</h3><p className="mt-1 text-xs font-bold text-slate-500">{formatDate(dataInicio)} até {formatDate(dataFim)}</p></div>
                  {dadosClienteLiberados ? <button type="button" onClick={() => { setDadosClienteLiberados(false); if (ordenacoes.clientes === "lucro_desc") setOrdenacoes((atuais) => ({ ...atuais, clientes: ORDENACAO_PADRAO.clientes })); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-800"><Unlock size={15} /> Custo visível</button> : <button type="button" onClick={() => { setPin(""); setPinErro(""); setPinOpen(true); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Lock size={15} /> Custo</button>}
                </div>
                <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-white p-2 print:hidden"><button type="button" onClick={() => setCategoriaCliente("metros")} className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${categoriaCliente === "metros" ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"}`}>Vendidos em metros ({analiseCliente.itensMetros.length})</button><button type="button" onClick={() => setCategoriaCliente("unidades")} className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${categoriaCliente === "unidades" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}>Unidades / outros ({analiseCliente.itensUnidades.length})</button></div>
                <TabelaItensCliente linhas={clienteProgressivo.itensVisiveis} liberado={dadosClienteLiberados} />
                <MarcadorListaProgressiva {...clienteProgressivo} />
              </div>
              <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div><h4 className="text-[11px] font-black uppercase text-slate-700">Resumo do período</h4><p className="text-[10px] font-bold text-slate-500">Vendas entre {formatDate(dataInicio)} e {formatDate(dataFim)}.</p></div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><CardResumo titulo="Valor líquido" valor={formatCurrency(analiseCliente.valorLiquido)} destaque="text-blue-800" /><CardResumo titulo="Valor bruto" valor={formatCurrency(analiseCliente.valorBruto)} /><CardResumo titulo="Desconto" valor={formatCurrency(analiseCliente.desconto)} />{dadosClienteLiberados && <><CardResumo titulo="Custo" valor={formatCurrency(analiseCliente.custo)} /><CardResumo titulo="Lucro / margem" valor={`${formatCurrency(analiseCliente.lucro)} • ${analiseCliente.margem.toFixed(1)}%`} destaque={analiseCliente.lucro >= 0 ? "text-emerald-800" : "text-red-800"} /></>}<CardResumo titulo="Vendas" valor={String(analiseCliente.totalVendas)} /><CardResumo titulo="Itens de venda" valor={String(analiseCliente.totalItensVenda)} /><CardResumo titulo="Metros" valor={`${formatDecimal(analiseCliente.quantidadeMetros)} m`} destaque="text-amber-800" /><CardResumo titulo="Unidades / outros" valor={`${formatDecimal(analiseCliente.quantidadeUnidades)} un`} destaque="text-violet-800" /></div>
              </section>
              <section className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                <div><h4 className="text-[11px] font-black uppercase text-blue-950">Resumo geral do cliente</h4><p className="text-[10px] font-bold text-blue-700">Histórico completo, sem limitar pelo período.</p></div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><CardResumo titulo="Valor líquido" valor={formatCurrency(resumoClienteGeral.valorLiquido)} destaque="text-blue-800" />{dadosClienteLiberados && <><CardResumo titulo="Custo" valor={formatCurrency(resumoClienteGeral.custo)} /><CardResumo titulo="Lucro" valor={formatCurrency(resumoClienteGeral.lucro)} destaque={resumoClienteGeral.lucro >= 0 ? "text-emerald-800" : "text-red-800"} /></>}<CardResumo titulo="Vendas" valor={String(resumoClienteGeral.totalVendas)} /><CardResumo titulo="Itens de venda" valor={String(resumoClienteGeral.totalItensVenda)} /><CardResumo titulo="Metros" valor={`${formatDecimal(resumoClienteGeral.quantidadeMetros)} m`} destaque="text-amber-800" /><CardResumo titulo="Unidades / outros" valor={`${formatDecimal(resumoClienteGeral.quantidadeUnidades)} un`} destaque="text-violet-800" /></div>
              </section>
            </>
          )}
        </div>}

        {aba === "materiais_cliente" && <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card titulo="MATERIAIS DISTINTOS" valor={String(resumoConsumo?.materiaisDistintos || 0)} />
            <Card titulo="CLIENTES COMPRADORES" valor={String(resumoConsumo?.clientesCompradores || 0)} />
            <Card titulo="VENDAS NO PERÍODO" valor={String(resumoConsumo?.totalVendas || 0)} />
            <Card titulo="VALOR VENDIDO" valor={formatCurrency(resumoConsumo?.totalValor || 0)} destaque="text-blue-800" />
            <Card titulo="VALOR VS. PERÍODO ANTERIOR" valor={variacaoConsumo === null || variacaoConsumo === undefined ? "Sem base anterior" : `${variacaoConsumo >= 0 ? "+" : ""}${variacaoConsumo.toFixed(1)}%`} destaque={variacaoConsumo === null || variacaoConsumo === undefined ? "text-slate-500" : variacaoConsumo >= 0 ? "text-emerald-800" : "text-red-800"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-black uppercase text-slate-700">Quantidade por unidade</h3>
              <div className="mt-3 flex flex-wrap gap-2">{resumoConsumo?.totaisPorUnidade.length ? resumoConsumo.totaisPorUnidade.map((item) => <div key={item.unidade} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-amber-800">{item.unidade}</p><p className="mt-1 font-mono text-lg font-black text-amber-950">{formatDecimal(item.totalQuantidade)}</p><p className="text-[10px] font-bold text-amber-700">{item.materiaisDistintos} material(is) • {item.clientesCompradores} cliente(s)</p></div>) : <p className="text-xs font-bold text-slate-500">Sem quantidades no período.</p>}</div>
            </section>
            <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
              <h3 className="text-xs font-black uppercase text-blue-950">{tituloInsightConsumo}</h3>
              <div className="mt-3 space-y-2">
                {clienteId && produtoId ? (
                  dadosMateriais?.items.length ? dadosMateriais.items.map((item) => <div key={`${item.clienteId}-${item.produtoId}-${item.unidade}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"><span className="font-black text-slate-900">{formatDecimal(item.totalQuantidade)} {item.unidade}</span><span className="font-bold text-slate-600">média {formatDecimal(item.mediaPorVenda)} por venda • última em {formatDate(item.ultimaCompra)}</span></div>) : <p className="text-xs font-bold text-blue-700">Sem relação de consumo no período.</p>
                ) : produtoId ? (
                  resumoConsumo?.lideresClientes.length ? resumoConsumo.lideresClientes.map((item) => <div key={`${item.clienteId}-${item.unidade}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs"><span className="font-black text-slate-900">{item.clienteNome}</span><span className="whitespace-nowrap font-mono font-black text-blue-800">{formatDecimal(item.totalQuantidade)} {item.unidade}</span></div>) : <p className="text-xs font-bold text-blue-700">Nenhum cliente comprou este material no período.</p>
                ) : (
                  resumoConsumo?.lideresMateriais.length ? resumoConsumo.lideresMateriais.map((item) => <div key={`${item.produtoId}-${item.unidade}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs"><span className="font-black text-slate-900">{item.produtoCodigo ? `${item.produtoCodigo} — ` : ""}{item.produtoNome}</span><span className="whitespace-nowrap font-mono font-black text-blue-800">{formatDecimal(item.totalQuantidade)} {item.unidade}</span></div>) : <p className="text-xs font-bold text-blue-700">Nenhum material vendido no período.</p>
                )}
              </div>
            </section>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 p-4"><h3 className="font-black text-slate-950">Análise de materiais × clientes</h3><p className="mt-1 text-xs font-bold text-slate-500">Valores líquidos de devoluções.</p></div>
            <TabelaMateriaisCliente linhas={dadosMateriais?.items || []} pagina={dadosMateriais?.page || paginaMateriais} tamanhoPagina={dadosMateriais?.pageSize || MATERIAIS_POR_PAGINA} />
            <Pagination page={dadosMateriais?.page || paginaMateriais} pageSize={dadosMateriais?.pageSize || MATERIAIS_POR_PAGINA} totalItems={dadosMateriais?.totalItems || 0} onPageChange={setPaginaMateriais} alwaysVisible />
          </div>
        </div>}

        {aba === "fornecedores" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Card titulo="FORNECEDORES COM COMPRA" valor={String(linhasFornecedores.length)} /><Card titulo="COMPRAS REGISTRADAS" valor={String(linhasFornecedores.reduce((t: number, i: any) => t + i.quantidadeCompras, 0))} /><Card titulo="TOTAL COMPRADO" valor={formatCurrency(linhasFornecedores.reduce((t: number, i: any) => t + i.totalComprado, 0))} destaque="text-blue-800" /></div><div className="overflow-hidden rounded-2xl border border-slate-300 bg-white"><TabelaFornecedores linhas={fornecedoresProgressivos.itensVisiveis} /><MarcadorListaProgressiva {...fornecedoresProgressivos} /></div></div>}

        {aba === "vales" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card titulo="VALES LISTADOS" valor={String(resumoVales.quantidade)} /><Card titulo="VALOR" valor={formatCurrency(resumoVales.totalOriginal)} /><Card titulo="RECEBIDO" valor={formatCurrency(resumoVales.recebido)} /><Card titulo="RESTANTE" valor={formatCurrency(resumoVales.saldo)} destaque="text-amber-800" /><Card titulo="SALDO VENCIDO" valor={formatCurrency(resumoVales.vencido)} destaque="text-red-800" /></div><div className="overflow-hidden rounded-2xl border border-slate-300 bg-white"><TabelaVales linhas={valesProgressivos.itensVisiveis} onDetalhes={vale => { void api.getVenda(vale.id).then(setValeDetalhado).catch(() => setValeDetalhado(vale)); }} /><MarcadorListaProgressiva {...valesProgressivos} /></div></div>}
      </>}
    </section>
  );
}

function TabelaVendas({ linhas }: { linhas: any[] }) {
  return <div className="overflow-x-auto"><table className="w-full table-fixed text-[11px] xl:text-xs">
    <colgroup><col className="w-[8%]" /><col className="w-[16%]" /><col className="w-[11%]" /><col className="w-[6%]" /><col className="w-[10%]" /><col className="w-[6%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[13%]" /></colgroup>
    <thead className="bg-slate-100 font-black uppercase text-slate-600"><tr><th className="p-2 text-left">Cód. venda</th><th className="p-2 text-left">Cliente</th><th className="bg-blue-50 p-2 text-right text-blue-900">Total</th><th className="bg-amber-50 p-2 text-right text-amber-900">M</th><th className="bg-amber-100 p-2 text-right text-amber-950">R$ Metro</th><th className="bg-violet-50 p-2 text-right text-violet-900">UN</th><th className="bg-violet-100 p-2 text-right text-violet-950">R$ UN</th><th className="bg-slate-200 p-2 text-right">Custo</th><th className="bg-emerald-50 p-2 text-right text-emerald-900">Lucro</th><th className="p-2 text-right">Data</th></tr></thead>
    <tbody className="divide-y divide-slate-200">{linhas.length ? linhas.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="whitespace-nowrap p-2 font-mono font-black">#{item.numeroSequencial}</td><td className="truncate p-2 font-black text-slate-950" title={item.clienteNome}>{item.clienteNome}</td><td className="whitespace-nowrap bg-blue-50/50 p-2 text-right font-mono font-black text-blue-900">{formatCurrency(item.totalLiquido)}</td><td className="whitespace-nowrap bg-amber-50/50 p-2 text-right font-mono font-black text-amber-900">{formatDecimal(item.metragem)}</td><td className="whitespace-nowrap bg-amber-100/60 p-2 text-right font-mono font-black text-amber-950">{formatCurrency(item.valorMetros)}</td><td className="whitespace-nowrap bg-violet-50/50 p-2 text-right font-mono font-black text-violet-900">{formatDecimal(item.unidades)}</td><td className="whitespace-nowrap bg-violet-100/60 p-2 text-right font-mono font-black text-violet-950">{formatCurrency(item.valorUnidades)}</td><td className="whitespace-nowrap bg-slate-50 p-2 text-right font-mono font-bold">{formatCurrency(item.custo)}</td><td className={`whitespace-nowrap bg-emerald-50/50 p-2 text-right font-mono font-black ${Number(item.lucro) >= 0 ? "text-emerald-800" : "text-red-800"}`}>{formatCurrency(item.lucro)}</td><td className="whitespace-nowrap p-2 text-right font-mono font-bold">{formatDate(item.data)}</td></tr>) : <tr><td colSpan={10} className="p-10 text-center font-bold text-slate-500">NENHUMA VENDA NESTE FILTRO.</td></tr>}</tbody>
  </table></div>;
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

function TabelaMateriaisCliente({ linhas, pagina, tamanhoPagina }: { linhas: any[]; pagina: number; tamanhoPagina: number }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[1380px] text-xs">
    <thead className="bg-white font-black uppercase text-slate-500"><tr><th className="w-12 p-3 text-center">#</th><th className="p-3 text-left">Cód. cliente</th><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Cód. material</th><th className="p-3 text-left">Material / produto</th><th className="p-3 text-left">Fornecedor(es)</th><th className="p-3 text-right">Quantidade</th><th className="p-3 text-left">Unidade</th><th className="p-3 text-right">Vendas</th><th className="p-3 text-right">Média / venda</th><th className="p-3 text-right">Primeira compra</th><th className="p-3 text-right">Última compra</th><th className="p-3 text-right">Valor vendido</th></tr></thead>
    <tbody className="divide-y divide-slate-200">{linhas.length ? linhas.map((item, index) => <tr key={`${item.clienteId}-${item.produtoId}-${item.unidade}`} className="hover:bg-blue-50/50"><td className="p-3 text-center font-mono font-black text-slate-500">{(pagina - 1) * tamanhoPagina + index + 1}</td><td className="whitespace-nowrap p-3 font-mono font-black">{item.clienteCodigo || "—"}</td><td className="p-3 font-black text-slate-950">{item.clienteNome}</td><td className="whitespace-nowrap p-3 font-mono font-black">{item.produtoCodigo || "—"}</td><td className="p-3 font-black text-slate-950">{item.produtoNome}</td><td className="p-3 font-bold text-slate-600">{item.fornecedorNome || "Não identificado"}</td><td className="whitespace-nowrap bg-amber-50/60 p-3 text-right font-mono font-black text-amber-900">{formatDecimal(Number(item.totalQuantidade))}</td><td className="p-3 font-bold uppercase text-slate-600">{item.unidade || "—"}</td><td className="p-3 text-right font-black">{item.totalVendas}</td><td className="p-3 text-right font-mono font-bold">{formatDecimal(item.mediaPorVenda)}</td><td className="whitespace-nowrap p-3 text-right">{formatDate(item.primeiraCompra)}</td><td className="whitespace-nowrap p-3 text-right">{formatDate(item.ultimaCompra)}</td><td className="whitespace-nowrap bg-blue-50/60 p-3 text-right font-black text-blue-800">{formatCurrency(item.totalValor)}</td></tr>) : <tr><td colSpan={13} className="p-12 text-center font-bold text-slate-500">Nenhum consumo encontrado para os filtros selecionados.</td></tr>}</tbody>
  </table></div>;
}

function TabelaVales({ linhas, onDetalhes }: { linhas: Venda[]; onDetalhes: (vale: Venda) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-sm"><thead className="bg-slate-100 text-xs font-black"><tr><th className="p-3 text-left">DOCUMENTO</th><th className="p-3 text-left">CLIENTE</th><th className="p-3 text-left">EMISSÃO</th><th className="p-3 text-left">VENCIMENTO</th><th className="p-3 text-right">VALOR</th><th className="p-3 text-right">RECEBIDO</th><th className="p-3 text-right">RESTANTE</th><th className="p-3 text-center">SITUAÇÃO</th><th className="p-3 text-center print:hidden">AÇÕES</th></tr></thead><tbody className="divide-y">{linhas.length ? linhas.map((item: any) => <tr key={item.id}><td className="p-3 font-mono font-black">#{item.numeroSequencial}</td><td className="p-3 font-black">{item.clienteNome}</td><td className="p-3">{formatDate(item.data)}</td><td className="p-3">{formatDate(item.vencimento)}</td><td className="p-3 text-right font-bold">{formatCurrency(item.totalLiquido)}</td><td className="p-3 text-right text-blue-800">{formatCurrency(item.valorPago)}</td><td className="p-3 text-right font-black text-amber-800">{formatCurrency(item.saldoRestante)}</td><td className="p-3 text-center">{item.status === "paga" ? <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">QUITADO</span> : item.diasAtraso > 0 ? <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-800">{item.diasAtraso} DIAS ATRASADO</span> : <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">EM ABERTO</span>}</td><td className="p-3 text-center print:hidden"><button type="button" onClick={() => onDetalhes(item)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black uppercase text-white"><Eye size={15} /> Detalhes</button></td></tr>) : <tr><td colSpan={9} className="p-10 text-center font-bold text-slate-500">NENHUM VALE NESTE FILTRO.</td></tr>}</tbody></table></div>;
}
