import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PrecoAutorizadoInput } from "./PrecoAutorizadoInput";
import { 
  Plus, Trash2, Printer, Save, X, Sparkles, Check, UserPlus, FileText,
  TrendingUp, DollarSign, Award, AlertCircle, CheckCircle2, Zap, MessageSquare, KeyRound, ShieldCheck,
  Lock, Unlock, TableProperties, History, ListChecks, CalendarRange, ShoppingCart
} from "lucide-react";
import { Cliente, Orcamento, Produto, ProdutoHabitual, SegurancaStatus, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { dataComPrazo, ParcelaValeRascunho } from "./ParcelasValeEditor";
import { useKeyboardListNavigation } from "../hooks/useKeyboardListNavigation";
import { ehCheque, FORMAS_PAGAMENTO } from "../lib/pagamentos";

interface VendaRapidaViewProps {
  onSaleSaved: () => void;
  onNavigateToView: (view: string) => void;
  orcamentoInicial?: Orcamento | null;
  onOrcamentoCarregado?: () => void;
  compact?: boolean;
  clienteExterno?: Cliente | null;
  ocultarSeletorCliente?: boolean;
  onItensChange?: (produtoIds: string[]) => void;
  vendaEmEdicao?: Venda | null;
  onCancelarEdicao?: () => void;
}

interface ItemRascunho {
  id?: string;
  produtoId: string;
  fornecedorId?: string | null;
  fornecedorReferencia?: string | null;
  codigo?: string;
  nome: string;
  quantidade: string; // Keep as string for friendly typing
  unidade: string;
  precoUnitario: string; // Keep as string for friendly typing
  desconto: string;      // Keep as string for friendly typing
  precoPadrao: number;
  precoAutorizado?: number;
  quantidadeDevolvida?: number;
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

type ProdutoComUnidades = Pick<Produto, "unidade">;

const getUnidadeVendaPrincipal = (produto: ProdutoComUnidades) => produto.unidade;

const getUnidadesVendaPermitidas = (produto: ProdutoComUnidades) => [produto.unidade];

const FORMAS_RECEBIMENTO = [
  ...FORMAS_PAGAMENTO,
  { value: "vale", label: "Vale — pagar depois" },
] as const;

const FORMAS_COM_INSTRUMENTO = new Set([
  "cheque_emitente",
  "cheque_terceiro",
]);

export function VendaRapidaView({ onSaleSaved, onNavigateToView, orcamentoInicial, onOrcamentoCarregado, compact = false, clienteExterno, ocultarSeletorCliente = false, onItensChange, vendaEmEdicao, onCancelarEdicao }: VendaRapidaViewProps) {
  // Clients state
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [saldoCreditoCarteira, setSaldoCreditoCarteira] = useState(0);
  const [showNovoClienteRapido, setShowNovoClienteRapido] = useState(false);
  
  // Fast Client Registration Form
  const [novoCliNome, setNovoCliNome] = useState("");
  const [novoCliTelefone, setNovoCliTelefone] = useState("");
  const [fastRegisterError, setFastRegisterError] = useState("");

  // Products state
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<FornecedorAssociadoProduto | null>(null);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);
  const [produtoDropdownPosition, setProdutoDropdownPosition] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  // Active Item Form
  const [itemQtd, setItemQtd] = useState("");
  const [itemUnidade, setItemUnidade] = useState("");
  const [itemPreco, setItemPreco] = useState("");

  // Cart
  const [itensVenda, setItensVenda] = useState<ItemRascunho[]>([]);
  const [produtosCliente, setProdutosCliente] = useState<ProdutoHabitual[]>([]);
  const [orcamentoCliente, setOrcamentoCliente] = useState<Orcamento | null>(null);
  const [orcamentoOrigemId, setOrcamentoOrigemId] = useState<string | null>(null);
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);
  const [showAutorizacaoPreco, setShowAutorizacaoPreco] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [autorizacaoErro, setAutorizacaoErro] = useState("");
  const [dadosAdmVisiveis, setDadosAdmVisiveis] = useState(false);
  const [showAnalisePin, setShowAnalisePin] = useState(false);
  const [analisePin, setAnalisePin] = useState("");
  const [analisePinErro, setAnalisePinErro] = useState("");

  // Client History for Sales BI
  const [clienteHistorico, setClienteHistorico] = useState<{
    cliente: Cliente;
    estatisticas: {
      totalComprado: number;
      totalPago: number;
      saldoPendente: number;
      lucroBruto: number;
    };
    produtosMaisComprados: any[];
    vendas: Venda[];
    pagamentos: any[];
  } | null>(null);
  const [vendaAnteriorId, setVendaAnteriorId] = useState("");
  const [itensVendaAnteriorSelecionados, setItensVendaAnteriorSelecionados] = useState<string[]>([]);
  const [historicoVendasOpen, setHistoricoVendasOpen] = useState(false);
  const [historicoDataInicial, setHistoricoDataInicial] = useState(() => {
    const data = new Date();
    data.setDate(data.getDate() - 90);
    return data.toISOString().split("T")[0];
  });
  const [historicoDataFinal, setHistoricoDataFinal] = useState(() => new Date().toISOString().split("T")[0]);
  const [historicoPage, setHistoricoPage] = useState(1);

  // Checkout Fields
  const [descontoGeral, setDescontoGeral] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("vale");
  const [vencimento, setVencimento] = useState("");
  const [parcelasVale, setParcelasVale] = useState<ParcelaValeRascunho[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [instrumentoEmitente, setInstrumentoEmitente] = useState("");
  const [instrumentoNumero, setInstrumentoNumero] = useState("");
  const [instrumentoVencimento, setInstrumentoVencimento] = useState("");
  const [instrumentoCpfTitular, setInstrumentoCpfTitular] = useState("");
  const [instrumentoCpfTerceiro, setInstrumentoCpfTerceiro] = useState("");
  const [instrumentoBanco, setInstrumentoBanco] = useState("");
  const [pinEdicao, setPinEdicao] = useState("");
  const [dataVendaEdicao, setDataVendaEdicao] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [vendaNumero, setVendaNumero] = useState(1);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  // Printing support
  const [vendaSalvaParaImpressao, setVendaSalvaParaImpressao] = useState<any | null>(null);

  // Copy to clipboard success state

  // Focus Refs
  const clienteInputRef = useRef<HTMLSelectElement>(null);
  const produtoInputRef = useRef<HTMLInputElement>(null);
  const quantidadeRef = useRef<HTMLInputElement>(null);
  const precoUnitarioRef = useRef<HTMLInputElement>(null);
  const descontoItemRef = useRef<HTMLInputElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const descontoGeralRef = useRef<HTMLInputElement>(null);
  const valorPagoRef = useRef<HTMLInputElement>(null);
  const formaPagamentoRef = useRef<HTMLSelectElement>(null);
  const vencimentoRef = useRef<HTMLInputElement>(null);
  const observacoesRef = useRef<HTMLTextAreaElement>(null);
  const salvarBtnRef = useRef<HTMLButtonElement>(null);

  // Load clients, products and next sequence number
  const loadInitialData = async () => {
    try {
      const [cList, pList, seq, segurancaStatus] = await Promise.all([
        api.getClientes(),
        api.getProdutos(),
        api.getProximoNumeroVenda(),
        api.getSegurancaStatus()
      ]);
      setClientes(cList.filter(c => c.ativo === 1));
      setProdutos(pList.filter(p => p.ativo === 1));
      setVendaNumero(seq.proximoNumero);
      setSeguranca(segurancaStatus);
    } catch (err) {
      console.error("Erro ao carregar dados de venda:", err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!ocultarSeletorCliente) return;
    setClienteSelecionado(clienteExterno || null);
  }, [clienteExterno, ocultarSeletorCliente]);

  useEffect(() => {
    if (!vendaEmEdicao || produtos.length === 0) return;
    const percentualDesconto = Number(vendaEmEdicao.subtotal) > 0
      ? (Number(vendaEmEdicao.desconto || 0) / Number(vendaEmEdicao.subtotal)) * 100
      : 0;
    setItensVenda((vendaEmEdicao.items || []).map((item) => {
      const produto = produtos.find((registro) => registro.id === item.produtoId);
      return {
        id: item.id,
        produtoId: item.produtoId,
        fornecedorId: item.fornecedorId,
        fornecedorReferencia: item.fornecedorReferencia,
        codigo: item.referencia || produto?.codigo,
        nome: item.descricao || produto?.nome || "Produto",
        quantidade: Number(item.quantidade).toString().replace(".", ","),
        unidade: item.unidade,
        precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
        desconto: item.desconto ? Number(item.desconto).toFixed(2).replace(".", ",") : "",
        precoPadrao: Number(
          produto?.fornecedores?.find((fornecedor) => fornecedor.fornecedorId === item.fornecedorId)?.precoVendaFornecedor
          ?? produto?.precoVendaPadrao
          ?? item.precoUnitario
        ),
        quantidadeDevolvida: Number(item.quantidadeDevolvida || 0)
      };
    }));
    setDescontoGeral(percentualDesconto ? percentualDesconto.toFixed(2).replace(".", ",") : "");
    setValorPago(Number(vendaEmEdicao.valorPago || 0).toFixed(2).replace(".", ","));
    setFormaPagamento(vendaEmEdicao.formaPagamento || ((vendaEmEdicao.parcelas || []).length > 0 ? "vale" : "avista_dinheiro"));
    setVencimento(vendaEmEdicao.vencimento || "");
    setParcelasVale((vendaEmEdicao.parcelas || []).map((parcela) => ({
      vencimento: parcela.vencimento,
      valor: Number(parcela.valor).toFixed(2).replace(".", ",")
    })));
    setObservacoes(vendaEmEdicao.observacoes || "");
    setInstrumentoEmitente(vendaEmEdicao.instrumentoRecebimento?.emitente || "");
    setInstrumentoNumero(vendaEmEdicao.instrumentoRecebimento?.numeroDocumento || "");
    setInstrumentoVencimento(vendaEmEdicao.instrumentoRecebimento?.vencimento || "");
    setInstrumentoCpfTitular(vendaEmEdicao.instrumentoRecebimento?.cpfTitular || vendaEmEdicao.clienteDocumento || "");
    setInstrumentoCpfTerceiro(vendaEmEdicao.instrumentoRecebimento?.cpfTerceiro || "");
    setInstrumentoBanco(vendaEmEdicao.instrumentoRecebimento?.banco || "");
    setDataVendaEdicao(vendaEmEdicao.data);
    setPinEdicao("");
    setFeedbackMsg(null);
  }, [vendaEmEdicao, produtos]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  useEffect(() => {
    if (!feedbackMsg) return;
    const timer = window.setTimeout(() => setFeedbackMsg(null), 10000);
    return () => window.clearTimeout(timer);
  }, [feedbackMsg]);

  useEffect(() => {
    if (!showProdutoDropdown || !produtoBusca.trim()) {
      setProdutoDropdownPosition(null);
      return;
    }

    const atualizarPosicao = () => {
      const input = produtoInputRef.current;
      if (!input) return;

      const rect = input.getBoundingClientRect();
      const margem = 8;
      const espacoAbaixo = window.innerHeight - rect.bottom - margem;
      const espacoAcima = rect.top - margem;
      const abrirAcima = espacoAbaixo < 260 && espacoAcima > espacoAbaixo;
      const espacoDisponivel = abrirAcima ? espacoAcima : espacoAbaixo;
      const width = Math.min(Math.max(rect.width, 540), window.innerWidth - margem * 2);
      const left = Math.min(Math.max(rect.left, margem), window.innerWidth - width - margem);

      setProdutoDropdownPosition({
        left,
        width,
        maxHeight: Math.max(96, Math.min(420, espacoDisponivel - 6)),
        ...(abrirAcima
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };

    atualizarPosicao();
    window.addEventListener("resize", atualizarPosicao);
    window.addEventListener("scroll", atualizarPosicao, true);
    return () => {
      window.removeEventListener("resize", atualizarPosicao);
      window.removeEventListener("scroll", atualizarPosicao, true);
    };
  }, [showProdutoDropdown, produtoBusca]);

  useEffect(() => {
    onItensChange?.(itensVenda
      .filter((item) => parseBrazilianNumber(item.quantidade) > 0)
      .map((item) => chaveVarianteProduto(item.produtoId, item.fornecedorId)));
  }, [itensVenda, onItensChange]);

  useEffect(() => {
    let active = true;

    if (clienteSelecionado) {
      setVendaAnteriorId("");
      setItensVendaAnteriorSelecionados([]);
      Promise.all([
        api.getClienteHistorico(clienteSelecionado.id),
        api.getClienteProdutosHabituais(clienteSelecionado.id),
        api.getCarteiraResumo(clienteSelecionado.id),
        api.getClienteOrcamentoVigente(clienteSelecionado.id)
      ])
        .then(([historico, habituais, carteira, orcamentoVigente]) => {
          if (!active) return;
          setClienteHistorico(historico);
          setProdutosCliente(habituais);
          setSaldoCreditoCarteira(Number(carteira.saldoBonus || 0));
          setOrcamentoCliente(orcamentoVigente);
          const precosAtuais = new Map(habituais.map((item) => [
            chaveVarianteProduto(item.produtoId, item.fornecedorId),
            Number(item.precoAutorizado ?? item.ultimoPreco)
          ]));
          setItensVenda((atuais) => atuais.map((item) => ({
            ...item,
            precoAutorizado: precosAtuais.get(chaveVarianteProduto(item.produtoId, item.fornecedorId))
          })));
        })
        .catch(err => {
          if (!active) return;
          console.error("Erro ao carregar dados do cliente:", err);
          setClienteHistorico(null);
          setProdutosCliente([]);
          setSaldoCreditoCarteira(0);
          setOrcamentoCliente(null);
          setFeedbackMsg({ type: "error", text: "Não foi possível carregar o histórico de preços deste cliente." });
        });
    } else {
      setClienteHistorico(null);
      setItensVenda([]);
      setProdutosCliente([]);
      setSaldoCreditoCarteira(0);
      setOrcamentoCliente(null);
      setVendaAnteriorId("");
      setItensVendaAnteriorSelecionados([]);
    }

    return () => {
      active = false;
    };
  }, [clienteSelecionado]);

  useEffect(() => {
    if (!orcamentoInicial || clientes.length === 0 || produtos.length === 0) return;
    const cliente = clientes.find((item) => item.id === orcamentoInicial.clienteId);
    if (!cliente) {
      setFeedbackMsg({ type: "error", text: "O cliente do orçamento não está disponível para venda." });
      onOrcamentoCarregado?.();
      return;
    }
    setClienteSelecionado(cliente);
    const itensRecebidos = orcamentoInicial.items.filter((item) => Number(item.quantidade) > 0).map((item) => {
      const produto = produtos.find((registro) => registro.id === item.produtoId);
      return {
        produtoId: item.produtoId,
        fornecedorId: item.fornecedorId,
        fornecedorReferencia: item.fornecedorReferencia,
        codigo: item.referencia || produto?.codigo,
        nome: item.descricao || produto?.nome || "Produto",
        quantidade: Number(item.quantidade).toString().replace(".", ","),
        unidade: item.unidade,
        precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
        desconto: "0",
        precoPadrao: Number(
          produto?.fornecedores?.find((fornecedor) => fornecedor.fornecedorId === item.fornecedorId)?.precoVendaFornecedor
          ?? produto?.precoVendaPadrao
          ?? item.precoUnitario
        )
      };
    });
    setItensVenda((atuais) => {
      let resultado = [...atuais];
      for (const recebido of itensRecebidos) {
        const indice = resultado.findIndex((item) =>
          chaveVarianteProduto(item.produtoId, item.fornecedorId)
          === chaveVarianteProduto(recebido.produtoId, recebido.fornecedorId)
        );
        resultado = indice >= 0
          ? resultado.map((item, itemIndex) => itemIndex === indice ? recebido : item)
          : [...resultado, recebido];
      }
      return resultado;
    });
    const percentualDesconto = Number(orcamentoInicial.subtotal) > 0
      ? (Number(orcamentoInicial.desconto) / Number(orcamentoInicial.subtotal)) * 100
      : 0;
    setDescontoGeral(percentualDesconto.toFixed(2).replace(".", ","));
    if (orcamentoInicial.observacoes) setObservacoes(orcamentoInicial.observacoes);
    setOrcamentoOrigemId(orcamentoInicial.id);
    setToastMsg(`${itensRecebidos.length} ${itensRecebidos.length === 1 ? "ITEM ADICIONADO" : "ITENS ADICIONADOS"} À VENDA.`);
    onOrcamentoCarregado?.();
  }, [orcamentoInicial, clientes, produtos, onOrcamentoCarregado]);

  const clientesOrdenados = clientes.filter(Boolean).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // Filter products based on query
  const filteredProdutos: OpcaoProdutoFornecedor[] = produtos.flatMap((produto) => {
    const fornecedores = produto.fornecedores || [];
    const opcoes = fornecedores.length > 0
      ? fornecedores.map((fornecedor) => ({
          produto,
          fornecedor,
          precoVenda: Number(fornecedor.precoVendaFornecedor ?? produto.precoVendaPadrao)
        }))
      : [{ produto, fornecedor: null, precoVenda: Number(produto.precoVendaPadrao) }];
    const termo = produtoBusca.toLowerCase();
    return opcoes.filter((opcao) =>
      produto.nome.toLowerCase().includes(termo) ||
      (produto.codigo || "").toLowerCase().includes(termo) ||
      (opcao.fornecedor?.fornecedorReferencia || "").toLowerCase().includes(termo)
    );
  }).slice(0, 20);

  const produtoKeyboard = useKeyboardListNavigation<OpcaoProdutoFornecedor>({
    items: filteredProdutos,
    isOpen: showProdutoDropdown && Boolean(produtoBusca.trim()),
    listId: "venda-produtos",
    resetKey: produtoBusca,
    onOpen: () => setShowProdutoDropdown(true),
    onClose: () => setShowProdutoDropdown(false),
    onSelect: (opcao) => handleSelectProduto(opcao)
  });

  // Calculations for added items
  const subtotalItens = itensVenda.reduce((acc, item) => {
    const qty = parseBrazilianNumber(item.quantidade);
    const preco = parseBrazilianNumber(item.precoUnitario);
    const desc = parseBrazilianNumber(item.desconto);
    return acc + (qty * preco) - desc;
  }, 0);
  const quantidadeItensPreenchidos = itensVenda.filter((item) => parseBrazilianNumber(item.quantidade) > 0).length;

  const descGeralPercent = parseBrazilianNumber(descontoGeral);
  const descGeral = subtotalItens * (descGeralPercent / 100);
  const totalLiquido = Math.max(0, subtotalItens - descGeral);
  const fatorPrecoEfetivo = subtotalItens > 0 ? totalLiquido / subtotalItens : 1;
  const itensQueExigemAutorizacao = itensVenda.filter((item) => {
    if (parseBrazilianNumber(item.quantidade) <= 0) return false;
    const pisoPermitido = item.precoAutorizado ?? item.precoPadrao;
    const precoEfetivo = parseBrazilianNumber(item.precoUnitario) * fatorPrecoEfetivo;
    return precoEfetivo < pisoPermitido - 0.005;
  });
  const vendaNoVale = vendaEmEdicao
    ? (vendaEmEdicao.parcelas || []).length > 0 || vendaEmEdicao.formaPagamento === "vale"
    : formaPagamento === "vale";
  const vendaComCredito = formaPagamento === "bonus";
  const formaExigeInstrumento = FORMAS_COM_INSTRUMENTO.has(formaPagamento);
  const vPago = vendaEmEdicao ? Math.min(totalLiquido, Number(vendaEmEdicao.valorPago || 0)) : vendaNoVale ? 0 : vendaComCredito
    ? Math.min(totalLiquido, saldoCreditoCarteira)
    : valorPago === "" ? totalLiquido : parseBrazilianNumber(valorPago);
  const saldoRestante = Math.max(0, totalLiquido - vPago);

  useEffect(() => {
    if (!vendaNoVale || totalLiquido <= 0) return;
    setParcelasVale((atuais) => {
      if (atuais.length === 0) {
        return [{ vencimento: dataComPrazo(30), valor: totalLiquido.toFixed(2).replace(".", ",") }];
      }
      if (atuais.length === 1) {
        return [{ ...atuais[0], valor: totalLiquido.toFixed(2).replace(".", ",") }];
      }
      return atuais;
    });
  }, [vendaNoVale, totalLiquido]);

  useEffect(() => {
    if (!vendaNoVale) return;
    const primeiro = [...parcelasVale].filter((parcela) => parcela.vencimento).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    setVencimento(primeiro?.vencimento || "");
  }, [vendaNoVale, parcelasVale]);

  const analiseLinhas = itensVenda
    .map((item) => {
      const quantidade = parseBrazilianNumber(item.quantidade);
      const precoUnitario = parseBrazilianNumber(item.precoUnitario);
      const descontoItem = parseBrazilianNumber(item.desconto);
      const produto = produtos.find((prod) => prod.id === item.produtoId);
      const valorAntesDescontoGeral = Math.max(0, (quantidade * precoUnitario) - descontoItem);
      const valorVenda = valorAntesDescontoGeral * fatorPrecoEfetivo;
      const custoUnitario = Number(
        produto?.fornecedores?.find((fornecedor) => fornecedor.fornecedorId === item.fornecedorId)?.custoFornecedor
        ?? produto?.custoPadrao
        ?? 0
      );
      const custoTotal = quantidade * custoUnitario;
      const lucro = valorVenda - custoTotal;
      const margem = valorVenda > 0 ? (lucro / valorVenda) * 100 : 0;
      return {
        ...item,
        quantidade,
        precoUnitario,
        valorVenda,
        custoUnitario,
        custoTotal,
        lucro,
        margem,
        fornecedor: produto?.ultimoFornecedorNome || "Sem compra registrada",
      };
    })
    .filter((item) => item.quantidade > 0);

  const quantidadeTotalAnalise = analiseLinhas.reduce((total, item) => total + item.quantidade, 0);
  const precoMedioAnalise = quantidadeTotalAnalise > 0 ? totalLiquido / quantidadeTotalAnalise : 0;

  // BI calculations
  const totalCustoItens = itensVenda.reduce((acc, item) => {
    const prod = produtos.find(p => p.id === item.produtoId);
    const custoUnit = Number(
      prod?.fornecedores?.find((fornecedor) => fornecedor.fornecedorId === item.fornecedorId)?.custoFornecedor
      ?? prod?.custoPadrao
      ?? 0
    );
    const qty = parseBrazilianNumber(item.quantidade);
    return acc + (qty * custoUnit);
  }, 0);

  const lucroEstimado = totalLiquido - totalCustoItens;
  const margemEstimada = totalLiquido > 0 ? (lucroEstimado / totalLiquido) * 100 : 0;

  // Suggest safe maximum discount to retain 15% margin
  const precoMinimoVenda = totalCustoItens / 0.85;
  const maxSafeDiscountVal = Math.max(0, subtotalItens - precoMinimoVenda);
  const maxSafeDiscountPct = subtotalItens > 0 ? (maxSafeDiscountVal / subtotalItens) * 100 : 0;

  const activeDebt = clienteHistorico?.estatisticas?.saldoPendente || 0;
  const hoje = new Date().toISOString().split("T")[0];
  const overdueSales = (clienteHistorico?.vendas || []).filter(
    (v) => v.status === "pendente" && !!v.vencimento && v.vencimento < hoje
  );
  const overdueDebt = overdueSales.reduce((total, venda) => total + Number(venda.saldoRestante || 0), 0);
  const vendasFiltradasHistorico = (clienteHistorico?.vendas || []).filter((venda) =>
    (!historicoDataInicial || venda.data >= historicoDataInicial) &&
    (!historicoDataFinal || venda.data <= historicoDataFinal)
  );
  const historicoPageSize = 8;
  const historicoTotalPages = Math.max(1, Math.ceil(vendasFiltradasHistorico.length / historicoPageSize));
  const vendasPaginaHistorico = vendasFiltradasHistorico.slice((historicoPage - 1) * historicoPageSize, historicoPage * historicoPageSize);
  const vendaAnteriorSelecionada = vendasFiltradasHistorico.find((venda) => venda.id === vendaAnteriorId) || null;
  
  // Handlers
  const handleSelectCliente = (cli: Cliente) => {
    if (clienteSelecionado?.id && clienteSelecionado.id !== cli.id) {
      setItensVenda([]);
      setOrcamentoOrigemId(null);
    }
    setClienteSelecionado(cli);
    // Focus product field on select
    setTimeout(() => {
      produtoInputRef.current?.focus();
    }, 50);
  };

  const handleSelectProduto = (opcao: OpcaoProdutoFornecedor) => {
    const { produto: prod, fornecedor, precoVenda } = opcao;
    const unidadePrincipal = getUnidadeVendaPrincipal(prod);
    const historicoCliente = encontrarPrecoCliente(produtosCliente, prod.id, fornecedor?.fornecedorId);
    const precoCliente = Number(historicoCliente?.precoAutorizado ?? historicoCliente?.ultimoPreco ?? precoVenda);
    setProdutoSelecionado({ ...prod, precoVendaPadrao: precoVenda });
    setFornecedorSelecionado(fornecedor);
    setProdutoBusca(prod.nome);
    setItemUnidade(unidadePrincipal);
    setItemPreco(precoCliente.toString().replace(".", ","));
    setItemQtd("");
    setShowProdutoDropdown(false);
    
    // Crucial rule: Após selecionar um material, posicionar o cursor automaticamente no campo de quantidade
    setTimeout(() => {
      quantidadeRef.current?.focus();
      quantidadeRef.current?.select();
    }, 50);
  };

  const registrarPrecoAutorizadoLocal = (produtoId: string, fornecedorId: string | null | undefined, novoPreco: number) => {
    const produto = produtos.find((item) => item.id === produtoId);
    if (!clienteSelecionado || !produto) return;
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
        clienteId: clienteSelecionado.id,
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

  const handleUnidadeChange = (novaUnidade: string) => {
    if (!produtoSelecionado || !getUnidadesVendaPermitidas(produtoSelecionado).includes(novaUnidade)) {
      return;
    }

    setItemUnidade(novaUnidade);
    setItemPreco(produtoSelecionado.precoVendaPadrao.toFixed(2).replace(".", ","));
  };

  const handleAddClienteRapido = async (e: React.FormEvent) => {
    e.preventDefault();
    setFastRegisterError("");
    if (!novoCliNome.trim()) {
      setFastRegisterError("Nome do cliente é obrigatório");
      return;
    }
    try {
      const newCli = await api.createCliente({
        nome: novoCliNome.trim(),
        telefone: novoCliTelefone.trim() || undefined,
        ativo: 1
      });
      // Add to state and set selected
      setClientes(prev => [...prev, newCli].sort((a, b) => a.nome.localeCompare(b.nome)));
      handleSelectCliente(newCli);
      setNovoCliNome("");
      setNovoCliTelefone("");
      setShowNovoClienteRapido(false);
    } catch (err: any) {
      setFastRegisterError(err.message || "Erro ao cadastrar.");
    }
  };

  const handleAddItem = () => {
    if (!produtoSelecionado) {
      setFeedbackMsg({ type: "error", text: "Por favor, busque e selecione um produto." });
      produtoInputRef.current?.focus();
      return;
    }
    
    const qty = parseBrazilianNumber(itemQtd);
    const price = parseBrazilianNumber(itemPreco);
    const unidadesPermitidas = getUnidadesVendaPermitidas(produtoSelecionado);

    if (!unidadesPermitidas.includes(itemUnidade)) {
      setFeedbackMsg({ type: "error", text: "A unidade selecionada não está liberada para este produto." });
      return;
    }

    if (qty <= 0) {
      setFeedbackMsg({ type: "error", text: "A quantidade deve ser maior que zero." });
      quantidadeRef.current?.focus();
      return;
    }

    if (price < 0) {
      setFeedbackMsg({ type: "error", text: "O preço unitário não pode ser negativo." });
      precoUnitarioRef.current?.focus();
      return;
    }
    const itemExistente = itensVenda.find((item) =>
      chaveVarianteProduto(item.produtoId, item.fornecedorId)
        === chaveVarianteProduto(produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)
      && parseBrazilianNumber(item.quantidade) > 0
    );
    if (itemExistente) {
      setFeedbackMsg({ type: "error", text: `${produtoSelecionado.nome} já está nesta venda.` });
      return;
    }

    // Add item (item-level discount retired, set to "0")
    const novoItem: ItemRascunho = {
      produtoId: produtoSelecionado.id,
      fornecedorId: fornecedorSelecionado?.fornecedorId || null,
      fornecedorReferencia: fornecedorSelecionado?.fornecedorReferencia || null,
      codigo: produtoSelecionado.codigo,
      nome: produtoSelecionado.nome,
      quantidade: itemQtd,
      unidade: itemUnidade,
      precoUnitario: itemPreco,
      desconto: "0",
      precoPadrao: produtoSelecionado.precoVendaPadrao,
      precoAutorizado: encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)
        ? Number(encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)?.precoAutorizado
          ?? encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)?.ultimoPreco)
        : undefined
    };

    setItensVenda(prev => {
      const habitualVazioIndex = prev.findIndex((item) =>
        chaveVarianteProduto(item.produtoId, item.fornecedorId)
          === chaveVarianteProduto(novoItem.produtoId, novoItem.fornecedorId)
        && parseBrazilianNumber(item.quantidade) <= 0
      );

      if (habitualVazioIndex >= 0) {
        return prev.map((item, index) => index === habitualVazioIndex
          ? { ...novoItem, precoPadrao: item.precoPadrao, precoAutorizado: item.precoAutorizado }
          : item
        );
      }

      return [...prev, novoItem];
    });

    // Clear item inputs for next item
    setProdutoSelecionado(null);
    setFornecedorSelecionado(null);
    setProdutoBusca("");
    setItemUnidade("");
    setItemQtd("");
    setItemPreco("");
    setFeedbackMsg(null);

    // Focus product search for next item
    setTimeout(() => {
      produtoInputRef.current?.focus();
    }, 50);
  };

  const handleRemoveItem = (index: number) => {
    setItensVenda(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, changes: Partial<ItemRascunho>) => {
    setItensVenda(prev => prev.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...changes } : item
    ));
  };

  const handleSelecionarVendaAnterior = (vendaId: string) => {
    setVendaAnteriorId(vendaId);
    setItensVendaAnteriorSelecionados([]);
  };

  const handleAlternarItemVendaAnterior = (itemId: string) => {
    setItensVendaAnteriorSelecionados((atuais) =>
      atuais.includes(itemId) ? atuais.filter((id) => id !== itemId) : [...atuais, itemId]
    );
  };

  const handleImportarItensVendaAnterior = () => {
    if (!vendaAnteriorSelecionada) return;
    const itensSelecionados = (vendaAnteriorSelecionada.items || []).filter((item) =>
      itensVendaAnteriorSelecionados.includes(item.id)
    );

    if (itensSelecionados.length === 0) {
      setFeedbackMsg({ type: "error", text: "Selecione pelo menos um item da venda anterior." });
      return;
    }

    setItensVenda((atuais) => {
      let resultado = [...atuais];
      for (const itemHistorico of itensSelecionados) {
        const produto = produtos.find((item) => item.id === itemHistorico.produtoId);
        if (!produto) continue;
        const importado: ItemRascunho = {
          produtoId: produto.id,
          fornecedorId: itemHistorico.fornecedorId,
          fornecedorReferencia: itemHistorico.fornecedorReferencia,
          codigo: produto.codigo,
          nome: itemHistorico.descricao || produto.nome,
          quantidade: Number(itemHistorico.quantidade).toString().replace(".", ","),
          unidade: itemHistorico.unidade || produto.unidade,
          precoUnitario: Number(itemHistorico.precoUnitario).toFixed(2).replace(".", ","),
          desconto: "0",
          precoPadrao: Number(
            produto.fornecedores?.find((fornecedor) => fornecedor.fornecedorId === itemHistorico.fornecedorId)?.precoVendaFornecedor
            ?? produto.precoVendaPadrao
          ),
          precoAutorizado: encontrarPrecoCliente(produtosCliente, produto.id, itemHistorico.fornecedorId)
            ? Number(encontrarPrecoCliente(produtosCliente, produto.id, itemHistorico.fornecedorId)?.precoAutorizado
              ?? encontrarPrecoCliente(produtosCliente, produto.id, itemHistorico.fornecedorId)?.ultimoPreco)
            : undefined
        };
        const existenteIndex = resultado.findIndex((item) =>
          chaveVarianteProduto(item.produtoId, item.fornecedorId)
            === chaveVarianteProduto(produto.id, itemHistorico.fornecedorId)
        );
        if (existenteIndex >= 0) {
          resultado = resultado.map((item, index) => index === existenteIndex
            ? { ...importado, precoAutorizado: item.precoAutorizado }
            : item
          );
        } else {
          resultado.push(importado);
        }
      }
      return resultado;
    });

    const mensagem = `${itensSelecionados.length} ${itensSelecionados.length === 1 ? "item adicionado" : "itens adicionados"} da venda #${vendaAnteriorSelecionada.numeroSequencial}.`;
    setFeedbackMsg({ type: "success", text: `${mensagem} Quantidades e preços continuam editáveis.` });
    setToastMsg(mensagem);
  };

  const carregarOrcamentoClienteNaVenda = () => {
    if (!orcamentoCliente) return;
    setItensVenda((atuais) => {
      let resultado = [...atuais];
      for (const item of orcamentoCliente.items.filter((registro) => Number(registro.quantidade) > 0)) {
        const produto = produtos.find((registro) => registro.id === item.produtoId);
        if (!produto) continue;
        const importado: ItemRascunho = {
          produtoId: item.produtoId,
          fornecedorId: item.fornecedorId,
          fornecedorReferencia: item.fornecedorReferencia,
          codigo: item.referencia || produto.codigo,
          nome: item.descricao || produto.nome,
          quantidade: Number(item.quantidade).toString().replace(".", ","),
          unidade: item.unidade || produto.unidade,
          precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
          desconto: "0",
          precoPadrao: Number(
            produto.fornecedores?.find((fornecedor) => fornecedor.fornecedorId === item.fornecedorId)?.precoVendaFornecedor
            ?? produto.precoVendaPadrao
          ),
          precoAutorizado: encontrarPrecoCliente(produtosCliente, item.produtoId, item.fornecedorId)?.precoAutorizado
        };
        const indice = resultado.findIndex((registro) =>
          chaveVarianteProduto(registro.produtoId, registro.fornecedorId)
            === chaveVarianteProduto(item.produtoId, item.fornecedorId)
        );
        resultado = indice >= 0
          ? resultado.map((registro, itemIndex) => itemIndex === indice ? importado : registro)
          : [...resultado, importado];
      }
      return resultado;
    });
    setOrcamentoOrigemId(orcamentoCliente.id);
    setToastMsg(`${orcamentoCliente.items.filter((item) => Number(item.quantidade) > 0).length} item(ns) do orçamento carregado(s).`);
  };

  // Quick keyboard focus skip helper on ENTER
  const handleKeyDown = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef.current?.focus();
      if (nextRef.current?.select) {
        nextRef.current.select();
      }
    }
  };

  const executarSalvamentoVenda = async (autorizacaoPreco?: { pin: string }) => {
    if (!clienteSelecionado) return;
    const itensPreenchidos = itensVenda.filter((item) => parseBrazilianNumber(item.quantidade) > 0);

    setLoading(true);
    setFeedbackMsg(null);
    setAutorizacaoErro("");

    try {
      if (vendaEmEdicao) {
        const atualizada = await api.updateVenda(vendaEmEdicao.id, {
          pin: pinEdicao,
          data: dataVendaEdicao || vendaEmEdicao.data,
          desconto: descGeral,
          observacoes: observacoes || undefined,
          items: itensPreenchidos.map((item) => ({
            id: item.id || `novo_${item.produtoId}`,
            produtoId: item.produtoId,
            fornecedorId: item.fornecedorId,
            fornecedorReferencia: item.fornecedorReferencia,
            quantidade: parseBrazilianNumber(item.quantidade),
            precoUnitario: parseBrazilianNumber(item.precoUnitario),
            desconto: parseBrazilianNumber(item.desconto)
          }))
        });
        setPinEdicao("");
        setFeedbackMsg({ type: "success", text: `Venda #${atualizada.numeroSequencial} atualizada com sucesso.` });
        onCancelarEdicao?.();
        onSaleSaved();
        return;
      }
      const vendaData = {
        clienteId: clienteSelecionado.id,
        data: new Date().toISOString().split("T")[0],
        descontoGeral: descGeral,
        items: itensPreenchidos.map(it => ({
          produtoId: it.produtoId,
          fornecedorId: it.fornecedorId,
          fornecedorReferencia: it.fornecedorReferencia,
          descricao: it.nome,
          quantidade: parseBrazilianNumber(it.quantidade),
          unidade: it.unidade,
          precoUnitario: parseBrazilianNumber(it.precoUnitario),
          desconto: parseBrazilianNumber(it.desconto)
        })),
        valorPago: vPago,
        formaPagamento,
        vencimento: vencimento || undefined,
        parcelas: vendaNoVale && vencimento ? [{ vencimento, valor: totalLiquido }] : undefined,
        observacoes: observacoes || undefined,
        instrumentoRecebimento: formaExigeInstrumento ? {
          emitente: instrumentoEmitente.trim() || (formaPagamento === "cheque_terceiro" ? `TERCEIRO ${instrumentoCpfTerceiro.trim()}` : clienteSelecionado.nome),
          numeroDocumento: instrumentoNumero.trim(),
          vencimento: instrumentoVencimento,
          cpfTitular: instrumentoCpfTitular.trim(),
          cpfTerceiro: instrumentoCpfTerceiro.trim() || undefined,
          banco: instrumentoBanco.trim(),
        } : undefined,
        autorizacaoPreco,
        orcamentoId: orcamentoOrigemId || undefined
      };

      const result = await api.createVenda(vendaData);
      setShowAutorizacaoPreco(false);
      setAdminPin("");
      setVendaSalvaParaImpressao({
        ...result,
        clienteNome: clienteSelecionado.nome,
        clienteTelefone: clienteSelecionado.telefone,
        clienteEndereco: clienteSelecionado.endereco,
        clienteDocumento: clienteSelecionado.documento,
        clienteIsWhatsapp: clienteSelecionado.isWhatsapp,
        formaPagamento,
        instrumentoRecebimento: formaExigeInstrumento ? {
          tipo: formaPagamento,
          emitente: instrumentoEmitente.trim() || (formaPagamento === "cheque_terceiro" ? `TERCEIRO ${instrumentoCpfTerceiro.trim()}` : clienteSelecionado.nome),
          numeroDocumento: instrumentoNumero.trim(),
          cpfTitular: instrumentoCpfTitular.trim(),
          cpfTerceiro: instrumentoCpfTerceiro.trim() || undefined,
          banco: instrumentoBanco.trim(),
          valor: vPago,
          vencimento: instrumentoVencimento,
          status: "a_receber"
        } : undefined,
        items: result.items?.length ? result.items : itensPreenchidos.map(it => ({
          produtoId: it.produtoId,
          fornecedorId: it.fornecedorId,
          fornecedorReferencia: it.fornecedorReferencia,
          referencia: it.codigo,
          descricao: it.nome,
          quantidade: parseBrazilianNumber(it.quantidade),
          unidade: it.unidade,
          precoUnitario: parseBrazilianNumber(it.precoUnitario),
          desconto: parseBrazilianNumber(it.desconto),
          total: (parseBrazilianNumber(it.quantidade) * parseBrazilianNumber(it.precoUnitario)) - parseBrazilianNumber(it.desconto)
        }))
      });
    } catch (err: any) {
      if (showAutorizacaoPreco || autorizacaoPreco) {
        setAutorizacaoErro(err.message || "Não foi possível validar a autorização.");
      } else {
        setFeedbackMsg({ type: "error", text: err.message || "Erro ao salvar a venda." });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVenda = async () => {
    if (!clienteSelecionado) {
      setFeedbackMsg({ type: "error", text: "Por favor, selecione um cliente para a venda." });
      clienteInputRef.current?.focus();
      return;
    }

    const itensPreenchidos = itensVenda.filter((item) => parseBrazilianNumber(item.quantidade) > 0);

    if (itensPreenchidos.length === 0) {
      setFeedbackMsg({ type: "error", text: "Preencha a quantidade de pelo menos um item da venda." });
      produtoInputRef.current?.focus();
      return;
    }

    if (vendaEmEdicao) {
      if (pinEdicao.length < 4 || pinEdicao.length > 64) {
        setFeedbackMsg({ type: "error", text: "Informe a senha do gerente para salvar a alteração." });
        return;
      }
      await executarSalvamentoVenda();
      return;
    }

    if (saldoRestante > 0 && !vencimento) {
      setFeedbackMsg({ type: "error", text: "Venda com saldo restante exige informar data de vencimento!" });
      vencimentoRef.current?.focus();
      return;
    }
    if (ehCheque(formaPagamento) && (!instrumentoNumero.trim() || !instrumentoVencimento || !instrumentoCpfTitular.trim() || !instrumentoBanco.trim() || (formaPagamento === "cheque_terceiro" && !instrumentoCpfTerceiro.trim()))) {
      setFeedbackMsg({ type: "error", text: "Informe vencimento, CPF/CNPJ, banco e número do cheque." });
      return;
    }
    if (vendaComCredito && saldoCreditoCarteira <= 0) {
      setFeedbackMsg({ type: "error", text: "Este cliente não possui crédito disponível na carteira." });
      return;
    }

    if (itensQueExigemAutorizacao.length > 0) {
      setAdminPin("");
      setAutorizacaoErro("");
      setShowAutorizacaoPreco(true);
      return;
    }

    await executarSalvamentoVenda();
  };

  const handleAutorizarPreco = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin.length < 4 || adminPin.length > 64) {
      setAutorizacaoErro("Informe a senha do gerente.");
      return;
    }
    await executarSalvamentoVenda({ pin: adminPin });
  };

  const handleDesbloquearAnalise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (analisePin.length < 4 || analisePin.length > 64) {
      setAnalisePinErro("Informe a senha do gerente.");
      return;
    }
    setAnalisePinErro("");
    try {
      await api.verificarPinAdministrador(analisePin, "visualizar_analise_venda");
      setDadosAdmVisiveis(true);
      setShowAnalisePin(false);
      setAnalisePin("");
    } catch (err: any) {
      setAnalisePinErro(err.message || "PIN administrativo inválido.");
    }
  };

  const resetForm = () => {
    setClienteSelecionado(null);
    setProdutoSelecionado(null);
    setFornecedorSelecionado(null);
    setProdutoBusca("");
    setItensVenda([]);
    setProdutosCliente([]);
    setOrcamentoOrigemId(null);
    setVendaAnteriorId("");
    setItensVendaAnteriorSelecionados([]);
    setHistoricoVendasOpen(false);
    setHistoricoPage(1);
    setDescontoGeral("");
    setValorPago("");
    setVencimento("");
    setParcelasVale([]);
    setObservacoes("");
    setFormaPagamento("vale");
    setInstrumentoEmitente("");
    setInstrumentoNumero("");
    setInstrumentoVencimento("");
    setInstrumentoCpfTitular("");
    setInstrumentoCpfTerceiro("");
    setInstrumentoBanco("");
    setFeedbackMsg(null);
    setShowAutorizacaoPreco(false);
    setAdminPin("");
    setAutorizacaoErro("");
    setDadosAdmVisiveis(false);
    setShowAnalisePin(false);
    setAnalisePin("");
    setAnalisePinErro("");
  };

  const executePrint = () => {
    window.print();
    // After printing, close print window/modal and reset
    setVendaSalvaParaImpressao(null);
    resetForm();
    onSaleSaved();
    loadInitialData();
  };

  return (
    <div id="quick-sale-view" className={`flex flex-col ${compact ? "gap-3" : "gap-6"}`}>
      {vendaEmEdicao && (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-300 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="text-sm text-blue-950">Editando venda #{vendaEmEdicao.numeroSequencial}</strong>
            <p className="text-xs font-semibold text-blue-800">Itens, quantidades, preços, desconto e observação podem ser ajustados. O pagamento já registrado será preservado.</p>
          </div>
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-900">
            Data
            <input type="date" value={dataVendaEdicao} onChange={(event) => setDataVendaEdicao(event.target.value)} className="min-h-10 rounded-lg border border-blue-300 bg-white px-3 text-sm font-bold normal-case" />
          </label>
        </div>
      )}
      {showAnalisePin && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleDesbloquearAnalise} role="dialog" aria-modal="true" aria-labelledby="analise-pin-titulo" className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Lock size={18} /></span>
                <div><h3 id="analise-pin-titulo" className="font-extrabold text-slate-950">Informações administrativas</h3><p className="mt-0.5 text-xs text-slate-500">Custo, lucro, fornecedor e margem.</p></div>
              </div>
              <button type="button" aria-label="Fechar PIN da análise" onClick={() => setShowAnalisePin(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              {!seguranca?.pinConfigurado ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><p className="font-bold">Configure primeiro o PIN do administrador.</p><button type="button" onClick={() => onNavigateToView("config")} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 font-bold text-white">Ir para Configurações</button></div>
              ) : (
                <><label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">Senha de {seguranca.nome}</label><input type="password" autoComplete="off" autoFocus value={analisePin} onChange={(event) => setAnalisePin(event.target.value.slice(0, 64))} placeholder="Senha do gerente" aria-label="Senha para visualizar análise" className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-xl font-black tracking-widest text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></>
              )}
              {analisePinErro && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{analisePinErro}</p>}
            </div>
            {seguranca?.pinConfigurado && <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" onClick={() => setShowAnalisePin(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600">Cancelar</button><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">Desbloquear</button></div>}
          </form>
        </div>
      )}
      {showAutorizacaoPreco && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleAutorizarPreco}
            role="dialog"
            aria-modal="true"
            aria-labelledby="autorizar-preco-titulo"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-5 py-4">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                  <KeyRound size={20} />
                </span>
                <div>
                  <h3 id="autorizar-preco-titulo" className="font-extrabold text-slate-950">Autorizar preço especial</h3>
                  <p className="mt-0.5 text-xs text-amber-800">{itensQueExigemAutorizacao.length} {itensQueExigemAutorizacao.length === 1 ? "item está" : "itens estão"} abaixo do preço permitido.</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar autorização"
                onClick={() => setShowAutorizacaoPreco(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {itensQueExigemAutorizacao.map((item) => (
                  <div key={item.produtoId} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-bold text-slate-800">{item.nome}</span>
                    <span className="shrink-0 font-mono font-black text-red-700">
                      {formatCurrency(parseBrazilianNumber(item.precoUnitario) * fatorPrecoEfetivo)}
                      <span className="ml-1 font-sans text-[9px] font-medium text-slate-400">/ piso {formatCurrency(item.precoAutorizado ?? item.precoPadrao)}</span>
                    </span>
                  </div>
                ))}
              </div>

              {!seguranca?.pinConfigurado ? (
                <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  <p className="font-bold">O PIN administrativo ainda não foi configurado.</p>
                  <button
                    type="button"
                    onClick={() => onNavigateToView("config")}
                    className="w-full rounded-lg bg-slate-900 px-3 py-2.5 font-bold text-white"
                  >
                    Ir para Ajustes & Backups
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">PIN de {seguranca.nome}</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      autoFocus
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.slice(0, 64))}
                      placeholder="••••"
                      aria-label="PIN administrativo"
                      className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-xl font-black tracking-[0.5em] text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    />
                  </div>
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
                    O preço autorizado passará a ser automaticamente o preço atual de <strong>{clienteSelecionado?.nome}</strong>. As vendas anteriores continuarão preservadas no histórico.
                  </p>
                </>
              )}

              {autorizacaoErro && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{autorizacaoErro}</p>
              )}
            </div>

            {seguranca?.pinConfigurado && (
              <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
                <button type="button" onClick={() => setShowAutorizacaoPreco(false)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-[1.5] rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-amber-600 disabled:opacity-50">
                  {loading ? "Validando..." : "Autorizar e finalizar"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {historicoVendasOpen && (
        <div className="fixed inset-0 z-[68] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-5">
          <div role="dialog" aria-modal="true" aria-labelledby="historico-vendas-titulo" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div><h3 id="historico-vendas-titulo" className="flex items-center gap-2 font-black text-slate-950"><History size={18} className="text-emerald-600" /> Histórico de vendas de {clienteSelecionado?.nome}</h3><p className="mt-1 text-xs text-slate-500">Escolha uma venda à direita e adicione os itens exibidos à esquerda.</p></div>
              <button type="button" aria-label="Fechar histórico de vendas" onClick={() => setHistoricoVendasOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={19} /></button>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label><span className="mb-1 block text-[10px] font-extrabold uppercase text-slate-500">Data inicial</span><input type="date" value={historicoDataInicial} onChange={(event) => { setHistoricoDataInicial(event.target.value); setHistoricoPage(1); setVendaAnteriorId(""); }} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold" /></label>
              <label><span className="mb-1 block text-[10px] font-extrabold uppercase text-slate-500">Data final</span><input type="date" value={historicoDataFinal} onChange={(event) => { setHistoricoDataFinal(event.target.value); setHistoricoPage(1); setVendaAnteriorId(""); }} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold" /></label>
              <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-center text-xs font-black text-slate-700">{vendasFiltradasHistorico.length} venda(s)</span>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
              <section className="min-h-[300px] border-b border-slate-200 p-4 lg:col-span-7 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                {!vendaAnteriorSelecionada ? <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center text-slate-400"><ShoppingCart size={34} /><p className="mt-3 font-bold">Selecione uma venda na lista ao lado.</p><p className="mt-1 text-xs">Os produtos, quantidades e preços aparecerão aqui.</p></div> :
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-black text-slate-950">Venda #{vendaAnteriorSelecionada.numeroSequencial}</h4><p className="text-xs text-slate-500">{formatDate(vendaAnteriorSelecionada.data)} • {formatCurrency(vendaAnteriorSelecionada.totalLiquido)}</p></div><div className="flex gap-2"><button type="button" onClick={() => setItensVendaAnteriorSelecionados((vendaAnteriorSelecionada.items || []).filter((item) => produtos.some((produto) => produto.id === item.produtoId)).map((item) => item.id))} className="rounded-lg border border-emerald-200 px-3 py-2 text-[11px] font-bold text-emerald-700">Selecionar todos</button><button type="button" disabled={itensVendaAnteriorSelecionados.length === 0} onClick={() => { handleImportarItensVendaAnterior(); setHistoricoVendasOpen(false); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:bg-slate-300"><ListChecks size={14} className="mr-1 inline" /> Adicionar selecionados</button></div></div>
                  <div className="space-y-2">
                    {(vendaAnteriorSelecionada.items || []).map((item) => {
                      const produtoDisponivel = produtos.some((produto) => produto.id === item.produtoId);
                      const selecionado = itensVendaAnteriorSelecionados.includes(item.id);
                      return <div key={item.id} className={`flex items-center gap-3 rounded-xl border p-3 ${selecionado ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"} ${!produtoDisponivel ? "opacity-50" : ""}`}>
                        <input type="checkbox" disabled={!produtoDisponivel} checked={selecionado} onChange={() => handleAlternarItemVendaAnterior(item.id)} className="h-4 w-4 accent-emerald-600" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-slate-900">{item.descricao}</p><p className="mt-0.5 text-xs text-slate-500">{formatDecimal(item.quantidade)} {item.unidade} • preço praticado <strong className="text-slate-800">{formatCurrency(item.precoUnitario)}</strong> • total {formatCurrency(item.total)}</p></div>
                      </div>;
                    })}
                  </div>
                </div>}
              </section>

              <aside className="min-h-[280px] bg-slate-50 p-4 lg:col-span-5 lg:overflow-y-auto">
                <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Vendas no período</h4>
                {vendasPaginaHistorico.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs font-bold text-slate-400">Nenhuma venda encontrada nesse período.</div> :
                <div className="space-y-2">{vendasPaginaHistorico.map((venda) => <button key={venda.id} type="button" onClick={() => handleSelecionarVendaAnterior(venda.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${venda.id === vendaAnteriorId ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-emerald-300"}`}><div className="flex items-center justify-between gap-3"><strong className="text-sm text-slate-900">{formatDate(venda.data)}</strong><span className="font-mono text-xs font-black text-emerald-700">{formatCurrency(venda.totalLiquido)}</span></div><div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-slate-500"><span>Venda #{venda.numeroSequencial}</span><span>{(venda.items || []).length} item(ns)</span></div></button>)}</div>}
                {vendasFiltradasHistorico.length > historicoPageSize && <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs"><button type="button" disabled={historicoPage <= 1} onClick={() => { setHistoricoPage((atual) => atual - 1); setVendaAnteriorId(""); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40">Anterior</button><strong>{historicoPage} / {historicoTotalPages}</strong><button type="button" disabled={historicoPage >= historicoTotalPages} onClick={() => { setHistoricoPage((atual) => atual + 1); setVendaAnteriorId(""); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold disabled:opacity-40">Próxima</button></div>}
              </aside>
            </div>
          </div>
        </div>
      )}

      {/* Pré-visualização e impressão: duas vias na mesma folha A4 */}
      {vendaSalvaParaImpressao && createPortal((
        <div
          id="print-receipt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="venda-finalizada-titulo"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6 print:absolute print:inset-0 print:block print:bg-white print:p-0"
        >
          <div className="mx-auto w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-slate-200 p-3 shadow-2xl sm:max-w-[calc(100vw-3rem)] print:max-w-none print:overflow-visible print:bg-white print:p-0 print:shadow-none">
            <div className="mb-3 flex flex-col gap-4 rounded-xl bg-white p-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={21} />
                </span>
                <div>
                  <h3 id="venda-finalizada-titulo" className="text-base font-extrabold text-slate-900">Venda finalizada</h3>
                  <p className="text-xs text-slate-500">A prévia abaixo já contém as duas vias na mesma folha A4.</p>
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
                <button type="button" onClick={executePrint} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"><Printer size={15} /> Imprimir</button>
                <button type="button" onClick={() => { setVendaSalvaParaImpressao(null); resetForm(); onSaleSaved(); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><X size={15} /> Fechar</button>
              </div>
            </div>

            <div className="max-w-full overflow-x-auto pb-2 print:overflow-visible print:pb-0"><VendaComprovante venda={vendaSalvaParaImpressao} /></div>

          </div>
        </div>
      ), document.body)}

      {/* Screen Area */}
      <div className={`${compact ? "hidden" : "flex"} flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4`}>
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Nova Venda</h2>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-100">
              Número Sequencial: #{vendaNumero}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={resetForm}
            className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold text-sm bg-slate-50 rounded-lg border border-slate-200/50 hover:bg-slate-100"
          >
            Limpar Campos
          </button>
        </div>
      </div>

      {/* Alert Feedbacks */}
      {feedbackMsg && (
        <div role={feedbackMsg.type === "error" ? "alert" : "status"} className={`fixed right-5 top-5 z-[95] flex max-w-sm items-center justify-between gap-3 rounded-xl border p-4 text-sm shadow-2xl ${
          feedbackMsg.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="p-1 hover:bg-slate-200/30 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {toastMsg && (
        <div role="status" className="fixed bottom-5 right-5 z-[90] flex max-w-sm items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-2xl">
          <CheckCircle2 size={19} className="shrink-0" />
          <span>{toastMsg}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setToastMsg(null)} className="rounded p-1 hover:bg-emerald-600"><X size={14} /></button>
        </div>
      )}

      {/* Step Grid */}
      <div className="contents">
        
        {/* Card 1: Cliente da Venda */}
        <div className={`${ocultarSeletorCliente ? "hidden" : "flex"} order-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex-col justify-between space-y-4`}>
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
                Cliente da Venda
              </label>
              
              <button 
                onClick={() => setShowNovoClienteRapido(!showNovoClienteRapido)}
                className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100/50 border border-emerald-200/50 px-2 py-1 rounded-lg transition-colors"
              >
                <UserPlus size={12} /> + Novo
              </button>
            </div>

            {/* Inline Fast Registration Form */}
            {showNovoClienteRapido && (
              <form onSubmit={handleAddClienteRapido} className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3 animate-fade-in">
                <h4 className="text-[11px] font-bold text-slate-700">Cadastro Rápido</h4>
                {fastRegisterError && <p className="text-[10px] text-red-600 font-semibold">{fastRegisterError}</p>}
                <div className="space-y-2">
                  <input 
                    type="text" 
                    placeholder="Nome completo (obrigatório)" 
                    value={novoCliNome}
                    onChange={(e) => setNovoCliNome(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-lg focus:border-emerald-500 outline-none font-medium"
                  />
                  <input 
                    type="text" 
                    placeholder="Telefone (opcional)" 
                    value={novoCliTelefone}
                    onChange={(e) => setNovoCliTelefone(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-lg focus:border-emerald-500 outline-none font-medium"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button 
                    type="button" 
                    onClick={() => setShowNovoClienteRapido(false)}
                    className="px-2 py-1 text-[10px] text-slate-400 font-bold"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold transition-colors"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            )}

            {/* Client Search or Selected Info */}
            <div className="mt-4">
              <select
                ref={clienteInputRef}
                value={clienteSelecionado?.id || ""}
                onChange={(event) => {
                  const selecionado = clientesOrdenados.find((cliente) => cliente.id === event.target.value);
                  if (selecionado) handleSelectCliente(selecionado);
                  else setClienteSelecionado(null);
                }}
                aria-label="Selecionar cliente da venda"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-500"
              >
                <option value="">SELECIONE O CLIENTE...</option>
                {clientesOrdenados.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}{cliente.telefone ? ` — ${cliente.telefone}` : ""}</option>)}
              </select>
              {clienteSelecionado && (
                <div className="mt-2 p-3 bg-emerald-50/50 border border-emerald-200/40 rounded-xl flex items-center justify-between animate-fade-in">
                  <div className="truncate pr-2">
                    <p className="font-extrabold text-slate-900 text-sm truncate">{clienteSelecionado.nome}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate flex items-center gap-1.5">
                      {clienteSelecionado.telefone || "Sem telefone"}
                      {clienteSelecionado.telefone && clienteSelecionado.isWhatsapp === 1 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600 font-bold bg-emerald-100/50 px-1.5 py-0.5 rounded border border-emerald-200/20">
                          <MessageSquare size={10} className="fill-emerald-600 text-emerald-100" /> WhatsApp
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{clienteSelecionado.documento || "Sem documento"}</p>
                  </div>
                </div>
              )}
            </div>

            {clienteSelecionado && (
              <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${overdueDebt > 0 ? "border-red-200 bg-red-50 text-red-800" : activeDebt > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                <span className="font-bold">{overdueDebt > 0 ? `${overdueSales.length} débito(s) vencido(s)` : activeDebt > 0 ? "Cliente possui saldo em aberto" : "Cliente em dia"}</span>
                <strong className="font-mono text-sm">Saldo: {formatCurrency(activeDebt)}</strong>
              </div>
            )}
          </div>
          
          <div className="text-[10px] text-slate-400 italic mt-3 leading-normal border-t border-slate-100/50 pt-2">
            {!clienteSelecionado ? (
              "Identifique o cliente para consultar histórico e saldo antes de concluir a venda."
            ) : (
              "Dados operacionais carregados. A análise abaixo acompanha os itens desta venda."
            )}
          </div>
        </div>

        {/* Análise por item, inspirada na planilha histórica do cliente. */}
        <section className="hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-900"><TableProperties size={17} className="text-emerald-600" /> Análise durante a venda</h3><p className="mt-1 text-xs font-medium text-slate-500">Uma linha para cada material. Desconto geral rateado proporcionalmente.</p></div>
            {dadosAdmVisiveis ? <button type="button" onClick={() => setDadosAdmVisiveis(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800"><Unlock size={15} /> Dados administrativos visíveis</button> : <button type="button" onClick={() => { setAnalisePinErro(""); setAnalisePin(""); setShowAnalisePin(true); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white"><Lock size={15} /> Ver custo e lucro com PIN</button>}
          </div>
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="flex items-center gap-2 text-xs font-extrabold text-slate-800"><History size={16} className="text-emerald-600" /> Reaproveitar uma venda anterior</p><p className="mt-1 text-[11px] text-slate-500">Consulte por período e traga produtos com quantidade e preço praticado.</p></div>
              <button type="button" disabled={!clienteSelecionado || (clienteHistorico?.vendas || []).length === 0} onClick={() => { setHistoricoPage(1); setVendaAnteriorId(""); setItensVendaAnteriorSelecionados([]); setHistoricoVendasOpen(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-extrabold text-white disabled:bg-slate-300"><CalendarRange size={16} /> Abrir histórico de vendas</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
              <thead><tr className="border-b border-slate-300 bg-white font-black uppercase text-slate-500"><th className="border-r border-slate-200 p-3">Data</th><th className="border-r border-slate-200 p-3">Cliente</th><th className="border-r border-slate-200 p-3 text-right">Qtd.</th><th className="border-r border-slate-200 p-3">Unid.</th><th className="border-r border-slate-200 p-3">Artigo / material</th><th className="border-r border-slate-200 p-3 text-right">V. unitário</th><th className="border-r border-slate-200 p-3 text-right">V. venda</th><th className="border-r border-slate-200 bg-slate-100 p-3 text-right">Custo</th><th className="border-r border-slate-200 bg-slate-100 p-3 text-right">Lucro</th><th className="border-r border-slate-200 bg-slate-100 p-3">Fornecedor</th><th className="bg-slate-100 p-3 text-right">Margem</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {analiseLinhas.length === 0 ? <tr><td colSpan={11} className="p-8 text-center font-bold text-slate-400">Selecione o cliente e preencha a quantidade dos materiais para formar a análise.</td></tr> : analiseLinhas.map((item, index) => <tr key={`analise-${item.produtoId}-${index}`} className="bg-amber-50/55 text-slate-800"><td className="border-r border-slate-200 p-3 font-mono">{formatDate(new Date().toISOString().slice(0, 10))}</td><td className="border-r border-slate-200 p-3 font-bold">{clienteSelecionado?.nome || "—"}</td><td className="border-r border-slate-200 p-3 text-right font-mono font-black">{formatDecimal(item.quantidade)}</td><td className="border-r border-slate-200 p-3 font-bold">{item.unidade}</td><td className="border-r border-slate-200 p-3 font-extrabold">{item.nome}</td><td className="border-r border-slate-200 p-3 text-right font-mono font-bold">{formatCurrency(item.precoUnitario)}</td><td className="border-r border-slate-200 p-3 text-right font-mono font-black">{formatCurrency(item.valorVenda)}</td><td className="border-r border-slate-200 bg-slate-50 p-3 text-right font-mono font-bold">{dadosAdmVisiveis ? formatCurrency(item.custoTotal) : "••••"}</td><td className="border-r border-slate-200 bg-slate-50 p-3 text-right font-mono font-black">{dadosAdmVisiveis ? formatCurrency(item.lucro) : "••••"}</td><td className="border-r border-slate-200 bg-slate-50 p-3 font-bold">{dadosAdmVisiveis ? item.fornecedor : <span className="inline-flex items-center gap-1 text-slate-400"><Lock size={12} /> Protegido</span>}</td><td className="bg-slate-50 p-3 text-right font-mono font-black">{dadosAdmVisiveis ? `${item.margem.toFixed(1)}%` : "••••"}</td></tr>)}
              </tbody>
              {analiseLinhas.length > 0 && <tfoot><tr className="border-t-2 border-slate-400 bg-slate-100 font-black text-slate-900"><td className="p-3" colSpan={2}>TOTAL DA VENDA</td><td className="border-l border-slate-300 p-3 text-right font-mono">{formatDecimal(quantidadeTotalAnalise)}</td><td className="p-3"></td><td className="p-3 text-right text-slate-500">Média {formatCurrency(precoMedioAnalise)}</td><td className="p-3"></td><td className="p-3 text-right font-mono">{formatCurrency(totalLiquido)}</td><td className="p-3 text-right font-mono">{dadosAdmVisiveis ? formatCurrency(totalCustoItens) : "••••"}</td><td className="p-3 text-right font-mono">{dadosAdmVisiveis ? formatCurrency(lucroEstimado) : "••••"}</td><td className="p-3"></td><td className="p-3 text-right font-mono">{dadosAdmVisiveis ? `${margemEstimada.toFixed(1)}%` : "••••"}</td></tr></tfoot>}
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-[11px]"><span className="font-bold text-slate-500">Vendedor: dados da venda • Administrador: custo, lucro, fornecedor e margem</span>{dadosAdmVisiveis && <span className={`rounded-lg px-2 py-1 font-extrabold ${margemEstimada >= 15 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{margemEstimada >= 15 ? "Margem saudável" : "Revisar margem"} • desconto seguro {maxSafeDiscountPct.toFixed(1)}%</span>}</div>
        </section>

        {/* Card 3: Resumo e Fechamento */}
        <div className={`order-4 bg-white flex flex-col justify-between ${compact ? "space-y-2 rounded-xl p-2" : "space-y-4 rounded-2xl border border-slate-200 p-5 shadow-sm"}`}>
          <div className={compact ? "grid gap-2 xl:grid-cols-2" : ""}>
            <label className={`${compact ? "hidden" : "flex"} text-xs font-extrabold text-slate-400 uppercase tracking-wider items-center gap-1.5 border-b border-slate-100 pb-3`}>
              <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
              Resumo & Fechamento
            </label>

            <div className={`${compact ? "space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]" : "mt-3 space-y-2.5 text-xs"}`}>
              <div className="flex justify-between text-slate-400 font-semibold">
                <span>Subtotal Itens:</span>
                <span className="font-bold text-slate-800">{formatCurrency(subtotalItens)}</span>
              </div>

              {/* Desconto Geral Input */}
              <div className="flex items-center justify-between gap-4 py-0.5">
                <span className="text-slate-400 font-semibold">Desconto Geral (%):</span>
                <div className="flex items-center gap-2">
                  {descGeral > 0 && (
                    <span className="text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                      -{formatCurrency(descGeral)}
                    </span>
                  )}
                  <div className="relative w-16">
                    <input 
                      ref={descontoGeralRef}
                      type="text" 
                      value={descontoGeral}
                      onChange={(e) => setDescontoGeral(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, valorPagoRef)}
                      placeholder="0"
                      className="w-full text-right bg-slate-50 border border-slate-200 text-xs font-bold pl-2 pr-5 py-1 rounded-lg text-slate-900 focus:border-emerald-500 outline-none"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">%</span>
                  </div>
                </div>
              </div>

              <hr className={compact ? "hidden" : "border-slate-100 my-1"} />

              <div className="flex justify-between items-center text-sm py-0.5">
                <span className="font-bold text-slate-900">Total Líquido:</span>
                <span className="text-base font-extrabold text-slate-950">{formatCurrency(totalLiquido)}</span>
              </div>

              {/* Valor Pago Input */}
              <div className="flex items-center justify-between gap-4 py-0.5">
                <span className="text-slate-500 font-bold">{vendaNoVale ? "Valor recebido agora:" : "Valor Recebido (R$):"}</span>
                <input 
                  ref={valorPagoRef}
                  type="text" 
                  value={vendaNoVale ? "" : vendaComCredito ? vPago.toFixed(2).replace(".", ",") : valorPago}
                  onChange={(e) => setValorPago(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, formaPagamentoRef)}
                  placeholder="0,00"
                  disabled={Boolean(vendaEmEdicao) || vendaNoVale || vendaComCredito}
                  className="w-28 text-right bg-slate-50 border border-slate-200 text-xs font-extrabold px-2.5 py-1 rounded-lg text-emerald-700 focus:border-emerald-500 outline-none disabled:bg-slate-200 disabled:text-slate-600"
                />
              </div>

              <div className="flex justify-between text-slate-500 text-[11px] italic font-semibold">
                <span>Saldo Restante (A Prazo):</span>
                <span className={`font-bold ${saldoRestante > 0 ? "text-amber-600 font-extrabold" : "text-slate-400"}`}>
                  {formatCurrency(saldoRestante)}
                </span>
              </div>
            </div>

            <hr className={compact ? "hidden" : "border-slate-100 my-2.5"} />

            {/* Formas de pagamento and extra data */}
            <div className={`${compact ? "space-y-1 rounded-lg border border-slate-200 bg-white p-2" : "space-y-2.5"}`}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Recebimento</label>
                <select 
                  ref={formaPagamentoRef}
                  value={formaPagamento}
                  disabled={Boolean(vendaEmEdicao)}
                  onChange={(e) => {
                    const novaForma = e.target.value;
                    setFormaPagamento(novaForma);
                    if (novaForma === "vale") setValorPago("");
                    else if (formaPagamento === "vale") setValorPago("");
                    if (!FORMAS_COM_INSTRUMENTO.has(novaForma)) {
                      setInstrumentoEmitente("");
                      setInstrumentoNumero("");
                      setInstrumentoVencimento("");
                      setInstrumentoCpfTitular("");
                      setInstrumentoCpfTerceiro("");
                      setInstrumentoBanco("");
                    } else if (!instrumentoCpfTitular) {
                      setInstrumentoCpfTitular(clienteSelecionado?.documento || "");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (saldoRestante > 0) {
                      handleKeyDown(e, vencimentoRef);
                    } else {
                      handleKeyDown(e, observacoesRef);
                    }
                  }}
                  className="min-w-0 flex-1 bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg font-bold text-slate-700 outline-none disabled:bg-slate-200 disabled:text-slate-500 sm:max-w-xs"
                >
                  {FORMAS_RECEBIMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}
                </select>
              </div>

              {vendaEmEdicao && <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] font-bold text-slate-600">Forma de pagamento e recebimentos preservados nesta edição.</p>}

              {vendaComCredito && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
                  <div className="flex justify-between gap-3"><span className="font-bold">Crédito disponível</span><strong>{formatCurrency(saldoCreditoCarteira)}</strong></div>
                  <div className="mt-1 flex justify-between gap-3"><span>Aplicado nesta venda</span><strong>{formatCurrency(vPago)}</strong></div>
                </div>
              )}

              {!vendaEmEdicao && formaExigeInstrumento && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">Vencimento *</label><input type="date" value={instrumentoVencimento} onChange={(event) => setInstrumentoVencimento(event.target.value)} className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">CPF/CNPJ titular *</label><input value={instrumentoCpfTitular} onChange={(event) => setInstrumentoCpfTitular(event.target.value.slice(0, 24))} placeholder={clienteSelecionado?.documento || "CPF/CNPJ"} className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  {formaPagamento === "cheque_terceiro" && <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">CPF/CNPJ terceiro *</label><input value={instrumentoCpfTerceiro} onChange={(event) => setInstrumentoCpfTerceiro(event.target.value.slice(0, 24))} placeholder="CPF/CNPJ DO TERCEIRO" className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>}
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">Banco *</label><input value={instrumentoBanco} onChange={(event) => setInstrumentoBanco(event.target.value.slice(0, 80))} placeholder="BANCO" className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">Nº cheque *</label><input type="text" value={instrumentoNumero} onChange={(event) => setInstrumentoNumero(event.target.value)} placeholder="NÚMERO" className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  <p className="text-[10px] font-semibold text-sky-800 sm:col-span-2 xl:col-span-5">O vencimento gera alerta; não marca o cheque como recebido automaticamente.</p>
                </div>
              )}

              {!vendaEmEdicao && vendaNoVale && saldoRestante > 0 && (
                <div className="space-y-1.5 rounded-xl border border-amber-200/50 bg-amber-50/60 p-2.5 text-[10px] animate-fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <label className="font-bold uppercase text-amber-800">Vencimento do vale</label>
                    <input
                      ref={vencimentoRef}
                      type="date"
                      value={vencimento}
                      onChange={(event) => {
                        setVencimento(event.target.value);
                        setParcelasVale([{ vencimento: event.target.value, valor: totalLiquido.toFixed(2).replace(".", ",") }]);
                      }}
                      onKeyDown={(event) => handleKeyDown(event, observacoesRef)}
                      required
                      className="rounded border border-amber-200 bg-white px-2 py-1 font-bold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>
                  <p className="font-semibold text-amber-800">O parcelamento será definido somente quando uma ordem de cobrança for criada.</p>
                </div>
              )}

              {/* Vencimento único para outras formas com saldo a prazo */}
              {!vendaEmEdicao && !vendaNoVale && saldoRestante > 0 && (
                <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/30 space-y-1.5 animate-fade-in text-[10px]">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-amber-800 uppercase">Vencimento do Saldo</label>
                    <input 
                      ref={vencimentoRef}
                      type="date" 
                      value={vencimento}
                      onChange={(e) => setVencimento(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, observacoesRef)}
                      required
                      className="bg-white border border-amber-200 text-[10px] px-2 py-0.5 rounded text-slate-900 focus:border-amber-500 outline-none font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Observações</label>
                <textarea
                  ref={observacoesRef}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value.slice(0, 100))}
                  placeholder="Observação da venda..."
                  rows={2}
                  maxLength={100}
                  className="min-h-16 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 sm:w-72 placeholder:text-[10px]"
                />
              </div>
            </div>
          </div>

          <div className={compact ? "" : "pt-3 border-t border-slate-100"}>
            {vendaEmEdicao && <div className="mb-2 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={pinEdicao} onChange={(event) => { setPinEdicao(event.target.value.slice(0, 64)); setFeedbackMsg(null); }} placeholder="Senha do gerente para salvar" className="min-h-10 flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 text-center text-xs font-black tracking-widest outline-none focus:border-blue-600" /><button type="button" onClick={onCancelarEdicao} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-black uppercase text-slate-700">Cancelar edição</button></div>}
            <button 
              ref={salvarBtnRef}
              type="button"
              disabled={loading}
              onClick={handleSaveVenda}
              className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black uppercase shadow-md shadow-emerald-950/10 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              {loading ? (vendaEmEdicao ? "SALVANDO..." : "FINALIZANDO...") : (vendaEmEdicao ? "SALVAR ALTERAÇÕES" : "FINALIZAR VENDA")}
            </button>
          </div>
        </div>

      </div>

      {/* Full Width Bottom Row: Adicionar Itens and Table Carrinho */}
      <div className={`order-3 bg-white ${compact ? "space-y-2 rounded-xl p-2" : "space-y-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-6"}`}>
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
            ITENS DA VENDA
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {!vendaEmEdicao && orcamentoCliente && <button type="button" onClick={carregarOrcamentoClienteNaVenda} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase text-blue-900 hover:bg-blue-100"><FileText size={13} /> CARREGAR ORÇAMENTO ({orcamentoCliente.items.filter((item) => Number(item.quantidade) > 0).length})</button>}
            <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {quantidadeItensPreenchidos} de {itensVenda.length} {itensVenda.length === 1 ? 'linha preenchida' : 'linhas preenchidas'}
            </div>
          </div>
        </div>

        {/* Added Items Grid Table - Clean, full horizontal width, high typography contrast */}
        <div className={`max-h-[72vh] overflow-auto rounded-xl border border-slate-200 shadow-sm ${itensVenda.length === 0 ? "min-h-[420px]" : "min-h-[260px]"}`}>
          <table className={`${itensVenda.length === 0 ? "min-h-[418px]" : ""} ${compact ? "min-w-[700px] xl:min-w-0 xl:table-fixed" : "min-w-[820px]"} w-full text-xs text-left`}>
            <colgroup>
              <col className="w-[8%]" /><col className="w-[28%]" /><col className="w-[10%]" />
              <col className="w-[10%]" /><col className="w-[18%]" /><col className="w-[16%]" /><col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-black text-[10px] uppercase border-b border-slate-200">
                <th className="px-2 py-1.5 w-16">CÓD.</th>
                <th className="px-2 py-1.5">MATERIAL</th>
                <th className="px-2 py-1.5 text-center w-28">QTD.</th>
                <th className="px-2 py-1.5 text-center w-24">UN.</th>
                <th className="px-2 py-1.5 text-right w-32">PREÇO</th>
                <th className="px-2 py-1.5 text-right w-28">TOTAL</th>
                <th className="px-2 py-1.5 text-center w-16">AÇÃO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-emerald-50/70">
                <td className="px-2 py-2 text-center"><button ref={addBtnRef} type="button" onClick={handleAddItem} title="Adicionar item à venda" aria-label="Adicionar item à venda" className="rounded-md bg-emerald-600 p-2 text-white hover:bg-emerald-700"><Plus size={14} /></button></td>
                <td className="relative px-2 py-2">
                  <input ref={produtoInputRef} value={produtoBusca} onChange={(event) => { setProdutoBusca(event.target.value); setProdutoSelecionado(null); setFornecedorSelecionado(null); setShowProdutoDropdown(true); }} onFocus={() => setShowProdutoDropdown(true)} onKeyDown={produtoKeyboard.onKeyDown} role="combobox" aria-autocomplete="list" aria-expanded={showProdutoDropdown && Boolean(produtoBusca.trim())} aria-controls="venda-produtos" aria-activedescendant={produtoKeyboard.activeDescendant} placeholder="Digite código, referência ou material..." className="w-full rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-500" />
                  {showProdutoDropdown && produtoBusca.trim() && produtoDropdownPosition && createPortal(
                    <div
                      id="venda-produtos"
                      role="listbox"
                      aria-label="Produtos encontrados"
                      className="fixed z-[100] overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-white shadow-2xl"
                      style={produtoDropdownPosition}
                    >
                      {filteredProdutos.length
                        ? filteredProdutos.map((opcao, index) => (
                          <button {...produtoKeyboard.getOptionProps(index)} key={`${opcao.produto.id}:${opcao.fornecedor?.fornecedorId || "sem-fornecedor"}`} type="button" onClick={() => handleSelectProduto(opcao)} className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left text-xs hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none ${produtoKeyboard.activeIndex === index ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : ""}`}>
                            <span className="min-w-0"><strong className="block truncate">{opcao.produto.nome}</strong><small className="block font-mono text-slate-600">REF.: {opcao.produto.codigo || "SEM REFERÊNCIA"} • {opcao.produto.unidade}</small><small className="mt-1 block text-[10px] font-black text-emerald-800">REF. FORNECEDOR: {opcao.fornecedor?.fornecedorReferencia || "SEM REFERÊNCIA"}</small></span>
                            <strong className="shrink-0 text-emerald-700">VENDA {formatCurrency(opcao.precoVenda)}</strong>
                          </button>
                        ))
                        : <p className="p-3 text-xs font-bold text-slate-400">Produto não encontrado.</p>}
                    </div>,
                    document.body
                  )}
                </td>
                <td className="px-2 py-2"><input ref={quantidadeRef} value={itemQtd} onChange={(event) => setItemQtd(event.target.value)} onKeyDown={(event) => handleKeyDown(event, precoUnitarioRef)} placeholder="0" className="w-full rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-right text-xs font-black outline-none focus:border-emerald-500" /></td>
                <td className="px-2 py-2 text-center text-xs font-bold text-slate-600">{itemUnidade || "—"}</td>
                <td className="px-2 py-2">{clienteSelecionado && produtoSelecionado ? <PrecoAutorizadoInput clienteId={clienteSelecionado.id} produtoId={produtoSelecionado.id} fornecedorId={fornecedorSelecionado?.fornecedorId} value={itemPreco} precoAutorizado={Number(encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)?.precoAutorizado ?? encontrarPrecoCliente(produtosCliente, produtoSelecionado.id, fornecedorSelecionado?.fornecedorId)?.ultimoPreco ?? produtoSelecionado.precoVendaPadrao)} origem="venda" ariaLabel={`Preço de ${produtoSelecionado.nome} na venda`} onAuthorized={(valorFormatado, valor) => { setItemPreco(valorFormatado); registrarPrecoAutorizadoLocal(produtoSelecionado.id, fornecedorSelecionado?.fornecedorId, valor); }} className="w-full min-w-16 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-right text-xs font-black outline-none focus:border-emerald-500" /> : <input ref={precoUnitarioRef} value={itemPreco} onChange={(event) => setItemPreco(event.target.value)} placeholder="0,00" className="w-full rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-right text-xs font-black outline-none focus:border-emerald-500" />}</td>
                <td className="px-2 py-2 text-right font-mono text-xs font-black">{formatCurrency(parseBrazilianNumber(itemQtd) * parseBrazilianNumber(itemPreco))}</td>
                <td className="px-2 py-2 text-center text-slate-300">—</td>
              </tr>
              {itensVenda.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-xs font-semibold text-slate-400">Use a linha verde para adicionar o primeiro item.</td></tr> : (
                itensVenda.map((it, idx) => {
                  const qty = parseBrazilianNumber(it.quantidade);
                  const price = parseBrazilianNumber(it.precoUnitario);
                  const totalItem = qty * price;
                  const produto = produtos.find((item) => item.id === it.produtoId);
                  const unidadesPermitidas = produto ? getUnidadesVendaPermitidas(produto) : [it.unidade];
                  const pisoPermitido = it.precoAutorizado ?? it.precoPadrao;
                  const exigeAutorizacao = qty > 0 && (price * fatorPrecoEfetivo) < pisoPermitido - 0.005;

                  return (
                    <tr key={`${it.produtoId}-${idx}`} className={`${exigeAutorizacao ? "bg-red-50/60" : qty > 0 ? "bg-white" : "bg-amber-50/40"} hover:bg-slate-50/70 text-slate-700 transition-colors`}>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-400 font-bold">{it.codigo || "-"}</td>
                      <td className="px-2 py-2 text-xs font-bold text-slate-900">
                        {it.nome}
                        {it.fornecedorReferencia && <span className="mt-0.5 block font-mono text-[9px] font-black text-emerald-700">REF. FORNECEDOR: {it.fornecedorReferencia}</span>}
                      </td>
                      <td className="p-2 text-center font-extrabold">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={it.quantidade}
                          onChange={(event) => handleUpdateItem(idx, { quantidade: event.target.value })}
                          placeholder="0"
                          aria-label={`Quantidade de ${it.nome}`}
                          className="w-full min-w-0 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1.5 text-right text-xs font-black text-slate-900 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <select
                          value={it.unidade}
                          onChange={(event) => handleUpdateItem(idx, { unidade: event.target.value })}
                          aria-label={`Unidade de ${it.nome}`}
                          className="w-full min-w-0 rounded-md border border-slate-300 bg-slate-100 px-1 py-1.5 text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-600 focus:bg-white"
                        >
                          {unidadesPermitidas.map((unidade) => (
                            <option key={unidade} value={unidade}>{unidade}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-600">
                        {clienteSelecionado ? <PrecoAutorizadoInput
                          clienteId={clienteSelecionado.id}
                          produtoId={it.produtoId}
                          fornecedorId={it.fornecedorId}
                          value={it.precoUnitario}
                          precoAutorizado={Number(it.precoAutorizado ?? it.precoPadrao)}
                          origem="venda"
                          ariaLabel={`Preço unitário de ${it.nome}`}
                          onAuthorized={(valorFormatado, valor) => {
                            handleUpdateItem(idx, { precoUnitario: valorFormatado, precoAutorizado: valor });
                            registrarPrecoAutorizadoLocal(it.produtoId, it.fornecedorId, valor);
                          }}
                          className={`w-full min-w-16 rounded-md border px-1.5 py-1.5 text-right text-xs font-black text-slate-900 outline-none focus:bg-white focus:ring-2 ${
                            exigeAutorizacao
                              ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100"
                              : "border-sky-300 bg-sky-50 focus:border-emerald-600 focus:ring-emerald-100"
                          }`}
                        /> : <input value={it.precoUnitario} onChange={(event) => handleUpdateItem(idx, { precoUnitario: event.target.value })} inputMode="decimal" aria-label={`Preço unitário de ${it.nome}`} className="w-full min-w-16 rounded-md border border-slate-300 px-1.5 py-1.5 text-right text-xs font-black text-slate-900 outline-none focus:border-emerald-600" />}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs font-extrabold text-slate-900">{formatCurrency(totalItem)}</td>
                      <td className="px-2 py-2 text-center">
                        <button 
                          type="button" 
                          disabled={Number(it.quantidadeDevolvida || 0) > 0}
                          onClick={() => handleRemoveItem(idx)}
                          className="rounded-md border border-red-200 p-1.5 text-red-600 transition-all hover:border-red-600 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                          title={Number(it.quantidadeDevolvida || 0) > 0 ? "Item com devolução deve permanecer no histórico" : "Remover somente desta venda"}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

        </div>
      </div>
    </div>
  );
}
