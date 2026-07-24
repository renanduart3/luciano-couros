import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, ClipboardList, FileText, History, KeyRound, ListChecks, Pencil,
  Percent, Plus, Printer, Save, Search, ShieldCheck, ShoppingCart, Trash2, X
} from "lucide-react";
import { Cliente, Orcamento, Produto, ProdutoHabitual, SegurancaStatus, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import { Pagination, paginate } from "./Pagination";
import { OrcamentoComprovante } from "./OrcamentoComprovante";

interface OrcamentoViewProps {
  onLevarParaVenda: (orcamento: Orcamento) => void;
  compact?: boolean;
  clienteExterno?: Cliente | null;
  ocultarSeletorCliente?: boolean;
}

interface ItemRascunhoOrcamento {
  produtoId: string;
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

export function OrcamentoView({ onLevarParaVenda, compact = false, clienteExterno, ocultarSeletorCliente = false }: OrcamentoViewProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCliente, setProdutosCliente] = useState<ProdutoHabitual[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [aba, setAba] = useState<"lista" | "formulario">(compact ? "formulario" : "lista");
  const [buscaOrcamentos, setBuscaOrcamentos] = useState("");
  const [orcamentosPage, setOrcamentosPage] = useState(1);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [numero, setNumero] = useState(1);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteBusca, setClienteBusca] = useState("");
  const [produtoBusca, setProdutoBusca] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [preco, setPreco] = useState("");
  const [items, setItems] = useState<ItemRascunhoOrcamento[]>([]);
  const [data, setData] = useState(() => new Date().toISOString().split("T")[0]);
  const [validade, setValidade] = useState(() => dataFutura(7));
  const [descontoPercentual, setDescontoPercentual] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historicoVendas, setHistoricoVendas] = useState<Venda[]>([]);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historicoDataInicial, setHistoricoDataInicial] = useState(() => dataFutura(-90));
  const [historicoDataFinal, setHistoricoDataFinal] = useState(() => new Date().toISOString().split("T")[0]);
  const [historicoPage, setHistoricoPage] = useState(1);
  const [vendaHistoricoId, setVendaHistoricoId] = useState("");
  const [itensHistoricoSelecionados, setItensHistoricoSelecionados] = useState<string[]>([]);
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [pinErro, setPinErro] = useState("");
  const [levarParaVendaAposPin, setLevarParaVendaAposPin] = useState(false);

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
    setNumero(proximoNumero);
    setCliente(null);
    setClienteBusca("");
    setProdutoBusca("");
    setProdutoSelecionado(null);
    setQuantidade("1");
    setPreco("");
    setItems([]);
    setData(new Date().toISOString().split("T")[0]);
    setValidade(dataFutura(7));
    setDescontoPercentual("0");
    setObservacoes("");
    setVendaHistoricoId("");
    setItensHistoricoSelecionados([]);
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
    setNumero(registro.numeroSequencial);
    setCliente(clienteRegistro);
    setClienteBusca(clienteRegistro?.nome || registro.clienteNome || "");
    setData(registro.data);
    setValidade(registro.validade || dataFutura(7));
    const percentualSalvo = Number(registro.subtotal) > 0
      ? (Number(registro.desconto) / Number(registro.subtotal)) * 100
      : 0;
    setDescontoPercentual(percentualSalvo.toFixed(2).replace(".", ","));
    setObservacoes(registro.observacoes || "");
    setItems(registro.items.map((item) => ({
      produtoId: item.produtoId,
      codigo: item.referencia,
      descricao: item.descricao,
      quantidade: Number(item.quantidade).toString().replace(".", ","),
      unidade: item.unidade,
      precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
      faltante: item.faltante === 1
    })));
    setProdutoBusca("");
    setProdutoSelecionado(null);
    setVendaHistoricoId("");
    setItensHistoricoSelecionados([]);
    setMensagem(null);
    setAba("formulario");
  };

  const clientesFiltrados = useMemo(() => clientes.filter((item) =>
    item.nome.toLowerCase().includes(clienteBusca.toLowerCase()) ||
    (item.telefone || "").includes(clienteBusca)
  ).slice(0, 8), [clientes, clienteBusca]);

  const produtosFiltrados = useMemo(() => produtos.filter((item) =>
    item.nome.toLowerCase().includes(produtoBusca.toLowerCase()) ||
    (item.codigo || "").toLowerCase().includes(produtoBusca.toLowerCase())
  ).slice(0, 10), [produtos, produtoBusca]);

  const orcamentosFiltrados = useMemo(() => {
    const termo = buscaOrcamentos.trim().toLowerCase();
    if (!termo) return orcamentos;
    return orcamentos.filter((registro) =>
      String(registro.numeroSequencial).includes(termo) ||
      (registro.clienteNome || "").toLowerCase().includes(termo) ||
      registro.status.toLowerCase().includes(termo)
    );
  }, [orcamentos, buscaOrcamentos]);
  const orcamentosPageSize = compact ? 4 : 8;
  const orcamentosPagina = paginate<Orcamento>(orcamentosFiltrados, orcamentosPage, orcamentosPageSize);

  const subtotal = items.reduce((total, item) =>
    total + parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario), 0
  );
  const descontoPercentualValor = parseBrazilianNumber(descontoPercentual);
  const descontoValor = subtotal * Math.max(0, descontoPercentualValor) / 100;
  const totalLiquido = Math.max(0, subtotal - descontoValor);
  const quantidadeFaltantes = items.filter((item) => item.faltante).length;
  const fatorPrecoEfetivo = subtotal > 0 ? totalLiquido / subtotal : 1;
  const itensAbaixoDoPrecoCliente = items.filter((item) => {
    const produto = produtos.find((registro) => registro.id === item.produtoId);
    const referenciaCliente = produtosCliente.find((registro) => registro.produtoId === item.produtoId);
    const precoAtualCliente = Number(
      referenciaCliente?.precoAutorizado
      ?? referenciaCliente?.ultimoPreco
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
      if (!confirm("Alterar o cliente manterá os itens, mas atualizará apenas os próximos preços adicionados. Continuar?")) return;
    }
    setCliente(selecionado);
    setClienteBusca(selecionado.nome);
    setVendaHistoricoId("");
    setItensHistoricoSelecionados([]);
    setHistoricoPage(1);
    try {
      const listaPadrao = await api.getClienteOrcamentoPadrao(selecionado.id);
      if (listaPadrao.length > 0) {
        setItems(listaPadrao.map((item) => ({
          produtoId: item.produtoId,
          codigo: item.codigo,
          descricao: item.nome,
          quantidade: Number(item.quantidade).toString().replace(".", ","),
          unidade: item.unidade,
          precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ","),
          faltante: item.faltante === 1
        })));
        setMensagem({ tipo: "ok", texto: `${listaPadrao.length} item(ns) habituais carregados para conferência.` });
      }
    } catch {
      setMensagem({ tipo: "erro", texto: "O cliente foi selecionado, mas a lista habitual não pôde ser carregada." });
    }
  };

  useEffect(() => {
    if (!ocultarSeletorCliente || loading) return;
    if (!clienteExterno) {
      setCliente(null);
      setClienteBusca("");
      setOrcamento(null);
      setItems([]);
      return;
    }
    const aberto = orcamentos.find((registro) =>
      registro.clienteId === clienteExterno.id && registro.status === "aberto"
    );
    if (aberto) {
      abrirEdicaoOrcamento(aberto);
      return;
    }
    setItems([]);
    setOrcamento(null);
    setCliente(null);
    setAba("formulario");
    selecionarCliente(clienteExterno);
  }, [clienteExterno?.id, loading]);

  const selecionarProduto = (produto: Produto) => {
    const referenciaCliente = produtosCliente.find((item) => item.produtoId === produto.id);
    const precoAtual = Number(referenciaCliente?.precoAutorizado ?? referenciaCliente?.ultimoPreco ?? produto.precoVendaPadrao);
    setProdutoSelecionado(produto);
    setProdutoBusca(produto.nome);
    setPreco(precoAtual.toFixed(2).replace(".", ","));
    setQuantidade("1");
  };

  const adicionarItem = () => {
    if (!produtoSelecionado) return setMensagem({ tipo: "erro", texto: "Selecione um produto." });
    const qtd = parseBrazilianNumber(quantidade);
    const valor = parseBrazilianNumber(preco);
    if (qtd <= 0 || valor < 0) return setMensagem({ tipo: "erro", texto: "Informe quantidade e preço válidos." });

    const novo: ItemRascunhoOrcamento = {
      produtoId: produtoSelecionado.id,
      codigo: produtoSelecionado.codigo,
      descricao: produtoSelecionado.nome,
      quantidade,
      unidade: produtoSelecionado.unidade,
      precoUnitario: preco,
      faltante: false
    };
    setItems((atuais) => {
      const indice = atuais.findIndex((item) => item.produtoId === novo.produtoId);
      return indice < 0
        ? [...atuais, novo]
        : atuais.map((item, itemIndex) => itemIndex === indice ? novo : item);
    });
    setProdutoSelecionado(null);
    setProdutoBusca("");
    setPreco("");
    setQuantidade("1");
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
          codigo: produto.codigo,
          descricao: itemHistorico.descricao || produto.nome,
          quantidade: Number(itemHistorico.quantidade).toString().replace(".", ","),
          unidade: itemHistorico.unidade || produto.unidade,
          precoUnitario: Number(itemHistorico.precoUnitario).toFixed(2).replace(".", ","),
          faltante: false
        };
        const existente = resultado.findIndex((item) => item.produtoId === produto.id);
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
    id: orcamento?.id,
    clienteId: cliente?.id || "",
    data,
    validade: validade || undefined,
    desconto: descontoValor,
    observacoes: observacoes.trim() || undefined,
    autorizacaoPreco: pin ? { pin } : undefined,
    items: items.map((item) => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      quantidade: parseBrazilianNumber(item.quantidade),
      unidade: item.unidade,
      precoUnitario: parseBrazilianNumber(item.precoUnitario),
      desconto: 0,
      faltante: item.faltante
    }))
  });

  const validar = () => {
    if (!cliente) {
      setMensagem({ tipo: "erro", texto: "Selecione o cliente do orçamento." });
      return false;
    }
    if (items.length === 0 || items.some((item) => parseBrazilianNumber(item.quantidade) <= 0 || parseBrazilianNumber(item.precoUnitario) < 0)) {
      setMensagem({ tipo: "erro", texto: "Adicione ao menos um item com quantidade e preço válidos." });
      return false;
    }
    if (descontoPercentualValor < 0 || descontoPercentualValor > 100) {
      setMensagem({ tipo: "erro", texto: "O desconto deve estar entre 0% e 100%." });
      return false;
    }
    return true;
  };

  const salvar = async (levarParaVenda = false, pin?: string) => {
    if (!validar()) return;
    if ((orcamento || itensAbaixoDoPrecoCliente.length > 0) && !pin) {
      setLevarParaVendaAposPin(levarParaVenda);
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
      setNumero(salvo.numeroSequencial);
      setOrcamentos((atuais) => [salvo, ...atuais.filter((item) => item.id !== salvo.id)]
        .sort((a, b) => b.numeroSequencial - a.numeroSequencial));
      setOrcamentosPage(1);
      setMensagem({ tipo: "ok", texto: `Orçamento #${salvo.numeroSequencial} salvo.` });
      setPinOpen(false);
      setAdminPin("");
      setPinErro("");
      if (levarParaVenda) {
        onLevarParaVenda(salvo);
      } else if (!compact) {
        setAba("lista");
      }
    } catch (error: any) {
      const texto = error.message || "Não foi possível salvar o orçamento.";
      if (pin || texto.toLowerCase().includes("pin")) {
        setPinErro(texto);
        setLevarParaVendaAposPin(levarParaVenda);
        setPinOpen(true);
      } else {
        setMensagem({ tipo: "erro", texto });
      }
    } finally {
      setSalvando(false);
    }
  };

  const excluirOrcamento = async (registro: Orcamento) => {
    if (!confirm(`Excluir o orçamento #${registro.numeroSequencial} de ${registro.clienteNome || "este cliente"}?`)) return;
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
      {previewOpen && orcamento && (
        <div id="print-orcamento" className="fixed inset-0 z-[80] overflow-x-hidden overflow-y-auto bg-slate-950/70 p-3 sm:p-6 print:absolute print:bg-white print:p-0">
          <div className="mx-auto w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-[calc(100vw-3rem)] print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 print:hidden">
              <div><h3 className="font-black">Prévia do orçamento #{orcamento.numeroSequencial}</h3><p className="text-xs text-slate-500">Confira antes de imprimir ou salvar em PDF.</p></div>
              <button type="button" aria-label="Fechar prévia" onClick={() => setPreviewOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="max-w-full overflow-x-auto print:overflow-visible"><OrcamentoComprovante orcamento={orcamento} /></div>
            <div className="flex gap-3 border-t border-slate-200 p-4 print:hidden"><button type="button" onClick={() => window.print()} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Printer size={16} className="mr-2 inline" /> Imprimir / salvar PDF</button><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">Fechar</button></div>
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
              salvar(levarParaVendaAposPin, adminPin);
            }}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 bg-amber-50 p-5">
              <div className="flex gap-3">
                <span className="rounded-xl bg-amber-100 p-2 text-amber-700"><KeyRound size={21} /></span>
                <div><h3 id="pin-orcamento-titulo" className="font-black text-slate-950">{orcamento ? "Autorizar alteração do orçamento" : "Autorizar preço do orçamento"}</h3><p className="mt-1 text-xs text-slate-600">{orcamento ? "A lista, quantidades, faltantes ou preços serão atualizados." : `${itensAbaixoDoPrecoCliente.length} item(ns) abaixo do preço atual do cliente.`}</p></div>
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

      {mensagem && <div className={`flex items-center justify-between rounded-xl border p-3 text-sm font-bold ${mensagem.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}><span>{mensagem.texto}</span><button type="button" onClick={() => setMensagem(null)}><X size={15} /></button></div>}

      {aba === "lista" && !compact ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-black text-slate-950">Orçamentos por cliente</h3><p className="text-xs text-slate-500">{orcamentosFiltrados.length} encontrado(s)</p></div>
            <div className="flex w-full max-w-md items-center rounded-xl border border-slate-300 bg-slate-50"><Search size={16} className="ml-3 text-slate-400" /><input value={buscaOrcamentos} onChange={(event) => { setBuscaOrcamentos(event.target.value); setOrcamentosPage(1); }} placeholder="Cliente, número ou status..." className="w-full rounded-xl bg-transparent px-3 py-2.5 text-sm font-bold outline-none" /></div>
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
          <>
            <div className="flex min-h-14 items-center rounded-xl border border-blue-300 bg-white shadow-sm focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={20} className="ml-4 shrink-0 text-blue-600" />
              <input
                value={clienteBusca}
                onChange={(event) => setClienteBusca(event.target.value)}
                placeholder="Digite o nome ou telefone do cliente..."
                className="w-full rounded-xl px-4 py-3 text-base font-bold outline-none"
              />
            </div>
            {clienteBusca && (
              <div className="absolute left-4 right-4 z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:left-5 sm:right-5">
                {clientesFiltrados.map((item) => (
                  <button key={item.id} type="button" onClick={() => selecionarCliente(item)} className="block w-full border-b border-slate-100 p-4 text-left text-sm font-bold hover:bg-blue-50">
                    {item.nome}
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{item.telefone || "Sem telefone"}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>}

      <div className={compact ? "grid min-w-0 gap-4" : "grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] xl:grid-cols-[minmax(0,1fr)_340px]"}>
        <section className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Emissão</span><input type="date" value={data} onChange={(event) => setData(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-bold" /></label>
            <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Validade</span><input type="date" value={validade} onChange={(event) => setValidade(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-bold" /></label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className={`w-full text-xs ${compact ? "min-w-[620px] xl:min-w-0 xl:table-fixed" : "min-w-[720px]"}`}>
              <colgroup>
                <col className="w-[8%]" /><col className="w-[27%]" /><col className="w-[9%]" /><col className="w-[9%]" />
                <col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[13%]" /><col className="w-[8%]" />
              </colgroup>
              <thead><tr className="bg-blue-50 text-[9px] font-black uppercase tracking-tight text-slate-500"><th className="px-1 py-2 text-left">Ref.</th><th className="px-1 py-2 text-left">Material</th><th className="px-1 py-2 text-right">Qtd.</th><th className="px-1 py-2 text-left">Un.</th><th className="px-1 py-2 text-right">Preço</th><th className="px-1 py-2 text-center">Falta</th><th className="px-1 py-2 text-right">Total</th><th className="px-1 py-2"></th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="bg-blue-50/60">
                  <td className="px-2 py-2 text-center font-black text-blue-700">+</td>
                  <td className="relative px-2 py-2"><input value={produtoBusca} onChange={(event) => { setProdutoBusca(event.target.value); setProdutoSelecionado(null); }} placeholder="Digite código ou material..." className="w-full border-0 bg-transparent px-1 py-1.5 font-bold outline-none" />{produtoBusca && !produtoSelecionado && <div className="absolute left-1 right-1 top-full z-30 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">{produtosFiltrados.map((item) => <button key={item.id} type="button" onClick={() => selecionarProduto(item)} className="flex w-full items-center justify-between border-b border-slate-100 p-2 text-left hover:bg-blue-50"><span><strong className="block">{item.nome}</strong><small className="text-slate-500">{item.codigo || "Sem código"} • {item.unidade}</small></span><strong className="text-blue-700">{formatCurrency(Number(produtosCliente.find((registro) => registro.produtoId === item.id)?.precoAutorizado ?? produtosCliente.find((registro) => registro.produtoId === item.id)?.ultimoPreco ?? item.precoVendaPadrao))}</strong></button>)}</div>}</td>
                  <td className="px-2 py-2"><input value={quantidade} onChange={(event) => setQuantidade(event.target.value)} className="w-full border-0 bg-transparent px-1 py-1.5 text-right font-black outline-none" /></td>
                  <td className="px-2 py-2 font-bold text-slate-600">{produtoSelecionado?.unidade || "—"}</td>
                  <td className="px-2 py-2"><input value={preco} onChange={(event) => setPreco(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); adicionarItem(); } }} placeholder="0,00" className="w-full border-0 bg-transparent px-1 py-1.5 text-right font-black outline-none" /></td>
                  <td className="px-2 py-2 text-center text-slate-400">—</td>
                  <td className="px-2 py-2 text-right font-mono font-black">{formatCurrency(parseBrazilianNumber(quantidade) * parseBrazilianNumber(preco))}</td>
                  <td className="px-2 py-2 text-center"><button type="button" onClick={adicionarItem} title="Adicionar nova linha" className="rounded-md bg-blue-700 p-2 text-white hover:bg-blue-800"><Plus size={14} /></button></td>
                </tr>
                {items.length === 0 ? <tr><td colSpan={8} className="p-6 text-center font-bold text-slate-400">Use a linha azul para adicionar o primeiro item.</td></tr> : items.map((item, index) => <tr key={item.produtoId} className={item.faltante ? "bg-red-50" : "bg-white"}><td className="px-2 py-2 font-mono text-slate-400">{item.codigo || "—"}</td><td className="px-2 py-2 font-black text-slate-900">{item.descricao}</td><td className="px-2 py-2"><input aria-label={`Quantidade de ${item.descricao} no orçamento`} value={item.quantidade} onChange={(event) => setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, quantidade: event.target.value } : registro))} className="w-full border-0 bg-transparent px-1 py-1.5 text-right font-black outline-none" /></td><td className="px-2 py-2 font-bold">{item.unidade}</td><td className="px-2 py-2"><input aria-label={`Preço de ${item.descricao} no orçamento`} value={item.precoUnitario} onChange={(event) => setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, precoUnitario: event.target.value } : registro))} className="w-full border-0 bg-transparent px-1 py-1.5 text-right font-black outline-none" /></td><td className="px-2 py-2 text-center"><label className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-black uppercase ${item.faltante ? "bg-red-100 text-red-800" : "text-slate-500"}`}><input type="checkbox" checked={item.faltante} onChange={(event) => setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, faltante: event.target.checked } : registro))} className="h-4 w-4 accent-red-600" /> {item.faltante ? "Faltante" : "OK"}</label></td><td className="px-2 py-2 text-right font-mono font-black">{formatCurrency(parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario))}</td><td className="px-2 py-2 text-center"><button type="button" aria-label={`Remover ${item.descricao}`} onClick={() => setItems((atuais) => atuais.filter((_, itemIndex) => itemIndex !== index))} className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button></td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="min-w-0 h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4"><span className="rounded-xl bg-blue-100 p-2 text-blue-700"><FileText size={20} /></span><div><p className="font-black">Resumo do orçamento</p><p className="text-xs text-slate-500">{items.length} item(ns) • {quantidadeFaltantes} faltante(s)</p></div></div>
          <div className="space-y-3"><div className="flex justify-between text-sm"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><label><span className="mb-1 flex items-center gap-1 text-xs font-black uppercase text-slate-500"><Percent size={13} /> Desconto percentual</span><div className="relative"><input aria-label="Desconto percentual" value={descontoPercentual} onChange={(event) => setDescontoPercentual(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-3 pr-9 text-right font-black" /><span className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-slate-500">%</span></div><span className="mt-1 block text-right text-xs font-bold text-slate-500">Desconto: {formatCurrency(descontoValor)}</span></label><div className="flex justify-between border-t-2 border-slate-900 pt-3 text-lg"><span className="font-black">Total</span><strong className="text-blue-800">{formatCurrency(totalLiquido)}</strong></div></div>
          <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Observações e condições</span><textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={4} placeholder="Prazo, condições de pagamento ou observações..." className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500" /></label>
          {(orcamento || itensAbaixoDoPrecoCliente.length > 0) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-black text-amber-800"><KeyRound size={15} className="mr-1.5 inline" /> {orcamento ? "PIN necessário para alterar este orçamento." : `PIN necessário para ${itensAbaixoDoPrecoCliente.length} item(ns).`}</p>}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <button type="button" disabled={salvando} onClick={() => salvar(false)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={17} /> {salvando ? "Salvando..." : "Salvar orçamento"}</button>
            <button type="button" disabled={salvando} onClick={() => salvar(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><ArrowRight size={17} /> {compact ? "Levar itens disponíveis à venda" : "Salvar e levar para venda"}</button>
            {orcamento && <button type="button" onClick={() => setPreviewOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800"><Printer size={17} /> Visualizar e imprimir</button>}
            {orcamento && <button type="button" disabled={salvando} onClick={() => excluirOrcamento(orcamento)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-700"><Trash2 size={17} /> Excluir orçamento</button>}
          </div>
        </aside>
      </div>
        </>
      )}
    </div>
  );
}
