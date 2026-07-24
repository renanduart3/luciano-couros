import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, CalendarClock, CheckCircle2, FileText, Plus, Printer,
  Save, Search, Trash2, X
} from "lucide-react";
import { Cliente, Orcamento, Produto, ProdutoHabitual } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";

interface OrcamentoViewProps {
  onLevarParaVenda: (orcamento: Orcamento) => void;
}

interface ItemRascunhoOrcamento {
  produtoId: string;
  codigo?: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  precoUnitario: string;
}

function dataFutura(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().split("T")[0];
}

export function OrcamentoView({ onLevarParaVenda }: OrcamentoViewProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCliente, setProdutosCliente] = useState<ProdutoHabitual[]>([]);
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
  const [desconto, setDesconto] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const [clientesAtivos, produtosAtivos, aberto, proximo] = await Promise.all([
        api.getClientes(),
        api.getProdutos(),
        api.getOrcamentoAberto(),
        api.getProximoNumeroOrcamento()
      ]);
      setClientes(clientesAtivos.filter((item) => item.ativo === 1));
      setProdutos(produtosAtivos.filter((item) => item.ativo === 1));
      setNumero(aberto?.numeroSequencial || proximo.proximoNumero);
      setOrcamento(aberto);
      if (aberto) {
        const clienteAberto = clientesAtivos.find((item) => item.id === aberto.clienteId) || null;
        setCliente(clienteAberto);
        setClienteBusca(clienteAberto?.nome || aberto.clienteNome || "");
        setData(aberto.data);
        setValidade(aberto.validade || dataFutura(7));
        setDesconto(Number(aberto.desconto).toFixed(2).replace(".", ","));
        setObservacoes(aberto.observacoes || "");
        setItems(aberto.items.map((item) => ({
          produtoId: item.produtoId,
          codigo: item.referencia,
          descricao: item.descricao,
          quantidade: Number(item.quantidade).toString().replace(".", ","),
          unidade: item.unidade,
          precoUnitario: Number(item.precoUnitario).toFixed(2).replace(".", ",")
        })));
      }
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
      return;
    }
    api.getClienteProdutosHabituais(cliente.id)
      .then(setProdutosCliente)
      .catch(() => setProdutosCliente([]));
  }, [cliente]);

  const clientesFiltrados = useMemo(() => clientes.filter((item) =>
    item.nome.toLowerCase().includes(clienteBusca.toLowerCase()) ||
    (item.telefone || "").includes(clienteBusca)
  ).slice(0, 8), [clientes, clienteBusca]);

  const produtosFiltrados = useMemo(() => produtos.filter((item) =>
    item.nome.toLowerCase().includes(produtoBusca.toLowerCase()) ||
    (item.codigo || "").toLowerCase().includes(produtoBusca.toLowerCase())
  ).slice(0, 10), [produtos, produtoBusca]);

  const subtotal = items.reduce((total, item) =>
    total + parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario), 0
  );
  const descontoValor = Math.max(0, parseBrazilianNumber(desconto));
  const totalLiquido = Math.max(0, subtotal - descontoValor);

  const selecionarCliente = (selecionado: Cliente) => {
    if (cliente?.id && cliente.id !== selecionado.id && items.length > 0) {
      if (!confirm("Alterar o cliente manterá os itens, mas atualizará apenas os próximos preços adicionados. Continuar?")) return;
    }
    setCliente(selecionado);
    setClienteBusca(selecionado.nome);
  };

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
      precoUnitario: preco
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

  const montarPayload = () => ({
    id: orcamento?.id,
    clienteId: cliente?.id || "",
    data,
    validade: validade || undefined,
    desconto: descontoValor,
    observacoes: observacoes.trim() || undefined,
    items: items.map((item) => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      quantidade: parseBrazilianNumber(item.quantidade),
      unidade: item.unidade,
      precoUnitario: parseBrazilianNumber(item.precoUnitario),
      desconto: 0
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
    if (descontoValor > subtotal) {
      setMensagem({ tipo: "erro", texto: "O desconto não pode superar o subtotal." });
      return false;
    }
    return true;
  };

  const salvar = async (levarParaVenda = false) => {
    if (!validar()) return;
    setSalvando(true);
    setMensagem(null);
    try {
      const salvo = await api.saveOrcamento(montarPayload());
      setOrcamento(salvo);
      setNumero(salvo.numeroSequencial);
      setMensagem({ tipo: "ok", texto: `Orçamento #${salvo.numeroSequencial} salvo.` });
      if (levarParaVenda) onLevarParaVenda(salvo);
    } catch (error: any) {
      setMensagem({ tipo: "erro", texto: error.message || "Não foi possível salvar o orçamento." });
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async () => {
    if (!orcamento || !confirm(`Cancelar o orçamento #${orcamento.numeroSequencial}?`)) return;
    setSalvando(true);
    try {
      await api.cancelarOrcamento(orcamento.id);
      setOrcamento(null);
      setCliente(null);
      setClienteBusca("");
      setItems([]);
      setDesconto("0");
      setObservacoes("");
      setData(new Date().toISOString().split("T")[0]);
      setValidade(dataFutura(7));
      const proximo = await api.getProximoNumeroOrcamento();
      setNumero(proximo.proximoNumero);
      setMensagem({ tipo: "ok", texto: "Orçamento cancelado. Um novo orçamento pode ser iniciado." });
    } catch (error: any) {
      setMensagem({ tipo: "erro", texto: error.message || "Não foi possível cancelar o orçamento." });
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <div className="rounded-2xl bg-white p-16 text-center font-bold text-slate-500">Abrindo orçamento...</div>;

  return (
    <div id="orcamento-view" className="space-y-5">
      {previewOpen && orcamento && (
        <div id="print-orcamento" className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/70 p-4 print:absolute print:bg-white print:p-0">
          <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 print:hidden">
              <div><h3 className="font-black">Prévia do orçamento #{orcamento.numeroSequencial}</h3><p className="text-xs text-slate-500">Confira antes de imprimir ou salvar em PDF.</p></div>
              <button type="button" aria-label="Fechar prévia" onClick={() => setPreviewOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <article className="min-h-[270mm] p-10 text-slate-950 print:min-h-0 print:p-8">
              <header className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
                <div><p className="text-2xl font-black">LUCIANO COUROS</p><p className="mt-1 text-sm font-bold text-slate-500">Proposta comercial</p></div>
                <div className="text-right"><p className="text-xs font-bold text-slate-500">ORÇAMENTO</p><p className="text-2xl font-black">#{orcamento.numeroSequencial}</p></div>
              </header>
              <section className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-100 p-4 text-sm">
                <div><strong>Cliente:</strong> {cliente?.nome}</div><div><strong>Telefone:</strong> {cliente?.telefone || "—"}</div>
                <div><strong>Emissão:</strong> {formatDate(data)}</div><div><strong>Validade:</strong> {validade ? formatDate(validade) : "Sem validade"}</div>
              </section>
              <table className="mt-6 w-full text-sm">
                <thead><tr className="border-b-2 border-slate-900 text-left"><th className="py-3">Produto</th><th className="py-3 text-right">Qtd.</th><th className="py-3 text-right">Preço</th><th className="py-3 text-right">Total</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.produtoId} className="border-b border-slate-200"><td className="py-3 font-bold">{item.descricao}<span className="ml-2 text-xs font-normal text-slate-500">{item.unidade}</span></td><td className="py-3 text-right">{item.quantidade}</td><td className="py-3 text-right">{formatCurrency(parseBrazilianNumber(item.precoUnitario))}</td><td className="py-3 text-right font-bold">{formatCurrency(parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario))}</td></tr>)}</tbody>
              </table>
              <div className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><div className="flex justify-between"><span>Desconto</span><strong>{formatCurrency(descontoValor)}</strong></div><div className="flex justify-between border-t-2 border-slate-900 pt-3 text-lg"><span>Total</span><strong>{formatCurrency(totalLiquido)}</strong></div></div>
              {observacoes && <div className="mt-8 rounded-xl border border-slate-300 p-4 text-sm"><strong>Observações:</strong><p className="mt-2 whitespace-pre-wrap">{observacoes}</p></div>}
            </article>
            <div className="flex gap-3 border-t border-slate-200 p-4 print:hidden"><button type="button" onClick={() => window.print()} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Printer size={16} className="mr-2 inline" /> Imprimir / salvar PDF</button><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">Fechar</button></div>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-3"><h2 className="text-2xl font-black text-slate-950">Orçamento do cliente</h2><span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">#{numero}</span></div><p className="mt-1 text-sm text-slate-500">Existe somente um orçamento aberto por vez. Salve, cancele ou leve-o para venda.</p></div>
        <span className={`w-fit rounded-xl px-3 py-2 text-xs font-black ${orcamento ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"}`}>{orcamento ? "ORÇAMENTO ABERTO" : "NOVO ORÇAMENTO"}</span>
      </header>

      {mensagem && <div className={`flex items-center justify-between rounded-xl border p-3 text-sm font-bold ${mensagem.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}><span>{mensagem.texto}</span><button type="button" onClick={() => setMensagem(null)}><X size={15} /></button></div>}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-1"><span className="mb-1 block text-xs font-black uppercase text-slate-500">Emissão</span><input type="date" value={data} onChange={(event) => setData(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-bold" /></label>
            <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Validade</span><input type="date" value={validade} onChange={(event) => setValidade(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-bold" /></label>
            <div className="relative"><span className="mb-1 block text-xs font-black uppercase text-slate-500">Cliente</span>{cliente ? <div className="flex min-h-11 items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3"><div className="min-w-0"><p className="truncate text-sm font-black">{cliente.nome}</p><p className="text-xs text-slate-500">{cliente.telefone || "Sem telefone"}</p></div><button type="button" aria-label="Alterar cliente" onClick={() => { setCliente(null); setClienteBusca(""); }}><X size={16} /></button></div> : <><div className="flex items-center rounded-xl border border-slate-300 bg-white"><Search size={16} className="ml-3 text-slate-400" /><input value={clienteBusca} onChange={(event) => setClienteBusca(event.target.value)} placeholder="Pesquisar cliente..." className="w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none" /></div>{clienteBusca && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">{clientesFiltrados.map((item) => <button key={item.id} type="button" onClick={() => selecionarCliente(item)} className="block w-full border-b border-slate-100 p-3 text-left text-sm font-bold hover:bg-slate-50">{item.nome}<span className="block text-xs font-normal text-slate-500">{item.telefone}</span></button>)}</div>}</>}</div>
          </div>

          <div className="grid items-end gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-[1fr_110px_140px_auto]">
            <div className="relative"><label className="mb-1 block text-xs font-black uppercase text-slate-500">Produto ou material</label><input value={produtoBusca} onChange={(event) => { setProdutoBusca(event.target.value); setProdutoSelecionado(null); }} placeholder="Código ou nome..." className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />{produtoBusca && !produtoSelecionado && <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">{produtosFiltrados.map((item) => <button key={item.id} type="button" onClick={() => selecionarProduto(item)} className="flex w-full items-center justify-between border-b border-slate-100 p-3 text-left text-sm hover:bg-slate-50"><span><strong>{item.nome}</strong><small className="block text-slate-500">{item.codigo || "Sem código"} • {item.unidade}</small></span><strong className="text-blue-700">{formatCurrency(Number(produtosCliente.find((registro) => registro.produtoId === item.id)?.precoAutorizado ?? produtosCliente.find((registro) => registro.produtoId === item.id)?.ultimoPreco ?? item.precoVendaPadrao))}</strong></button>)}</div>}</div>
            <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Quantidade</span><input value={quantidade} onChange={(event) => setQuantidade(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right font-black" /></label>
            <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Preço unitário</span><input value={preco} onChange={(event) => setPreco(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right font-black" /></label>
            <button type="button" onClick={adicionarItem} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-black text-white"><Plus size={17} className="mr-1 inline" /> Adicionar</button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[700px] text-sm"><thead><tr className="bg-slate-100 text-xs uppercase text-slate-500"><th className="p-3 text-left">Produto</th><th className="p-3 text-right">Quantidade</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Total</th><th className="p-3 text-center">Remover</th></tr></thead><tbody className="divide-y divide-slate-200">{items.length === 0 ? <tr><td colSpan={5} className="p-12 text-center font-bold text-slate-400">Adicione os produtos deste orçamento.</td></tr> : items.map((item, index) => <tr key={item.produtoId}><td className="p-3"><strong>{item.descricao}</strong><span className="ml-2 text-xs text-slate-500">{item.unidade}</span></td><td className="p-2 text-right"><input aria-label={`Quantidade de ${item.descricao} no orçamento`} value={item.quantidade} onChange={(event) => setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, quantidade: event.target.value } : registro))} className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-right font-black" /></td><td className="p-2 text-right"><input aria-label={`Preço de ${item.descricao} no orçamento`} value={item.precoUnitario} onChange={(event) => setItems((atuais) => atuais.map((registro, itemIndex) => itemIndex === index ? { ...registro, precoUnitario: event.target.value } : registro))} className="w-28 rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-right font-black" /></td><td className="p-3 text-right font-mono font-black">{formatCurrency(parseBrazilianNumber(item.quantidade) * parseBrazilianNumber(item.precoUnitario))}</td><td className="p-3 text-center"><button type="button" aria-label={`Remover ${item.descricao}`} onClick={() => setItems((atuais) => atuais.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></td></tr>)}</tbody></table>
          </div>
        </section>

        <aside className="min-w-0 h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4"><span className="rounded-xl bg-blue-100 p-2 text-blue-700"><FileText size={20} /></span><div><p className="font-black">Resumo do orçamento</p><p className="text-xs text-slate-500">{items.length} item(ns)</p></div></div>
          <div className="space-y-3"><div className="flex justify-between text-sm"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><label><span className="mb-1 flex items-center gap-1 text-xs font-black uppercase text-slate-500"><CalendarClock size={13} /> Desconto em reais</span><input value={desconto} onChange={(event) => setDesconto(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-right font-black" /></label><div className="flex justify-between border-t-2 border-slate-900 pt-3 text-lg"><span className="font-black">Total</span><strong className="text-blue-800">{formatCurrency(totalLiquido)}</strong></div></div>
          <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Observações e condições</span><textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={4} placeholder="Prazo, condições de pagamento ou observações..." className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500" /></label>
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <button type="button" disabled={salvando} onClick={() => salvar(false)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={17} /> {salvando ? "Salvando..." : "Salvar orçamento"}</button>
            <button type="button" disabled={salvando} onClick={() => salvar(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><ArrowRight size={17} /> Salvar e levar para venda</button>
            {orcamento && <button type="button" onClick={() => setPreviewOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800"><Printer size={17} /> Visualizar e imprimir</button>}
            {orcamento && <button type="button" disabled={salvando} onClick={cancelar} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-700"><X size={17} /> Cancelar orçamento aberto</button>}
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /> Ao levar para venda, cliente, produtos, quantidades, preços e desconto serão carregados automaticamente.</p>
        </aside>
      </div>
    </div>
  );
}
