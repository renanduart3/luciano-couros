import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, ClipboardList, Eye, FileText, History, KeyRound, ListChecks, Pencil,
  Percent, Plus, Printer, Save, Search, ShieldCheck, ShoppingCart, Trash2, X
} from "lucide-react";
import { Cliente, Orcamento, Produto, ProdutoHabitual, SegurancaStatus, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import { Pagination, paginate } from "./Pagination";
import { OrcamentoComprovante } from "./OrcamentoComprovante";
import { PrecoAutorizadoInput } from "./PrecoAutorizadoInput";
import { useKeyboardListNavigation } from "../hooks/useKeyboardListNavigation";
import { useConfirmacao } from "./ConfirmacaoDialog";

interface OrcamentoViewProps {
  onLevarParaVenda: (orcamento: Orcamento) => void;
  compact?: boolean;
  clienteExterno?: Cliente | null;
  ocultarSeletorCliente?: boolean;
  produtosNaVenda?: string[];
}

interface ItemRascunhoOrcamento {
  produtoId: string;
  fornecedorId?: string | null;
  fornecedorReferencia?: string | null;
  codigo?: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  precoUnitario: string;
  faltante: boolean;
}

function dataFutura(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().split("T")[0];
}

type FornecedorAssociadoProduto = NonNullable<Produto["fornecedores"]>[number];
type OpcaoProdutoFornecedor = {
  produto: Produto;
  fornecedor: FornecedorAssociadoProduto | null;
  precoVenda: number;
};

const chaveVarianteProduto = (produtoId: string, fornecedorId?: string | null) =>
  `${produtoId}::${fornecedorId || ""}`;

const encontrarPrecoCliente = (
  registros: ProdutoHabitual[],
  produtoId: string,
  fornecedorId?: string | null
) => registros.find((item) =>
  item.produtoId === produtoId && (item.fornecedorId || null) === (fornecedorId || null)
);

export function OrcamentoView({ onLevarParaVenda, compact = false, clienteExterno, ocultarSeletorCliente = false, produtosNaVenda = [] }: OrcamentoViewProps) {
  const confirmacao = useConfirmacao();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCliente, setProdutosCliente] = useState<ProdutoHabitual[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [aba, setAba] = useState<"lista" | "formulario">(compact ? "formulario" : "lista");
  const [buscaOrcamentos, setBuscaOrcamentos] = useState("");
  const [filtroClienteOrcamentos, setFiltroClienteOrcamentos] = useState("");
  const [orcamentosPage, setOrcamentosPage] = useState(1);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [orcamentoVigente, setOrcamentoVigente] = useState<Orcamento | null>(null);
  const [numero, setNumero] = useState(1);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteBusca, setClienteBusca] = useState("");
  const [produtoBusca, setProdutoBusca] = useState("");
  const [produtoDropdownOpen, setProdutoDropdownOpen] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<FornecedorAssociadoProduto | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [preco, setPreco] = useState("");
  const [items, setItems] = useState<ItemRascunhoOrcamento[]>([]);
  const [data, setData] = useState(() => new Date().toISOString().split("T")[0]);
  const [validade, setValidade] = useState(() => dataFutura(7));
  const [descontoPercentual, setDescontoPercentual] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [orcamentoPreview, setOrcamentoPreview] = useState<Orcamento | null>(null);
  const [historicoVendas, setHistoricoVendas] = useState<Venda[]>([]);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historicoDataInicial, setHistoricoDataInicial] = useState(() => dataFutura(-90));
  const [historicoDataFinal, setHistoricoDataFinal] = useState(() => new Date().toISOString().split("T")[0]);
  const [historicoPage, setHistoricoPage] = useState(1);
  const [vendaHistoricoId, setVendaHistoricoId] = useState("");
  const [itensHistoricoSelecionados, setItensHistoricoSelecionados] = useState<string[]>([]);
  const [origemItens, setOrigemItens] = useState("todos");
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    const timer = window.setTimeout(() => setMensagem(null), 10000);
    return () => window.clearTimeout(timer);
  }, [mensagem]);
  const [pinOpen, setPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [pinErro, setPinErro] = useState("");
  const [levarParaVendaAposPin, setLevarParaVendaAposPin] = useState(false);
  const [itensSelecionadosVenda, setItensSelecionadosVenda] = useState<string[]>([]);
  const [itensParaVendaAposPin, setItensParaVendaAposPin] = useState<string[]>([]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [clientesAtivos, produtosAtivos, registros, proximo, segurancaStatus] = await Promise.all([
        api.getClientes(),
        api.getProdutos(),
        api.getOrcamentos(),
        api.getProximoNumeroOrcamento(),
        api.getSegurancaStatus()
      ]);
      setClientes(clientesAtivos.filter((item) => item.ativo === 1));
      setProdutos(produtosAtivos.filter((item) => item.ativo === 1));
      setOrcamentos(registros);
      setNumero(proximo.proximoNumero);
      setSeguranca(segurancaStatus);
    } catch (error: any) {
      setMensagem({ tipo: "erro", texto: error.message || "Não foi possível abrir o módulo de orçamentos." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!cliente) {
      setProdutosCliente([]);
      setHistoricoVendas([]);
      return;
    }
    api.getClienteProdutosHabituais(cliente.id)
      .then(setProdutosCliente)
      .catch(() => setProdutosCliente([]));
    api.getClienteHistorico(cliente.id)
      .then((historico) => setHistoricoVendas(historico.vendas || []))
      .catch(() => setHistoricoVendas([]));
  }, [cliente]);

  const limparFormulario = (proximoNumero: number) => {
    setOrcamento(null);
    setOrcamentoVigente(null);
    setNumero(proximoNumero);
    setCliente(null);
    setClienteBusca("");
    setProdutoBusca("");
    setProdutoSelecionado(null);
    setQuantidade("");
    setPreco("");
    setItems([]);
    setData(new Date().toISOString().split("T")[0]);
    setValidade(dataFutura(7));
    setDescontoPercentual("");
    setObservacoes("");
    setVendaHistoricoId("");
    setItensHistoricoSelecionados([]);
    setItensSelecionadosVenda([]);
    setOrigemItens("todos");
  };

  const abrirNovoOrcamento = async () => {
    try {
      const proximo = await api.getProximoNumeroOrcamento();
      limparFormulario(proximo.proximoNumero);
      setMensagem(null);
      setAba("formulario");
    } catch (error: any) {
      setMensagem({ tipo: "erro", texto: error.message || "Não foi possível iniciar o orçamento." });
    }
  };

  const abrirEdicaoOrcamento = (registro: Orcamento) => {
    const clienteRegistro = clientes.find((item) => item.id === registro.clienteId) || null;
    setOrcamento(registro);
    setOrcamentoVigente(registro);
    setNumero(registro.numeroSequencial);
    setCliente(clienteRegistro);
    setClienteBusca(clienteRegistro?.nome || registro.clienteNome || "");
    setData(registro.data);
    setValidade(registro.validade || dataFutura(7));
    const percentualSalvo = Number(registro.subtotal) > 0
      ? (Number(registro.desconto) / Number(registro.subtotal)) * 100
      : 0;
    setDescontoPercentual(percentualSalvo > 0 ? percentualSalvo.toFixed(2).replace(".", ",") : "");
    setObservacoes(registro.observacoes || "");
    setItems(registro.items.map((item) => ({
      produtoId: item.produtoId,
      fornecedorId: item.fornecedorId,
      fornecedorReferencia: item.fornecedorReferencia,
      codigo: item.referencia,
      descricao: item.descricao,
      quantidade: Number(item.quantidade).toString().replace(".", ","),
      unidade: item.unidade,
      precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
      faltante: item.faltante === 1
    })));
    setProdutoBusca("");
    setProdutoSelecionado(null);
    setFornecedorSelecionado(null);
    setVendaHistoricoId("");
    setItensHistoricoSelecionados([]);
    setItensSelecionadosVenda([]);
    setMensagem(null);
    setAba("formulario");
  };

  const clientesOrdenados = useMemo(
    () => clientes.filter(Boolean).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [clientes]
  );

  const produtosFiltrados = useMemo<OpcaoProdutoFornecedor[]>(() => {
    const termo = produtoBusca.toLowerCase();
    return produtos.flatMap((produto) => {
      const fornecedores = produto.fornecedores || [];
      const opcoes = fornecedores.length > 0
        ? fornecedores.map((fornecedor) => ({
            produto,
            fornecedor,
            precoVenda: Number(fornecedor.precoVendaFornecedor ?? produto.precoVendaPadrao)
          }))
        : [{ produto, fornecedor: null, precoVenda: Number(produto.precoVendaPadrao) }];
      return opcoes.filter((opcao) =>
        produto.nome.toLowerCase().includes(termo) ||
        (produto.codigo || "").toLowerCase().includes(termo) ||
        (opcao.fornecedor?.fornecedorReferencia || "").toLowerCase().includes(termo)
      );
    }).slice(0, 20);
  }, [produtos, produtoBusca]);

  const produtoKeyboard = useKeyboardListNavigation<OpcaoProdutoFornecedor>({
    items: produtosFiltrados,
    isOpen: produtoDropdownOpen && Boolean(produtoBusca) && !produtoSelecionado,
    listId: "orcamento-produtos",
    resetKey: produtoBusca,
    onOpen: () => setProdutoDropdownOpen(true),
    onClose: () => setProdutoDropdownOpen(false),
    onSelect: (opcao) => selecionarProduto(opcao)
  });

  const orcamentosFiltrados = useMemo(() => {
    const termo = buscaOrcamentos.trim().toLowerCase();
    return orcamentos.filter((registro) =>
      (!filtroClienteOrcamentos || registro.clienteId === filtroClienteOrcamentos) && (!termo ||
        String(registro.numeroSequencial).includes(termo) ||
        (registro.clienteNome || "").toLowerCase().includes(termo) ||
        registro.status.toLowerCase().includes(termo))
    );
  }, [orcamentos, buscaOrcamentos, filtroClienteOrcamentos]);
  const orcamentosPageSize = compact ? 4 : 8;
  const orcamentosPagina = paginate<Orcamento>(orcamentosFiltrados, orcamentosPage, orcamentosPageSize);

  const subtotal = items.reduce((total, item) =>
    total + parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario), 0
  );
  const itensDisponiveisVenda = items.filter((item) =>
    parseBrazilianNumber(item.quantidade) > 0
    && !produtosNaVenda.includes(chaveVarianteProduto(item.produtoId, item.fornecedorId))
  );
  const descontoPercentualValor = parseBrazilianNumber(descontoPercentual);
  const descontoValor = subtotal * Math.max(0, descontoPercentualValor) / 100;
  const totalLiquido = Math.max(0, subtotal - descontoValor);
  const fatorPrecoEfetivo = subtotal > 0 ? totalLiquido / subtotal : 1;
  const itensAbaixoDoPrecoCliente = items.filter((item) => {
    if (parseBrazilianNumber(item.quantidade) <= 0) return false;
    const produto = produtos.find((registro) => registro.id === item.produtoId);
    const referenciaCliente = encontrarPrecoCliente(produtosCliente, item.produtoId, item.fornecedorId);
    const fornecedor = produto?.fornecedores?.find((registro) => registro.fornecedorId === item.fornecedorId);
    const precoAtualCliente = Number(
      referenciaCliente?.precoAutorizado
      ?? referenciaCliente?.ultimoPreco
      ?? fornecedor?.precoVendaFornecedor
      ?? produto?.precoVendaPadrao
      ?? 0
    );
    return parseBrazilianNumber(item.precoUnitario) * fatorPrecoEfetivo < precoAtualCliente - 0.005;
  });
  const vendasFiltradasHistorico = historicoVendas.filter((venda) =>
    (!historicoDataInicial || venda.data >= historicoDataInicial) &&
    (!historicoDataFinal || venda.data <= historicoDataFinal)
  );
  const historicoPageSize = 8;
  const historicoTotalPages = Math.max(1, Math.ceil(vendasFiltradasHistorico.length / historicoPageSize));
  const vendasPaginaHistorico = vendasFiltradasHistorico.slice(
    (historicoPage - 1) * historicoPageSize,
    historicoPage * historicoPageSize
  );
  const vendaHistoricoSelecionada = vendasFiltradasHistorico.find((venda) => venda.id === vendaHistoricoId) || null;

  const selecionarCliente = async (selecionado: Cliente) => {
    if (cliente?.id && cliente.id !== selecionado.id && items.length > 0) {
      if (!await confirmacao.confirmar({
        titulo: "Alterar cliente",
        mensagem: "Alterar o cliente manterá os itens, mas atualizará apenas os próximos preços adicionados. Continuar?",
        textoConfirmar: "Alterar cliente",
        variante: "atencao"
      })) return;
    }
    setCliente(selecionado);
    setClienteBusca(selecionado.nome);
    setVendaHistoricoId("");
    setItensHistoricoSelecionados([]);
    setHistoricoPage(1);
    setOrigemItens("todos");
    setItensSelecionadosVenda([]);
    setOrcamento(null);
    setMensagem(null);
    try {
      const [vigente, listaPadrao] = await Promise.all([
        api.getClienteOrcamentoVigente(selecionado.id),
        api.getClienteOrcamentoPadrao(selecionado.id)
      ]);
      setOrcamentoVigente(vigente);
      if (listaPadrao.length > 0) {
        setItems(listaPadrao.map((item) => ({
          produtoId: item.produtoId,
          fornecedorId: item.fornecedorId,
          fornecedorReferencia: item.fornecedorReferencia,
          codigo: item.codigo,
          descricao: item.nome,
          quantidade: "",
          unidade: item.unidade,
          precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
          faltante: false
        })));
      } else {
        setItems([]);
      }
    } catch {
      setMensagem({ tipo: "erro", texto: "O cliente foi selecionado, mas os produtos acumulados não puderam ser carregados." });
    }
  };

  const carregarOrigemItens = async (origem: string) => {
    if (!cliente) return;
    setOrigemItens(origem);
    setMensagem(null);
    setItensSelecionadosVenda([]);
    if (origem === "orcamento") {
      if (orcamentoVigente) {
        abrirEdicaoOrcamento(orcamentoVigente);
        setCliente(cliente);
        setClienteBusca(cliente.nome);
        setOrigemItens("orcamento");
      }
      return;
    }
    if (origem === "todos") {
      try {
        const acumulados = await api.getClienteOrcamentoPadrao(cliente.id);
        const lista = acumulados.map((item) => ({
          produtoId: item.produtoId,
          fornecedorId: item.fornecedorId,
          fornecedorReferencia: item.fornecedorReferencia,
          codigo: item.codigo,
          descricao: item.nome,
          quantidade: "",
          unidade: item.unidade,
          precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
          faltante: false
        }));
        setItems(lista);
        setOrcamento(null);
      } catch (error: any) {
        setMensagem({ tipo: "erro", texto: error.message || "Não foi possível carregar os produtos do cliente." });
      }
      return;
    }
    const venda = historicoVendas.find((registro) => registro.id === origem);
    if (!venda) return;
    setItensSelecionadosVenda([]);
    setItems((venda.items || []).filter((item) => produtos.some((produto) => produto.id === item.produtoId)).map((item) => {
      const produto = produtos.find((registro) => registro.id === item.produtoId);
      return {
        produtoId: item.produtoId,
        fornecedorId: item.fornecedorId,
        fornecedorReferencia: item.fornecedorReferencia,
        codigo: item.referencia || produto?.codigo,
        descricao: item.descricao || produto?.nome || "Produto",
        quantidade: Number(item.quantidade).toString().replace(".", ","),
        unidade: item.unidade || produto?.unidade || "unidade",
        precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
        faltante: false
      };
    }));
    setOrcamento(null);
  };

  useEffect(() => {
    if (!ocultarSeletorCliente || loading) return;
    if (!clienteExterno) {
      setCliente(null);
      setClienteBusca("");
      setOrcamento(null);
      setOrcamentoVigente(null);
      setItems([]);
      return;
    }
    setItems([]);
    setOrcamento(null);
    setCliente(null);
    setAba("formulario");
    selecionarCliente(clienteExterno);
  }, [clienteExterno?.id, loading]);

  useEffect(() => {
    setItensSelecionadosVenda((atuais) => atuais.filter((chave) => !produtosNaVenda.includes(chave)));
  }, [produtosNaVenda]);

  const selecionarProduto = (opcao: OpcaoProdutoFornecedor) => {
    const { produto, fornecedor, precoVenda } = opcao;
    const referenciaCliente = encontrarPrecoCliente(produtosCliente, produto.id, fornecedor?.fornecedorId);
    const precoAtual = Number(referenciaCliente?.precoAutorizado ?? referenciaCliente?.ultimoPreco ?? precoVenda);
    setProdutoSelecionado({ ...produto, precoVendaPadrao: precoVenda });
    setFornecedorSelecionado(fornecedor);
    setProdutoBusca(produto.nome);
    setProdutoDropdownOpen(false);
    setPreco(precoAtual.toFixed(2).replace(".", ","));
    setQuantidade("");
  };

  const registrarPrecoAutorizadoLocal = (produtoId: string, fornecedorId: string | null | undefined, novoPreco: number) => {
    const produto = produtos.find((item) => item.id === produtoId);
    if (!cliente || !produto) return;
    setProdutosCliente((atuais) => {
      const existente = encontrarPrecoCliente(atuais, produtoId, fornecedorId);
      if (existente) {
        return atuais.map((item) =>
          chaveVarianteProduto(item.produtoId, item.fornecedorId) === chaveVarianteProduto(produtoId, fornecedorId)
            ? { ...item, precoAutorizado: novoPreco }
            : item
        );
      }
      const fornecedor = produto.fornecedores?.find((item) => item.fornecedorId === fornecedorId);
      return [...atuais, {
        clienteId: cliente.id,
        produtoId,
        fornecedorId: fornecedorId || null,
        fornecedorReferencia: fornecedor?.fornecedorReferencia || null,
        nome: produto.nome,
        codigo: produto.codigo,
        ultimoPreco: novoPreco,
        ultimaQuantidade: 0,
        ultimaUnidade: produto.unidade,
        vezesComprado: 0,
        ultimaCompraEm: new Date().toISOString().split("T")[0],
        precoAutorizado: novoPreco,
        unidade: produto.unidade,
        precoVendaPadrao: Number(fornecedor?.precoVendaFornecedor ?? produto.precoVendaPadrao),
        custoPadrao: Number(fornecedor?.custoFornecedor ?? produto.custoPadrao),
      }];
    });
  };

  const adicionarItem = () => {
    if (!produtoSelecionado) return setMensagem({ tipo: "erro", texto: "Selecione um produto." });
    if (items.some((item) =>
      chaveVarianteProduto(item.produtoId, item.fornecedorId)
        === chaveVarianteProduto(produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)
    )) {
      setMensagem({ tipo: "erro", texto: `${produtoSelecionado.nome} já está neste orçamento.` });
      return;
    }
    const qtd = parseBrazilianNumber(quantidade);
    const valor = parseBrazilianNumber(preco);
    if (qtd <= 0 || valor < 0) return setMensagem({ tipo: "erro", texto: "Informe quantidade maior que zero e um preço válido." });

    const novo: ItemRascunhoOrcamento = {
      produtoId: produtoSelecionado.id,
      fornecedorId: fornecedorSelecionado?.fornecedorId || null,
      fornecedorReferencia: fornecedorSelecionado?.fornecedorReferencia || null,
      codigo: produtoSelecionado.codigo,
      descricao: produtoSelecionado.nome,
      quantidade,
      unidade: produtoSelecionado.unidade,
      precoUnitario: preco,
      faltante: false
    };
    setItems((atuais) => [...atuais, novo]);
    setProdutoSelecionado(null);
    setFornecedorSelecionado(null);
    setProdutoBusca("");
    setProdutoDropdownOpen(false);
    setPreco("");
    setQuantidade("");
    setMensagem({ tipo: "ok", texto: `${novo.descricao} adicionado ao orçamento.` });
  };

  const importarItensHistorico = () => {
    if (!vendaHistoricoSelecionada) return;
    const selecionados = (vendaHistoricoSelecionada.items || []).filter((item) =>
      itensHistoricoSelecionados.includes(item.id)
    );
    if (selecionados.length === 0) {
      setMensagem({ tipo: "erro", texto: "Selecione pelo menos um item da venda anterior." });
      return;
    }

    setItems((atuais) => {
      let resultado = [...atuais];
      for (const itemHistorico of selecionados) {
        const produto = produtos.find((item) => item.id === itemHistorico.produtoId);
        if (!produto) continue;
        const importado: ItemRascunhoOrcamento = {
          produtoId: produto.id,
          fornecedorId: itemHistorico.fornecedorId,
          fornecedorReferencia: itemHistorico.fornecedorReferencia,
          codigo: produto.codigo,
          descricao: itemHistorico.descricao || produto.nome,
          quantidade: Number(itemHistorico.quantidade).toString().replace(".", ","),
          unidade: itemHistorico.unidade || produto.unidade,
          precoUnitario: Number(itemHistorico.precoUnitario).toFixed(2).replace(".", ","),
          faltante: false
        };
        const existente = resultado.findIndex((item) =>
          chaveVarianteProduto(item.produtoId, item.fornecedorId)
            === chaveVarianteProduto(produto.id, itemHistorico.fornecedorId)
        );
        resultado = existente >= 0
          ? resultado.map((item, index) => index === existente ? importado : item)
          : [...resultado, importado];
      }
      return resultado;
    });

    setHistoricoOpen(false);
    setMensagem({
      tipo: "ok",
      texto: `${selecionados.length} ${selecionados.length === 1 ? "item adicionado" : "itens adicionados"} da venda #${vendaHistoricoSelecionada.numeroSequencial}.`
    });
  };

  const montarPayload = (pin?: string) => ({
    id: orcamento?.id || orcamentoVigente?.id,
    clienteId: cliente?.id || "",
    data,
    validade: validade || undefined,
    desconto: descontoValor,
    observacoes: observacoes.trim() || undefined,
    autorizacaoPreco: pin ? { pin } : undefined,
    items: items.filter((item) => parseBrazilianNumber(item.quantidade) > 0).map((item) => ({
      produtoId: item.produtoId,
      fornecedorId: item.fornecedorId,
      fornecedorReferencia: item.fornecedorReferencia,
      descricao: item.descricao,
      quantidade: parseBrazilianNumber(item.quantidade),
      unidade: item.unidade,
      precoUnitario: parseBrazilianNumber(item.precoUnitario),
      desconto: 0,
      faltante: false
    }))
  });

  const validar = () => {
    if (!cliente) {
      setMensagem({ tipo: "erro", texto: "Selecione o cliente do orçamento." });
      return false;
    }
    const itensSelecionados = items.filter((item) => parseBrazilianNumber(item.quantidade) > 0);
    if (itensSelecionados.length === 0 || itensSelecionados.some((item) => parseBrazilianNumber(item.precoUnitario) < 0)) {
      setMensagem({ tipo: "erro", texto: "Informe a quantidade de pelo menos um item do orçamento." });
      return false;
    }
    if (descontoPercentualValor < 0 || descontoPercentualValor > 100) {
      setMensagem({ tipo: "erro", texto: "O desconto deve estar entre 0% e 100%." });
      return false;
    }
    return true;
  };

  const incluirItensNaVenda = (produtosSelecionados: string[]) => {
    if (!cliente) {
      setMensagem({ tipo: "erro", texto: "Selecione o cliente do orçamento." });
      return;
    }
    const selecionados = new Set(produtosSelecionados);
    const itensParaVenda = items
      .filter((item) => selecionados.has(chaveVarianteProduto(item.produtoId, item.fornecedorId)) && parseBrazilianNumber(item.quantidade) > 0)
      .map((item, index) => ({
        id: `item-transferencia-${index}`,
        orcamentoId: orcamento?.id || "",
        produtoId: item.produtoId,
        fornecedorId: item.fornecedorId,
        fornecedorReferencia: item.fornecedorReferencia,
        descricao: item.descricao,
        quantidade: parseBrazilianNumber(item.quantidade),
        unidade: item.unidade,
        precoUnitario: parseBrazilianNumber(item.precoUnitario),
        desconto: 0,
        total: parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario),
        faltante: 0,
        referencia: item.codigo
      }));
    if (itensParaVenda.length === 0) {
      setMensagem({ tipo: "erro", texto: "Selecione ao menos um item com quantidade maior que zero." });
      return;
    }
    onLevarParaVenda({
      id: orcamento?.id || "",
      numeroSequencial: orcamento?.numeroSequencial || numero,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      clienteTelefone: cliente.telefone,
      clienteEndereco: cliente.endereco,
      clienteDocumento: cliente.documento,
      data,
      validade,
      subtotal,
      desconto: descontoValor,
      totalLiquido,
      status: "aberto",
      observacoes,
      items: itensParaVenda,
      createdAt: orcamento?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setItensSelecionadosVenda([]);
    setMensagem({ tipo: "ok", texto: `${itensParaVenda.length} item(ns) incluído(s) na venda atual.` });
  };

  const salvar = async (levarParaVenda = false, pin?: string, produtosParaVenda: string[] = itensSelecionadosVenda) => {
    if (!validar()) return;
    if (levarParaVenda && produtosParaVenda.length === 0) {
      setMensagem({ tipo: "erro", texto: "Selecione pelo menos um item para incluir na venda." });
      return;
    }
    // O preço digitado é autorizado ao lado do próprio campo. O PIN deste
    // diálogo fica restrito ao desconto geral, que também reduz o preço efetivo.
    if (itensAbaixoDoPrecoCliente.length > 0 && !pin) {
      setLevarParaVendaAposPin(levarParaVenda);
      setItensParaVendaAposPin(produtosParaVenda);
      setAdminPin("");
      setPinErro("");
      setPinOpen(true);
      return;
    }
    setSalvando(true);
    setMensagem(null);
    try {
      const salvo = await api.saveOrcamento(montarPayload(pin));
      setOrcamento(salvo);
      setOrcamentoVigente(salvo);
      setNumero(salvo.numeroSequencial);
      setOrcamentos((atuais) => [salvo, ...atuais.filter((item) => item.id !== salvo.id)]
        .sort((a, b) => b.numeroSequencial - a.numeroSequencial));
      setOrcamentosPage(1);
      setMensagem({ tipo: "ok", texto: `Orçamento #${salvo.numeroSequencial} salvo.` });
      setPinOpen(false);
      setAdminPin("");
      setPinErro("");
      if (levarParaVenda) {
        const selecionados = new Set(produtosParaVenda);
        onLevarParaVenda({
          ...salvo,
          items: salvo.items.filter((item) => selecionados.has(chaveVarianteProduto(item.produtoId, item.fornecedorId)))
        });
        setItensSelecionadosVenda([]);
      } else if (!compact) {
        setAba("lista");
      }
    } catch (error: any) {
      const texto = error.message || "Não foi possível salvar o orçamento.";
      setMensagem({ tipo: "erro", texto });
    } finally {
      setSalvando(false);
    }
  };

  const excluirOrcamento = async (registro: Orcamento) => {
    if (!await confirmacao.confirmar({
      titulo: "Excluir orçamento",
      mensagem: `Excluir o orçamento #${registro.numeroSequencial} de ${registro.clienteNome || "este cliente"}?`,
      textoConfirmar: "Excluir orçamento"
    })) return;
    setSalvando(true);
    try {
      await api.deleteOrcamento(registro.id);
      setOrcamentos((atuais) => atuais.filter((item) => item.id !== registro.id));
      setOrcamentosPage(1);
      if (orcamento?.id === registro.id) setOrcamento(null);
      setMensagem({ tipo: "ok", texto: `Orçamento #${registro.numeroSequencial} excluído.` });
      setAba("lista");
    } catch (error: any) {
      setMensagem({ tipo: "erro", texto: error.message || "Não foi possível excluir o orçamento." });
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <div className="rounded-2xl bg-white p-16 text-center font-bold text-slate-500">Abrindo orçamento...</div>;

  return (
    <div id="orcamento-view" className={compact ? "space-y-3" : "space-y-5"}>
      {confirmacao.dialogo}
      {previewOpen && orcamentoPreview && (
        <div id="print-orcamento" className="fixed inset-0 z-[80] overflow-x-hidden overflow-y-auto bg-slate-950/70 p-3 sm:p-6 print:absolute print:bg-white print:p-0">
          <div className="mx-auto w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-[calc(100vw-3rem)] print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 print:hidden">
              <div><h3 className="font-black">Prévia do orçamento #{orcamentoPreview.numeroSequencial}</h3><p className="text-xs text-slate-500">Confira antes de imprimir ou salvar em PDF.</p></div>
              <button type="button" aria-label="Fechar prévia" onClick={() => { setPreviewOpen(false); setOrcamentoPreview(null); }} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="max-w-full overflow-x-auto print:overflow-visible"><OrcamentoComprovante orcamento={orcamentoPreview} /></div>
            <div className="flex gap-3 border-t border-slate-200 p-4 print:hidden"><button type="button" onClick={() => window.print()} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Printer size={16} className="mr-2 inline" /> Imprimir / salvar PDF</button><button type="button" onClick={() => { setPreviewOpen(false); setOrcamentoPreview(null); }} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">Fechar</button></div>
          </div>
        </div>
      )}

      {pinOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-orcamento-titulo"
            onSubmit={(event) => {
              event.preventDefault();
              salvar(levarParaVendaAposPin, adminPin, itensParaVendaAposPin);
            }}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 bg-amber-50 p-5">
              <div className="flex gap-3">
                <span className="rounded-xl bg-amber-100 p-2 text-amber-700"><KeyRound size={21} /></span>
                <div><h3 id="pin-orcamento-titulo" className="font-black text-slate-950">Autorizar desconto geral</h3><p className="mt-1 text-xs text-slate-600">O desconto reduz o preço efetivo de {itensAbaixoDoPrecoCliente.length} item(ns).</p></div>
              </div>
              <button type="button" aria-label="Fechar autorização" onClick={() => setPinOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              {seguranca?.pinConfigurado ? (
                <label><span className="mb-1 block text-xs font-black uppercase text-slate-600">PIN administrativo</span><input type="password" inputMode="numeric" autoFocus value={adminPin} onChange={(event) => { setAdminPin(event.target.value); setPinErro(""); }} placeholder="Digite o PIN" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-black tracking-[0.35em]" /></label>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">Configure o PIN administrativo em Configurações.</p>
              )}
              {pinErro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{pinErro}</p>}
            </div>
            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={() => setPinOpen(false)} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700">Cancelar</button>
              {seguranca?.pinConfigurado && <button type="submit" disabled={salvando || !adminPin} className="flex-[1.4] rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><ShieldCheck size={17} className="mr-1.5 inline" /> {salvando ? "Validando..." : "Autorizar e salvar"}</button>}
            </div>
          </form>
        </div>
      )}

      {historicoOpen && cliente && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-5">
          <div role="dialog" aria-modal="true" aria-labelledby="historico-orcamento-titulo" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <h3 id="historico-orcamento-titulo" className="flex items-center gap-2 font-black text-slate-950"><History size={18} className="text-blue-700" /> Histórico de vendas de {cliente.nome}</h3>
                <p className="mt-1 text-xs text-slate-500">Consulte preços e adicione itens ao orçamento.</p>
              </div>
              <button type="button" aria-label="Fechar histórico de vendas" onClick={() => setHistoricoOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={19} /></button>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label><span className="mb-1 block text-[10px] font-extrabold uppercase text-slate-500">Data inicial</span><input type="date" value={historicoDataInicial} onChange={(event) => { setHistoricoDataInicial(event.target.value); setHistoricoPage(1); setVendaHistoricoId(""); setItensHistoricoSelecionados([]); }} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold" /></label>
              <label><span className="mb-1 block text-[10px] font-extrabold uppercase text-slate-500">Data final</span><input type="date" value={historicoDataFinal} onChange={(event) => { setHistoricoDataFinal(event.target.value); setHistoricoPage(1); setVendaHistoricoId(""); setItensHistoricoSelecionados([]); }} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold" /></label>
              <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-center text-xs font-black text-slate-700">{vendasFiltradasHistorico.length} venda(s)</span>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
              <section className="min-h-[300px] border-b border-slate-200 p-4 lg:col-span-7 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                {!vendaHistoricoSelecionada ? (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center text-slate-400">
                    <ShoppingCart size={34} />
                    <p className="mt-3 font-bold">Selecione uma venda na lista ao lado.</p>
                    <p className="mt-1 text-xs">Os produtos, quantidades e preços praticados aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-black text-slate-950">Venda #{vendaHistoricoSelecionada.numeroSequencial}</h4>
                        <p className="text-xs text-slate-500">{formatDate(vendaHistoricoSelecionada.data)} • {formatCurrency(vendaHistoricoSelecionada.totalLiquido)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setItensHistoricoSelecionados((vendaHistoricoSelecionada.items || []).filter((item) => produtos.some((produto) => produto.id === item.produtoId)).map((item) => item.id))} className="rounded-lg border border-blue-200 px-3 py-2 text-[11px] font-bold text-blue-700">Selecionar todos</button>
                        <button type="button" disabled={itensHistoricoSelecionados.length === 0} onClick={importarItensHistorico} className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-bold text-white disabled:bg-slate-300"><ListChecks size={14} className="mr-1 inline" /> Adicionar ao orçamento</button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(vendaHistoricoSelecionada.items || []).map((item) => {
                        const produtoDisponivel = produtos.some((produto) => produto.id === item.produtoId);
                        const selecionado = itensHistoricoSelecionados.includes(item.id);
                        return (
                          <label key={item.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selecionado ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"} ${!produtoDisponivel ? "opacity-50" : ""}`}>
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${item.descricao}`}
                              disabled={!produtoDisponivel}
                              checked={selecionado}
                              onChange={() => setItensHistoricoSelecionados((atuais) => atuais.includes(item.id) ? atuais.filter((id) => id !== item.id) : [...atuais, item.id])}
                              className="h-4 w-4 accent-blue-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-slate-900">{item.descricao}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">{formatDecimal(item.quantidade)} {item.unidade} • preço praticado <strong className="text-slate-800">{formatCurrency(item.precoUnitario)}</strong> • total {formatCurrency(item.total)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <aside className="min-h-[280px] bg-slate-50 p-4 lg:col-span-5 lg:overflow-y-auto">
                <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Vendas no período</h4>
                {vendasPaginaHistorico.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs font-bold text-slate-400">Nenhuma venda encontrada nesse período.</div>
                ) : (
                  <div className="space-y-2">
                    {vendasPaginaHistorico.map((venda) => (
                      <button key={venda.id} type="button" onClick={() => { setVendaHistoricoId(venda.id); setItensHistoricoSelecionados([]); }} className={`w-full rounded-xl border p-3 text-left transition-colors ${venda.id === vendaHistoricoId ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                        <div className="flex items-center justify-between gap-3"><strong className="text-sm text-slate-900">{formatDate(venda.data)}</strong><span className="font-mono text-xs font-black text-blue-700">{formatCurrency(venda.totalLiquido)}</span></div>
                        <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-slate-500"><span>Venda #{venda.numeroSequencial}</span><span>{(venda.items || []).length} item(ns)</span></div>
                      </button>
                    ))}
                  </div>
                )}
                {vendasFiltradasHistorico.length > historicoPageSize && (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs">
                    <button type="button" disabled={historicoPage <= 1} onClick={() => { setHistoricoPage((atual) => atual - 1); setVendaHistoricoId(""); setItensHistoricoSelecionados([]); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40">Anterior</button>
                    <strong>{historicoPage} / {historicoTotalPages}</strong>
                    <button type="button" disabled={historicoPage >= historicoTotalPages} onClick={() => { setHistoricoPage((atual) => atual + 1); setVendaHistoricoId(""); setItensHistoricoSelecionados([]); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40">Próxima</button>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}

      {!compact && <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-2xl font-black text-slate-950">Orçamentos</h2><p className="mt-1 text-sm text-slate-500">{orcamentos.length} registro(s)</p></div>
        <button type="button" onClick={abrirNovoOrcamento} className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white sm:w-auto"><Plus size={17} className="mr-1.5 inline" /> Novo orçamento</button>
      </header>}

      {!compact && <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex">
        <button type="button" aria-label="Orçamentos salvos" onClick={() => setAba("lista")} className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-black sm:px-4 sm:text-sm ${aba === "lista" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><ClipboardList size={17} className="shrink-0" /> <span className="sm:hidden">Salvos</span><span className="hidden sm:inline">Orçamentos salvos</span></button>
        <button type="button" aria-label="Novo orçamento" onClick={abrirNovoOrcamento} className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-black sm:px-4 sm:text-sm ${aba === "formulario" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Plus size={17} className="shrink-0" /> <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo orçamento</span></button>
      </div>}

      {mensagem && <div role={mensagem.tipo === "erro" ? "alert" : "status"} className={`fixed right-5 top-5 z-[95] flex max-w-sm items-center justify-between gap-3 rounded-xl border p-3 text-sm font-bold shadow-2xl ${mensagem.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}><span>{mensagem.texto}</span><button type="button" aria-label="Fechar aviso" onClick={() => setMensagem(null)}><X size={15} /></button></div>}

      {aba === "lista" && !compact ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_260px_280px] md:items-center">
            <div><h3 className="font-black text-slate-950">Orçamentos por cliente</h3><p className="text-xs text-slate-500">{orcamentosFiltrados.length} encontrado(s)</p></div>
            <select aria-label="Filtrar orçamentos por cliente" value={filtroClienteOrcamentos} onChange={(event) => { setFiltroClienteOrcamentos(event.target.value); setOrcamentosPage(1); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold"><option value="">Todos os clientes</option>{clientesOrdenados.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
            <div className="flex w-full items-center rounded-xl border border-slate-300 bg-slate-50"><Search size={16} className="ml-3 text-slate-400" /><input value={buscaOrcamentos} onChange={(event) => { setBuscaOrcamentos(event.target.value); setOrcamentosPage(1); }} placeholder="Cliente, número ou status..." className="w-full rounded-xl bg-transparent px-3 py-2.5 text-sm font-bold outline-none" /></div>
          </div>
          <div className={compact ? "space-y-3 p-3" : "space-y-3 p-3 md:hidden"}>
            {orcamentosPagina.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-400">Nenhum orçamento encontrado.</div>
            ) : orcamentosPagina.map((registro) => (
              <article key={registro.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-blue-800">Orçamento #{registro.numeroSequencial}</p>
                    <h4 className="mt-1 truncate text-base font-black text-slate-950">{registro.clienteNome}</h4>
                    <p className="text-xs text-slate-500">{registro.clienteTelefone || "Sem telefone"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${registro.status === "aberto" ? "bg-amber-100 text-amber-800" : registro.status === "convertido" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{registro.status}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                  <div><dt className="font-bold uppercase text-slate-400">Emissão</dt><dd className="mt-1 font-black text-slate-700">{formatDate(registro.data)}</dd></div>
                  <div><dt className="font-bold uppercase text-slate-400">Validade</dt><dd className="mt-1 font-black text-slate-700">{registro.validade ? formatDate(registro.validade) : "—"}</dd></div>
                  <div className="col-span-2 border-t border-slate-200 pt-3"><dt className="font-bold uppercase text-slate-400">Total</dt><dd className="mt-1 font-mono text-lg font-black text-blue-800">{formatCurrency(registro.totalLiquido)}</dd></div>
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setOrcamentoPreview(registro); setPreviewOpen(true); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700"><Eye size={15} className="mr-1 inline" /> Ver</button>
                  {registro.status === "aberto" && <button type="button" onClick={() => abrirEdicaoOrcamento(registro)} className="rounded-xl border border-blue-200 px-3 py-2.5 text-xs font-black text-blue-700"><Pencil size={15} className="mr-1 inline" /> Editar</button>}
                  {registro.status === "aberto" && <button type="button" onClick={() => onLevarParaVenda(registro)} className="rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-black text-white"><ArrowRight size={15} className="mr-1 inline" /> Levar à venda</button>}
                  <button type="button" onClick={() => excluirOrcamento(registro)} className="col-span-2 rounded-xl border border-red-200 px-3 py-2.5 text-xs font-black text-red-700"><Trash2 size={15} className="mr-1 inline" /> Excluir orçamento</button>
                </div>
              </article>
            ))}
          </div>
          <div className={compact ? "hidden" : "hidden overflow-x-auto md:block"}>
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="bg-slate-100 text-xs uppercase text-slate-500"><th className="p-3 text-left">Número</th><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Emissão</th><th className="p-3 text-left">Validade</th><th className="p-3 text-right">Total</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {orcamentosPagina.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center font-bold text-slate-400">Nenhum orçamento encontrado.</td></tr>
                ) : orcamentosPagina.map((registro) => (
                  <tr key={registro.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black text-blue-800">#{registro.numeroSequencial}</td>
                    <td className="p-3"><strong className="block text-slate-950">{registro.clienteNome}</strong><span className="text-xs text-slate-500">{registro.clienteTelefone || "Sem telefone"}</span></td>
                    <td className="p-3 font-semibold">{formatDate(registro.data)}</td>
                    <td className="p-3 text-slate-600">{registro.validade ? formatDate(registro.validade) : "—"}</td>
                    <td className="p-3 text-right font-mono font-black">{formatCurrency(registro.totalLiquido)}</td>
                    <td className="p-3 text-center"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${registro.status === "aberto" ? "bg-amber-100 text-amber-800" : registro.status === "convertido" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{registro.status}</span></td>
                    <td className="p-3"><div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setOrcamentoPreview(registro); setPreviewOpen(true); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><Eye size={14} className="mr-1 inline" /> Ver</button>
                      {registro.status === "aberto" && <button type="button" onClick={() => abrirEdicaoOrcamento(registro)} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-blue-700"><Pencil size={14} className="mr-1 inline" /> Editar</button>}
                      {registro.status === "aberto" && <button type="button" onClick={() => onLevarParaVenda(registro)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white"><ArrowRight size={14} className="mr-1 inline" /> Levar para venda</button>}
                      <button type="button" aria-label={`Excluir orçamento ${registro.numeroSequencial}`} onClick={() => excluirOrcamento(registro)} className="rounded-lg border border-red-200 p-2 text-red-700"><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={orcamentosPage} pageSize={orcamentosPageSize} totalItems={orcamentosFiltrados.length} onPageChange={setOrcamentosPage} />
        </section>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex min-w-0 items-center gap-3"><h3 className="truncate text-xl font-black text-slate-950">{compact ? "Orçamento do cliente" : orcamento ? "Editar orçamento" : "Novo orçamento"}</h3>{!compact && <span className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">#{numero}</span>}</div>
            {orcamento && <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">SALVA</span>}
          </header>

      {!ocultarSeletorCliente && <section className="relative rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-wider text-blue-700">Cliente do orçamento</p>
        </div>
        {cliente ? (
          <div className="flex min-h-16 flex-col items-stretch gap-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-slate-950">{cliente.nome}</p>
              <p className="mt-0.5 text-sm text-slate-500">
                {cliente.telefone || "Sem telefone"}
                {cliente.documento ? ` • ${cliente.documento}` : ""}
              </p>
            </div>
            <div className="grid shrink-0 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setVendaHistoricoId("");
                  setItensHistoricoSelecionados([]);
                  setHistoricoOpen(true);
                }}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
              >
                <History size={16} className="mr-1.5 inline" /> Abrir histórico de vendas
              </button>
              <button
                type="button"
                onClick={() => {
                  setCliente(null);
                  setClienteBusca("");
                  setVendaHistoricoId("");
                  setItensHistoricoSelecionados([]);
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Alterar cliente
              </button>
            </div>
          </div>
        ) : (
          <select
            value=""
            onChange={(event) => {
              const selecionado = clientesOrdenados.find((item) => item.id === event.target.value);
              if (selecionado) selecionarCliente(selecionado);
            }}
            aria-label="Selecionar cliente do orçamento"
            className="min-h-14 w-full rounded-xl border border-blue-300 bg-white px-4 text-base font-bold text-slate-950 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">SELECIONE O CLIENTE...</option>
            {clientesOrdenados.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.telefone ? ` — ${item.telefone}` : ""}</option>)}
          </select>
        )}
      </section>}

      <div className={compact ? "grid min-w-0 gap-2" : "grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] xl:grid-cols-[minmax(0,1fr)_340px]"}>
        <section className={`min-w-0 rounded-xl bg-white ${compact ? "space-y-2 p-2" : "space-y-5 border border-slate-200 p-3 shadow-sm sm:p-5"}`}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="min-w-[260px] flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-600">CARREGAR ITENS</span><select value={origemItens} onChange={(event) => carregarOrigemItens(event.target.value)} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-2 text-xs font-black uppercase text-slate-900 outline-none focus:border-blue-700"><option value="todos">TODOS OS PRODUTOS JÁ COMPRADOS</option>{orcamentoVigente && <option value="orcamento">ORÇAMENTO DO CLIENTE #{orcamentoVigente.numeroSequencial}</option>}{historicoVendas.slice(0, 7).map((venda) => <option key={venda.id} value={venda.id}>VENDA #{venda.numeroSequencial} — {formatDate(venda.data)} — {formatCurrency(venda.totalLiquido)}</option>)}</select></label>
            <button type="button" disabled={salvando} onClick={() => salvar(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-50"><Save size={15} /> {salvando ? "SALVANDO..." : "SALVAR ORÇAMENTO"}</button>
            {itensSelecionadosVenda.length > 1 && <button type="button" onClick={() => incluirItensNaVenda(itensSelecionadosVenda)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-[11px] font-black uppercase text-white shadow-sm hover:bg-emerald-800"><ListChecks size={15} /> INSERIR TODOS SELECIONADOS ({itensSelecionadosVenda.length})</button>}
          </div>

          <div className={`max-h-[72vh] overflow-auto rounded-xl border border-slate-200 ${items.length === 0 ? "min-h-[420px]" : "min-h-[260px]"}`}>
            <table className={`w-full text-xs ${items.length === 0 ? "min-h-[418px]" : ""} ${compact ? "min-w-[700px] xl:min-w-0 xl:table-fixed" : "min-w-[780px]"}`}>
              <colgroup>
                <col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[23%]" /><col className="w-[10%]" />
                <col className="w-[8%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[10%]" />
              </colgroup>
              <thead className="sticky top-0 z-10"><tr className="bg-blue-50 text-[9px] font-black uppercase tracking-tight text-slate-500"><th className="px-1 py-2 text-center"><span>ENVIAR À VENDA</span><input className="ml-1" aria-label="Selecionar todos os itens do orçamento" type="checkbox" checked={itensDisponiveisVenda.length > 0 && itensDisponiveisVenda.every((item) => itensSelecionadosVenda.includes(chaveVarianteProduto(item.produtoId, item.fornecedorId)))} onChange={(event) => setItensSelecionadosVenda(event.target.checked ? itensDisponiveisVenda.map((item) => chaveVarianteProduto(item.produtoId, item.fornecedorId)) : [])} /></th><th className="px-1 py-2 text-left">Ref.</th><th className="px-1 py-2 text-left">Material</th><th className="px-1 py-2 text-right">Qtd.</th><th className="px-1 py-2 text-left">Un.</th><th className="px-1 py-2 text-right">Preço</th><th className="px-1 py-2 text-right">Total</th><th className="px-1 py-2"></th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="bg-blue-50/60">
                  <td className="px-2 py-2 text-center"><button type="button" onClick={adicionarItem} title="Adicionar item ao orçamento" aria-label="Adicionar item ao orçamento" className="rounded-md bg-blue-700 p-2 text-white hover:bg-blue-800"><Plus size={14} /></button></td>
                  <td className="px-2 py-2 text-center font-mono text-xs font-bold text-slate-500">{produtoSelecionado?.codigo || "—"}</td>
                  <td className="relative px-2 py-2"><input value={produtoBusca} onChange={(event) => { setProdutoBusca(event.target.value); setProdutoSelecionado(null); setFornecedorSelecionado(null); setProdutoDropdownOpen(true); }} onFocus={() => setProdutoDropdownOpen(true)} onKeyDown={produtoKeyboard.onKeyDown} role="combobox" aria-autocomplete="list" aria-expanded={produtoDropdownOpen && Boolean(produtoBusca) && !produtoSelecionado} aria-controls="orcamento-produtos" aria-activedescendant={produtoKeyboard.activeDescendant} placeholder="Digite código, referência ou material..." className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 font-bold outline-none" />{produtoDropdownOpen && produtoBusca && !produtoSelecionado && <div id="orcamento-produtos" role="listbox" className="absolute left-1 right-1 top-full z-30 max-h-[360px] min-w-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">{produtosFiltrados.map((opcao, index) => <button {...produtoKeyboard.getOptionProps(index)} key={`${opcao.produto.id}:${opcao.fornecedor?.fornecedorId || "sem-fornecedor"}`} type="button" onClick={() => selecionarProduto(opcao)} className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left hover:bg-blue-50 ${produtoKeyboard.activeIndex === index ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : ""}`}><span className="min-w-0"><strong className="block">{opcao.produto.nome}</strong><small className="block font-mono text-slate-600">REF.: {opcao.produto.codigo || "SEM REFERÊNCIA"} • {opcao.produto.unidade}</small><small className="mt-1 block text-[10px] font-black text-blue-800">REF. FORNECEDOR: {opcao.fornecedor?.fornecedorReferencia || "SEM REFERÊNCIA"}</small></span><strong className="shrink-0 text-blue-700">VENDA {formatCurrency(opcao.precoVenda)}</strong></button>)}</div>}</td>
                  <td className="px-2 py-2"><input value={quantidade} onChange={(event) => setQuantidade(event.target.value)} placeholder="0" className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-right font-black outline-none" /></td>
                  <td className="px-2 py-2 font-bold text-slate-600">{produtoSelecionado?.unidade || "—"}</td>
                  <td className="px-2 py-2">{cliente && produtoSelecionado ? <PrecoAutorizadoInput clienteId={cliente.id} produtoId={produtoSelecionado.id} fornecedorId={fornecedorSelecionado?.fornecedorId} value={preco} precoAutorizado={Number(encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)?.precoAutorizado ?? encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)?.ultimoPreco ?? produtoSelecionado.precoVendaPadrao)} origem="orcamento" documentoId={orcamento?.id} ariaLabel={`Preço de ${produtoSelecionado.nome} no orçamento`} onAuthorized={(valorFormatado, valor) => { setPreco(valorFormatado); registrarPrecoAutorizadoLocal(produtoSelecionado.id, fornecedorSelecionado?.fornecedorId, valor); }} className="w-full min-w-16 rounded-md border border-blue-200 bg-white px-2 py-1.5 text-right font-black outline-none" /> : <input value={preco} onChange={(event) => setPreco(event.target.value)} placeholder="0,00" className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-right font-black outline-none" />}</td>
                  <td className="px-2 py-2 text-right font-mono font-black">{formatCurrency(parseBrazilianNumber(quantidade) * parseBrazilianNumber(preco))}</td>
                  <td className="px-2 py-2 text-center text-slate-300">—</td>
                </tr>
                {items.length === 0 ? <tr><td colSpan={8} className="p-6 text-center font-bold text-slate-400">Use a linha azul para adicionar o primeiro item.</td></tr> : items.map((item, index) => {
                  const chaveItem = chaveVarianteProduto(item.produtoId, item.fornecedorId);
                  const jaEstaNaVenda = produtosNaVenda.includes(chaveItem);
                  const disponivel = parseBrazilianNumber(item.quantidade) > 0 && !jaEstaNaVenda;
                  const selecionado = itensSelecionadosVenda.includes(chaveItem);
                  const produto = produtos.find((registro) => registro.id === item.produtoId);
                  const fornecedor = produto?.fornecedores?.find((registro) => registro.fornecedorId === item.fornecedorId);
                  const referenciaCliente = encontrarPrecoCliente(produtosCliente, item.produtoId, item.fornecedorId);
                  const precoAutorizado = Number(referenciaCliente?.precoAutorizado ?? referenciaCliente?.ultimoPreco ?? fornecedor?.precoVendaFornecedor ?? produto?.precoVendaPadrao ?? 0);
                  return <tr key={chaveItem} className={jaEstaNaVenda ? "bg-emerald-50/70 text-slate-500" : "bg-white"}><td className="px-1 py-1"><div className="flex flex-col items-center justify-center gap-1"><button type="button" disabled={!disponivel || salvando} title={jaEstaNaVenda ? "Item já inserido na venda" : "Enviar este item para a venda"} onClick={() => incluirItensNaVenda([chaveItem])} className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-1.5 text-[9px] font-black text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"><ArrowRight size={12} /> {jaEstaNaVenda ? "ENVIADO" : "ENVIAR"}</button><input aria-label={`Selecionar ${item.descricao} para venda`} type="checkbox" disabled={!disponivel} checked={selecionado} onChange={(event) => setItensSelecionadosVenda((atuais) => event.target.checked ? [...new Set([...atuais, chaveItem])] : atuais.filter((id) => id !== chaveItem))} /></div></td><td className="px-2 py-1 font-mono text-slate-400">{item.codigo || "—"}</td><td className="px-2 py-1 font-black uppercase text-slate-900">{item.descricao}{item.fornecedorReferencia && <span className="mt-0.5 block font-mono text-[9px] text-blue-700">REF. FORNECEDOR: {item.fornecedorReferencia}</span>}{jaEstaNaVenda && <span className="ml-2 rounded bg-emerald-700 px-1.5 py-0.5 text-[8px] font-black text-white">NA VENDA</span>}</td><td className="px-2 py-1"><input aria-label={`Quantidade de ${item.descricao} no orçamento`} value={item.quantidade} onChange={(event) => { const valor = event.target.value; setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, quantidade: valor } : registro)); if (parseBrazilianNumber(valor) <= 0) setItensSelecionadosVenda((atuais) => atuais.filter((id) => id !== chaveItem)); }} placeholder="0" className="w-full rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-right font-black outline-none focus:border-amber-600" /></td><td className="px-2 py-1 font-bold uppercase">{item.unidade}</td><td className="px-2 py-1"><PrecoAutorizadoInput clienteId={cliente!.id} produtoId={item.produtoId} fornecedorId={item.fornecedorId} value={item.precoUnitario} precoAutorizado={precoAutorizado} origem="orcamento" documentoId={orcamento?.id} ariaLabel={`Preço de ${item.descricao} no orçamento`} onAuthorized={(valorFormatado, valor) => { setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, precoUnitario: valorFormatado } : registro)); registrarPrecoAutorizadoLocal(item.produtoId, item.fornecedorId, valor); }} className="w-full min-w-16 rounded border border-sky-300 bg-sky-50 px-1.5 py-1 text-right font-black outline-none focus:border-sky-600" /></td><td className="px-2 py-1 text-right font-mono font-black">{formatCurrency(parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario))}</td><td className="px-1 py-1 text-center"><button type="button" aria-label={`Remover ${item.descricao}`} onClick={() => { setItems((atuais) => atuais.filter((_, itemIndex) => itemIndex !== index)); setItensSelecionadosVenda((atuais) => atuais.filter((id) => id !== chaveItem)); }} className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className={`min-w-0 h-fit rounded-xl bg-slate-100/70 ${compact ? "grid gap-2 p-2 lg:grid-cols-[1fr_1.4fr_auto]" : "space-y-4 border border-slate-300 p-5 shadow-sm"}`}>
          <div className={compact ? "hidden" : "flex items-center gap-3 border-b border-slate-200 pb-4"}><span className="rounded-xl bg-blue-100 p-2 text-blue-700"><FileText size={20} /></span><div><p className="font-black uppercase">Resumo do orçamento</p><p className="text-xs text-slate-500">{items.filter((item) => parseBrazilianNumber(item.quantidade) > 0).length} item(ns) selecionado(s)</p></div></div>
          <div className={compact ? "grid grid-cols-3 gap-2 text-[10px]" : "space-y-3"}><div className="flex flex-col justify-center rounded-lg border border-slate-200 bg-white px-2 py-1"><span className="font-black uppercase text-slate-500">Subtotal</span><strong className="text-sm">{formatCurrency(subtotal)}</strong></div><label className="rounded-lg border border-slate-200 bg-white px-2 py-1"><span className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-500"><Percent size={11} /> Desconto</span><div className="relative"><input aria-label="Desconto percentual" value={descontoPercentual} onChange={(event) => setDescontoPercentual(event.target.value)} placeholder="0" className="w-full bg-transparent pr-4 text-right text-sm font-black outline-none" /><span className="absolute right-0 top-1/2 -translate-y-1/2 font-black text-slate-500">%</span></div></label><div className="flex flex-col justify-center rounded-lg bg-blue-900 px-2 py-1 text-white"><span className="font-black uppercase">Total</span><strong className="text-sm">{formatCurrency(totalLiquido)}</strong></div></div>
          <label><span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-600">OBSERVAÇÕES</span><textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={compact ? 1 : 4} placeholder="Condições do orçamento..." className="w-full resize-none rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-blue-600" /></label>
          <div className={compact ? "flex items-end" : "space-y-2 border-t border-slate-200 pt-4"}>
            <button type="button" disabled={salvando} onClick={() => salvar(false)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-black uppercase text-white disabled:opacity-50"><Save size={15} /> {salvando ? "SALVANDO..." : "SALVAR ORÇAMENTO"}</button>
            {!compact && orcamento && <button type="button" onClick={() => { setOrcamentoPreview(orcamento); setPreviewOpen(true); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800"><Printer size={17} /> Visualizar e imprimir</button>}
            {!compact && orcamento && <button type="button" disabled={salvando} onClick={() => excluirOrcamento(orcamento)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-700"><Trash2 size={17} /> Excluir orçamento</button>}
          </div>
        </aside>
      </div>
        </>
      )}
    </div>
  );
}
