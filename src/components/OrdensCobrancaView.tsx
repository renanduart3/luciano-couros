import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Coins, Edit3, Eye, FileClock, History, ListChecks, RefreshCw, ShieldCheck, WalletCards, X } from "lucide-react";
import { api } from "../lib/api";
import { OrdemCobranca } from "../types";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";
import { CamposCheque } from "./CamposCheque";
import { dadosChequeVazios, DadosCheque, ehCheque, FORMAS_PAGAMENTO } from "../lib/pagamentos";

interface Props {
  refreshKey?: number;
}

const statusLabel: Record<OrdemCobranca["status"], string> = {
  aberta: "EM ABERTO",
  quitada: "QUITADA",
  cancelada: "CANCELADA",
  renegociada: "RENEGOCIADA",
};

const statusClass: Record<OrdemCobranca["status"], string> = {
  aberta: "bg-amber-100 text-amber-900",
  quitada: "bg-emerald-100 text-emerald-800",
  cancelada: "bg-slate-200 text-slate-700",
  renegociada: "bg-blue-100 text-blue-800",
};

const hojeIso = () => new Date().toISOString().slice(0, 10);
const dinheiroInput = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OrdemCobrancaDetalhesModal({ ordem, onClose, onChanged }: { ordem: OrdemCobranca; onClose: () => void; onChanged: (ordem: OrdemCobranca) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [abaDetalhe, setAbaDetalhe] = useState<"parcelas" | "historico">("parcelas");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [dadosCheque, setDadosCheque] = useState<DadosCheque>(() => ({ ...dadosChequeVazios(), cpfTitular: ordem.clienteDocumento || "" }));
  const [valoresPagamento, setValoresPagamento] = useState<Record<string, string>>(() => Object.fromEntries(ordem.parcelas.filter((parcela) => parcela.status === "pendente").map((parcela) => [parcela.id, dinheiroInput(parcela.saldo)])));
  const [datasPagamento, setDatasPagamento] = useState<Record<string, string>>(() => Object.fromEntries(ordem.parcelas.map((parcela) => [parcela.id, hojeIso()])));
  const [encerramento, setEncerramento] = useState(false);
  const [pinEncerramento, setPinEncerramento] = useState("");
  const [motivoEncerramento, setMotivoEncerramento] = useState("");
  const [correcao, setCorrecao] = useState<{ parcelaId: string; recebimentoId: string; valor: number } | null>(null);
  const [pinCorrecao, setPinCorrecao] = useState("");

  useEffect(() => {
    setValoresPagamento(Object.fromEntries(ordem.parcelas.filter((parcela) => parcela.status === "pendente").map((parcela) => [parcela.id, dinheiroInput(parcela.saldo)])));
  }, [ordem.updatedAt, ordem.valorPago]);

  const registrarPagamento = async (parcelaId: string) => {
    const valorInformado = parseBrazilianNumber(valoresPagamento[parcelaId] || "");
    const valorRecebido = formaPagamento === "bonus" ? 0 : valorInformado;
    const bonusUtilizado = formaPagamento === "bonus" ? valorInformado : 0;
    if (valorInformado <= 0) return setError("Informe o valor do pagamento.");
    if (formaPagamento === "bonus" && valorInformado > Number(ordem.saldoBonus) + 0.005) return setError("O valor ultrapassa o bônus disponível do cliente.");
    if (formaPagamento === "bonus" && valorInformado > Number(ordem.saldo) + 0.005) return setError("O bônus não pode ultrapassar o saldo da ordem.");
    if (ehCheque(formaPagamento) && (!dadosCheque.vencimento || !dadosCheque.cpfTitular.trim() || !dadosCheque.banco.trim() || !dadosCheque.numeroCheque.trim() || (formaPagamento === "cheque_terceiro" && !dadosCheque.cpfTerceiro.trim()))) return setError("Preencha todos os dados obrigatórios do cheque.");
    let restante = Math.min(valorInformado, Number(ordem.saldo));
    const alocacoes: Array<{ vendaId: string; valor: number }> = [];
    for (const vale of ordem.vales.filter((item) => Number(item.saldo) > 0.005)) {
      if (restante <= 0.005) break;
      const valor = Math.round(Math.min(restante, Number(vale.saldo)) * 100) / 100;
      alocacoes.push({ vendaId: vale.vendaId, valor });
      restante = Math.round(Math.max(0, restante - valor) * 100) / 100;
    }
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const resultado = await api.createRecebimentoCliente(ordem.clienteId, {
        data: datasPagamento[parcelaId] || hojeIso(),
        valorRecebido,
        bonusUtilizado,
        formaPagamento,
        dadosCheque: ehCheque(formaPagamento) ? dadosCheque : undefined,
        parcelaOrdemId: parcelaId,
        observacao: `Pagamento da ordem de cobrança #${ordem.numeroSequencial}`,
        alocacoes,
      });
      const atualizada = (await api.getOrdensCobranca(ordem.clienteId)).find((item) => item.id === ordem.id);
      if (atualizada) onChanged(atualizada);
      setFeedback(`Pagamento registrado: ${formatCurrency(resultado.valorAplicado)} abatido` + (resultado.bonusGerado > 0.005 ? ` e ${formatCurrency(resultado.bonusGerado)} gerado em bônus.` : "."));
    } catch (err: any) {
      setError(err.message || "Não foi possível registrar o pagamento.");
    } finally {
      setSaving(false);
    }
  };

  const corrigirPagamento = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correcao || pinCorrecao.length < 4) return;
    setSaving(true);
    setError("");
    try {
      await api.cancelarRecebimentoCliente(correcao.recebimentoId, pinCorrecao);
      const atualizada = (await api.getOrdensCobranca(ordem.clienteId)).find((item) => item.id === ordem.id);
      setValoresPagamento((atuais) => ({ ...atuais, [correcao.parcelaId]: dinheiroInput(correcao.valor) }));
      setCorrecao(null);
      setPinCorrecao("");
      if (atualizada) onChanged(atualizada);
      setFeedback("Pagamento liberado para edição. Ajuste o valor na parcela e registre novamente.");
    } catch (err: any) {
      setError(err.message || "Não foi possível liberar o pagamento para edição.");
    } finally {
      setSaving(false);
    }
  };

  const abrirEncerramento = () => {
    setError("");
    setPinEncerramento("");
    setMotivoEncerramento("");
    setEncerramento(true);
  };

  const encerrar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!encerramento) return;
    if (pinEncerramento.length < 4) return setError("Informe a senha do gerente para continuar.");
    setSaving(true);
    setError("");
    try {
      const atualizada = await api.encerrarOrdemCobranca(ordem.id, {
        pin: pinEncerramento,
        status: "cancelada",
        motivo: motivoEncerramento,
      });
      setEncerramento(false);
      onChanged(atualizada);
      setFeedback("Ordem cancelada. O saldo ainda devido voltou a ficar disponível nos vales.");
    } catch (err: any) {
      setError(err.message || "Não foi possível encerrar a ordem.");
    } finally {
      setSaving(false);
    }
  };

  return <>
  {correcao && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"><form onSubmit={corrigirPagamento} role="alertdialog" aria-modal="true" aria-labelledby="editar-pagamento-titulo" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4"><div><h2 id="editar-pagamento-titulo" className="font-black text-slate-950">Editar pagamento</h2><p className="mt-1 text-xs font-bold text-slate-500">O lançamento de {formatCurrency(correcao.valor)} será estornado e a parcela voltará para edição.</p></div><button type="button" onClick={() => { setCorrecao(null); setError(""); }} className="rounded-lg p-2 text-slate-500"><X size={18}/></button></header><div className="space-y-3 p-5"><p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">Após confirmar, ajuste o campo PAGAMENTO e registre novamente. O histórico manterá o estorno e o novo lançamento.</p><label className="block text-[10px] font-black uppercase text-slate-600">Senha do gerente<input autoFocus type="password" value={pinCorrecao} onChange={(event) => { setPinCorrecao(event.target.value.slice(0, 64)); setError(""); }} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-black tracking-widest" /></label>{error && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800">{error}</p>}</div><footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={() => { setCorrecao(null); setError(""); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black uppercase">Voltar</button><button type="submit" disabled={saving || pinCorrecao.length < 4} className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-black uppercase text-white disabled:opacity-40"><ShieldCheck size={16}/>Liberar edição</button></footer></form></div>}
  {encerramento && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
    <form onSubmit={encerrar} role="alertdialog" aria-modal="true" aria-labelledby="encerrar-ordem-titulo" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
        <div><h2 id="encerrar-ordem-titulo" className="font-black text-slate-950">Cancelar ordem</h2><p className="mt-1 text-xs font-bold text-slate-500">Ordem #{ordem.numeroSequencial} · {ordem.clienteNome}</p></div>
        <button type="button" onClick={() => { setEncerramento(false); setError(""); }} aria-label="Fechar confirmação" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X size={18}/></button>
      </header>
      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-950">
          A ordem será encerrada sem cancelar os vales. Todo saldo ainda devido ficará novamente disponível para cobrança ou nova negociação.
        </div>
        <label className="block text-[10px] font-black uppercase text-slate-600">Senha do gerente<input autoFocus type="password" autoComplete="off" value={pinEncerramento} onChange={(event) => { setPinEncerramento(event.target.value.slice(0, 64)); setError(""); }} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-black tracking-widest" /></label>
        <label className="block text-[10px] font-black uppercase text-slate-600">Motivo (opcional)<textarea rows={2} value={motivoEncerramento} onChange={(event) => setMotivoEncerramento(event.target.value.slice(0, 300))} placeholder="Ex.: cliente solicitou novas datas" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm font-bold" /></label>
        {error && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800"><AlertCircle size={16}/>{error}</div>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button type="button" disabled={saving} onClick={() => { setEncerramento(false); setError(""); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black uppercase text-slate-700">Voltar</button><button type="submit" disabled={saving || pinEncerramento.length < 4} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-black uppercase text-white disabled:opacity-40"><ShieldCheck size={16}/>{saving ? "Confirmando..." : "Cancelar ordem"}</button></footer>
    </form>
  </div>}
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
    <div role="dialog" aria-modal="true" className="flex max-h-[98vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-950 p-4 text-white"><div><p className="text-xs font-black text-slate-400">ORDEM DE COBRANÇA</p><h2 className="text-xl font-black">#{ordem.numeroSequencial} · {ordem.clienteNome}</h2><div className="mt-2 flex flex-wrap gap-2"><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusClass[ordem.status]}`}>{statusLabel[ordem.status]}</span><span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black">EMITIDA EM {formatDate(ordem.dataEmissao)}</span>{Number(ordem.saldoBonus) > 0.005 && <span className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-2 py-1 text-[10px] font-black text-white"><WalletCards size={13}/> BÔNUS {formatCurrency(ordem.saldoBonus)}</span>}</div></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20}/></button></header>
      <div className="space-y-4 overflow-y-auto bg-slate-100 p-4">
        <div className="grid grid-cols-3 gap-3"><div className="rounded-xl border border-slate-300 bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-500">Negociado</p><p className="mt-1 font-mono text-lg font-black">{formatCurrency(ordem.totalOriginal)}</p></div><div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase text-emerald-700">Pago</p><p className="mt-1 font-mono text-lg font-black text-emerald-800">{formatCurrency(ordem.valorPago)}</p></div><div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-700">Em aberto</p><p className="mt-1 font-mono text-lg font-black text-amber-900">{formatCurrency(ordem.saldo)}</p></div></div>

        <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Vales vinculados</div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-slate-900 text-[10px] font-black uppercase text-white"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Emissão</th><th className="p-2 text-right">Valor do vale</th></tr></thead><tbody className="divide-y divide-slate-200">{ordem.vales.map((vale) => <tr key={vale.id}><td className="p-2 font-black">#{vale.numeroSequencial}</td><td className="p-2 font-bold">{formatDate(vale.data)}</td><td className="p-2 text-right font-mono font-black">{formatCurrency(vale.valorVinculado)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-900 bg-slate-100"><td colSpan={2} className="p-2 text-right text-xs font-black uppercase">Total dos vales selecionados</td><td className="p-2 text-right font-mono text-base font-black">{formatCurrency(ordem.vales.reduce((total, vale) => total + Number(vale.valorVinculado), 0))}</td></tr></tfoot></table></div></div>

        <div className="flex gap-2 rounded-xl border border-slate-300 bg-white p-2">
          <button type="button" onClick={() => setAbaDetalhe("parcelas")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-black uppercase ${abaDetalhe === "parcelas" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><ListChecks size={15}/> Parcelas e pagamentos</button>
          <button type="button" onClick={() => setAbaDetalhe("historico")} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-black uppercase ${abaDetalhe === "historico" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><History size={15}/> Histórico da ordem</button>
        </div>

        {abaDetalhe === "parcelas" ? <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
          <div className="space-y-3 border-b border-slate-300 bg-slate-50 p-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-700">Parcelamento e pagamentos</p><p className="mt-1 text-sm font-black text-slate-950">{ordem.clienteNome}</p><p className="text-[10px] font-bold text-slate-500">CPF/CNPJ: {ordem.clienteDocumento || "NÃO INFORMADO"}</p></div><label className="text-[10px] font-black uppercase text-slate-600">Forma de pagamento<select value={formaPagamento} onChange={(event) => setFormaPagamento(event.target.value)} className="mt-1 min-h-9 min-w-56 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold">{FORMAS_PAGAMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}</select></label></div><CamposCheque formaPagamento={formaPagamento} dados={dadosCheque} onChange={setDadosCheque} documentoCliente={ordem.clienteDocumento} />{formaPagamento === "bonus" && <p className="rounded-lg border border-violet-300 bg-violet-50 p-2 text-xs font-black text-violet-900">BÔNUS DISPONÍVEL: {formatCurrency(ordem.saldoBonus)}</p>}</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-xs"><thead className="bg-slate-900 text-[10px] font-black uppercase text-white"><tr><th className="p-2 text-left">Parcela</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Previsto</th><th className="p-2 text-right">Pago</th><th className="p-2 text-left">Data do pagamento</th><th className="p-2 text-right">Pagamento</th><th className="w-[210px] p-2 text-center">Ações</th></tr></thead><tbody className="divide-y divide-slate-200">{ordem.parcelas.map((parcela) => <tr key={parcela.id} className={parcela.status === "paga" ? "bg-emerald-50/60" : "bg-white"}><td className="p-2 font-black">{parcela.numero}/{ordem.parcelas.length}</td><td className="p-2 font-bold">{formatDate(parcela.vencimento)}</td><td className="p-2 text-right font-mono font-bold">{formatCurrency(parcela.valor)}</td><td className="p-2 text-right font-mono font-bold text-emerald-800">{formatCurrency(parcela.valorPago)}</td>{parcela.status === "pendente" && ordem.status === "aberta" ? <><td className="p-2"><input type="date" value={datasPagamento[parcela.id] || hojeIso()} onChange={(event) => setDatasPagamento((atuais) => ({ ...atuais, [parcela.id]: event.target.value }))} className="min-h-9 rounded-lg border border-slate-300 px-2 font-bold"/></td><td className="p-2 text-right"><input type="text" inputMode="decimal" value={valoresPagamento[parcela.id] || ""} onChange={(event) => setValoresPagamento((atuais) => ({ ...atuais, [parcela.id]: event.target.value }))} className="min-h-9 w-32 rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-right font-mono font-black text-emerald-900"/></td><td className="p-2"><div className="grid grid-cols-2 justify-center gap-2"><button type="button" disabled={saving} onClick={() => void registrarPagamento(parcela.id)} className="inline-flex min-h-9 w-24 items-center justify-center gap-1 rounded-lg bg-emerald-700 text-[10px] font-black uppercase text-white disabled:opacity-40"><Coins size={14}/> Registrar</button><button type="button" disabled={saving || !parcela.ultimoRecebimentoId} onClick={() => { if (!parcela.ultimoRecebimentoId) return; setCorrecao({ parcelaId: parcela.id, recebimentoId: parcela.ultimoRecebimentoId, valor: Number(parcela.ultimoPagamentoValor || 0) }); setPinCorrecao(""); setError(""); }} className="inline-flex min-h-9 w-24 items-center justify-center gap-1 rounded-lg border border-amber-400 bg-amber-50 text-[10px] font-black uppercase text-amber-900 disabled:cursor-not-allowed disabled:opacity-35"><Edit3 size={13}/> Editar</button></div></td></> : <><td className="p-2 font-bold text-slate-700">{parcela.dataPagamento ? formatDate(parcela.dataPagamento) : "—"}</td><td className="p-2 text-center"><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${parcela.status === "paga" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{parcela.status === "paga" ? "QUITADA" : parcela.status.toUpperCase()}</span></td><td className="p-2"><div className="grid grid-cols-2 justify-center gap-2"><span className="w-24" aria-hidden="true"/>{parcela.ultimoRecebimentoId ? <button type="button" disabled={saving} onClick={() => { setCorrecao({ parcelaId: parcela.id, recebimentoId: parcela.ultimoRecebimentoId!, valor: Number(parcela.ultimoPagamentoValor || 0) }); setPinCorrecao(""); setError(""); }} className="inline-flex min-h-9 w-24 items-center justify-center gap-1 rounded-lg border border-amber-400 bg-amber-50 text-[10px] font-black uppercase text-amber-900 disabled:opacity-40"><Edit3 size={13}/> Editar</button> : <span className="w-24" aria-hidden="true"/>}</div></td></>}</tr>)}</tbody></table></div>
        </div> : <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
          <div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Ciclo de vida da ordem</div>
          <div className="divide-y divide-slate-200">{(ordem.eventos || []).map((evento) => <div key={evento.id} className="flex gap-3 p-3 text-sm"><span className="shrink-0 font-mono text-xs font-black text-slate-500">{formatDate(evento.data)}</span><p className={evento.tipo === "estorno" ? "font-bold text-red-700" : "font-bold text-slate-800"}>{evento.texto}{evento.formaPagamento && evento.tipo === "pagamento" ? ` Forma: ${evento.formaPagamento.replaceAll("_", " ").toUpperCase()}.` : ""}</p></div>)}</div>
        </div>}
        {ordem.observacao && <div className="rounded-xl border border-slate-300 bg-white p-3 text-sm font-bold text-slate-700"><span className="block text-[10px] font-black uppercase text-slate-500">Observação</span>{ordem.observacao}</div>}
        {feedback && <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-black text-emerald-800"><CheckCircle2 size={17}/>{feedback}</div>}
        {error && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-black text-red-800"><AlertCircle size={17}/>{error}</div>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-300 bg-white p-3">{ordem.status === "aberta" && <button disabled={saving} type="button" onClick={abrirEncerramento} className="rounded-lg border border-slate-400 px-3 py-2 text-xs font-black uppercase text-slate-700">Cancelar ordem</button>}<button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white">Fechar</button></footer>
    </div>
  </div></>;
}

export function OrdensCobrancaView({ refreshKey }: Props) {
  const [ordens, setOrdens] = useState<OrdemCobranca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("aberta");
  const [numeroVale, setNumeroVale] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhada, setDetalhada] = useState<OrdemCobranca | null>(null);

  const carregar = async () => {
    setLoading(true);
    setError("");
    try { setOrdens(await api.getOrdensCobranca()); }
    catch (err: any) { setError(err.message || "Não foi possível carregar as ordens."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void carregar(); }, [refreshKey]);

  const clientes = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string }>();
    ordens.forEach((ordem) => mapa.set(ordem.clienteId, { id: ordem.clienteId, nome: ordem.clienteNome }));
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ordens]);

  const filtradas = useMemo(() => ordens.filter((ordem) => {
    if (status !== "todas" && ordem.status !== status) return false;
    if (clienteId && ordem.clienteId !== clienteId) return false;
    if (dataInicio && ordem.dataEmissao < dataInicio) return false;
    if (dataFim && ordem.dataEmissao > dataFim) return false;
    const numero = numeroVale.replace(/\D/g, "").replace(/^0+/, "");
    return !numero || ordem.vales.some((vale) => String(vale.numeroSequencial) === numero);
  }), [ordens, status, numeroVale, clienteId, dataInicio, dataFim]);

  const atualizar = (ordem: OrdemCobranca) => { setOrdens((atuais) => atuais.map((item) => item.id === ordem.id ? ordem : item)); setDetalhada(ordem); };

  return <div className="space-y-4">
    {detalhada && <OrdemCobrancaDetalhesModal ordem={detalhada} onClose={() => setDetalhada(null)} onChanged={atualizar}/>}
    <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[0.8fr_1.5fr_1fr_1fr_1fr_auto] xl:items-end"><label className="text-[10px] font-black uppercase text-slate-600">Nº do vale<input inputMode="numeric" value={numeroVale} onChange={(event) => setNumeroVale(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ex.: 123" className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Cliente<select value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="">Todos os clientes</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label><label className="text-[10px] font-black uppercase text-slate-600">Data início<input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Data fim<input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="aberta">Em aberto</option><option value="quitada">Quitadas</option><option value="renegociada">Renegociadas</option><option value="cancelada">Canceladas</option><option value="todas">Todas</option></select></label><button type="button" onClick={() => void carregar()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-black uppercase"><RefreshCw size={15}/> Atualizar</button></div></div>
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center font-bold text-slate-500">Carregando ordens...</div> : error ? <div className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 font-bold text-red-800"><AlertCircle size={18}/>{error}</div> : filtradas.length === 0 ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-10 text-center"><FileClock className="mx-auto text-blue-600" size={34}/><p className="mt-3 font-black text-blue-950">Nenhuma ordem neste filtro</p></div> : <div className="grid gap-3">{filtradas.map((ordem) => {
      const proxima = ordem.parcelas.find((parcela) => parcela.status === "pendente");
      return <article key={ordem.id} className="grid gap-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm lg:grid-cols-[0.55fr_1.5fr_0.8fr_0.8fr_0.9fr_auto] lg:items-center"><div><p className="text-[10px] font-black uppercase text-slate-500">Ordem</p><p className="font-mono text-lg font-black">#{ordem.numeroSequencial}</p><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusClass[ordem.status]}`}>{statusLabel[ordem.status]}</span></div><div><p className="text-[10px] font-black uppercase text-slate-500">Cliente</p><p className="font-black uppercase text-slate-950">{ordem.clienteNome}</p><p className="text-xs font-bold text-slate-500">{ordem.vales.length} vale(s) · {ordem.parcelas.length} parcela(s)</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Negociado</p><p className="font-mono font-black">{formatCurrency(ordem.totalOriginal)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Pago</p><p className="font-mono font-black text-emerald-800">{formatCurrency(ordem.valorPago)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Próximo pagamento</p>{proxima ? <><p className="inline-flex items-center gap-1 font-black text-amber-900"><CalendarClock size={14}/>{formatDate(proxima.vencimento)}</p><p className="font-mono text-xs font-black">{formatCurrency(proxima.saldo)}</p></> : <p className="inline-flex items-center gap-1 font-black text-emerald-800"><CheckCircle2 size={15}/>Concluída</p>}</div><button type="button" onClick={() => setDetalhada(ordem)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black uppercase text-white"><Eye size={15}/> Detalhes</button></article>;
    })}</div>}
  </div>;
}
