import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ClipboardList, CreditCard, Eye, FileText, HandCoins, History, PackagePlus, Pencil,
  Printer, Save, Search, ShoppingBag, Trash2, Truck, X
} from "lucide-react";
import { Compra, Fornecedor, FornecedorProduto, OrcamentoCompra, Produto } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import { Pagination, paginate } from "./Pagination";
import { useConfirmacao } from "./ConfirmacaoDialog";
import { OrcamentoCompraComprovante } from "./OrcamentoCompraComprovante";
import { useEhGerente } from "../auth/AuthContext";

type ItemRascunho = {
  produtoId: string;
  nome: string;
  codigo?: string;
  unidade: string;
  quantidade: string;
  custo: string;
  habitual: boolean;
};
type ProdutoSelecionavel = Pick<Produto, "id" | "nome" | "codigo" | "unidade" | "custoPadrao">;

const hoje = () => new Date().toISOString().split("T")[0];
const emDias = (dias: number) => {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().split("T")[0];
};
const numeroBR = (valor: number) => String(valor).replace(".", ",");
const PAGE_SIZE = 10;

function SeletorProduto({
  produtos, associados, bloqueados, onAdicionar, fornecedorReferencia, cor = "blue"
}: {
  produtos: ProdutoSelecionavel[];
  fornecedorReferencia?: string;
  associados: Set<string>;
  bloqueados: Set<string>;
  onAdicionar: (produto: ProdutoSelecionavel) => void;
  cor?: "blue" | "amber";
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const resultados = produtos.filter((produto) => !bloqueados.has(produto.id) && (
    !termo || produto.nome.toLocaleLowerCase("pt-BR").includes(termo) || (produto.codigo || "").toLocaleLowerCase("pt-BR").includes(termo)
  )).slice(0, 15);
  const foco = cor === "amber" ? "focus:border-amber-500" : "focus:border-blue-600";
  const hover = cor === "amber" ? "hover:bg-amber-50" : "hover:bg-blue-50";

  const somenteFornecedor = cor === "blue";
  return <div className="relative min-w-0 flex-1" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setAberto(false);
  }}>
    <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
    <input type="search" aria-label={somenteFornecedor ? "Buscar produtos do fornecedor" : "Buscar produtos para a compra"} value={busca} onFocus={() => setAberto(true)} onChange={(event) => { setBusca(event.target.value); setAberto(true); }} placeholder={somenteFornecedor ? "Busque um produto deste fornecedor…" : "Digite o nome ou código do produto…"} className={`min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold outline-none ${foco}`} />
    {aberto && (somenteFornecedor || termo) && <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
      {resultados.length === 0 ? <p className="p-4 text-sm font-bold text-slate-500">Nenhum produto disponível.</p> : resultados.map((produto) => <button key={produto.id} type="button" onClick={() => { onAdicionar(produto); setBusca(""); setAberto(false); }} className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left ${hover}`}>
        <span className="min-w-0"><strong className="block truncate text-slate-950">{produto.nome}</strong><small className="font-mono text-slate-500">{produto.codigo?.trim() || "##"} • {produto.unidade}</small><small className="block font-mono text-blue-700">REF. FORNECEDOR: {fornecedorReferencia?.trim() || "##"}</small></span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${associados.has(produto.id) ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}>{associados.has(produto.id) ? "HABITUAL" : "NOVO PARA ESTE FORNECEDOR"}</span>
      </button>)}
    </div>}
  </div>;
}

export function ComprasView() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.getFornecedores()
      .then(lista => setFornecedores(lista.filter(item => item.ativo === 1).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))))
      .catch(error => setErro(error.message || "Não foi possível carregar os fornecedores."))
      .finally(() => setCarregando(false));
  }, []);

  const fornecedor = fornecedores.find(item => item.id === fornecedorId);

  return <div id="compras-view" className="space-y-3">
    <section className="rounded-xl border border-slate-300 bg-white p-2.5 shadow-sm">
      <label htmlFor="compras-fornecedor" className="mb-1.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-700">
        <Truck size={17} className="text-amber-700" /> 1. Selecione o fornecedor
      </label>
      <select id="compras-fornecedor" autoFocus disabled={carregando || Boolean(erro)} value={fornecedorId} onChange={event => setFornecedorId(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-amber-500 disabled:bg-slate-200">
        <option value="">{carregando ? "CARREGANDO FORNECEDORES…" : "SELECIONE O FORNECEDOR…"}</option>
        {fornecedores.map(item => <option key={item.id} value={item.id}>{item.nome}{item.telefone ? ` — ${item.telefone}` : ""}</option>)}
      </select>
    </section>
    {erro && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{erro}</p>}
    {fornecedor && <React.Fragment key={fornecedor.id}>
      <ComprasFornecedor fornecedor={fornecedor} />
    </React.Fragment>}
  </div>;
}

function ComprasFornecedor({ fornecedor }: { fornecedor: Fornecedor }) {
  const confirmacao = useConfirmacao();
  const gerente = useEhGerente();
  const fornecedorId = fornecedor.id;
  const [modo, setModo] = useState<"orcamento" | "compra" | "historico" | "vales">("orcamento");
  const [produtosCompra, setProdutosCompra] = useState<Produto[] | null>(null);
  const [erroProdutosCompra, setErroProdutosCompra] = useState("");
  const [compras, setCompras] = useState<Compra[]>([]);
  const [catalogo, setCatalogo] = useState<FornecedorProduto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [page, setPage] = useState(1);
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [valesPage, setValesPage] = useState(1);
  const [filtroStatusVales, setFiltroStatusVales] = useState<"abertos" | "quitados" | "todos">("abertos");

  const [orcamentoAtual, setOrcamentoAtual] = useState<OrcamentoCompra | null>(null);
  const [orcamentoItems, setOrcamentoItems] = useState<ItemRascunho[]>([]);
  const [orcamentoData, setOrcamentoData] = useState(hoje());
  const [validade, setValidade] = useState(emDias(7));
  const [orcamentoDesconto, setOrcamentoDesconto] = useState("0");
  const [orcamentoObservacao, setOrcamentoObservacao] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [orcamentoPreview, setOrcamentoPreview] = useState<OrcamentoCompra | null>(null);
  const [orcamentoExpandido, setOrcamentoExpandido] = useState(true);

  const [rascunhoCompra, setRascunhoCompra] = useState<ItemRascunho[] | null>(null);
  const [orcamentoOrigemCompraId, setOrcamentoOrigemCompraId] = useState("");
  const [compraData, setCompraData] = useState(hoje());
  const [compraDesconto, setCompraDesconto] = useState("0");
  const [valorPago, setValorPago] = useState("0");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [vencimento, setVencimento] = useState("");
  const [compraObservacao, setCompraObservacao] = useState("");
  const [compraEmEdicao, setCompraEmEdicao] = useState<Compra | null>(null);
  const [compraDetalhe, setCompraDetalhe] = useState<Compra | null>(null);
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [pagamentoValor, setPagamentoValor] = useState("");
  const [pagamentoForma, setPagamentoForma] = useState("pix");

  const associados = useMemo(() => new Set(catalogo.map((item) => item.produtoId)), [catalogo]);
  const produtosFornecedor = useMemo<ProdutoSelecionavel[]>(() => catalogo.map(item => ({
    id: item.produtoId,
    nome: item.produtoNome || "Produto",
    codigo: item.produtoCodigo,
    unidade: item.unidade || "",
    custoPadrao: item.ultimoCusto ?? 0
  })), [catalogo]);

  const carregarFornecedor = async () => {
    setLoading(true);
    setErroCarga("");
    try {
      const [listaCatalogo, listaCompras, listaOrcamentos] = await Promise.all([
        api.getFornecedorProdutos(fornecedorId, true), api.getCompras(fornecedorId), api.getOrcamentosCompra(fornecedorId)
      ]);
      setCompras(listaCompras);
      setCatalogo(listaCatalogo);
      const aberto = listaOrcamentos.find(item => item.status === "aberto");
      if (aberto) carregarOrcamentoNoFormulario(aberto, listaCatalogo);
    } catch (error: any) {
      setErroCarga(error.message || "Não foi possível carregar os dados do fornecedor.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void carregarFornecedor(); }, [fornecedorId]);

  const carregarProdutosCompra = async () => {
    setErroProdutosCompra("");
    try {
      const lista = await api.getProdutos();
      setProdutosCompra(lista.filter(item => item.ativo === 1));
    } catch (error: any) {
      setErroProdutosCompra(error.message || "Não foi possível carregar os produtos para a compra.");
    }
  };

  useEffect(() => {
    if (modo === "compra" && produtosCompra === null) void carregarProdutosCompra();
  }, [modo, produtosCompra]);

  const atualizarCompras = async () => setCompras(await api.getCompras(fornecedorId));

  const historicoPrecos = useMemo(() => {
    const mapa = new Map<string, Array<{ data: string; custo: number; quantidade: number; compra: number }>>();
    compras.forEach((compra) => {
      (compra.items || []).forEach((item) => {
        const atual = mapa.get(item.produtoId) || [];
        atual.push({ data: compra.data, custo: Number(item.custoUnitario), quantidade: Number(item.quantidade), compra: compra.numeroSequencial });
        mapa.set(item.produtoId, atual);
      });
    });
    mapa.forEach((registros) => registros.sort((a, b) => b.data.localeCompare(a.data) || b.compra - a.compra));
    return mapa;
  }, [compras]);

  const ultimasCincoComprasFornecedor = useMemo<Compra[]>(() => compras.slice(0, 5), [compras]);

  const custoSugerido = (produto: ProdutoSelecionavel) => {
    const ultimo = historicoPrecos.get(produto.id)?.[0]?.custo;
    const habitual = catalogo.find((item) => item.produtoId === produto.id);
    return Number(ultimo ?? habitual?.ultimoCustoCompra ?? habitual?.custoFornecedor ?? produto.custoPadrao ?? 0);
  };

  const itemDoProduto = (produto: ProdutoSelecionavel): ItemRascunho => {
    const custo = custoSugerido(produto);
    return { produtoId: produto.id, nome: produto.nome, codigo: produto.codigo,
      unidade: produto.unidade, quantidade: "", custo: custo > 0 ? numeroBR(custo) : "", habitual: associados.has(produto.id) };
  };

  const itensRecentes = useMemo<ItemRascunho[]>(() => {
    if (!produtosCompra) return [];
    const unicos = new Map<string, ItemRascunho>();
    const produtosPorId = new Map<string, Produto>(produtosCompra.map(produto => [produto.id, produto]));
    for (const compra of ultimasCincoComprasFornecedor) {
      for (const item of compra.items || []) {
        if (unicos.has(item.produtoId)) continue;
        const produto = produtosPorId.get(item.produtoId);
        if (!produto) continue;
        unicos.set(item.produtoId, {
          produtoId: produto.id,
          nome: produto.nome,
          codigo: produto.codigo,
          unidade: item.unidade || produto.unidade,
          quantidade: "",
          custo: Number(item.custoUnitario) > 0 ? numeroBR(Number(item.custoUnitario)) : "",
          habitual: associados.has(produto.id)
        });
      }
    }
    return [...unicos.values()];
  }, [ultimasCincoComprasFornecedor, produtosCompra, associados]);
  const compraItems = rascunhoCompra ?? itensRecentes;

  const itensDoOrcamento = (orcamento: OrcamentoCompra, catalogoAtual = catalogo) => {
    const idsHabituais = new Set(catalogoAtual.map((item) => item.produtoId));
    return orcamento.items.map((item) => ({
      produtoId: item.produtoId, nome: item.produtoNome || "Produto", codigo: item.produtoCodigo,
      unidade: item.unidade, quantidade: numeroBR(Number(item.quantidade)), custo: numeroBR(Number(item.custoEstimado)), habitual: idsHabituais.has(item.produtoId)
    }));
  };

  const carregarOrcamentoNoFormulario = (orcamento: OrcamentoCompra, catalogoAtual: FornecedorProduto[]) => {
    setOrcamentoAtual(orcamento);
    setOrcamentoData(orcamento.data);
    setValidade(orcamento.validade || emDias(7));
    setOrcamentoDesconto(numeroBR(Number(orcamento.desconto)));
    setOrcamentoObservacao(orcamento.observacao || "");
    setOrcamentoItems(itensDoOrcamento(orcamento, catalogoAtual));
  };

  const limparOrcamento = () => {
    setOrcamentoAtual(null);
    setOrcamentoData(hoje());
    setValidade(emDias(7));
    setOrcamentoDesconto("0");
    setOrcamentoObservacao("");
    setOrcamentoItems([]);
  };

  const atualizarItens = (destino: "orcamento" | "compra", alterar: (items: ItemRascunho[]) => ItemRascunho[]) => {
    if (destino === "orcamento") setOrcamentoItems(alterar);
    else setRascunhoCompra(atuais => alterar(atuais ?? itensRecentes));
  };

  const atualizarItem = (destino: "orcamento" | "compra", produtoId: string, campo: "quantidade" | "custo", valor: string) => {
    atualizarItens(destino, atuais => atuais.map(item => item.produtoId === produtoId ? { ...item, [campo]: valor } : item));
  };

  const adicionarItem = (destino: "orcamento" | "compra", produto: ProdutoSelecionavel) => {
    atualizarItens(destino, atuais => atuais.some(item => item.produtoId === produto.id) ? atuais : [...atuais, itemDoProduto(produto)]);
  };

  const removerItem = (destino: "orcamento" | "compra", produtoId: string) => {
    atualizarItens(destino, atuais => atuais.filter(item => item.produtoId !== produtoId));
  };

  const calcular = (items: ItemRascunho[], descontoTexto: string) => {
    const subtotal = items.reduce((soma, item) => soma + parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.custo), 0);
    const desconto = parseBrazilianNumber(descontoTexto);
    return { subtotal, desconto, total: Math.max(0, subtotal - desconto) };
  };
  const totaisOrcamento = calcular(orcamentoItems, orcamentoDesconto);
  const totaisCompra = calcular(compraItems, compraDesconto);

  const itensValidos = (items: ItemRascunho[]) => items.filter((item) => parseBrazilianNumber(item.quantidade) > 0);
  const validarItens = (items: ItemRascunho[], desconto: number, subtotal: number) => {
    const validos = itensValidos(items);
    if (validos.length === 0) return "Informe a quantidade de pelo menos um produto.";
    if (validos.some((item) => parseBrazilianNumber(item.custo) < 0)) return "Revise os custos informados.";
    if (desconto < 0 || desconto > subtotal) return "O desconto não pode superar o subtotal.";
    return null;
  };

  const salvarOrcamento = async () => {
    const erro = validarItens(orcamentoItems, totaisOrcamento.desconto, totaisOrcamento.subtotal);
    if (erro) return setMensagem({ tipo: "erro", texto: erro });
    setSalvando(true);
    try {
      const salvo = await api.saveOrcamentoCompra({
        id: orcamentoAtual?.id, fornecedorId, data: orcamentoData, validade: validade || undefined,
        desconto: totaisOrcamento.desconto, observacao: orcamentoObservacao || undefined,
        items: itensValidos(orcamentoItems).map((item) => ({ produtoId: item.produtoId, quantidade: parseBrazilianNumber(item.quantidade), unidade: item.unidade, custoEstimado: parseBrazilianNumber(item.custo) }))
      });
      setOrcamentoAtual(salvo);
      setOrcamentoPreview(salvo);
      setMensagem({ tipo: "ok", texto: "Pedido de orçamento salvo. A tela para enviar ao fornecedor já está pronta." });
      setPreviewOpen(true);
    } catch (error: any) { setMensagem({ tipo: "erro", texto: error.message || "Não foi possível salvar o pedido." }); }
    finally { setSalvando(false); }
  };

  const levarOrcamentoParaCompra = () => {
    if (compraEmEdicao) return setMensagem({ tipo: "erro", texto: "Conclua ou cancele a edição da compra antes de carregar um orçamento." });
    const origem = itensValidos(orcamentoItems);
    if (origem.length === 0) return setMensagem({ tipo: "erro", texto: "Preencha as quantidades do orçamento antes de levar para a compra." });
    setModo("compra");
    setRascunhoCompra(origem.map((item) => ({ ...item })));
    setOrcamentoOrigemCompraId(orcamentoAtual?.id || "");
    setCompraDesconto(orcamentoDesconto);
    setCompraObservacao(orcamentoObservacao);
    setMensagem({ tipo: "ok", texto: "Itens carregados na conferência. Corrija quantidade, metragem e custo conforme o material recebido." });
    window.setTimeout(() => document.getElementById("entrada-compra")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const carregarOrcamentoNaCompra = () => {
    if (!orcamentoAtual) return;
    setRascunhoCompra(itensDoOrcamento(orcamentoAtual));
    setOrcamentoOrigemCompraId(orcamentoAtual.id);
    setCompraDesconto(numeroBR(Number(orcamentoAtual.desconto)));
    setCompraObservacao(orcamentoAtual.observacao || "");
    setMensagem({ tipo: "ok", texto: `Pedido #${orcamentoAtual.numeroSequencial} carregado. Confira o que chegou antes de finalizar.` });
  };

  const carregarHabituaisNaCompra = () => {
    setOrcamentoOrigemCompraId("");
    setRascunhoCompra(null);
    setMensagem(itensRecentes.length > 0
      ? { tipo: "ok", texto: `${itensRecentes.length} produto(s) único(s) carregado(s) das últimas ${ultimasCincoComprasFornecedor.length} compra(s) deste fornecedor.` }
      : { tipo: "erro", texto: "Este fornecedor ainda não possui compras anteriores para carregar. Adicione os produtos pela busca." });
  };

  const limparCompra = () => {
    setRascunhoCompra(null);
    setOrcamentoOrigemCompraId("");
    setCompraEmEdicao(null);
    setCompraData(hoje());
    setCompraDesconto("0");
    setValorPago("0");
    setFormaPagamento("pix");
    setVencimento("");
    setCompraObservacao("");
  };

  const finalizarCompra = async () => {
    const erro = validarItens(compraItems, totaisCompra.desconto, totaisCompra.subtotal);
    if (erro) return setMensagem({ tipo: "erro", texto: erro });
    const pago = compraEmEdicao ? Number(compraEmEdicao.valorPago) : parseBrazilianNumber(valorPago);
    if (pago < 0 || pago > totaisCompra.total) return setMensagem({ tipo: "erro", texto: "O valor pago deve estar entre zero e o total." });
    if (!compraEmEdicao && formaPagamento === "vale" && pago >= totaisCompra.total - 0.005) return setMensagem({ tipo: "erro", texto: "O Vale precisa possuir saldo pendente. Para uma compra totalmente paga, escolha outra forma." });
    if (pago < totaisCompra.total && !vencimento) return setMensagem({ tipo: "erro", texto: "Informe o vencimento do saldo pendente." });
    setSalvando(true);
    try {
      const items = itensValidos(compraItems).map((item) => ({ produtoId: item.produtoId, quantidade: parseBrazilianNumber(item.quantidade), unidade: item.unidade, custoUnitario: parseBrazilianNumber(item.custo) }));
      if (compraEmEdicao) await api.updateCompra(compraEmEdicao.id, {
        updatedAt: compraEmEdicao.updatedAt, data: compraData, desconto: totaisCompra.desconto,
        vencimento: vencimento || undefined, observacao: compraObservacao || undefined, items
      });
      else await api.createCompra({
        fornecedorId, orcamentoCompraId: orcamentoOrigemCompraId || undefined, data: compraData, desconto: totaisCompra.desconto,
        valorPago: pago, formaPagamento, vencimento: vencimento || undefined, observacao: compraObservacao || undefined, items
      });
      const valeEmitido = !compraEmEdicao && formaPagamento === "vale";
      if (!compraEmEdicao && orcamentoOrigemCompraId && orcamentoOrigemCompraId === orcamentoAtual?.id) limparOrcamento();
      limparCompra();
      setMensagem({ tipo: "ok", texto: compraEmEdicao ? "Alterações da compra salvas com segurança." : valeEmitido ? "Compra finalizada e Vale emitido para acompanhamento dos pagamentos." : "Compra finalizada. Os produtos novos agora fazem parte dos habituais deste fornecedor." });
      if (valeEmitido) { setFiltroStatusVales("abertos"); setValesPage(1); }
      else setPage(1);
      setModo(valeEmitido ? "vales" : "historico");
      try {
        const [listaCompras, listaCatalogo] = await Promise.all([api.getCompras(fornecedorId), api.getFornecedorProdutos(fornecedorId, true)]);
        setCompras(listaCompras);
        setCatalogo(listaCatalogo);
      } catch {
        setMensagem({ tipo: "erro", texto: "Compra salva. Selecione novamente o fornecedor para atualizar os registros." });
      }
    } catch (error: any) { setMensagem({ tipo: "erro", texto: error.message || "Não foi possível finalizar a compra." }); }
    finally { setSalvando(false); }
  };

  const editarCompra = (compra: Compra) => {
    setModo("compra");
    setCompraEmEdicao(compra);
    setCompraData(compra.data);
    setCompraDesconto(numeroBR(Number(compra.desconto)));
    setValorPago(numeroBR(Number(compra.valorPago)));
    setFormaPagamento(compra.formaPagamento || "nao_informado");
    setVencimento(compra.vencimento || "");
    setCompraObservacao(compra.observacao || "");
    setOrcamentoOrigemCompraId(compra.orcamentoCompraId || "");
    setRascunhoCompra((compra.items || []).map((item) => ({
      produtoId: item.produtoId, nome: item.produtoNome || "Produto",
      codigo: item.produtoCodigo, unidade: item.unidade, quantidade: numeroBR(Number(item.quantidade)),
      custo: numeroBR(Number(item.custoUnitario)), habitual: associados.has(item.produtoId)
    })));
    setMensagem({ tipo: "ok", texto: `Editando a compra #${compra.numeroSequencial}. O fornecedor e os pagamentos já registrados não podem ser trocados.` });
  };

  const visualizarOrcamento = (registro: OrcamentoCompra) => {
    setOrcamentoPreview(registro);
    setPreviewOpen(true);
  };

  const registrarPagamento = async (compra: Compra) => {
    const valor = parseBrazilianNumber(pagamentoValor);
    if (valor <= 0 || valor > Number(compra.saldoRestante)) return setMensagem({ tipo: "erro", texto: "Informe um valor dentro do saldo da compra." });
    try {
      await api.createPagamentoCompra(compra.id, { data: hoje(), valor, formaPagamento: pagamentoForma });
      setPagandoId(null); setPagamentoValor(""); if (modo === "vales") setValesPage(1); await atualizarCompras();
      setMensagem({ tipo: "ok", texto: "Pagamento registrado e saldo atualizado." });
    } catch (error: any) { setMensagem({ tipo: "erro", texto: error.message || "Não foi possível registrar o pagamento." }); }
  };

  const cancelarCompra = async (compra: Compra) => {
    if (!await confirmacao.confirmar({ titulo: "Cancelar compra", mensagem: "A compra e seus pagamentos serão cancelados. Os custos voltarão à última compra válida.", textoConfirmar: "Cancelar compra" })) return;
    try { await api.cancelarCompra(compra.id); await atualizarCompras(); }
    catch (error: any) { setMensagem({ tipo: "erro", texto: error.message || "Não foi possível cancelar a compra." }); }
  };

  const cancelarOrcamento = async (orcamento: OrcamentoCompra) => {
    if (!await confirmacao.confirmar({ titulo: "Cancelar pedido", mensagem: `Cancelar o pedido de orçamento #${orcamento.numeroSequencial}?`, textoConfirmar: "Cancelar pedido" })) return;
    setSalvando(true);
    try {
      await api.cancelarOrcamentoCompra(orcamento.id);
      limparOrcamento();
      if (orcamentoOrigemCompraId === orcamento.id) setOrcamentoOrigemCompraId("");
      setMensagem({ tipo: "ok", texto: "Orçamento cancelado." });
    }
    catch (error: any) { setMensagem({ tipo: "erro", texto: error.message || "Não foi possível cancelar o pedido." }); }
    finally { setSalvando(false); }
  };

  const renderTabelaItens = (destino: "orcamento" | "compra", items: ItemRascunho[]) => {
    const itemsOrdenados = destino === "compra"
      ? items.map((item, indice) => ({ item, indice })).sort((a, b) =>
          parseBrazilianNumber(b.item.quantidade) - parseBrazilianNumber(a.item.quantidade) || a.indice - b.indice
        ).map(({ item }) => item)
      : items;
    return <>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[900px] text-sm"><thead className={destino === "compra" ? "bg-amber-50 text-left text-[10px] font-black uppercase text-amber-950" : "bg-blue-50 text-left text-[10px] font-black uppercase text-blue-950"}><tr><th className="p-2">Produto</th><th className="p-2">Últimos preços pagos</th><th className="w-36 p-2">Quantidade</th><th className="w-36 p-2">{destino === "compra" ? "Custo recebido" : "Custo estimado"}</th><th className="w-32 p-2 text-right">Total</th><th className="w-12"></th></tr></thead>
        <tbody className="divide-y divide-slate-100">{itemsOrdenados.map((item) => {
          const historico = historicoPrecos.get(item.produtoId) || [];
          return <tr key={item.produtoId} className={item.habitual ? "bg-white" : "bg-violet-50/40"}>
            <td className="p-2"><div className="flex items-center gap-2"><strong className="text-slate-950">{item.nome}</strong>{!item.habitual && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-800">NOVO</span>}</div><small className="font-mono text-slate-500">{item.codigo?.trim() || "##"} • {item.unidade}</small><small className="block font-mono text-blue-700">REF. FORNECEDOR: {fornecedor?.referencia?.trim() || "##"}</small></td>
            <td className="p-2">{historico.length === 0 ? <span className="text-xs text-slate-400">Nunca comprado deste fornecedor</span> : <div className="flex flex-wrap gap-1">{historico.slice(0, 3).map((registro, index) => <span key={`${registro.compra}-${index}`} title={`Compra #${registro.compra} • ${formatDate(registro.data)} • ${formatDecimal(registro.quantidade)} ${item.unidade}`} className={`rounded px-2 py-1 text-[10px] font-black ${index === 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{formatCurrency(registro.custo)}</span>)}</div>}</td>
            <td className="p-2"><input aria-label={`Quantidade de ${item.nome}`} inputMode="decimal" value={item.quantidade} onChange={(event) => atualizarItem(destino, item.produtoId, "quantidade", event.target.value)} placeholder="0" className={`w-full rounded-md border px-2 py-2 text-right font-black outline-none ${destino === "compra" ? "border-amber-300 bg-amber-50 focus:border-amber-600" : "border-blue-300 bg-blue-50 focus:border-blue-600"}`} /></td>
            <td className="p-2"><input aria-label={`Custo de ${item.nome}`} inputMode="decimal" value={item.custo} onChange={(event) => atualizarItem(destino, item.produtoId, "custo", event.target.value)} placeholder="0,00" className="w-full rounded-md border border-sky-300 bg-sky-50 px-2 py-2 text-right font-black outline-none focus:border-sky-600" /></td>
            <td className="p-2 text-right font-mono font-black">{formatCurrency(parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.custo))}</td>
            <td className="p-2"><button type="button" onClick={() => removerItem(destino, item.produtoId)} aria-label={`Remover ${item.nome}`} className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="space-y-2 md:hidden">{itemsOrdenados.map((item) => {
      const historico = historicoPrecos.get(item.produtoId) || [];
      return <article key={item.produtoId} className={`rounded-xl border p-3 shadow-sm ${item.habitual ? "border-slate-200 bg-white" : "border-violet-200 bg-violet-50"}`}>
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1"><strong className="text-sm text-slate-950">{item.nome}</strong>{!item.habitual && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-800">NOVO</span>}</div><p className="mt-0.5 font-mono text-[10px] text-slate-500">{item.codigo?.trim() || "##"} • {item.unidade}</p><p className="font-mono text-[10px] text-blue-700">REF. FORNECEDOR: {fornecedor?.referencia?.trim() || "##"}</p></div><button type="button" onClick={() => removerItem(destino, item.produtoId)} aria-label={`Remover ${item.nome}`} className="shrink-0 rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={15}/></button></div>
        <div className="mt-2"><span className="text-[9px] font-black uppercase text-slate-500">Últimos preços</span>{historico.length === 0 ? <p className="text-xs text-slate-400">Primeira compra neste fornecedor</p> : <div className="mt-1 flex flex-wrap gap-1">{historico.slice(0, 3).map((registro, index) => <span key={`${registro.compra}-${index}`} className={`rounded px-2 py-1 text-[10px] font-black ${index === 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{formatCurrency(registro.custo)}</span>)}</div>}</div>
        <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] font-black uppercase text-slate-600">Quantidade<input aria-label={`Quantidade de ${item.nome}`} inputMode="decimal" value={item.quantidade} onChange={(event) => atualizarItem(destino, item.produtoId, "quantidade", event.target.value)} placeholder="0" className={`mt-1 w-full rounded-lg border px-3 py-3 text-right text-base font-black outline-none ${destino === "compra" ? "border-amber-300 bg-amber-50" : "border-blue-300 bg-blue-50"}`}/></label><label className="text-[10px] font-black uppercase text-slate-600">{destino === "compra" ? "Custo recebido" : "Custo estimado"}<input aria-label={`Custo de ${item.nome}`} inputMode="decimal" value={item.custo} onChange={(event) => atualizarItem(destino, item.produtoId, "custo", event.target.value)} placeholder="0,00" className="mt-1 w-full rounded-lg border border-sky-300 bg-sky-50 px-3 py-3 text-right text-base font-black outline-none"/></label></div>
        <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm"><span className="font-bold text-slate-600">Total do item</span><strong className="font-mono text-base text-slate-950">{formatCurrency(parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.custo))}</strong></div>
      </article>;
    })}</div>
  </>;
  };

  const termoHistorico = buscaHistorico.trim();
  const comprasFiltradas = compras.filter(compra => String(compra.numeroSequencial).includes(termoHistorico));
  const comprasPagina = paginate<Compra>(comprasFiltradas, page, PAGE_SIZE);
  const valesCompra = compras.filter(compra => compra.formaPagamento === "vale"
    && (filtroStatusVales === "todos" || (filtroStatusVales === "abertos" ? compra.status === "pendente" : compra.status === "paga"))
  );
  const valesPagina = paginate<Compra>(valesCompra, valesPage, PAGE_SIZE);
  const totaisVales = valesCompra.reduce((totais, compra) => ({
    total: totais.total + Number(compra.total),
    pago: totais.pago + Number(compra.valorPago),
    saldo: totais.saldo + Number(compra.saldoRestante)
  }), { total: 0, pago: 0, saldo: 0 });

  const formularioOrcamento = <section className="overflow-visible rounded-xl bg-slate-50 shadow-sm">
    <div className="flex items-center justify-between rounded-t-xl bg-blue-800 px-3 py-2 text-white">
      <div className="flex items-center gap-2"><FileText size={18}/><strong className="text-sm uppercase">{orcamentoAtual ? `Editar orçamento #${orcamentoAtual.numeroSequencial}` : "Novo orçamento ao fornecedor"}</strong></div>
      <button type="button" aria-expanded={orcamentoExpandido} onClick={() => setOrcamentoExpandido(atual => !atual)} className="rounded border border-white/30 px-2 py-1 text-[10px] font-black">{orcamentoExpandido ? "RECOLHER" : "EXPANDIR"}</button>
    </div>
    {orcamentoExpandido && <div className="space-y-3 p-2">
      <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-white p-2 sm:flex-row"><SeletorProduto fornecedorReferencia={fornecedor?.referencia} produtos={produtosFornecedor} associados={associados} bloqueados={new Set(orcamentoItems.map((item) => item.produtoId))} onAdicionar={(produto) => adicionarItem("orcamento", produto)}/><input type="date" aria-label="Data do orçamento" value={orcamentoData} onChange={(event) => setOrcamentoData(event.target.value)} className="rounded-lg border px-2 text-xs font-bold"/><input type="date" aria-label="Validade" value={validade} onChange={(event) => setValidade(event.target.value)} className="rounded-lg border px-2 text-xs font-bold"/></div>
      {orcamentoItems.length === 0 ? <div className="rounded-lg border border-dashed border-blue-300 p-8 text-center text-sm font-bold text-slate-500">Adicione produtos vinculados a este fornecedor.</div> : renderTabelaItens("orcamento", orcamentoItems)}
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]"><textarea rows={2} value={orcamentoObservacao} onChange={(event) => setOrcamentoObservacao(event.target.value)} placeholder="Observações para o fornecedor..." className="rounded-lg border border-blue-200 p-3 text-sm"/><div className="space-y-2 rounded-lg bg-blue-50 p-3 text-sm"><div className="flex justify-between"><span>Estimativa interna</span><strong>{formatCurrency(totaisOrcamento.subtotal)}</strong></div><label className="flex justify-between">Desconto<input value={orcamentoDesconto} onChange={(event) => setOrcamentoDesconto(event.target.value)} className="w-24 rounded border px-2 py-1 text-right"/></label><div className="flex justify-between border-t pt-2"><strong>Total</strong><strong>{formatCurrency(totaisOrcamento.total)}</strong></div></div></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={salvando} onClick={salvarOrcamento} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white"><Save size={17}/>{orcamentoAtual ? "Salvar alterações" : "Salvar orçamento"}</button>{orcamentoAtual && <button type="button" onClick={() => visualizarOrcamento(orcamentoAtual)} className="rounded-xl border border-blue-300 px-4 py-3 text-sm font-black text-blue-800"><Printer size={17} className="mr-1 inline"/>Tela para enviar</button>}{gerente && orcamentoAtual && <button type="button" disabled={salvando} onClick={() => cancelarOrcamento(orcamentoAtual)} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-700">Cancelar orçamento</button>}<button type="button" disabled={salvando} onClick={levarOrcamentoParaCompra} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">Levar para conferência <ArrowDown size={17} className="inline"/></button></div>
    </div>}
  </section>;

  return <>
    {confirmacao.dialogo}
    {compraDetalhe && <div className="fixed inset-0 z-[85] overflow-y-auto bg-slate-950/65 p-3 sm:p-6"><div role="dialog" aria-modal="true" aria-label={`Detalhes da compra ${compraDetalhe.numeroSequencial}`} className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b bg-amber-50 p-4"><div><h3 className="text-lg font-black text-amber-950">Compra #{compraDetalhe.numeroSequencial}</h3><p className="text-sm font-bold text-slate-700">{compraDetalhe.fornecedorNome} • {formatDate(compraDetalhe.data)}</p></div><button type="button" onClick={() => setCompraDetalhe(null)} aria-label="Fechar detalhes da compra" className="rounded-lg border border-amber-300 bg-white p-2"><X size={18}/></button></div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl bg-slate-100 p-3"><span className="text-[10px] font-black uppercase text-slate-500">Total</span><strong className="block font-mono text-lg">{formatCurrency(compraDetalhe.total)}</strong></div><div className="rounded-xl bg-emerald-50 p-3"><span className="text-[10px] font-black uppercase text-emerald-700">Pago</span><strong className="block font-mono text-lg text-emerald-800">{formatCurrency(compraDetalhe.valorPago)}</strong></div><div className="rounded-xl bg-amber-50 p-3"><span className="text-[10px] font-black uppercase text-amber-700">Saldo</span><strong className="block font-mono text-lg text-amber-900">{formatCurrency(compraDetalhe.saldoRestante)}</strong></div><div className="rounded-xl bg-slate-100 p-3"><span className="text-[10px] font-black uppercase text-slate-500">Vencimento</span><strong className="block text-sm">{compraDetalhe.vencimento ? formatDate(compraDetalhe.vencimento) : "—"}</strong></div></div>
        <section><h4 className="mb-2 font-black text-slate-950">Produtos comprados</h4><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-100 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Produto</th><th className="p-3 text-right">Quantidade</th><th className="p-3">Unidade</th><th className="p-3 text-right">Custo unitário</th><th className="p-3 text-right">Total</th></tr></thead><tbody className="divide-y">{(compraDetalhe.items || []).map((item) => <tr key={item.id}><td className="p-3"><strong>{item.produtoNome || "Produto"}</strong>{item.produtoCodigo && <small className="block font-mono text-slate-500">{item.produtoCodigo}</small>}</td><td className="p-3 text-right font-mono font-bold">{formatDecimal(item.quantidade)}</td><td className="p-3">{item.unidade}</td><td className="p-3 text-right font-mono">{formatCurrency(item.custoUnitario)}</td><td className="p-3 text-right font-mono font-black">{formatCurrency(item.total)}</td></tr>)}</tbody></table></div></section>
        <section><h4 className="mb-2 font-black text-slate-950">Pagamentos</h4>{(compraDetalhe.pagamentos || []).length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Nenhum pagamento registrado.</p> : <div className="space-y-2">{(compraDetalhe.pagamentos || []).map((pagamento) => <div key={pagamento.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><span>{formatDate(pagamento.data)} • <strong className="uppercase">{pagamento.formaPagamento}</strong></span><strong className="font-mono text-emerald-700">{formatCurrency(pagamento.valor)}</strong></div>)}</div>}</section>
        {compraDetalhe.observacao && <section className="rounded-xl bg-slate-50 p-3"><h4 className="text-xs font-black uppercase text-slate-500">Observações</h4><p className="mt-1 text-sm text-slate-700">{compraDetalhe.observacao}</p></section>}
      </div>
    </div></div>}
    {previewOpen && orcamentoPreview && <div id="print-orcamento-compra" className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/70 p-3 sm:p-6 print:absolute print:bg-white print:p-0"><div className="mx-auto w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-[calc(100vw-3rem)] print:max-w-none print:rounded-none print:shadow-none">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-white p-4 sm:flex-row sm:items-center sm:justify-between print:hidden"><div><h3 className="font-black">Pedido pronto para enviar ao fornecedor</h3><p className="text-xs text-slate-600">Os custos internos não aparecem na impressão.</p></div><div className="grid grid-cols-[1fr_1fr_auto] gap-2"><button type="button" onClick={() => window.print()} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white"><Printer size={15} className="mr-1 inline"/> Imprimir</button><button type="button" onClick={() => window.print()} className="rounded-xl border border-amber-300 px-3 py-2 text-xs font-black text-amber-900"><FileText size={15} className="mr-1 inline"/> Salvar PDF</button><button type="button" onClick={() => { setPreviewOpen(false); setOrcamentoPreview(null); }} className="rounded-lg border p-2" aria-label="Fechar"><X size={18}/></button></div></div>
      <div className="max-w-full overflow-x-auto bg-slate-200 p-3 print:overflow-visible print:bg-white print:p-0"><OrcamentoCompraComprovante orcamento={orcamentoPreview} fornecedor={fornecedor}/></div>
    </div></div>}

    <nav aria-label="Áreas de compras" className="sticky top-0 z-30 grid grid-cols-2 gap-1 rounded-xl border border-amber-300 bg-amber-50/95 p-1.5 shadow-sm backdrop-blur sm:grid-cols-4 print:hidden">
      <button type="button" onClick={() => setModo("orcamento")} className={`module-tab justify-center ${modo === "orcamento" ? "module-tab-active" : ""}`}><ClipboardList size={17}/><span>Orçamento</span></button>
      <button type="button" onClick={() => setModo("compra")} className={`module-tab justify-center ${modo === "compra" ? "module-tab-active" : ""}`}><ShoppingBag size={17}/><span>Compra</span></button>
      <button type="button" onClick={() => setModo("historico")} className={`module-tab justify-center ${modo === "historico" ? "module-tab-active" : ""}`}><History size={17}/><span>Histórico</span></button>
      <button type="button" onClick={() => setModo("vales")} className={`module-tab justify-center ${modo === "vales" ? "module-tab-active" : ""}`}><HandCoins size={17}/><span>Vales</span></button>
    </nav>

    {mensagem && <div className={`rounded-xl border p-3 text-sm font-bold ${mensagem.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{mensagem.texto}</div>}
    {loading ? <div className="py-16 text-center font-bold text-slate-500">Carregando dados do fornecedor…</div> : erroCarga ? (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
        {erroCarga}<button type="button" className="underline" onClick={carregarFornecedor}>Tentar novamente</button>
      </div>
    ) : <>
      {modo === "orcamento" && formularioOrcamento}
      {modo === "compra" && <div className="space-y-3">
        {compraEmEdicao && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-300 bg-violet-50 p-3"><strong className="text-violet-950">Editando compra #{compraEmEdicao.numeroSequencial}</strong><button type="button" onClick={() => { limparCompra(); setMensagem(null); setModo("historico"); }} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800">Cancelar edição</button></div>}
        <section id="entrada-compra" className="overflow-visible rounded-xl bg-slate-50 shadow-sm"><div className="flex items-center justify-between rounded-t-xl bg-amber-700 px-3 py-2 text-white"><div className="flex items-center gap-2"><ShoppingBag size={18}/><strong className="text-sm uppercase">Compra • entrada conferida</strong></div><span className="rounded bg-white/15 px-2 py-1 text-[10px] font-black">{compraEmEdicao ? "EDIÇÃO" : "CONFIRA O QUE CHEGOU"}</span></div><div className="space-y-3 p-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <input type="date" aria-label="Data da compra" value={compraData} onChange={event => setCompraData(event.target.value)} className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold"/>
            {!compraEmEdicao && orcamentoAtual && <button type="button" onClick={carregarOrcamentoNaCompra} className="min-h-11 rounded-xl bg-amber-700 px-4 text-sm font-black text-white">Carregar orçamento #{orcamentoAtual.numeroSequencial}</button>}
            {!compraEmEdicao && orcamentoOrigemCompraId && <span className="text-xs font-bold text-amber-900">Orçamento vinculado à compra</span>}
          </div>
          {produtosCompra ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-2 sm:flex-row">
              <SeletorProduto fornecedorReferencia={fornecedor.referencia} produtos={produtosCompra} associados={associados} bloqueados={new Set(compraItems.map(item => item.produtoId))} onAdicionar={produto => adicionarItem("compra", produto)} cor="amber"/>
              {!compraEmEdicao && <button type="button" onClick={carregarHabituaisNaCompra} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-900"><PackagePlus size={15}/> Últimas 5 compras ({itensRecentes.length})</button>}
            </div>
          ) : erroProdutosCompra ? (
            <p role="alert" className="text-sm text-red-800">{erroProdutosCompra} <button type="button" className="font-bold underline" onClick={carregarProdutosCompra}>Tentar novamente</button></p>
          ) : <p className="text-sm text-slate-500">Carregando a busca de produtos…</p>}
          {compraItems.length === 0 ? <div className="rounded-lg border border-dashed border-amber-300 p-8 text-center text-sm font-bold text-slate-500">Carregue um orçamento, os produtos das últimas cinco compras ou pesquise um produto.</div> : renderTabelaItens("compra", compraItems)}
          <div className="grid gap-3 xl:grid-cols-[1fr_340px]"><div className="space-y-2"><textarea rows={2} value={compraObservacao} onChange={(event) => setCompraObservacao(event.target.value)} placeholder="Nota fiscal, prazo ou observações..." className="w-full rounded-lg border border-amber-200 p-3 text-sm"/><div className="grid gap-2 sm:grid-cols-3"><label className="text-xs font-bold">{compraEmEdicao ? "Pago já registrado" : "Valor pago agora"}<input disabled={Boolean(compraEmEdicao)} value={valorPago} onChange={(event) => setValorPago(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"/></label><label className="text-xs font-bold">Forma / condição<select disabled={Boolean(compraEmEdicao)} value={formaPagamento} onChange={(event) => { const forma = event.target.value; setFormaPagamento(forma); if (forma === "vale" && !vencimento) setVencimento(emDias(30)); }} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="cartao">Cartão</option><option value="vale">Vale — pagar depois</option></select></label><label className="text-xs font-bold">Vencimento do saldo<input type="date" value={vencimento} onChange={(event) => setVencimento(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"/></label></div>{!compraEmEdicao && formaPagamento === "vale" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">O restante ficará no vale.</p>}</div><div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(totaisCompra.subtotal)}</strong></div><label className="flex items-center justify-between">Desconto<input value={compraDesconto} onChange={(event) => setCompraDesconto(event.target.value)} className="w-24 rounded border px-2 py-1 text-right"/></label><div className="flex justify-between border-t border-amber-200 pt-2 text-base"><strong>Total</strong><strong>{formatCurrency(totaisCompra.total)}</strong></div><button type="button" disabled={salvando} onClick={finalizarCompra} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={17}/>{compraEmEdicao ? "Salvar alterações" : "Finalizar compra"}</button></div></div>
        </div></section>
      </div>}

      {modo === "historico" && <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 p-4">
          <div><h3 className="font-black text-amber-950">Histórico de compras</h3><p className="text-xs text-slate-500">{comprasFiltradas.length} compra(s)</p></div>
          <div className="flex items-center rounded-xl border bg-white"><Search size={16} className="ml-3 text-slate-400"/><input value={buscaHistorico} onChange={event => { setBuscaHistorico(event.target.value); setPage(1); }} aria-label="Buscar compra por número" placeholder="Número da compra…" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"/></div>
        </div>
        {comprasPagina.length === 0 && <p className="p-8 text-center text-sm font-bold text-slate-500">Nenhuma compra encontrada.</p>}
        <div className="space-y-3 p-3 md:hidden">{comprasPagina.map((compra) => <article key={compra.id} className="rounded-xl border p-3"><div className="flex justify-between"><div><strong>Compra #{compra.numeroSequencial}</strong><p className="text-xs text-slate-500">{compra.fornecedorNome} • {formatDate(compra.data)}</p></div><strong>{formatCurrency(compra.total)}</strong></div><p className="mt-2 text-xs font-bold text-amber-700">Pago {formatCurrency(compra.valorPago)} • saldo {formatCurrency(compra.saldoRestante)}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setCompraDetalhe(compra)} className="rounded-lg border border-slate-300 p-2 text-xs font-black text-slate-700"><Eye size={14} className="mr-1 inline"/>Ver detalhes</button><button type="button" onClick={() => editarCompra(compra)} className="rounded-lg border border-blue-200 p-2 text-xs font-black text-blue-700"><Pencil size={14} className="mr-1 inline"/>Editar</button>{Number(compra.saldoRestante) > 0 && <button type="button" onClick={() => { setPagandoId(compra.id); setPagamentoValor(numeroBR(Number(compra.saldoRestante))); }} className="rounded-lg border border-emerald-200 p-2 text-xs font-black text-emerald-700"><CreditCard size={14} className="mr-1 inline"/>Pagar</button>}{gerente && <button type="button" onClick={() => cancelarCompra(compra)} className="rounded-lg border border-red-200 p-2 text-xs font-black text-red-700"><Trash2 size={14}/></button>}</div>{pagandoId === compra.id && <div className="mt-3 grid gap-2 rounded-lg bg-emerald-50 p-2"><input value={pagamentoValor} onChange={(event) => setPagamentoValor(event.target.value)} className="rounded border px-3 py-2"/><select value={pagamentoForma} onChange={(event) => setPagamentoForma(event.target.value)} className="rounded border px-3 py-2"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option></select><button type="button" onClick={() => registrarPagamento(compra)} className="rounded bg-emerald-700 p-2 font-bold text-white">Dar baixa</button></div>}</article>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Compra</th><th className="p-4">Fornecedor</th><th className="p-4">Itens</th><th className="p-4 text-right">Total</th><th className="p-4 text-right">Pago / saldo</th><th className="p-4">Vencimento</th><th className="p-4">Ações</th></tr></thead><tbody className="divide-y">{comprasPagina.map((compra) => <React.Fragment key={compra.id}><tr><td className="p-4"><strong>#{compra.numeroSequencial}</strong><p className="text-xs text-slate-500">{formatDate(compra.data)}</p></td><td className="p-4 font-bold">{compra.fornecedorNome}</td><td className="p-4">{compra.items?.length || 0} item(ns)</td><td className="p-4 text-right font-mono font-black">{formatCurrency(compra.total)}</td><td className="p-4 text-right"><strong className="text-emerald-700">{formatCurrency(compra.valorPago)}</strong><p className="text-xs text-amber-700">saldo {formatCurrency(compra.saldoRestante)}</p></td><td className="p-4">{compra.vencimento ? formatDate(compra.vencimento) : "—"}</td><td className="p-4"><div className="flex gap-2"><button type="button" onClick={() => setCompraDetalhe(compra)} className="rounded-lg border border-slate-300 p-2 text-slate-700" aria-label="Ver detalhes da compra"><Eye size={15}/></button><button type="button" onClick={() => editarCompra(compra)} className="rounded-lg border border-blue-200 p-2 text-blue-700" aria-label="Editar compra"><Pencil size={15}/></button>{Number(compra.saldoRestante) > 0 && <button type="button" onClick={() => { setPagandoId(compra.id); setPagamentoValor(numeroBR(Number(compra.saldoRestante))); }} className="rounded-lg border border-emerald-200 p-2 text-emerald-700"><CreditCard size={15}/></button>}{gerente && <button type="button" onClick={() => cancelarCompra(compra)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={15}/></button>}</div></td></tr>{pagandoId === compra.id && <tr className="bg-emerald-50"><td colSpan={7} className="p-3"><div className="flex flex-wrap items-end justify-end gap-3"><input aria-label="Valor do pagamento" value={pagamentoValor} onChange={(event) => setPagamentoValor(event.target.value)} className="rounded-lg border px-3 py-2"/><select aria-label="Forma do pagamento" value={pagamentoForma} onChange={(event) => setPagamentoForma(event.target.value)} className="rounded-lg border px-3 py-2"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option></select><button type="button" onClick={() => registrarPagamento(compra)} className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">Dar baixa</button></div></td></tr>}</React.Fragment>)}</tbody></table></div><Pagination page={page} pageSize={PAGE_SIZE} totalItems={comprasFiltradas.length} onPageChange={setPage}/>
      </section>}

      {modo === "vales" && <div className="space-y-3">
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-white">
          <div className="grid gap-2 border-b border-amber-200 bg-amber-50 p-3 md:grid-cols-[1fr_190px] md:items-end">
            <div><h3 className="flex items-center gap-2 font-black text-amber-950"><HandCoins size={18}/> Vales de compras</h3><p className="text-xs font-bold text-amber-800/70">Contas a pagar e vales quitados deste fornecedor.</p></div>

            <label className="text-[10px] font-black uppercase text-amber-900">Situação<select value={filtroStatusVales} onChange={(event) => { setFiltroStatusVales(event.target.value as "abertos" | "quitados" | "todos"); setValesPage(1); }} className="mt-1 min-h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm font-bold normal-case"><option value="abertos">Em aberto</option><option value="quitados">Quitados</option><option value="todos">Todos</option></select></label>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b bg-slate-50 p-3">
            <div className="rounded-lg border bg-white p-2"><span className="text-[9px] font-black uppercase text-slate-500">Original</span><strong className="block font-mono text-sm text-slate-950 sm:text-base">{formatCurrency(totaisVales.total)}</strong></div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2"><span className="text-[9px] font-black uppercase text-emerald-700">Pago</span><strong className="block font-mono text-sm text-emerald-800 sm:text-base">{formatCurrency(totaisVales.pago)}</strong></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2"><span className="text-[9px] font-black uppercase text-amber-700">A pagar</span><strong className="block font-mono text-sm text-amber-900 sm:text-base">{formatCurrency(totaisVales.saldo)}</strong></div>
          </div>

          <div className="space-y-2 p-3 md:hidden">{valesPagina.length === 0 ? <p className="p-8 text-center text-sm font-bold text-slate-400">Nenhum Vale de compra neste filtro.</p> : valesPagina.map((compra) => {
            const vencido = compra.status === "pendente" && Boolean(compra.vencimento && compra.vencimento < hoje());
            return <article key={compra.id} className={`rounded-xl border p-3 ${vencido ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-2"><div><strong className="text-slate-950">Vale #{compra.numeroSequencial}</strong><p className="text-xs font-bold text-slate-600">{compra.fornecedorNome}</p><p className="text-[10px] text-slate-500">Emitido em {formatDate(compra.data)}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${compra.status === "paga" ? "bg-emerald-100 text-emerald-800" : vencido ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{compra.status === "paga" ? "Quitado" : vencido ? "Vencido" : "Em aberto"}</span></div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-lg bg-slate-100 p-2"><span className="block text-[8px] font-black uppercase text-slate-500">Original</span><strong className="font-mono text-xs">{formatCurrency(compra.total)}</strong></div><div className="rounded-lg bg-emerald-50 p-2"><span className="block text-[8px] font-black uppercase text-emerald-700">Pago</span><strong className="font-mono text-xs text-emerald-800">{formatCurrency(compra.valorPago)}</strong></div><div className="rounded-lg bg-amber-50 p-2"><span className="block text-[8px] font-black uppercase text-amber-700">Falta</span><strong className="font-mono text-xs text-amber-900">{formatCurrency(compra.saldoRestante)}</strong></div></div>
              <div className="mt-2 flex items-center justify-between text-xs"><span className="font-bold text-slate-500">Vencimento</span><strong className={vencido ? "text-red-700" : "text-slate-800"}>{compra.vencimento ? formatDate(compra.vencimento) : "—"}</strong></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setCompraDetalhe(compra)} className="rounded-lg border border-slate-300 p-2 text-xs font-black text-slate-700"><Eye size={14} className="mr-1 inline"/>Detalhes</button>{compra.status === "pendente" && <button type="button" onClick={() => { setPagandoId(compra.id); setPagamentoValor(numeroBR(Number(compra.saldoRestante))); }} className="rounded-lg bg-emerald-700 p-2 text-xs font-black text-white"><CreditCard size={14} className="mr-1 inline"/>Registrar pagamento</button>}</div>
              {pagandoId === compra.id && <div className="mt-3 grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2"><label className="text-[10px] font-black uppercase text-emerald-900">Valor pago<input aria-label="Valor do pagamento do Vale" inputMode="decimal" value={pagamentoValor} onChange={(event) => setPagamentoValor(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-base font-black"/></label><select aria-label="Forma do pagamento do Vale" value={pagamentoForma} onChange={(event) => setPagamentoForma(event.target.value)} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-bold"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="cartao">Cartão</option></select><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setPagandoId(null); setPagamentoValor(""); }} className="rounded-lg border border-slate-300 bg-white p-2 text-xs font-black text-slate-600">Cancelar</button><button type="button" onClick={() => registrarPagamento(compra)} className="rounded-lg bg-emerald-700 p-2 text-xs font-black text-white">Confirmar baixa</button></div></div>}
            </article>;
          })}</div>

          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[920px] text-sm"><thead className="bg-slate-100 text-left text-[10px] font-black uppercase text-slate-500"><tr><th className="p-3">Vale / emissão</th><th className="p-3">Fornecedor</th><th className="p-3 text-right">Valor original</th><th className="p-3 text-right">Pago</th><th className="p-3 text-right">Saldo</th><th className="p-3">Vencimento</th><th className="p-3">Situação</th><th className="p-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{valesPagina.length === 0 ? <tr><td colSpan={8} className="p-10 text-center font-bold text-slate-400">Nenhum Vale de compra neste filtro.</td></tr> : valesPagina.map((compra) => {
            const vencido = compra.status === "pendente" && Boolean(compra.vencimento && compra.vencimento < hoje());
            return <React.Fragment key={compra.id}><tr className={vencido ? "bg-red-50/40" : ""}><td className="p-3"><strong className="font-mono text-amber-900">#{compra.numeroSequencial}</strong><p className="text-[10px] text-slate-500">{formatDate(compra.data)}</p></td><td className="p-3 font-bold">{compra.fornecedorNome}</td><td className="p-3 text-right font-mono font-black">{formatCurrency(compra.total)}</td><td className="p-3 text-right font-mono font-black text-emerald-700">{formatCurrency(compra.valorPago)}</td><td className="p-3 text-right font-mono font-black text-amber-800">{formatCurrency(compra.saldoRestante)}</td><td className={`p-3 font-bold ${vencido ? "text-red-700" : ""}`}>{compra.vencimento ? formatDate(compra.vencimento) : "—"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${compra.status === "paga" ? "bg-emerald-100 text-emerald-800" : vencido ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{compra.status === "paga" ? "Quitado" : vencido ? "Vencido" : "Em aberto"}</span></td><td className="p-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => setCompraDetalhe(compra)} aria-label={`Detalhes do Vale ${compra.numeroSequencial}`} className="rounded-lg border border-slate-300 p-2 text-slate-700"><Eye size={15}/></button>{compra.status === "pendente" && <button type="button" onClick={() => { setPagandoId(compra.id); setPagamentoValor(numeroBR(Number(compra.saldoRestante))); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white"><CreditCard size={14}/>Pagar</button>}</div></td></tr>{pagandoId === compra.id && <tr className="bg-emerald-50"><td colSpan={8} className="p-3"><div className="flex flex-wrap items-end justify-end gap-2"><label className="text-[10px] font-black uppercase text-emerald-900">Valor pago<input aria-label="Valor do pagamento do Vale" inputMode="decimal" value={pagamentoValor} onChange={(event) => setPagamentoValor(event.target.value)} className="mt-1 block rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-black"/></label><select aria-label="Forma do pagamento do Vale" value={pagamentoForma} onChange={(event) => setPagamentoForma(event.target.value)} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-bold"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="cartao">Cartão</option></select><button type="button" onClick={() => { setPagandoId(null); setPagamentoValor(""); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancelar</button><button type="button" onClick={() => registrarPagamento(compra)} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white">Confirmar baixa</button></div></td></tr>}</React.Fragment>;
          })}</tbody></table></div>
          <Pagination page={valesPage} pageSize={PAGE_SIZE} totalItems={valesCompra.length} onPageChange={setValesPage}/>
        </section>
      </div>}

    </>}
  </>;
}
