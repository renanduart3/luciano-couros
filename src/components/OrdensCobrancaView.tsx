import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Coins, Edit3, Eye, FileClock, FileText, History, ListChecks, MessageCircle, Plus, RefreshCw, Save, ShieldCheck, Trash2, WalletCards, X } from "lucide-react";
import { api } from "../lib/api";
import { ComprovanteRecebimento, OrdemCobranca, TituloRecebimento, Venda } from "../types";
import { formatCurrency, formatDate, parseBrazilianNumber, todayLocalIso, whatsappUrl } from "../lib/utils";
import { ehTituloPagamento, FORMAS_PAGAMENTO } from "../lib/pagamentos";
import { RenegociarSaldoOrdem } from "./RenegociarSaldoOrdem";
import { LinhaPagamento } from "./LinhaPagamento";
import { useEhGerente } from "../auth/AuthContext";
import { ParcelamentoCartaoSelect, ResumoParcelamentoCartao } from "./ParcelamentoCartaoSelect";
import { TitulosPagamentoEditor } from "./TitulosPagamentoEditor";
import { ComprovanteRecebimentoModal } from "./ComprovanteRecebimentoModal";
import { OrdemCobrancaDemonstrativoModal } from "./OrdemCobrancaDemonstrativoModal";

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

const hojeIso = todayLocalIso;
const dinheiroInput = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const adicionarMeses = (data: string, meses: number) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return hojeIso();
  const indiceMes = mes - 1 + meses;
  const anoDestino = ano + Math.floor(indiceMes / 12);
  const mesDestino = ((indiceMes % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(anoDestino, mesDestino + 1, 0)).getUTCDate();
  return `${String(anoDestino).padStart(4, "0")}-${String(mesDestino + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
};

function EditarValesOrdem({ ordem, onCancel, onSaved }: { ordem: OrdemCobranca; onCancel: () => void; onSaved: (ordem: OrdemCobranca) => void }) {
  const [vales, setVales] = useState<Venda[]>([]);
  const [ordens, setOrdens] = useState<OrdemCobranca[]>([]);
  const [selecionados, setSelecionados] = useState(() => new Set(ordem.vales.map((vale) => vale.vendaId)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ativo = true;
    Promise.all([api.getVendas(), api.getOrdensCobranca(ordem.clienteId)])
      .then(([vendas, listaOrdens]) => { if (ativo) { setVales(vendas); setOrdens(listaOrdens); } })
      .catch((err: any) => { if (ativo) setError(err.message || "Não foi possível carregar os vales do cliente."); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [ordem.clienteId]);

  const atuais = new Map(ordem.vales.map((vale) => [vale.vendaId, vale]));
  const ordemDeOutroVale = new Map<string, number>();
  ordens.filter((item) => item.id !== ordem.id && item.status === "aberta").forEach((item) => {
    item.vales.filter((vale) => Number(vale.saldo) > 0.005).forEach((vale) => ordemDeOutroVale.set(vale.vendaId, item.numeroSequencial));
  });
  const disponiveis = vales
    .filter((vale) => vale.clienteId === ordem.clienteId && (atuais.has(vale.id) || (vale.status === "pendente" && Number(vale.saldoRestante) > 0.005)))
    .sort((a, b) => Number(b.numeroSequencial) - Number(a.numeroSequencial));
  const totalSelecionado = disponiveis.reduce((total, vale) => selecionados.has(vale.id)
    ? total + Number(atuais.get(vale.id)?.valorVinculado ?? vale.saldoRestante)
    : total, 0);

  const salvar = async () => {
    if (selecionados.size === 0) return setError("Mantenha ao menos um vale na ordem.");
    setSaving(true);
    setError("");
    try { onSaved(await api.updateOrdemCobrancaVales(ordem.id, [...selecionados])); }
    catch (err: any) { setError(err.message || "Não foi possível alterar os vales desta ordem."); }
    finally { setSaving(false); }
  };

  return <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase text-blue-900">Editar vales da ordem</p><p className="mt-1 text-xs font-bold text-blue-700">Marque os vales que devem permanecer agrupados. As parcelas em aberto serão recalculadas.</p></div><strong className="font-mono text-lg text-blue-950">{formatCurrency(totalSelecionado)}</strong></div>
    {loading ? <p className="mt-3 rounded-lg bg-white p-3 text-sm font-bold text-slate-500">Carregando vales...</p> : <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{disponiveis.map((vale) => {
      const atual = atuais.get(vale.id);
      const possuiPagamento = Number(atual?.valorPago || 0) > 0.005;
      const outraOrdem = ordemDeOutroVale.get(vale.id);
      const bloqueado = possuiPagamento || Boolean(outraOrdem);
      return <label key={vale.id} className={`flex items-center gap-3 rounded-lg border bg-white p-3 ${bloqueado ? "cursor-not-allowed opacity-65" : "cursor-pointer border-blue-200"}`}><input type="checkbox" checked={selecionados.has(vale.id)} disabled={bloqueado} onChange={() => setSelecionados((anteriores) => { const proximos = new Set(anteriores); if (proximos.has(vale.id)) proximos.delete(vale.id); else proximos.add(vale.id); return proximos; })} className="h-5 w-5 accent-blue-700"/><span className="min-w-0 flex-1"><strong className="block">Vale #{vale.numeroSequencial}</strong><span className="text-xs font-bold text-slate-500">{formatDate(vale.data)}{possuiPagamento ? " · possui pagamento nesta ordem" : outraOrdem ? ` · vinculado à ordem #${outraOrdem}` : " · disponível"}</span></span><strong className="font-mono text-sm">{formatCurrency(atual?.valorVinculado ?? vale.saldoRestante)}</strong></label>;
    })}</div>}
    {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800"><AlertCircle size={15}/>{error}</div>}
    <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase">Voltar</button><button type="button" disabled={saving || loading || selecionados.size === 0} onClick={() => void salvar()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"><Save size={15}/>{saving ? "Salvando..." : "Salvar vales"}</button></div>
  </div>;
}

