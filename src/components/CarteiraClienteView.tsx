import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Coins, FileText, History, RefreshCw, Search, ShieldCheck, WalletCards } from "lucide-react";
import { CarteiraCliente, Cliente, ComprovanteRecebimento, DividaCarteira, TituloRecebimento } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber, todayLocalIso } from "../lib/utils";
import { useConfirmacao } from "./ConfirmacaoDialog";
import { useEhGerente } from "../auth/AuthContext";
import { ehTituloPagamento } from "../lib/pagamentos";
import { ParcelamentoCartaoSelect, ResumoParcelamentoCartao } from "./ParcelamentoCartaoSelect";
import { TitulosPagamentoEditor } from "./TitulosPagamentoEditor";
import { ComprovanteRecebimentoModal } from "./ComprovanteRecebimentoModal";

import { distribuirCentavos } from "../lib/distribuicaoPagamento";

interface CarteiraClienteViewProps {
  onRefreshStats?: () => void;
  clienteInicialId?: string;
  onRecebimentoRegistrado?: () => void;
}

const hoje = todayLocalIso;
const dinheiro = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CarteiraClienteView({ onRefreshStats, clienteInicialId, onRecebimentoRegistrado }: CarteiraClienteViewProps) {
  const confirmacao = useConfirmacao();
  const gerente = useEhGerente();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [busca, setBusca] = useState("");
  const [carteira, setCarteira] = useState<CarteiraCliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [valores, setValores] = useState<Record<string, string>>({});
  const [data, setData] = useState(hoje());
  const [valorRecebido, setValorRecebido] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("avista_dinheiro");
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [titulos, setTitulos] = useState<TituloRecebimento[]>([]);
  const [observacao, setObservacao] = useState("");
  const [comprovante, setComprovante] = useState<ComprovanteRecebimento | null>(null);

  useEffect(() => {
    api.getClientes()
      .then((lista) => setClientes(lista.filter((cliente) => cliente.ativo === 1)))
      .catch((err) => setError(err.message || "Não foi possível carregar os clientes."))
      .finally(() => setLoading(false));
  }, []);

  const carregarCarteira = async (id = clienteId) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const dados = await api.getCarteiraCliente(id);
      setCarteira(dados);
      setTitulos([]);
      setSelecionadas(new Set());
      setValores({});
    } catch (err: any) {
      setError(err.message || "Não foi possível carregar a carteira.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clienteInicialId) return;
    setClienteId(clienteInicialId);
    void carregarCarteira(clienteInicialId);
  }, [clienteInicialId]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter((cliente) =>
      cliente.nome.toLowerCase().includes(termo) || (cliente.telefone || "").includes(termo)
    );
  }, [busca, clientes]);

  const valorParaDistribuir = parseBrazilianNumber(valorRecebido);
  const totalAplicado = [...selecionadas].reduce((total, id) => total + parseBrazilianNumber(valores[id] || ""), 0);
  const pagamentoTitulo = ehTituloPagamento(formaPagamento);
  const usandoBonus = formaPagamento === "bonus";
  const totalTitulos = useMemo(() => Math.round(titulos.reduce((soma, titulo) => soma + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0) * 100) / 100, [titulos]);
  const valorReferencia = pagamentoTitulo ? (valorParaDistribuir || totalAplicado) : valorParaDistribuir;
  const montantePagamento = pagamentoTitulo ? totalTitulos : valorParaDistribuir;
  const credito = distribuirCentavos(valorParaDistribuir, parcelasCartao);
  const recebido = usandoBonus ? 0 : montantePagamento;
  const bonusUtilizado = usandoBonus ? montantePagamento : 0;
  const bonusGerado = usandoBonus ? 0 : Math.max(0, montantePagamento - totalAplicado);
  const distribuicaoInvalida = totalAplicado > montantePagamento + 0.005 || (usandoBonus && Math.abs(totalAplicado - montantePagamento) > 0.005);
  const valorExibido = pagamentoTitulo ? dinheiro(valorReferencia) : valorRecebido;

  const alternarDivida = (divida: DividaCarteira) => {
    const proxima = new Set(selecionadas);
    if (proxima.has(divida.id)) {
      proxima.delete(divida.id);
      setValores((atual) => ({ ...atual, [divida.id]: "" }));
    } else {
      proxima.add(divida.id);
    }
    setSelecionadas(proxima);
  };

  const selecionarTodas = () => {
    if (!carteira) return;
    if (selecionadas.size === carteira.dividas.length) {
      setSelecionadas(new Set());
      setValores({});
      return;
    }
    setSelecionadas(new Set(carteira.dividas.map((divida) => divida.id)));
  };

  const distribuirAutomaticamente = () => {
    if (!carteira || montantePagamento <= 0) return;
    const ids = selecionadas.size ? selecionadas : new Set(carteira.dividas.map((divida) => divida.id));
    let restante = montantePagamento;
    const novosValores: Record<string, string> = {};
    for (const divida of carteira.dividas) {
      if (!ids.has(divida.id) || restante <= 0) continue;
      const aplicar = Math.min(restante, Number(divida.saldoRestante));
      novosValores[divida.id] = dinheiro(aplicar);
      restante = Math.round((restante - aplicar) * 100) / 100;
    }
    setSelecionadas(new Set(ids));
    setValores(novosValores);
  };

  const registrar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!carteira) return;
    if (selecionadas.size > 1) return setError("Para pagar vários vales, gere uma ordem de cobrança na tela Vales > Gerar ordem.");
    const alocacoes = carteira.dividas
      .filter((divida) => selecionadas.has(divida.id))
      .map((divida) => ({ vendaId: divida.id, valor: parseBrazilianNumber(valores[divida.id] || "") }))
      .filter((item) => item.valor > 0);
    if (totalAplicado <= 0) return alert("INFORME O VALOR PAGO EM PELO MENOS UMA DÍVIDA.");
    if (montantePagamento <= 0) return alert("INFORME O VALOR RECEBIDO.");
    if (distribuicaoInvalida) return alert(usandoBonus ? "O BÔNUS UTILIZADO DEVE SER TOTALMENTE APLICADO NAS DÍVIDAS." : "O VALOR ABATIDO NÃO PODE ULTRAPASSAR O PAGAMENTO RECEBIDO.");
    if (bonusUtilizado > Number(carteira.saldoBonus || 0) + 0.005) return alert("O VALOR ULTRAPASSA O BÔNUS DISPONÍVEL DO CLIENTE.");
    if (!await confirmacao.confirmar({
      titulo: "Confirmar recebimento",
      mensagem: `${usandoBonus ? "BÔNUS UTILIZADO" : "VALOR RECEBIDO"}: ${formatCurrency(montantePagamento)}\nTOTAL ABATIDO DOS VALES: ${formatCurrency(totalAplicado)}${bonusGerado > 0.005 ? `\nBÔNUS GERADO: ${formatCurrency(bonusGerado)}` : ""}`,
      textoConfirmar: "Registrar",
      variante: "atencao"
    })) return;

    setSaving(true);
    try {
      const resultado = await api.createRecebimentoCliente(carteira.cliente.id, {
        data,
        valorRecebido: recebido,
        bonusUtilizado,
        formaPagamento,
        parcelasCartao: formaPagamento === "cartao_credito" ? credito.length : undefined,
        valoresParcelasCartao: formaPagamento === "cartao_credito" ? credito : undefined,
        observacao: observacao || undefined,
        titulos: ehTituloPagamento(formaPagamento) ? titulos : undefined,
        alocacoes
      });
      setComprovante(await api.getComprovanteRecebimento(resultado.id));
      setValorRecebido("");
      setObservacao("");
      setTitulos([]);
      await carregarCarteira(carteira.cliente.id);
      onRefreshStats?.();
      onRecebimentoRegistrado?.();
    } catch (err: any) {
      alert(err.message || "NÃO FOI POSSÍVEL REGISTRAR O RECEBIMENTO.");
    } finally {
      setSaving(false);
    }
  };

  const estornar = async (recebimentoId: string) => {
    const pin = prompt("INFORME A SENHA DO GERENTE PARA ESTORNAR ESTE RECEBIMENTO:");
    if (!pin) return;
    if (!await confirmacao.confirmar({
      titulo: "Estornar recebimento",
      mensagem: "Confirma o estorno? As dívidas e o bônus serão restaurados.",
      textoConfirmar: "Estornar"
    })) return;
    try {
      await api.cancelarRecebimentoCliente(recebimentoId, pin);
      await carregarCarteira();
      onRefreshStats?.();
    } catch (err: any) {
      alert(err.message || "NÃO FOI POSSÍVEL ESTORNAR O RECEBIMENTO.");
    }
  };

  const abrirComprovanteSalvo = async (recebimentoId: string) => {
    setError("");
    try { setComprovante(await api.getComprovanteRecebimento(recebimentoId)); }
    catch (error: any) { setError(error.message || "Não foi possível abrir o comprovante."); }
  };

  return (
    <div className="space-y-5">
      {comprovante && <ComprovanteRecebimentoModal comprovante={comprovante} onClose={() => setComprovante(null)} />}
      {confirmacao.dialogo}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-xs font-black text-slate-700">LOCALIZAR CLIENTE</label>
        <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
          <div className="relative"><Search className="absolute left-3 top-3 text-slate-500" size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="NOME OU TELEFONE" className="min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 pl-10 pr-3 font-bold text-slate-950" /></div>
          <select data-testid="carteira-cliente-select" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setCarteira(null); if (e.target.value) carregarCarteira(e.target.value); }} className="min-h-11 rounded-xl border border-slate-400 bg-slate-100 px-3 font-extrabold text-slate-950">
            <option value="">SELECIONE O CLIENTE</option>
            {clientesFiltrados.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome} {cliente.telefone ? `— ${cliente.telefone}` : ""}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-900"><AlertCircle size={18} />{error}</div>}
      {loading && <div className="rounded-2xl border border-slate-300 bg-white p-10 text-center font-bold text-slate-600">CARREGANDO CARTEIRA...</div>}

      {!loading && !carteira && <div className="rounded-2xl border border-dashed border-slate-400 bg-slate-50 p-10 text-center"><WalletCards className="mx-auto text-slate-500" size={38} /><p className="mt-3 font-black text-slate-900">SELECIONE UM CLIENTE PARA ABRIR A CARTEIRA</p></div>}

      {carteira && !loading && (
        <form onSubmit={registrar} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><p className="text-xs font-black text-amber-800">SALDO DEVEDOR</p><p className="mt-1 text-2xl font-black text-amber-950">{formatCurrency(carteira.saldoDevedor)}</p></div>
            <div className="rounded-2xl border border-slate-300 bg-white p-4"><p className="text-xs font-black text-slate-600">DÍVIDAS EM ABERTO</p><p className="mt-1 text-2xl font-black text-slate-950">{carteira.dividas.length}</p></div>
            <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4"><p className="text-xs font-black text-violet-700">BÔNUS DISPONÍVEL</p><p className="mt-1 text-2xl font-black text-violet-950">{formatCurrency(carteira.saldoBonus || 0)}</p></div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <h3 className="font-black text-slate-950">1. INFORMAR O RECEBIMENTO</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-black text-slate-700">{pagamentoTitulo ? "VALOR DE REFERÊNCIA SELECIONADO" : "VALOR DO PAGAMENTO"}<input data-testid="carteira-valor-recebido" readOnly={pagamentoTitulo} value={valorExibido} onChange={(e) => setValorRecebido(e.target.value)} placeholder="0,00" className={`mt-1 min-h-11 w-full rounded-xl border px-3 text-base font-black ${pagamentoTitulo ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600" : "border-slate-400 bg-slate-100 text-emerald-800"}`} /><span className="mt-1 block text-[10px] font-bold text-slate-500">{pagamentoTitulo ? "REFERÊNCIA DAS DÍVIDAS SELECIONADAS; O RECEBIDO VEM DOS TÍTULOS." : "PODE SER MENOR, IGUAL OU MAIOR QUE O TOTAL ABATIDO."}</span></label>
              <label className="text-xs font-black text-slate-700">DATA<input type="date" readOnly={pagamentoTitulo} value={data} onChange={(e) => setData(e.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border px-3 font-bold ${pagamentoTitulo ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500" : "border-slate-400 bg-slate-100 text-slate-950"}`} /></label>
              <label className="text-xs font-black text-slate-700">FORMA DE PAGAMENTO<select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-400 bg-slate-100 px-3 font-bold text-slate-950"><option value="avista_dinheiro">À VISTA DINHEIRO</option><option value="avista_debito">À VISTA DÉBITO</option><option value="pix">PIX</option><option value="cartao_credito">CARTÃO CRÉDITO</option><option value="cheque_emitente">CHEQUE EMITENTE</option><option value="cheque_terceiro">CHEQUE TERCEIRO</option><option value="duplicata_emitente">DUPLICATA EMITENTE</option><option value="duplicata_terceiro">DUPLICATA TERCEIRO</option><option value="bonus">BÔNUS</option></select></label>
            </div>
            <div className="mt-3"><TitulosPagamentoEditor formaPagamento={formaPagamento} clienteId={carteira.cliente.id} clienteNome={carteira.cliente.nome} clienteDocumento={carteira.cliente.documento} valorPagamento={valorReferencia} titulos={titulos} onChange={setTitulos} /></div>
            {formaPagamento === "cartao_credito" && <ParcelamentoCartaoSelect formaPagamento={formaPagamento} parcelas={parcelasCartao} onChange={setParcelasCartao} valorTotal={valorParaDistribuir}/>}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-slate-950">2. SELECIONAR E DISTRIBUIR NAS DÍVIDAS</h3><p className="text-xs font-bold text-slate-600">EXCEDENTE VIRA BÔNUS.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={selecionarTodas} className="rounded-xl border border-slate-400 bg-white px-3 py-2 text-xs font-black text-slate-900">{selecionadas.size === carteira.dividas.length && carteira.dividas.length ? "LIMPAR SELEÇÃO" : "SELECIONAR TODAS"}</button><button data-testid="carteira-distribuir" type="button" onClick={distribuirAutomaticamente} disabled={montantePagamento <= 0 || carteira.dividas.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><RefreshCw size={15} />DISTRIBUIR AUTOMATICAMENTE</button></div></div>
            {carteira.dividas.length === 0 ? <div className="p-8 text-center font-bold text-emerald-800"><CheckCircle2 className="mx-auto mb-2" />ESTE CLIENTE NÃO POSSUI DÍVIDAS EM ABERTO.</div> : <div className="divide-y divide-slate-200">{carteira.dividas.map((divida) => { const marcada = selecionadas.has(divida.id); const aplicado = parseBrazilianNumber(valores[divida.id] || ""); return <div key={divida.id} className={`grid grid-cols-2 items-center gap-3 p-3 sm:grid-cols-3 lg:grid-cols-[auto_0.5fr_1.15fr_0.75fr_0.75fr_0.75fr_1fr] ${marcada ? "bg-blue-50" : "bg-white"}`}><input aria-label={`Selecionar venda ${divida.numeroSequencial}`} type="checkbox" checked={marcada} onChange={() => alternarDivida(divida)} className="h-5 w-5 accent-blue-700 sm:row-span-2 lg:row-span-1" /><div><p className="text-xs font-black text-slate-500">VENDA</p><p className="font-black text-slate-950">#{divida.numeroSequencial}</p></div><div className="col-span-2 sm:col-span-1"><p className="text-xs font-black text-slate-500">EMISSÃO / VENCIMENTO</p><p className="font-bold text-slate-900">{formatDate(divida.data)} / {divida.vencimento ? formatDate(divida.vencimento) : "SEM DATA"}</p></div><div><p className="text-xs font-black text-slate-500">VALOR ORIGINAL</p><p className="font-black text-slate-950">{formatCurrency(divida.totalLiquido)}</p></div><div><p className="text-xs font-black text-slate-500">TOTAL PAGO</p><p className="font-black text-emerald-800">{formatCurrency(divida.valorPago)}</p></div><div><p className="text-xs font-black text-slate-500">FALTA PAGAR</p><p className="font-black text-amber-900">{formatCurrency(divida.saldoRestante)}</p></div><label className="col-span-2 text-xs font-black text-slate-700 sm:col-span-1">APLICAR NESTA DÍVIDA<input value={valores[divida.id] || ""} onChange={(e) => { setSelecionadas((atual) => new Set(atual).add(divida.id)); setValores((atual) => ({ ...atual, [divida.id]: e.target.value })); }} placeholder="0,00" className={`mt-1 min-h-10 w-full rounded-lg border px-3 font-black ${aplicado > divida.saldoRestante ? "border-red-500 bg-red-50 text-red-800" : "border-slate-400 bg-white text-slate-950"}`} /></label></div>; })}</div>}
          </div>

          <div className="rounded-2xl border-2 border-slate-400 bg-slate-950 p-4 text-white shadow-lg">
            <div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-black text-slate-300">{usandoBonus ? "BÔNUS UTILIZADO" : "TOTAL RECEBIDO"}</p><p className="text-xl font-black text-emerald-300">{formatCurrency(montantePagamento)}</p></div><div><p className="text-xs font-black text-slate-300">TOTAL ABATIDO DOS VALES</p><p className="text-xl font-black">{formatCurrency(totalAplicado)}</p></div><div><p className="text-xs font-black text-slate-300">BÔNUS GERADO</p><p className="text-xl font-black text-violet-300">{formatCurrency(bonusGerado)}</p></div></div>
            {distribuicaoInvalida && <p className="mt-3 rounded-lg bg-amber-600 p-2 text-sm font-black text-slate-950">{usandoBonus ? "O BÔNUS UTILIZADO DEVE SER TODO APLICADO NAS DÍVIDAS." : "O TOTAL ABATIDO NÃO PODE ULTRAPASSAR O PAGAMENTO."}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="OBSERVAÇÃO DO RECEBIMENTO" className="min-h-11 rounded-xl border border-slate-500 bg-slate-800 px-3 font-bold text-white placeholder:text-slate-400" /><button data-testid="carteira-confirmar" disabled={saving || totalAplicado <= 0 || montantePagamento <= 0 || distribuicaoInvalida} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40"><Coins size={18} />{saving ? "REGISTRANDO..." : "CONFIRMAR RECEBIMENTO"}</button></div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-300 bg-slate-100 p-4"><History size={18} /><h3 className="font-black text-slate-950">HISTÓRICO DA CARTEIRA</h3></div>
            {carteira.recebimentos.length === 0 ? <p className="p-8 text-center font-bold text-slate-500">NENHUM RECEBIMENTO REGISTRADO PELA CARTEIRA.</p> : <div className="divide-y divide-slate-200">{carteira.recebimentos.map((recebimento) => <article key={recebimento.id} className="space-y-3 p-4"><div className="grid gap-3 lg:grid-cols-[0.7fr_1fr_1.4fr_auto]"><div><p className="text-xs font-black text-slate-500">DATA</p><p className="font-bold text-slate-950">{formatDate(recebimento.data)}</p></div><div><p className="text-xs font-black text-slate-500">RECEBIDO / FORMA</p><p className={`font-black ${recebimento.status === "recusado" ? "text-red-800 line-through" : "text-emerald-800"}`}>{formatCurrency(recebimento.valorRecebido)}</p><p className="text-xs font-bold uppercase text-slate-600">{recebimento.formaPagamento.replaceAll("_", " ")}</p><button type="button" onClick={() => void abrirComprovanteSalvo(recebimento.id)} className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[10px] font-black uppercase text-blue-800"><FileText size={13}/>Comprovante</button><ResumoParcelamentoCartao formaPagamento={recebimento.formaPagamento} parcelasCartao={recebimento.parcelasCartao} valoresParcelasCartao={recebimento.valoresParcelasCartao} valorTotal={recebimento.valorRecebido} className="mt-1" />{recebimento.status === "recusado" && <span className="mt-1 inline-block rounded-lg bg-red-100 px-2 py-1 text-[10px] font-black text-red-800">RECUSADO</span>}</div><div><p className="text-xs font-black text-slate-500">VALORES ABATIDOS</p><p className="font-black text-slate-950">{formatCurrency(recebimento.status === "recusado" ? 0 : recebimento.valorAplicado)}</p><p className="text-xs font-bold text-slate-600">{recebimento.alocacoes.map((a) => `#${a.numeroSequencial}: ${formatCurrency(a.valor)}`).join(" • ") || (recebimento.status === "recusado" ? "SALDOS RESTAURADOS" : "SEM DÍVIDAS")}</p></div>{gerente && recebimento.status === "ativo" && <button type="button" onClick={() => estornar(recebimento.id)} className="inline-flex self-center items-center justify-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-black text-red-800 hover:bg-red-50"><ShieldCheck size={14} />ESTORNAR</button>}</div>{recebimento.titulos?.map((titulo, indice) => <div key={titulo.id || indice} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950"><p className="font-black">{titulo.tipo.startsWith("duplicata") ? "BOLETO" : "CHEQUE"} Nº {titulo.numeroDocumento} · {formatCurrency(titulo.valor)}</p><p className="mt-1 text-[10px]">{titulo.nomeTitular} · {titulo.documentoTitular} · VENCIMENTO: {formatDate(titulo.vencimento)} · SITUAÇÃO: {(titulo.status || "aguardando").toUpperCase()}</p>{titulo.observacao && <p className="mt-1 text-[10px] text-slate-700">OBS.: {titulo.observacao}</p>}</div>)}</article>)}</div>}
          </div>
        </form>
      )}
    </div>
  );
}
