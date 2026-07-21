import React, { useState, useEffect, useRef } from "react";
import { 
  Search, Plus, Trash2, Printer, Save, X, Sparkles, Check, ChevronDown, UserPlus, FileText,
  TrendingUp, DollarSign, Award, AlertCircle, CheckCircle2, Zap, Share2, MessageSquare
} from "lucide-react";
import { Cliente, Produto, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import logo from "../img/logo.png";

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
}

const getUnidadeVendaPrincipal = (produto: Produto) => produto.unidadeVenda || produto.unidade;

const getUnidadesVendaPermitidas = (produto: Produto) => {
  const unidadePrincipal = getUnidadeVendaPrincipal(produto);
  const unidades = [unidadePrincipal];

  if (
    produto.venderUnidadeCompra === 1 &&
    produto.unidadeCompra &&
    produto.unidadeCompra !== unidadePrincipal
  ) {
    unidades.push(produto.unidadeCompra);
  }

  return unidades;
};

const getFatorDaUnidade = (produto: Produto, unidade: string) => {
  const unidadePrincipal = getUnidadeVendaPrincipal(produto);
  return unidade === produto.unidadeCompra && unidade !== unidadePrincipal
    ? Number(produto.fatorConversao || 1)
    : 1;
};

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
  const [currentPage, setCurrentPage] = useState(1);

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

  // Checkout Fields
  const [descontoGeral, setDescontoGeral] = useState("0");
  const [valorPago, setValorPago] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [vencimento, setVencimento] = useState("");
  const [observacoes, setObservacoes] = useState("");

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
      const [cList, pList, seq] = await Promise.all([
        api.getClientes(),
        api.getProdutos(),
        api.getProximoNumeroVenda()
      ]);
      setClientes(cList.filter(c => c.ativo === 1));
      setProdutos(pList.filter(p => p.ativo === 1));
      setVendaNumero(seq.proximoNumero);
    } catch (err) {
      console.error("Erro ao carregar dados de venda:", err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (clienteSelecionado) {
      api.getClienteHistorico(clienteSelecionado.id)
        .then(res => setClienteHistorico(res))
        .catch(err => {
          console.error("Erro ao obter historico para BI da Venda:", err);
          setClienteHistorico(null);
        });
    } else {
      setClienteHistorico(null);
    }
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

  const descGeralPercent = parseBrazilianNumber(descontoGeral);
  const descGeral = subtotalItens * (descGeralPercent / 100);
  const totalLiquido = Math.max(0, subtotalItens - descGeral);
  const vPago = valorPago === "" ? totalLiquido : parseBrazilianNumber(valorPago);
  const saldoRestante = Math.max(0, totalLiquido - vPago);

  // BI calculations
  const totalCustoItens = itensVenda.reduce((acc, item) => {
    const prod = produtos.find(p => p.id === item.produtoId);
    const custoUnit = prod ? prod.custoPadrao * getFatorDaUnidade(prod, item.unidade) : 0;
    const qty = parseBrazilianNumber(item.quantidade);
    return acc + (qty * custoUnit);
  }, 0);

  const lucroEstimado = totalLiquido - totalCustoItens;
  const margemEstimada = totalLiquido > 0 ? (lucroEstimado / totalLiquido) * 100 : 0;

  const historicalTotal = clienteHistorico?.estatisticas?.totalComprado || 0;

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
  
  const ultimaCompra = clienteHistorico?.vendas && clienteHistorico.vendas.length > 0
    ? clienteHistorico.vendas.reduce((latest, current) => {
        return new Date(current.data) > new Date(latest.data) ? current : latest;
      }, clienteHistorico.vendas[0])
    : null;
  const dataUltimaCompraStr = ultimaCompra ? formatDate(ultimaCompra.data) : "Sem compras registradas";

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
    const fator = getFatorDaUnidade(produtoSelecionado, novaUnidade);
    setItemPreco((produtoSelecionado.precoVendaPadrao * fator).toFixed(2).replace(".", ","));
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
      desconto: "0"
    };

    setItensVenda(prev => {
      const updated = [...prev, novoItem];
      setCurrentPage(Math.ceil(updated.length / 5));
      return updated;
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
    setItensVenda(prev => {
      const updated = prev.filter((_, i) => i !== index);
      const maxPage = Math.ceil(updated.length / 5);
      if (currentPage > maxPage) {
        setCurrentPage(Math.max(1, maxPage));
      }
      return updated;
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

  const handleSaveVenda = async () => {
    if (!clienteSelecionado) {
      setFeedbackMsg({ type: "error", text: "Por favor, selecione um cliente para a venda." });
      clienteInputRef.current?.focus();
      return;
    }

    if (itensVenda.length === 0) {
      setFeedbackMsg({ type: "error", text: "Adicione pelo menos um item à venda." });
      produtoInputRef.current?.focus();
      return;
    }

    if (saldoRestante > 0 && !vencimento) {
      setFeedbackMsg({ type: "error", text: "Venda com saldo restante exige informar data de vencimento!" });
      vencimentoRef.current?.focus();
      return;
    }

    setLoading(true);
    setFeedbackMsg(null);

    try {
      const vendaData = {
        clienteId: clienteSelecionado.id,
        data: new Date().toISOString().split("T")[0],
        descontoGeral: descGeral,
        items: itensVenda.map(it => ({
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
        observacoes: observacoes || undefined
      };

      const result = await api.createVenda(vendaData);
      
      // Prepare print preview details for the confirmation modal
      setVendaSalvaParaImpressao({
        ...result,
        clienteNome: clienteSelecionado.nome,
        clienteTelefone: clienteSelecionado.telefone,
        clienteIsWhatsapp: clienteSelecionado.isWhatsapp,
        items: itensVenda.map(it => ({
          descricao: it.nome,
          quantidade: parseBrazilianNumber(it.quantidade),
          unidade: it.unidade,
          precoUnitario: parseBrazilianNumber(it.precoUnitario),
          desconto: parseBrazilianNumber(it.desconto),
          total: (parseBrazilianNumber(it.quantidade) * parseBrazilianNumber(it.precoUnitario)) - parseBrazilianNumber(it.desconto)
        }))
      });

    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Erro ao salvar a venda." });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setClienteSelecionado(null);
    setClienteBusca("");
    setProdutoSelecionado(null);
    setProdutoBusca("");
    setItensVenda([]);
    setDescontoGeral("0");
    setValorPago("");
    setVencimento("");
    setObservacoes("");
    setFeedbackMsg(null);
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
    <div id="quick-sale-view" className="space-y-6">
      {/* Printable Area - Hidden on Screen */}
      {vendaSalvaParaImpressao && (
        <div
          id="print-receipt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="venda-finalizada-titulo"
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto print:absolute print:inset-0 print:block print:bg-white print:backdrop-blur-none print:p-0"
        >
          <div className="max-w-lg mx-auto w-full max-h-[92vh] overflow-y-auto bg-white p-6 border border-slate-200 rounded-2xl print:max-h-none print:overflow-visible print:border-none print:shadow-none shadow-2xl animate-fade-in">
            <div className="flex items-start justify-between gap-4 pb-4 mb-1 border-b border-slate-100 print:hidden">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={21} />
                </span>
                <div>
                  <h3 id="venda-finalizada-titulo" className="text-base font-extrabold text-slate-900">Venda finalizada</h3>
                  <p className="text-xs text-slate-500">Confira os detalhes e escolha o que deseja fazer.</p>
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

            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <img
                src={logo}
                alt="Luciano Couros"
                className="mx-auto mb-3 h-20 w-48 object-contain print:h-20"
              />
              <h2 className="text-xl font-extrabold text-slate-900 uppercase">Comprovante de Venda</h2>
              <p className="text-xs text-slate-500 mt-1">Central dos Tecidos e Aviamentos</p>
              <p className="text-xs text-slate-400">Data: {formatDate(vendaSalvaParaImpressao.data)}</p>
              <p className="text-base font-bold text-slate-800 mt-2">Venda #{vendaSalvaParaImpressao.numeroSequencial}</p>
            </div>

            <div className="py-4 border-b border-dashed border-slate-300 text-xs space-y-1 text-slate-700">
              <p><strong>Cliente:</strong> {vendaSalvaParaImpressao.clienteNome}</p>
              {vendaSalvaParaImpressao.clienteTelefone && <p><strong>Telefone:</strong> {vendaSalvaParaImpressao.clienteTelefone}</p>}
            </div>

            <div className="py-4 border-b border-dashed border-slate-300">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Itens do Pedido</h4>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 font-bold text-slate-500">
                    <th className="pb-1">Descrição</th>
                    <th className="pb-1 text-center">Qtd</th>
                    <th className="pb-1 text-right">Unit</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendaSalvaParaImpressao.items.map((it: any, idx: number) => (
                    <tr key={idx} className="text-slate-800">
                      <td className="py-2 pr-2 font-medium">{it.descricao}</td>
                      <td className="py-2 text-center">{formatDecimal(it.quantidade)} <span className="text-[10px] text-slate-400">{it.unidade}</span></td>
                      <td className="py-2 text-right">{formatCurrency(it.precoUnitario)}</td>
                      <td className="py-2 text-right">{formatCurrency(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="py-4 space-y-1.5 text-xs text-right border-b border-dashed border-slate-300">
              <p className="text-slate-500">Subtotal: <strong className="text-slate-800 font-semibold">{formatCurrency(vendaSalvaParaImpressao.subtotal)}</strong></p>
              {vendaSalvaParaImpressao.desconto > 0 && (
                <p className="text-red-600 font-medium">Desconto Geral: -{formatCurrency(vendaSalvaParaImpressao.desconto)}</p>
              )}
              <p className="text-sm font-bold text-slate-900">Total Líquido: {formatCurrency(vendaSalvaParaImpressao.totalLiquido)}</p>
              <p className="text-emerald-700 font-semibold">Valor Pago: {formatCurrency(vendaSalvaParaImpressao.valorPago)} ({formaPagamento.toUpperCase()})</p>
              {vendaSalvaParaImpressao.saldoRestante > 0 && (
                <p className="text-amber-700 font-bold">Saldo Restante: {formatCurrency(vendaSalvaParaImpressao.saldoRestante)} {vendaSalvaParaImpressao.vencimento && `(Venc: ${formatDate(vendaSalvaParaImpressao.vencimento)})`}</p>
              )}
            </div>

            {vendaSalvaParaImpressao.observacoes && (
              <div className="py-4 text-xs text-slate-500 border-b border-dashed border-slate-300 italic">
                Obs: {vendaSalvaParaImpressao.observacoes}
              </div>
            )}

            <div className="text-center pt-6 text-[10px] text-slate-400">
              <p>Obrigado pela preferência!</p>
              <p className="mt-1">Sistema Controle Comercial Enxuto</p>
            </div>

            {/* Print action bar */}
            <div className="mt-8 space-y-3 print:hidden">
              <div className="flex gap-3">
                <button 
                  onClick={executePrint}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  <Printer size={15} /> Imprimir Recibo
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
          <div className="flex items-center gap-3">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Card 1: Cliente da Venda */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
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

            {/* Client business health summary */}
            {clienteSelecionado && (
              <div className="mt-4 p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Saúde do Cliente</span>
                  <span className={`px-2 py-1 rounded-full border text-[9px] font-extrabold uppercase ${
                    overdueDebt > 0
                      ? "bg-red-50 border-red-200 text-red-700"
                      : activeDebt > 0
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  }`}>
                    {overdueDebt > 0 ? "Pagamento atrasado" : activeDebt > 0 ? "Saldo em aberto" : "Em dia"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-[10px]">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-bold uppercase tracking-wide block">Cliente desde</span>
                    <p className="font-extrabold text-slate-800">{formatDate(clienteSelecionado.createdAt)}</p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-bold uppercase tracking-wide block">Última Compra</span>
                    <p className="font-extrabold text-slate-800">{dataUltimaCompraStr}</p>
                  </div>

                  <div className="space-y-0.5 border-t border-slate-100/50 pt-2">
                    <span className="text-slate-400 font-bold uppercase tracking-wide block">Total comprado</span>
                    <p className="font-black text-emerald-700 text-xs">{formatCurrency(historicalTotal)}</p>
                  </div>
                  <div className="space-y-0.5 border-t border-slate-100/50 pt-2 text-right">
                    <span className="text-slate-400 font-bold uppercase tracking-wide block">Saldo aberto</span>
                    <p className={`font-black text-xs ${activeDebt > 0 ? "text-amber-700" : "text-slate-500"}`}>{formatCurrency(activeDebt)}</p>
                  </div>
                </div>

                {overdueDebt > 0 && (
                  <div className="p-2.5 bg-red-50 text-red-800 border border-red-100 rounded-lg flex items-center justify-between text-[10px]">
                    <span className="font-bold uppercase tracking-wider">Vencido em {overdueSales.length} {overdueSales.length === 1 ? "venda" : "vendas"}</span>
                    <strong className="text-sm font-black text-red-700">{formatCurrency(overdueDebt)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="text-[10px] text-slate-400 italic mt-3 leading-normal border-t border-slate-100/50 pt-2">
            {!clienteSelecionado ? (
              "Identifique o cliente para consultar histórico e saldo antes de concluir a venda."
            ) : (
              "Histórico financeiro atualizado em tempo real. O fiado continua disponível no fechamento."
            )}
          </div>
        </div>

        {/* Card 2: essential sale indicators */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
            <Sparkles size={14} className="text-amber-500" />
            Resumo de Rentabilidade
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Lucro Bruto</span>
              <p className={`text-base font-black ${lucroEstimado > 0 ? "text-emerald-600" : lucroEstimado < 0 ? "text-red-600" : "text-slate-500"}`}>
                {formatCurrency(lucroEstimado)}
              </p>
            </div>
            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Margem Bruta</span>
              <p className={`text-base font-black ${margemEstimada >= 15 ? "text-emerald-600" : margemEstimada > 0 ? "text-amber-600" : "text-red-600"}`}>
                {margemEstimada.toFixed(1)}%
              </p>
            </div>
          </div>

          {itensVenda.length === 0 ? (
            <p className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-3">
              Adicione um produto para calcular a rentabilidade.
            </p>
          ) : (
            <div className={`rounded-xl border p-3 text-[11px] ${
              lucroEstimado < 0
                ? "bg-red-50 border-red-200 text-red-800"
                : margemEstimada < 15
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">
                  {lucroEstimado < 0 ? "Venda abaixo do custo" : margemEstimada < 15 ? "Margem abaixo de 15%" : "Margem saudável"}
                </span>
                <span className="font-extrabold whitespace-nowrap">
                  Desconto seguro: {maxSafeDiscountPct.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Resumo e Fechamento */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between">
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
                <span className="text-slate-500 font-bold">Valor Recebido (R$):</span>
                <input 
                  ref={valorPagoRef}
                  type="text" 
                  value={valorPago}
                  onChange={(e) => setValorPago(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, formaPagamentoRef)}
                  placeholder={totalLiquido.toFixed(2).replace(".", ",")}
                  className="w-24 text-right bg-slate-50 border border-slate-200 text-xs font-extrabold px-2.5 py-1 rounded-lg text-emerald-700 focus:border-emerald-500 outline-none"
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
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  onKeyDown={(e) => {
                    if (saldoRestante > 0) {
                      handleKeyDown(e, vencimentoRef);
                    } else {
                      handleKeyDown(e, observacoesRef);
                    }
                  }}
                  className="bg-slate-50 border border-slate-200 text-[11px] px-2 py-1 rounded-lg font-bold text-slate-700 outline-none w-36"
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Crédito</option>
                  <option value="cartao_debito">Débito</option>
                  <option value="boleto">Boleto</option>
                </select>
              </div>

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
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
            Itens e Materiais do Pedido
          </label>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Total de {itensVenda.length} {itensVenda.length === 1 ? 'item' : 'itens'} no carrinho
          </div>
        </div>

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
                          Código: {p.codigo || "Sem"} • Venda: {getUnidadesVendaPermitidas(p).join(" ou ")} • Custo: {formatCurrency(p.custoPadrao)}
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
        <div className="border border-slate-150 rounded-2xl overflow-hidden mt-6 shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-extrabold text-xs uppercase border-b border-slate-100">
                <th className="p-4 w-20">Cód</th>
                <th className="p-4">Material</th>
                <th className="p-4 text-center w-36">Quantidade</th>
                <th className="p-4 text-right w-40">Preço Unit</th>
                <th className="p-4 text-right w-44">Total</th>
                <th className="p-4 text-center w-24">Remover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itensVenda.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-slate-400 text-sm font-semibold">
                    Carrinho vazio. Adicione os tecidos e materiais no formulário acima.
                  </td>
                </tr>
              ) : (
                itensVenda.slice((currentPage - 1) * 5, currentPage * 5).map((it, idx) => {
                  const qty = parseBrazilianNumber(it.quantidade);
                  const price = parseBrazilianNumber(it.precoUnitario);
                  const totalItem = qty * price;
                  const itemIndexInMainList = (currentPage - 1) * 5 + idx;

                  return (
                    <tr key={itemIndexInMainList} className="hover:bg-slate-50/50 text-slate-700 transition-colors">
                      <td className="p-4 font-mono text-xs text-slate-400 font-bold">{it.codigo || "-"}</td>
                      <td className="p-4 font-bold text-slate-900">{it.nome}</td>
                      <td className="p-4 text-center font-extrabold">
                        {formatDecimal(qty)} <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-extrabold uppercase">{it.unidade}</span>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-600">{formatCurrency(price)}</td>
                      <td className="p-4 text-right font-mono font-extrabold text-slate-900">{formatCurrency(totalItem)}</td>
                      <td className="p-4 text-center">
                        <button 
                          type="button" 
                          onClick={() => handleRemoveItem(itemIndexInMainList)}
                          className="px-2.5 py-1.5 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg inline-flex items-center gap-1 text-xs font-bold transition-all"
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

          {/* Pagination Controls */}
          {itensVenda.length > 5 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500 font-semibold">
                Mostrando <strong className="text-slate-800">{(currentPage - 1) * 5 + 1}</strong> até <strong className="text-slate-800">{Math.min(currentPage * 5, itensVenda.length)}</strong> de <strong className="text-slate-800">{itensVenda.length}</strong> itens adicionados
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none rounded-lg text-xs font-bold text-slate-700 transition-all active:scale-[0.98]"
                >
                  Anterior
                </button>
                <span className="text-xs font-bold text-slate-600 px-2.5">
                  Página {currentPage} de {Math.ceil(itensVenda.length / 5)}
                </span>
                <button
                  type="button"
                  disabled={currentPage === Math.ceil(itensVenda.length / 5)}
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(itensVenda.length / 5), prev + 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none rounded-lg text-xs font-bold text-slate-700 transition-all active:scale-[0.98]"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