function EditarParcelasOrdem({ ordem, onCancel, onSaved }: { ordem: OrdemCobranca; onCancel: () => void; onSaved: (ordem: OrdemCobranca) => void }) {
  type ParcelaEditavel = { id?: string; vencimento: string; valor: number; valorTexto?: string; bloqueada: boolean };
  const [parcelas, setParcelas] = useState<ParcelaEditavel[]>(() => ordem.parcelas.map((parcela) => ({
    id: parcela.id,
    vencimento: parcela.vencimento,
    valor: Number(parcela.valor),
    bloqueada: Number(parcela.valorPago) > 0.005,
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = Math.round(parcelas.reduce((soma, parcela) => soma + Number(parcela.valor || 0), 0) * 100) / 100;
  const totalCorreto = Math.abs(total - Number(ordem.totalOriginal)) <= 0.01;

  const redistribuir = (lista: ParcelaEditavel[]) => {
    const editaveis = lista.filter((parcela) => !parcela.bloqueada);
    if (editaveis.length === 0) return lista;
    const fixoCentavos = Math.round(lista.filter((parcela) => parcela.bloqueada).reduce((soma, parcela) => soma + parcela.valor, 0) * 100);
    const disponivel = Math.max(0, Math.round(Number(ordem.totalOriginal) * 100) - fixoCentavos);
    const base = Math.floor(disponivel / editaveis.length);
    let resto = disponivel - base * editaveis.length;
    return lista.map((parcela) => parcela.bloqueada ? parcela : {
      ...parcela,
      valor: (base + (resto-- > 0 ? 1 : 0)) / 100,
      valorTexto: undefined,
    });
  };

  const adicionar = () => {
    if (parcelas.length >= 36) return;
    const ultimaData = parcelas.at(-1)?.vencimento || hojeIso();
    setParcelas((atuais) => redistribuir([...atuais, { vencimento: adicionarMeses(ultimaData, 1), valor: 0, bloqueada: false }]));
    setError("");
  };
  const remover = (index: number) => {
    if (parcelas.length <= 1 || parcelas[index].bloqueada) return;
    setParcelas((atuais) => redistribuir(atuais.filter((_, posicao) => posicao !== index)));
    setError("");
  };
  const salvar = async () => {
    setError("");
    if (parcelas.some((parcela) => !/^\d{4}-\d{2}-\d{2}$/.test(parcela.vencimento) || !Number.isFinite(parcela.valor) || parcela.valor <= 0)) return setError("Informe data e valor maior que zero em todas as parcelas.");
    if (parcelas.some((parcela, index) => index > 0 && parcela.vencimento < parcelas[index - 1].vencimento)) return setError("Mantenha os vencimentos em ordem crescente.");
    if (!totalCorreto) return setError(`A soma das parcelas deve ser ${formatCurrency(ordem.totalOriginal)}.`);
    setSaving(true);
    try {
      onSaved(await api.updateOrdemCobrancaParcelas(ordem.id, ordem.updatedAt, parcelas.map(({ id, vencimento, valor }) => ({ id, vencimento, valor }))));
    } catch (err: any) {
      setError(err.message || "Não foi possível alterar as parcelas desta ordem.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-blue-900">Editar parcelas da ordem</p><p className="mt-1 text-xs font-bold text-blue-700">Altere vencimentos e valores ou adicione e remova parcelas sem pagamento. Parcelas que já receberam valores ficam preservadas.</p></div><div className="text-right"><span className="block text-[9px] font-black uppercase text-blue-700">Soma das parcelas</span><strong className={`font-mono text-lg ${totalCorreto ? "text-emerald-800" : "text-red-700"}`}>{formatCurrency(total)} / {formatCurrency(ordem.totalOriginal)}</strong></div></div>
    <div className="mt-3 overflow-x-auto rounded-lg border border-blue-200 bg-white"><table className="w-full min-w-[620px] text-xs"><thead className="bg-slate-900 text-[10px] font-black uppercase text-white"><tr><th className="p-2 text-left">Parcela</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Valor</th><th className="w-28 p-2 text-center">Ação</th></tr></thead><tbody className="divide-y divide-slate-200">{parcelas.map((parcela, index) => <tr key={parcela.id || `nova-${index}`} className={parcela.bloqueada ? "bg-slate-100" : "bg-white"}><td className="p-2 font-black">{index + 1}/{parcelas.length}{parcela.bloqueada && <span className="ml-2 rounded bg-slate-300 px-2 py-1 text-[9px] text-slate-700">COM PAGAMENTO</span>}</td><td className="p-2"><input type="date" disabled={parcela.bloqueada} value={parcela.vencimento} onChange={(event) => setParcelas((atuais) => atuais.map((item, posicao) => posicao === index ? { ...item, vencimento: event.target.value } : item))} className="min-h-9 rounded-lg border border-slate-300 px-2 font-bold disabled:bg-slate-200"/></td><td className="p-2 text-right"><input type="text" inputMode="decimal" disabled={parcela.bloqueada} value={parcela.valorTexto ?? String(parcela.valor).replace(".", ",")} onChange={(event) => setParcelas((atuais) => atuais.map((item, posicao) => posicao === index ? { ...item, valor: parseBrazilianNumber(event.target.value), valorTexto: event.target.value } : item))} className="min-h-9 w-36 rounded-lg border border-slate-300 px-2 text-right font-mono font-black disabled:bg-slate-200"/></td><td className="p-2 text-center"><button type="button" disabled={parcela.bloqueada || parcelas.length <= 1} onClick={() => remover(index)} aria-label={`Remover parcela ${index + 1}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 text-[10px] font-black uppercase text-red-800 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={13}/> Remover</button></td></tr>)}</tbody></table></div>
    {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800"><AlertCircle size={15}/>{error}</div>}
    <div className="mt-3 flex flex-wrap justify-between gap-2"><div className="flex gap-2"><button type="button" disabled={parcelas.length >= 36} onClick={adicionar} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-black uppercase text-blue-800 disabled:opacity-40"><Plus size={15}/> Adicionar parcela</button><button type="button" onClick={() => setParcelas((atuais) => redistribuir(atuais))} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-black uppercase text-blue-800">Distribuir valores</button></div><div className="flex gap-2"><button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase">Voltar</button><button type="button" disabled={saving || !totalCorreto} onClick={() => void salvar()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"><Save size={15}/>{saving ? "Salvando..." : "Salvar parcelas"}</button></div></div>
  </div>;
}

function ResumoCompartilhavelOrdem({ ordem, onEditarVales, onEditarParcelas }: { ordem: OrdemCobranca; onEditarVales: () => void; onEditarParcelas: () => void }) {
  return <section aria-label="Resumo da ordem para compartilhamento" className="overflow-hidden rounded-2xl border-2 border-slate-400 bg-white shadow-sm">
    <div className="grid gap-3 border-b border-slate-300 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-4 text-white lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status da ordem #{ordem.numeroSequencial}</p><h3 className="truncate text-lg font-black uppercase" title={ordem.clienteNome}>{ordem.clienteNome}</h3><p className="mt-1 text-xs font-bold text-slate-300">CPF/CNPJ: {ordem.clienteDocumento || "NÃO INFORMADO"} · Emissão: {formatDate(ordem.dataEmissao)}</p></div>
      <div className="grid grid-cols-3 gap-2 text-right">
        <div className="rounded-lg bg-white/10 px-3 py-2"><span className="block text-[9px] font-black uppercase text-slate-300">Negociado</span><strong className="whitespace-nowrap font-mono text-sm">{formatCurrency(ordem.totalOriginal)}</strong></div>
        <div className="rounded-lg bg-emerald-500/20 px-3 py-2"><span className="block text-[9px] font-black uppercase text-emerald-200">Pago</span><strong className="whitespace-nowrap font-mono text-sm text-emerald-100">{formatCurrency(ordem.valorPago)}</strong></div>
        <div className="rounded-lg bg-amber-500/20 px-3 py-2"><span className="block text-[9px] font-black uppercase text-amber-200">Em aberto</span><strong className="whitespace-nowrap font-mono text-sm text-amber-100">{formatCurrency(ordem.saldo)}</strong></div>
      </div>
    </div>
    <div className="grid xl:grid-cols-[0.85fr_1.35fr]">
      <div className="border-b border-slate-300 xl:border-b-0 xl:border-r">
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3"><div><p className="text-[11px] font-black uppercase text-slate-800">Vales vinculados</p><p className="text-[9px] font-bold text-slate-500">{ordem.vales.length} documento(s)</p></div>{ordem.status === "aberta" && <button type="button" onClick={onEditarVales} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 text-[9px] font-black uppercase text-blue-800"><Edit3 size={12}/> Alterar</button>}</div>
        <div className="divide-y divide-slate-100">{ordem.vales.map((vale) => <div key={vale.id} className="grid grid-cols-[0.65fr_0.9fr_1fr] items-center gap-2 px-3 py-2 text-[11px]"><strong className="font-mono">Vale #{vale.numeroSequencial}</strong><span className="font-bold text-slate-600">{formatDate(vale.data)}</span><span className="text-right font-mono font-black">{formatCurrency(vale.valorVinculado)}</span></div>)}</div>
        <div className="grid grid-cols-[1fr_auto] border-t-2 border-slate-800 bg-slate-100 px-3 py-2 text-xs"><strong className="uppercase">Total dos vales</strong><strong className="font-mono">{formatCurrency(ordem.vales.reduce((total, vale) => total + Number(vale.valorVinculado), 0))}</strong></div>
      </div>
      <div>
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3"><p className="text-[11px] font-black uppercase text-slate-800">Parcelas</p><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-[9px] font-black ${statusClass[ordem.status]}`}>{statusLabel[ordem.status]}</span>{ordem.status === "aberta" && !ordem.parcelas.some(p => Number(p.valorRenegociado || 0) > 0) && <button type="button" onClick={onEditarParcelas} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 text-[9px] font-black uppercase text-blue-800"><Edit3 size={12}/> Alterar</button>}</div></div>
        <div className="divide-y divide-slate-100">{ordem.parcelas.map((parcela) => {
          const quitada = parcela.status === "paga" || Number(parcela.saldo) <= 0.005;
          const parcial = !quitada && Number(parcela.valorPago) > 0.005;
          const cor = quitada ? "border-l-4 border-emerald-500 bg-emerald-50/60" : parcial ? "border-l-4 border-blue-500 bg-blue-50/60" : "border-l-4 border-amber-500 bg-amber-50/40";
          return <div key={parcela.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[10px] ${cor}`}><strong className="text-xs">Parcela {parcela.numero}/{ordem.parcelas.length}</strong><span className="font-bold text-slate-600">{formatDate(parcela.vencimento)}</span><span className="font-mono">Valor: <strong>{formatCurrency(parcela.valor)}</strong></span><span aria-hidden="true" className="font-black text-slate-400">→</span><span className="font-mono text-emerald-800">Pago <strong>{formatCurrency(parcela.valorPago)}</strong></span>{Number(parcela.valorRenegociado || 0) > 0 && <span className="text-blue-800">Saldo renegociado: {formatCurrency(parcela.valorRenegociado!)}</span>}{!quitada && <span className="font-mono text-amber-900">Falta <strong>{formatCurrency(parcela.saldo)}</strong></span>}</div>;
        })}</div>
      </div>
    </div>
  </section>;
}

export function OrdemCobrancaDetalhesModal({ ordem, onClose, onChanged }: { ordem: OrdemCobranca; onClose: () => void; onChanged: (ordem: OrdemCobranca) => void }) {
  const gerente = useEhGerente();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [abaDetalhe, setAbaDetalhe] = useState<"parcelas" | "historico">("parcelas");
  const [encerramento, setEncerramento] = useState(false);
  const [pinEncerramento, setPinEncerramento] = useState("");
  const [motivoEncerramento, setMotivoEncerramento] = useState("");
  const [comprovante, setComprovante] = useState<ComprovanteRecebimento | null>(null);
  const [editandoVales, setEditandoVales] = useState(false);
  const [editandoParcelas, setEditandoParcelas] = useState(false);
  const [renegociandoId, setRenegociandoId] = useState<string | null>(null);
  const [demonstrativoAberto, setDemonstrativoAberto] = useState(false);
  const atualizarPagamentos = async () => {
    const atualizada = (await api.getOrdensCobranca(ordem.clienteId)).find((item) => item.id === ordem.id);
    if (!atualizada) throw new Error("Ordem não encontrada ao atualizar.");
    onChanged(atualizada);
  };
  const alocarPagamento = (valor: number) => {
    let restante = valor;
    const alocacoes: Array<{ vendaId: string; valor: number }> = [];
    for (const vale of ordem.vales) {
      const aplicar = Math.round(Math.min(restante, Number(vale.saldo), Number(vale.saldoAtualVale)) * 100) / 100;
      if (aplicar > 0) alocacoes.push({ vendaId: vale.vendaId, valor: aplicar });
      restante = Math.round((restante - Math.max(0, aplicar)) * 100) / 100;
    }
    return alocacoes;
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

  const abrirComprovanteSalvo = async (recebimentoId: string) => {
    setError("");
    try { setComprovante(await api.getComprovanteRecebimento(recebimentoId)); }
    catch (err: any) { setError(err.message || "Não foi possível abrir o comprovante."); }
  };

  const linkWhatsApp = whatsappUrl(ordem.clienteTelefone);

  return <>
  {demonstrativoAberto && <OrdemCobrancaDemonstrativoModal ordem={ordem} onClose={() => setDemonstrativoAberto(false)} />}
  {comprovante && <ComprovanteRecebimentoModal comprovante={comprovante} onClose={() => setComprovante(null)} />}
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
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 px-[10vw] py-[5vh] backdrop-blur-sm">
    <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-950 p-4 text-white"><div><p className="text-xs font-black text-slate-400">ORDEM DE COBRANÇA</p><h2 className="text-xl font-black">#{ordem.numeroSequencial} · {ordem.clienteNome}</h2><p className="mt-1 text-xs font-bold text-slate-300">CPF/CNPJ: {ordem.clienteDocumento || "NÃO INFORMADO"}</p><div className="mt-2 flex flex-wrap gap-2"><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusClass[ordem.status]}`}>{statusLabel[ordem.status]}</span><span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black">EMITIDA EM {formatDate(ordem.dataEmissao)}</span>{Number(ordem.saldoBonus) > 0.005 && <span className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-2 py-1 text-[10px] font-black text-white"><WalletCards size={13}/> BÔNUS {formatCurrency(ordem.saldoBonus)}</span>}</div></div><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setDemonstrativoAberto(true)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-[10px] font-black uppercase text-slate-950"><FileText size={15}/> Demonstrativo</button>{linkWhatsApp && <a href={linkWhatsApp} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-[10px] font-black uppercase text-white"><MessageCircle size={15}/> WhatsApp</a>}<button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20}/></button></div></header>
      <div className="space-y-4 overflow-y-auto bg-slate-100 p-4">
        {editandoVales ? <EditarValesOrdem ordem={ordem} onCancel={() => setEditandoVales(false)} onSaved={(atualizada) => { setEditandoVales(false); setFeedback("Vales da ordem atualizados e parcelas em aberto recalculadas."); onChanged(atualizada); }}/>
        : editandoParcelas ? <EditarParcelasOrdem ordem={ordem} onCancel={() => setEditandoParcelas(false)} onSaved={(atualizada) => { setEditandoParcelas(false); setFeedback("Parcelas da ordem atualizadas."); onChanged(atualizada); }}/>
        : (
          <ResumoCompartilhavelOrdem ordem={ordem} onEditarVales={() => { setError(""); setFeedback(""); setEditandoParcelas(false); setEditandoVales(true); }} onEditarParcelas={() => { setError(""); setFeedback(""); setEditandoVales(false); setEditandoParcelas(true); }}/>
        )}

        {renegociandoId && ordem.parcelas.find(p => p.id === renegociandoId) && <RenegociarSaldoOrdem key={renegociandoId} ordem={ordem} origem={ordem.parcelas.find(p => p.id === renegociandoId)!} onClose={() => setRenegociandoId(null)} onSaved={o => { setRenegociandoId(null); onChanged(o); }}/>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setAbaDetalhe("parcelas")} className={`rounded-lg px-3 py-2 text-xs font-bold ${abaDetalhe === "parcelas" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>Parcelas e pagamentos</button>
          <button type="button" onClick={() => setAbaDetalhe("historico")} className={`rounded-lg px-3 py-2 text-xs font-bold ${abaDetalhe === "historico" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>Histórico da ordem</button>
        </div>
        {abaDetalhe === "parcelas" ? <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
          <table className="w-full min-w-[1000px] text-xs">
            <thead className="bg-slate-900 text-left text-[10px] text-white"><tr><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2">Previsto</th><th className="p-2">Pago</th><th className="p-2">Data</th><th className="p-2">Pagamento</th><th className="p-2">Forma de pagamento</th><th className="p-2">Status</th><th className="p-2 text-right">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-200">{ordem.parcelas.flatMap((parcela) => {
              const pagamentos = parcela.pagamentos?.length ? parcela.pagamentos : [undefined];
              return pagamentos.map((pagamento, index) => <LinhaPagamento key={`${parcela.id}-${pagamento?.id || "novo"}`}
                pagamento={pagamento} clienteId={ordem.clienteId} clienteNome={ordem.clienteNome} clienteDocumento={ordem.clienteDocumento}
                saldo={index === 0 ? Number(parcela.saldo) : 0} alocar={valor => alocarPagamento(Math.min(valor, Number(parcela.saldo)))} parcelaOrdemId={parcela.id}
                referencia={`parcela ${parcela.numero}/${ordem.parcelas.length}${index ? " · recebimento anterior " + index : ""}`}
                formaPagamentoPrevista={parcela.formaPagamentoPrevista} statusSemPagamento={parcela.status === "renegociada" ? "Saldo renegociado" : undefined} editavel={(pagamento ? gerente : Number(parcela.saldo) > 0.005) && ["aberta", "quitada"].includes(ordem.status)} colunasAntes={4}
                alvoReabertura={{ tipo: "recebimento", id: pagamento?.id || "" }} onSaved={atualizarPagamentos} onComprovante={(id) => void abrirComprovanteSalvo(id)}>
                <td className="p-2 font-bold">{parcela.numero}/{ordem.parcelas.length}{index === 0 && gerente && parcela.saldo > 0.005 && <button type="button" onClick={() => setRenegociandoId(parcela.id)} className="mt-1 block text-[10px] text-blue-800 underline">Renegociar saldo</button>}{index > 0 && <span className="block text-[9px] text-slate-500">Recebimento anterior</span>}</td>
                <td className="p-2">{index === 0 ? formatDate(parcela.vencimento) : "—"}</td>
                <td className="p-2 font-mono">{index === 0 ? formatCurrency(parcela.valor) : "—"}</td>
                <td className="p-2 font-mono text-emerald-800">{index === 0 ? formatCurrency(parcela.valorPago) : "—"}</td>
              </LinhaPagamento>);
            })}</tbody>
          </table>
        </div> : <div className="divide-y divide-slate-200 rounded-xl border border-slate-300 bg-white">
          {(ordem.eventos || []).map((evento) => <div key={evento.id} className="flex gap-3 px-3 py-2 text-[11px] leading-5"><span className="shrink-0 font-mono text-slate-500">{formatDate(evento.data)}</span><p className={evento.tipo === "estorno" ? "text-red-700" : "text-slate-700"}>{evento.texto}</p></div>)}
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
  const [ordenacao, setOrdenacao] = useState<"numero_desc" | "numero_asc" | "valor_desc" | "valor_asc">("numero_desc");

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
  const filtradasOrdenadas = useMemo(() => [...filtradas].sort((a, b) => {
    if (ordenacao === "numero_asc") return Number(a.numeroSequencial) - Number(b.numeroSequencial);
    if (ordenacao === "valor_desc") return Number(b.totalOriginal) - Number(a.totalOriginal) || Number(b.numeroSequencial) - Number(a.numeroSequencial);
    if (ordenacao === "valor_asc") return Number(a.totalOriginal) - Number(b.totalOriginal) || Number(b.numeroSequencial) - Number(a.numeroSequencial);
    return Number(b.numeroSequencial) - Number(a.numeroSequencial);
  }), [filtradas, ordenacao]);

  const atualizar = (ordem: OrdemCobranca) => { setDetalhada(ordem); void carregar(); };

  return <div className="space-y-4">
    {detalhada && <OrdemCobrancaDetalhesModal ordem={detalhada} onClose={() => setDetalhada(null)} onChanged={atualizar}/>}
    <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[0.8fr_1.5fr_1fr_1fr_1fr_1fr_auto] xl:items-end"><label className="text-[10px] font-black uppercase text-slate-600">Nº do vale<input inputMode="numeric" value={numeroVale} onChange={(event) => setNumeroVale(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ex.: 123" className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Cliente<select value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="">Todos os clientes</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label><label className="text-[10px] font-black uppercase text-slate-600">Data início<input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Data fim<input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="aberta">Em aberto</option><option value="quitada">Quitadas</option><option value="renegociada">Renegociadas</option><option value="cancelada">Canceladas</option><option value="todas">Todas</option></select></label><label className="text-[10px] font-black uppercase text-slate-600">Ordenar por<select value={ordenacao} onChange={(event) => setOrdenacao(event.target.value as typeof ordenacao)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="numero_desc">Nº da ordem (maior)</option><option value="numero_asc">Nº da ordem (menor)</option><option value="valor_desc">Valor (maior)</option><option value="valor_asc">Valor (menor)</option></select></label><button type="button" onClick={() => void carregar()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-black uppercase"><RefreshCw size={15}/> Atualizar</button></div></div>
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center font-bold text-slate-500">Carregando ordens...</div> : error ? <div className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 font-bold text-red-800"><AlertCircle size={18}/>{error}</div> : filtradasOrdenadas.length === 0 ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-10 text-center"><FileClock className="mx-auto text-blue-600" size={34}/><p className="mt-3 font-black text-blue-950">Nenhuma ordem neste filtro</p></div> : <div className="grid gap-3">{filtradasOrdenadas.map((ordem) => {
      const proxima = ordem.parcelas.find((parcela) => parcela.status === "pendente");
      return <article key={ordem.id} className="grid gap-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm lg:grid-cols-[0.55fr_1.5fr_0.8fr_0.8fr_0.9fr_auto] lg:items-center"><div><p className="text-[10px] font-black uppercase text-slate-500">Ordem</p><p className="font-mono text-lg font-black">#{ordem.numeroSequencial}</p><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusClass[ordem.status]}`}>{statusLabel[ordem.status]}</span></div><div><p className="text-[10px] font-black uppercase text-slate-500">Cliente</p><p className="font-black uppercase text-slate-950">{ordem.clienteNome}</p><p className="text-[10px] font-bold text-slate-500">CPF/CNPJ: {ordem.clienteDocumento || "NÃO INFORMADO"}</p><p className="text-xs font-bold text-slate-500">{ordem.vales.length} vale(s) · {ordem.parcelas.length} parcela(s)</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Negociado</p><p className="font-mono font-black">{formatCurrency(ordem.totalOriginal)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Pago</p><p className="font-mono font-black text-emerald-800">{formatCurrency(ordem.valorPago)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Próximo pagamento</p>{proxima ? <><p className="inline-flex items-center gap-1 font-black text-amber-900"><CalendarClock size={14}/>{formatDate(proxima.vencimento)}</p><p className="font-mono text-xs font-black">{formatCurrency(proxima.saldo)}</p></> : <p className="inline-flex items-center gap-1 font-black text-emerald-800"><CheckCircle2 size={15}/>Concluída</p>}</div><div className="flex justify-end"><button type="button" onClick={() => setDetalhada(ordem)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-[10px] font-black uppercase text-white"><Eye size={14}/> Detalhes</button></div></article>;
    })}</div>}
  </div>;
}
