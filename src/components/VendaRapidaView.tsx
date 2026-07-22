import React, { useState, useEffect, useRef } from "react";
import { 
  Search, Plus, Trash2, Printer, Save, X, Sparkles, Check, ChevronDown, UserPlus, FileText,
  TrendingUp, DollarSign, Award, AlertCircle, CheckCircle2, Zap, Share2, MessageSquare, KeyRound, ShieldCheck,
  Lock, Unlock, TableProperties, History, ListChecks
} from "lucide-react";
import { Cliente, Produto, SegurancaStatus, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";

interface VendaRapidaViewProps {
  onSaleSaved: () => void;
  onNavigateToView: (view: string) => void;
}

interface ItemRascunho {
  produtoId: string;
  codigo?: string;
  nome: string;
  quantidade: string; // Keep as string for friendly typing
  unidade: string;
  precoUnitario: string; // Keep as string for friendly typing
  desconto: string;      // Keep as string for friendly typing
  precoPadrao: number;
  precoAutorizado?: number;
}

type ProdutoComUnidades = Pick<Produto, "unidade">;

const getUnidadeVendaPrincipal = (produto: ProdutoComUnidades) => produto.unidade;

const getUnidadesVendaPermitidas = (produto: ProdutoComUnidades) => [produto.unidade];

const FORMAS_RECEBIMENTO = [
  { value: "avista_dinheiro", label: "À vista — dinheiro" },
  { value: "avista_debito", label: "À vista — débito" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "pix", label: "PIX" },
  { value: "cheque_emitente", label: "Cheque do emitente" },
  { value: "cheque_terceiro", label: "Cheque de terceiro" },
  { value: "duplicata_emitente", label: "Duplicata do emitente" },
  { value: "duplicata_terceiro", label: "Duplicata de terceiro" },
  { value: "bonus", label: "Bônus / crédito — próxima etapa", disabled: true },
  { value: "vale", label: "Vale — pagar depois" },
] as const;

const FORMAS_COM_INSTRUMENTO = new Set([
  "cheque_emitente",
  "cheque_terceiro",
  "duplicata_emitente",
  "duplicata_terceiro",
]);

export function VendaRapidaView({ onSaleSaved, onNavigateToView }: VendaRapidaViewProps) {
  // Clients state
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [showNovoClienteRapido, setShowNovoClienteRapido] = useState(false);
  
  // Fast Client Registration Form
  const [novoCliNome, setNovoCliNome] = useState("");
  const [novoCliTelefone, setNovoCliTelefone] = useState("");
  const [fastRegisterError, setFastRegisterError] = useState("");

  // Products state
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);

  // Active Item Form
  const [itemQtd, setItemQtd] = useState("1");
  const [itemUnidade, setItemUnidade] = useState("");
  const [itemPreco, setItemPreco] = useState("");
  const [itemDesconto, setItemDesconto] = useState("0");

  // Cart
  const [itensVenda, setItensVenda] = useState<ItemRascunho[]>([]);
  const [quantidadeHabituaisCarregados, setQuantidadeHabituaisCarregados] = useState(0);
  const [carregandoHabituais, setCarregandoHabituais] = useState(false);
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);
  const [showAutorizacaoPreco, setShowAutorizacaoPreco] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [salvarPrecoCliente, setSalvarPrecoCliente] = useState(true);
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

  // Checkout Fields
  const [descontoGeral, setDescontoGeral] = useState("0");
  const [valorPago, setValorPago] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [vencimento, setVencimento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [instrumentoEmitente, setInstrumentoEmitente] = useState("");
  const [instrumentoNumero, setInstrumentoNumero] = useState("");
  const [instrumentoVencimento, setInstrumentoVencimento] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [vendaNumero, setVendaNumero] = useState(1);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Printing support
  const [vendaSalvaParaImpressao, setVendaSalvaParaImpressao] = useState<any | null>(null);

  // Copy to clipboard success state
  const [copiado, setCopiado] = useState(false);

  // Focus Refs
  const clienteInputRef = useRef<HTMLInputElement>(null);
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
    let active = true;

    if (clienteSelecionado) {
      setVendaAnteriorId("");
      setItensVendaAnteriorSelecionados([]);
      setCarregandoHabituais(true);
      Promise.all([
        api.getClienteHistorico(clienteSelecionado.id),
        api.getClienteProdutosHabituais(clienteSelecionado.id)
      ])
        .then(([historico, habituais]) => {
          if (!active) return;
          setClienteHistorico(historico);
          setItensVenda(habituais.map((item) => ({
            produtoId: item.produtoId,
            codigo: item.codigo,
            nome: item.nome,
            quantidade: "",
            unidade: item.unidade,
            precoUnitario: Number(item.ultimoPreco).toString().replace(".", ","),
            desconto: "0",
            precoPadrao: Number(item.precoVendaPadrao),
            precoAutorizado: item.precoAutorizado == null ? undefined : Number(item.precoAutorizado)
          })));
          setQuantidadeHabituaisCarregados(habituais.length);
          if (habituais.length > 0) {
            setFeedbackMsg({
              type: "success",
              text: `${habituais.length} ${habituais.length === 1 ? "produto habitual carregado" : "produtos habituais carregados"}. Preencha somente as quantidades desta venda.`
            });
          }
        })
        .catch(err => {
          if (!active) return;
          console.error("Erro ao carregar dados habituais do cliente:", err);
          setClienteHistorico(null);
          setItensVenda([]);
          setQuantidadeHabituaisCarregados(0);
          setFeedbackMsg({ type: "error", text: "Não foi possível carregar o padrão de compra deste cliente." });
        })
        .finally(() => {
          if (active) setCarregandoHabituais(false);
        });
    } else {
      setClienteHistorico(null);
      setItensVenda([]);
      setQuantidadeHabituaisCarregados(0);
      setVendaAnteriorId("");
      setItensVendaAnteriorSelecionados([]);
    }

    return () => {
      active = false;
    };
  }, [clienteSelecionado]);

  // Filter clients based on query
  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(clienteBusca.toLowerCase()) || 
    (c.telefone && c.telefone.includes(clienteBusca)) ||
    (c.documento && c.documento.includes(clienteBusca))
  );

  // Filter products based on query
  const filteredProdutos = produtos.filter(p => 
    p.nome.toLowerCase().includes(produtoBusca.toLowerCase()) || 
    (p.codigo && p.codigo.toLowerCase().includes(produtoBusca.toLowerCase()))
  );

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
  const vendaNoVale = formaPagamento === "vale";
  const formaExigeInstrumento = FORMAS_COM_INSTRUMENTO.has(formaPagamento);
  const vPago = vendaNoVale ? 0 : valorPago === "" ? totalLiquido : parseBrazilianNumber(valorPago);
  const saldoRestante = Math.max(0, totalLiquido - vPago);

  const analiseLinhas = itensVenda
    .map((item) => {
      const quantidade = parseBrazilianNumber(item.quantidade);
      const precoUnitario = parseBrazilianNumber(item.precoUnitario);
      const descontoItem = parseBrazilianNumber(item.desconto);
      const produto = produtos.find((prod) => prod.id === item.produtoId);
      const valorAntesDescontoGeral = Math.max(0, (quantidade * precoUnitario) - descontoItem);
      const valorVenda = valorAntesDescontoGeral * fatorPrecoEfetivo;
      const custoUnitario = Number(produto?.custoPadrao || 0);
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
    const custoUnit = prod ? prod.custoPadrao : 0;
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
  const ultimasVendasCliente = (clienteHistorico?.vendas || []).slice(0, 7);
  const vendaAnteriorSelecionada = ultimasVendasCliente.find((venda) => venda.id === vendaAnteriorId) || null;
  
  // Handlers
  const handleSelectCliente = (cli: Cliente) => {
    setClienteSelecionado(cli);
    setClienteBusca(cli.nome);
    setShowClienteDropdown(false);
    // Focus product field on select
    setTimeout(() => {
      produtoInputRef.current?.focus();
    }, 50);
  };

  const handleSelectProduto = (prod: Produto) => {
    const unidadePrincipal = getUnidadeVendaPrincipal(prod);
    setProdutoSelecionado(prod);
    setProdutoBusca(prod.nome);
    setItemUnidade(unidadePrincipal);
    setItemPreco(prod.precoVendaPadrao.toString().replace(".", ","));
    setItemQtd("1");
    setItemDesconto("0");
    setShowProdutoDropdown(false);
    
    // Crucial rule: Após selecionar um material, posicionar o cursor automaticamente no campo de quantidade
    setTimeout(() => {
      quantidadeRef.current?.focus();
      quantidadeRef.current?.select();
    }, 50);
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

    // Add item (item-level discount retired, set to "0")
    const novoItem: ItemRascunho = {
      produtoId: produtoSelecionado.id,
      codigo: produtoSelecionado.codigo,
      nome: produtoSelecionado.nome,
      quantidade: itemQtd,
      unidade: itemUnidade,
      precoUnitario: itemPreco,
      desconto: "0",
      precoPadrao: produtoSelecionado.precoVendaPadrao
    };

    setItensVenda(prev => {
      const habitualVazioIndex = prev.findIndex((item) =>
        item.produtoId === novoItem.produtoId && parseBrazilianNumber(item.quantidade) <= 0
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
    setProdutoBusca("");
    setItemUnidade("");
    setItemQtd("1");
    setItemPreco("");
    setItemDesconto("0");
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
    const venda = ultimasVendasCliente.find((item) => item.id === vendaId);
    setItensVendaAnteriorSelecionados(
      (venda?.items || [])
        .filter((item) => produtos.some((produto) => produto.id === item.produtoId))
        .map((item) => item.id)
    );
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
          codigo: produto.codigo,
          nome: itemHistorico.descricao || produto.nome,
          quantidade: Number(itemHistorico.quantidade).toString().replace(".", ","),
          unidade: itemHistorico.unidade || produto.unidade,
          precoUnitario: Number(itemHistorico.precoUnitario).toFixed(2).replace(".", ","),
          desconto: "0",
          precoPadrao: Number(produto.precoVendaPadrao)
        };
        const existenteIndex = resultado.findIndex((item) => item.produtoId === produto.id);
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

    setFeedbackMsg({
      type: "success",
      text: `${itensSelecionados.length} ${itensSelecionados.length === 1 ? "item importado" : "itens importados"} da venda #${vendaAnteriorSelecionada.numeroSequencial}. Quantidades e preços continuam editáveis.`
    });
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

  const executarSalvamentoVenda = async (autorizacaoPreco?: { pin: string; salvarParaCliente: boolean }) => {
    if (!clienteSelecionado) return;
    const itensPreenchidos = itensVenda.filter((item) => parseBrazilianNumber(item.quantidade) > 0);

    setLoading(true);
    setFeedbackMsg(null);
    setAutorizacaoErro("");

    try {
      const vendaData = {
        clienteId: clienteSelecionado.id,
        data: new Date().toISOString().split("T")[0],
        descontoGeral: descGeral,
        items: itensPreenchidos.map(it => ({
          produtoId: it.produtoId,
          descricao: it.nome,
          quantidade: parseBrazilianNumber(it.quantidade),
          unidade: it.unidade,
          precoUnitario: parseBrazilianNumber(it.precoUnitario),
          desconto: parseBrazilianNumber(it.desconto)
        })),
        valorPago: vPago,
        formaPagamento,
        vencimento: vencimento || undefined,
        observacoes: observacoes || undefined,
        instrumentoRecebimento: formaExigeInstrumento ? {
          emitente: instrumentoEmitente.trim(),
          numeroDocumento: instrumentoNumero.trim(),
          vencimento: instrumentoVencimento
        } : undefined,
        autorizacaoPreco
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
          emitente: instrumentoEmitente.trim(),
          numeroDocumento: instrumentoNumero.trim(),
          valor: vPago,
          vencimento: instrumentoVencimento,
          status: "a_receber"
        } : undefined,
        items: itensPreenchidos.map(it => ({
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

    if (saldoRestante > 0 && !vencimento) {
      setFeedbackMsg({ type: "error", text: "Venda com saldo restante exige informar data de vencimento!" });
      vencimentoRef.current?.focus();
      return;
    }

    if (formaExigeInstrumento && (!instrumentoEmitente.trim() || !instrumentoNumero.trim() || !instrumentoVencimento)) {
      setFeedbackMsg({ type: "error", text: "Informe emitente, número e vencimento do cheque ou duplicata." });
      return;
    }

    if (itensQueExigemAutorizacao.length > 0) {
      setAdminPin("");
      setAutorizacaoErro("");
      setSalvarPrecoCliente(true);
      setShowAutorizacaoPreco(true);
      return;
    }

    await executarSalvamentoVenda();
  };

  const handleAutorizarPreco = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(adminPin)) {
      setAutorizacaoErro("Informe o PIN administrativo de 4 a 8 números.");
      return;
    }
    await executarSalvamentoVenda({ pin: adminPin, salvarParaCliente: salvarPrecoCliente });
  };

  const handleDesbloquearAnalise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(analisePin)) {
      setAnalisePinErro("Informe o PIN administrativo de 4 a 8 números.");
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
    setClienteBusca("");
    setProdutoSelecionado(null);
    setProdutoBusca("");
    setItensVenda([]);
    setQuantidadeHabituaisCarregados(0);
    setVendaAnteriorId("");
    setItensVendaAnteriorSelecionados([]);
    setDescontoGeral("0");
    setValorPago("");
    setVencimento("");
    setObservacoes("");
    setFormaPagamento("pix");
    setInstrumentoEmitente("");
    setInstrumentoNumero("");
    setInstrumentoVencimento("");
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

  const gerarTextoComprovante = (v: any) => {
    const itemsStr = v.items.map((it: any) => 
      `• ${it.descricao} (${formatDecimal(it.quantidade)} ${it.unidade}) - ${formatCurrency(it.precoUnitario)}`
    ).join("\n");
    
    return `*Comprovante de Venda - Central dos Tecidos*\n` +
      `*Venda:* #${v.numeroSequencial}\n` +
      `*Data:* ${formatDate(v.data)}\n` +
      `*Cliente:* ${v.clienteNome}\n` +
      `---------------------------------\n` +
      `*Itens:*\n${itemsStr}\n` +
      `---------------------------------\n` +
      `*Subtotal:* ${formatCurrency(v.subtotal)}\n` +
      (v.desconto > 0 ? `*Desconto Geral:* -${formatCurrency(v.desconto)}\n` : '') +
      `*Total Líquido:* ${formatCurrency(v.totalLiquido)}\n` +
      `*Valor Recebido:* ${formatCurrency(v.valorPago)} (${formaPagamento.toUpperCase()})\n` +
      (v.saldoRestante > 0 ? `*Saldo Restante:* ${formatCurrency(v.saldoRestante)} (Venc: ${v.vencimento ? formatDate(v.vencimento) : 'A definir'})\n` : '') +
      `\nObrigado pela preferência!`;
  };

  const handleCompartilhar = () => {
    if (!vendaSalvaParaImpressao) return;
    const text = gerarTextoComprovante(vendaSalvaParaImpressao);
    if (navigator.share) {
      navigator.share({
        title: `Comprovante Venda #${vendaSalvaParaImpressao.numeroSequencial}`,
        text: text
      }).catch(err => {
        console.log("Erro ao compartilhar:", err);
      });
    } else {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        })
        .catch(err => console.error("Erro ao copiar:", err));
    }
  };

  const handleAbrirWhatsapp = () => {
    if (!vendaSalvaParaImpressao || !vendaSalvaParaImpressao.clienteTelefone) return;
    const text = gerarTextoComprovante(vendaSalvaParaImpressao);
    const phone = vendaSalvaParaImpressao.clienteTelefone;
    const cleaned = phone.replace(/\D/g, "");
    const withCountry = cleaned.startsWith("55") ? cleaned : "55" + cleaned;
    const url = `https://api.whatsapp.com/send?phone=${withCountry}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div id="quick-sale-view" className="flex flex-col gap-6">
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
                <><label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">PIN de {seguranca.nome}</label><input type="password" inputMode="numeric" autoComplete="off" autoFocus value={analisePin} onChange={(event) => setAnalisePin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••" aria-label="PIN para visualizar análise" className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-xl font-black tracking-[0.5em] text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></>
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
                      onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="••••"
                      aria-label="PIN administrativo"
                      className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-xl font-black tracking-[0.5em] text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    />
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <input
                      type="checkbox"
                      checked={salvarPrecoCliente}
                      onChange={(e) => setSalvarPrecoCliente(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-emerald-600"
                    />
                    <span className="text-xs leading-relaxed text-emerald-900">
                      <strong>Manter estes preços para {clienteSelecionado?.nome}</strong><br />
                      Nas próximas vendas, valores iguais ou maiores não pedirão o PIN novamente.
                    </span>
                  </label>
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

      {/* Pré-visualização e impressão: duas vias na mesma folha A4 */}
      {vendaSalvaParaImpressao && (
        <div
          id="print-receipt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="venda-finalizada-titulo"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6 print:absolute print:inset-0 print:block print:bg-white print:p-0"
        >
          <div className="mx-auto w-full max-w-[230mm] rounded-2xl bg-slate-200 p-3 shadow-2xl print:max-w-none print:bg-white print:p-0 print:shadow-none">
            <div className="mb-3 flex items-start justify-between gap-4 rounded-xl bg-white p-4 print:hidden">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={21} />
                </span>
                <div>
                  <h3 id="venda-finalizada-titulo" className="text-base font-extrabold text-slate-900">Venda finalizada</h3>
                  <p className="text-xs text-slate-500">A prévia abaixo já contém as duas vias na mesma folha A4.</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar comprovante"
                onClick={() => {
                  setVendaSalvaParaImpressao(null);
                  resetForm();
                  onSaleSaved();
                }}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <VendaComprovante venda={vendaSalvaParaImpressao} />

            {/* Print action bar */}
            <div className="mt-3 space-y-3 rounded-xl bg-white p-4 print:hidden">
              <div className="flex gap-3">
                <button 
                  onClick={executePrint}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  <Printer size={15} /> Imprimir 2 vias em A4
                </button>

                {vendaSalvaParaImpressao.clienteTelefone && vendaSalvaParaImpressao.clienteIsWhatsapp === 1 && (
                  <button 
                    onClick={handleAbrirWhatsapp}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"
                  >
                    <MessageSquare size={15} /> Enviar WhatsApp
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleCompartilhar}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-100"
                >
                  <Share2 size={15} /> {copiado ? "Copiado!" : "Compartilhar Texto"}
                </button>

                <button 
                  onClick={() => {
                    setVendaSalvaParaImpressao(null);
                    resetForm();
                    onSaleSaved();
                  }}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screen Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Nova Venda</h2>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-100">
              Número Sequencial: #{vendaNumero}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">Operação ágil com checkout assistido por teclado.</p>
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
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
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

      {/* Step Grid */}
      <div className="contents">
        
        {/* Card 1: Cliente da Venda */}
        <div className="order-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
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
              {clienteSelecionado ? (
                <div className="p-4 bg-emerald-50/50 border border-emerald-200/40 rounded-xl flex items-center justify-between animate-fade-in">
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
                  <button 
                    type="button"
                    onClick={() => {
                      setClienteSelecionado(null);
                      setClienteBusca("");
                    }}
                    className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors shrink-0"
                    title="Alterar cliente"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                    <span className="pl-3 text-slate-400">
                      <Search size={16} />
                    </span>
                    <input 
                      ref={clienteInputRef}
                      type="text"
                      placeholder="Pesquisar por cliente..."
                      value={clienteBusca}
                      onChange={(e) => {
                        setClienteBusca(e.target.value);
                        setShowClienteDropdown(true);
                      }}
                      onFocus={() => setShowClienteDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && filteredClientes.length === 1) {
                          handleSelectCliente(filteredClientes[0]);
                        }
                      }}
                      className="w-full text-slate-900 bg-transparent py-2.5 px-3 text-sm outline-none font-bold placeholder-slate-400"
                    />
                  </div>

                  {showClienteDropdown && clienteBusca.trim() !== "" && (
                    <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-50">
                      {filteredClientes.length === 0 ? (
                        <div className="p-3 text-center text-slate-400 text-xs">
                          <span>Nenhum ativo encontrado</span>
                        </div>
                      ) : (
                        filteredClientes.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectCliente(c)}
                            className="w-full p-3 hover:bg-slate-50 text-left text-xs flex justify-between items-center transition-colors"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{c.nome}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{c.telefone || "Sem telefone"}</p>
                            </div>
                            <ChevronDown size={14} className="text-slate-400" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
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
        <section className="order-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-900"><TableProperties size={17} className="text-emerald-600" /> Análise durante a venda</h3><p className="mt-1 text-xs font-medium text-slate-500">Uma linha para cada material. Desconto geral rateado proporcionalmente.</p></div>
            {dadosAdmVisiveis ? <button type="button" onClick={() => setDadosAdmVisiveis(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800"><Unlock size={15} /> Dados administrativos visíveis</button> : <button type="button" onClick={() => { setAnalisePinErro(""); setAnalisePin(""); setShowAnalisePin(true); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white"><Lock size={15} /> Ver custo e lucro com PIN</button>}
          </div>
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-extrabold text-slate-700"><History size={15} className="text-emerald-600" /> Repetir itens de uma das últimas 7 vendas</span>
                <select data-testid="venda-anterior-select" value={vendaAnteriorId} disabled={!clienteSelecionado || ultimasVendasCliente.length === 0} onChange={(event) => handleSelecionarVendaAnterior(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500">
                  <option value="">{!clienteSelecionado ? "Selecione primeiro o cliente" : ultimasVendasCliente.length === 0 ? "Cliente sem vendas anteriores" : "Escolha uma venda anterior..."}</option>
                  {ultimasVendasCliente.map((venda) => <option key={venda.id} value={venda.id}>{formatDate(venda.data)} — Venda #{venda.numeroSequencial} — {(venda.items || []).length} itens — {formatCurrency(venda.totalLiquido)}</option>)}
                </select>
              </label>
              {vendaAnteriorSelecionada && <button data-testid="importar-venda-anterior" type="button" disabled={itensVendaAnteriorSelecionados.length === 0} onClick={handleImportarItensVendaAnterior} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:bg-slate-300"><ListChecks size={16} /> Adicionar selecionados</button>}
            </div>

            {vendaAnteriorSelecionada && (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                  <span className="text-xs font-bold text-slate-700">Marque os itens que deseja levar para a venda atual.</span>
                  <button type="button" onClick={() => setItensVendaAnteriorSelecionados((vendaAnteriorSelecionada.items || []).filter((item) => produtos.some((produto) => produto.id === item.produtoId)).map((item) => item.id))} className="rounded-lg px-2 py-1 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-100">Selecionar todos</button>
                </div>
                <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-y-0">
                  {(vendaAnteriorSelecionada.items || []).map((item) => {
                    const produtoDisponivel = produtos.some((produto) => produto.id === item.produtoId);
                    return <label key={item.id} className={`flex cursor-pointer items-center gap-3 border-slate-200 px-3 py-2.5 md:border-b ${produtoDisponivel ? "bg-white" : "cursor-not-allowed bg-slate-100 opacity-60"}`}><input type="checkbox" disabled={!produtoDisponivel} checked={itensVendaAnteriorSelecionados.includes(item.id)} onChange={() => handleAlternarItemVendaAnterior(item.id)} className="h-4 w-4 shrink-0 accent-emerald-600" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-slate-900">{item.descricao}</span><span className="block text-[11px] font-semibold text-slate-500">{formatDecimal(item.quantidade)} {item.unidade} • {formatCurrency(item.precoUnitario)} / un.</span></span>{!produtoDisponivel && <span className="text-[10px] font-bold text-red-600">Indisponível</span>}</label>;
                  })}
                </div>
              </div>
            )}
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
        <div className="order-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
              Resumo & Fechamento
            </label>

            <div className="space-y-2.5 text-xs mt-3">
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
                      className="w-full text-right bg-slate-50 border border-slate-200 text-xs font-bold pl-2 pr-5 py-1 rounded-lg text-slate-900 focus:border-emerald-500 outline-none"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">%</span>
                  </div>
                </div>
              </div>

              <hr className="border-slate-100 my-1" />

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
                  value={vendaNoVale ? "0,00" : valorPago}
                  onChange={(e) => setValorPago(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, formaPagamentoRef)}
                  placeholder={totalLiquido.toFixed(2).replace(".", ",")}
                  disabled={vendaNoVale}
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

            <hr className="border-slate-100 my-2.5" />

            {/* Formas de pagamento and extra data */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Recebimento</label>
                <select 
                  ref={formaPagamentoRef}
                  value={formaPagamento}
                  onChange={(e) => {
                    const novaForma = e.target.value;
                    setFormaPagamento(novaForma);
                    if (novaForma === "vale") setValorPago("0");
                    else if (formaPagamento === "vale") setValorPago("");
                    if (!FORMAS_COM_INSTRUMENTO.has(novaForma)) {
                      setInstrumentoEmitente("");
                      setInstrumentoNumero("");
                      setInstrumentoVencimento("");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (saldoRestante > 0) {
                      handleKeyDown(e, vencimentoRef);
                    } else {
                      handleKeyDown(e, observacoesRef);
                    }
                  }}
                  className="min-w-0 flex-1 bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg font-bold text-slate-700 outline-none sm:max-w-xs"
                >
                  {FORMAS_RECEBIMENTO.map((forma) => <option key={forma.value} value={forma.value} disabled={"disabled" in forma && forma.disabled}>{forma.label}</option>)}
                </select>
              </div>

              {vendaNoVale && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-extrabold">Esta venda será lançada como Vale.</p>
                  <p className="mt-1 font-medium">A venda será concluída normalmente e o valor integral ficará em aberto no módulo Vales.</p>
                </div>
              )}

              {formaExigeInstrumento && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:grid-cols-3">
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">Emitente *</label><input type="text" value={instrumentoEmitente} onChange={(event) => setInstrumentoEmitente(event.target.value)} placeholder={formaPagamento.includes("terceiro") ? "Nome do terceiro" : clienteSelecionado?.nome || "Nome do emitente"} className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">Nº cheque/documento *</label><input type="text" value={instrumentoNumero} onChange={(event) => setInstrumentoNumero(event.target.value)} placeholder="Número" className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-sky-800">Vencimento *</label><input type="date" value={instrumentoVencimento} onChange={(event) => setInstrumentoVencimento(event.target.value)} className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500" /></div>
                  <p className="text-[10px] font-semibold text-sky-800 sm:col-span-3">O vencimento gera alerta; não marca o cheque ou a duplicata como recebido automaticamente.</p>
                </div>
              )}

              {/* Date Vencimento if there is Remaining Balance */}
              {saldoRestante > 0 && (
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
                <input 
                  ref={observacoesRef}
                  type="text"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Observação da venda..."
                  className="bg-slate-50 border border-slate-200 text-xs px-2 py-1 rounded-lg text-slate-900 focus:border-emerald-500 outline-none w-36 placeholder:text-[10px]"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <button 
              ref={salvarBtnRef}
              type="button"
              disabled={loading}
              onClick={handleSaveVenda}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-950/10 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              {loading ? "Finalizando..." : "Finalizar venda"}
            </button>
          </div>
        </div>

      </div>

      {/* Full Width Bottom Row: Adicionar Itens and Table Carrinho */}
      <div className="order-3 bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
            Itens e Materiais do Pedido
          </label>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {quantidadeItensPreenchidos} de {itensVenda.length} {itensVenda.length === 1 ? 'linha preenchida' : 'linhas preenchidas'}
          </div>
        </div>

        {(carregandoHabituais || quantidadeHabituaisCarregados > 0) && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            <span className="font-bold">
              {carregandoHabituais
                ? "Carregando o padrão de compra do cliente..."
                : `${quantidadeHabituaisCarregados} ${quantidadeHabituaisCarregados === 1 ? "produto habitual foi carregado" : "produtos habituais foram carregados"}.`}
            </span>
            {!carregandoHabituais && (
              <span className="text-emerald-700">Preencha as quantidades usadas hoje; linhas vazias não serão vendidas.</span>
            )}
          </div>
        )}

        {/* Inputs row - horizontal, spacious, full layout width */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
          
          {/* Material selection (5 cols on desktop) */}
          <div className="relative md:col-span-5">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Buscar Material</label>
            <div className="flex items-center bg-white border border-slate-200 rounded-xl focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all shadow-sm">
              <input 
                ref={produtoInputRef}
                type="text"
                placeholder="Código ou nome do tecido/material..."
                value={produtoBusca}
                onChange={(e) => {
                  setProdutoBusca(e.target.value);
                  setShowProdutoDropdown(true);
                }}
                onFocus={() => setShowProdutoDropdown(true)}
                className="w-full text-slate-900 bg-transparent py-2.5 px-3.5 text-sm outline-none font-bold placeholder-slate-400"
              />
            </div>

            {showProdutoDropdown && produtoBusca.trim() !== "" && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto divide-y divide-slate-50">
                {filteredProdutos.length === 0 ? (
                  <div className="p-3 text-slate-400 text-xs">Produto não cadastrado</div>
                ) : (
                  filteredProdutos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProduto(p)}
                      className="w-full p-3 hover:bg-slate-50 text-left text-xs flex justify-between items-center transition-colors"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{p.nome}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Código: {p.codigo || "Sem"} • Venda: {getUnidadesVendaPermitidas(p).join(" ou ")}
                          {dadosAdmVisiveis ? ` • Custo: ${formatCurrency(p.custoPadrao)}` : ""}
                        </p>
                      </div>
                      <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-0.5">{formatCurrency(p.precoVendaPadrao)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Quantidade */}
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Quant.</label>
            <input 
              ref={quantidadeRef}
              type="text" 
              value={itemQtd}
              onChange={(e) => setItemQtd(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, precoUnitarioRef)}
              placeholder="1.0"
              className="w-full bg-white border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-extrabold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
            />
          </div>

          {/* Unidade */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Unidade</label>
            <select 
              value={itemUnidade}
              onChange={(e) => handleUnidadeChange(e.target.value)}
              disabled={!produtoSelecionado || getUnidadesVendaPermitidas(produtoSelecionado).length === 1}
              className="w-full bg-white border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-700 outline-none shadow-sm disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {!produtoSelecionado ? (
                <option value="">Selecione um produto</option>
              ) : (
                getUnidadesVendaPermitidas(produtoSelecionado).map((unidadePermitida) => (
                  <option key={unidadePermitida} value={unidadePermitida}>
                    {unidadePermitida === "metro" ? "Metro (m)" :
                     unidadePermitida === "unidade" ? "Unidade (un)" :
                     unidadePermitida === "quilograma" ? "Quilo (kg)" :
                     unidadePermitida === "rolo" ? "Rolo" : "Peça"}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Preço Unitário & Botão Adicionar (3 cols on desktop) */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Preço Unit (R$)</label>
            <div className="flex gap-2">
              <input 
                ref={precoUnitarioRef}
                type="text" 
                value={itemPreco}
                onChange={(e) => setItemPreco(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                placeholder="0,00"
                className="w-full bg-white border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-extrabold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
              />
              
              <button 
                ref={addBtnRef}
                type="button"
                onClick={handleAddItem}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-emerald-950/10 flex items-center justify-center shrink-0"
                title="Adicionar Item"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

        </div>

        {/* Added Items Grid Table - Clean, full horizontal width, high typography contrast */}
        <div className="border border-slate-150 rounded-2xl overflow-x-auto mt-6 shadow-sm">
          <table className="min-w-[820px] w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-extrabold text-xs uppercase border-b border-slate-100">
                <th className="p-4 w-20">Cód</th>
                <th className="p-4">Material</th>
                <th className="p-4 text-center w-36">Quantidade</th>
                <th className="p-4 text-center w-32">Unidade</th>
                <th className="p-4 text-right w-40">Preço Unit</th>
                <th className="p-4 text-right w-44">Total</th>
                <th className="p-4 text-center w-24">Remover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itensVenda.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-16 text-center text-slate-400 text-sm font-semibold">
                    Carrinho vazio. Adicione os tecidos e materiais no formulário acima.
                  </td>
                </tr>
              ) : (
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
                      <td className="p-4 font-mono text-xs text-slate-400 font-bold">{it.codigo || "-"}</td>
                      <td className="p-4 font-bold text-slate-900">
                        {it.nome}
                        {it.precoAutorizado != null && (
                          <span className="mt-1 flex w-fit items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-emerald-700">
                            <ShieldCheck size={10} /> preço especial: {formatCurrency(it.precoAutorizado)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center font-extrabold">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={it.quantidade}
                          onChange={(event) => handleUpdateItem(idx, { quantidade: event.target.value })}
                          placeholder="Quantidade"
                          aria-label={`Quantidade de ${it.nome}`}
                          className="w-28 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-right text-sm font-black text-slate-900 outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <select
                          value={it.unidade}
                          onChange={(event) => handleUpdateItem(idx, { unidade: event.target.value })}
                          aria-label={`Unidade de ${it.nome}`}
                          className="w-28 rounded-lg border border-slate-300 bg-slate-100 px-2 py-2 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 focus:bg-white"
                        >
                          {unidadesPermitidas.map((unidade) => (
                            <option key={unidade} value={unidade}>{unidade}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-600">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={it.precoUnitario}
                          onChange={(event) => handleUpdateItem(idx, { precoUnitario: event.target.value })}
                          aria-label={`Preço unitário de ${it.nome}`}
                          className={`w-32 rounded-lg border px-3 py-2 text-right text-sm font-black text-slate-900 outline-none focus:bg-white focus:ring-2 ${
                            exigeAutorizacao
                              ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100"
                              : "border-sky-300 bg-sky-50 focus:border-emerald-600 focus:ring-emerald-100"
                          }`}
                        />
                        {exigeAutorizacao && (
                          <span className="mt-1 flex items-center justify-end gap-1 text-[9px] font-extrabold uppercase text-red-700">
                            <KeyRound size={9} /> exige PIN
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono font-extrabold text-slate-900">{formatCurrency(totalItem)}</td>
                      <td className="p-4 text-center">
                        <button 
                          type="button" 
                          onClick={() => handleRemoveItem(idx)}
                          className="px-2.5 py-1.5 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg inline-flex items-center gap-1 text-xs font-bold transition-all"
                          title="Remover somente desta venda"
                        >
                          <Trash2 size={13} /> Remover
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
