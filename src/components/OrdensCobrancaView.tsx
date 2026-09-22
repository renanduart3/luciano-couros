import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Coins, Edit3, Eye, FileClock, FileText, History, ListChecks, MessageCircle, Plus, RefreshCw, Save, ShieldCheck, Trash2, WalletCards, X } from "lucide-react";
import { RecebimentoDetalhesModal } from "./RecebimentoDetalhesModal";
import { ValeDetalhesModal } from "./ValeDetalhesModal";
import { api } from "../lib/api";
import { ComprovanteRecebimento, OrdemCobranca, TituloRecebimento, Venda } from "../types";
import { formatCurrency, formatDate, parseBrazilianNumber, todayLocalIso, whatsappUrl } from "../lib/utils";
import { ehTituloPagamento, FORMAS_PAGAMENTO } from "../lib/pagamentos";
import { ConfirmarAcaoPagamentosOrdem } from "./ConfirmarAcaoPagamentosOrdem";
import { financeiroOrdem } from "../lib/financeiro";
import { resumoRecebimentos } from "../lib/resumoRecebimentos";
import { situacaoAgendaOrdem } from "../lib/situacaoOrdem";
import { ItemAcaoPagamentoOrdem } from "../types";
import { LinhaPagamento } from "./LinhaPagamento";
import { useEhGerente } from "../auth/AuthContext";
import { ParcelamentoCartaoSelect, ResumoParcelamentoCartao } from "./ParcelamentoCartaoSelect";
import { TitulosPagamentoEditor } from "./TitulosPagamentoEditor";
import { ComprovanteRecebimentoModal } from "./ComprovanteRecebimentoModal";
import { OrdemCobrancaDemonstrativoModal } from "./OrdemCobrancaDemonstrativoModal";

interface Props {
  refreshKey?: number;
  onChanged?: (ordem: OrdemCobranca) => void;
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
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase text-blue-900">Editar vales da ordem</p><p className="mt-1 text-xs font-bold text-blue-700">Marque os vales que devem permanecer agrupados. O montante e o saldo serão atualizados.</p></div><strong className="font-mono text-lg text-blue-950">{formatCurrency(totalSelecionado)}</strong></div>
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

function ResumoCompartilhavelOrdem({ ordem, onEditarVales, onOpenVale, onOpenPagamento }: { ordem: OrdemCobranca; onEditarVales: () => void; onOpenVale: (id: string) => void; onOpenPagamento: (id: string) => void }) {
  const financeiro = financeiroOrdem(ordem);
  const resumo = resumoRecebimentos(ordem.pagamentos || []);
  const planejado = (ordem.projecoes || []).reduce((s, p) => s + Math.round((Number(p.dados.valorRecebido) + Number(p.dados.bonusUtilizado || 0)) * 100), 0) / 100;
  return <section aria-label="Resumo da ordem para compartilhamento" className="overflow-hidden rounded-2xl border-2 border-slate-400 bg-white shadow-sm">
    <div className="grid gap-3 border-b border-slate-300 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-4 text-white lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status da ordem #{ordem.numeroSequencial}</p><h3 className="truncate text-lg font-black uppercase" title={ordem.clienteNome}>{ordem.clienteNome}</h3><p className="mt-1 text-xs font-bold text-slate-300">CPF/CNPJ: {ordem.clienteDocumento || "NÃO INFORMADO"} · Emissão: {formatDate(ordem.dataEmissao)}</p></div>
      <div className="grid grid-cols-3 gap-2 text-right">
        <div className="rounded-lg bg-white/10 px-3 py-2"><span className="block text-[9px] font-black uppercase text-slate-300">Negociado</span><strong className="whitespace-nowrap font-mono text-sm">{formatCurrency(ordem.totalOriginal)}</strong></div>
        <div className="rounded-lg bg-emerald-500/20 px-3 py-2"><span className="block text-[9px] font-black uppercase text-emerald-200">Recebido</span><strong className="whitespace-nowrap font-mono text-sm text-emerald-100">{formatCurrency(financeiroOrdem(ordem).recebido)}</strong></div>
        <div className="rounded-lg bg-amber-500/20 px-3 py-2"><span className="block text-[9px] font-black uppercase text-amber-200">Restante</span><strong className="whitespace-nowrap font-mono text-sm text-amber-100">{formatCurrency(financeiroOrdem(ordem).restante)}</strong></div>
      </div>
    </div>
    <div className="border-b border-slate-300 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">Valores dos recebimentos vinculados</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 text-xs">
        <div><p className="text-slate-600">Aguardando</p><strong className="font-mono text-amber-800">{formatCurrency(financeiro.aguardando)}</strong></div>
        <div><p className="text-slate-600">Planejado · não recebido</p><strong className="font-mono text-blue-800">{formatCurrency(planejado)}</strong></div>
        <div><p className="text-slate-600">Excedente em bônus</p><strong className="font-mono text-violet-800">{formatCurrency(financeiro.bonus)}</strong></div>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Planejamentos e títulos aguardando não entram em Recebido. A compensação ocorre automaticamente no vencimento.{resumo.bonusUtilizado > 0 && ` Bônus utilizado: ${formatCurrency(resumo.bonusUtilizado)} (crédito anterior).`}</p>
      {(ordem.pagamentos || []).some(p => p.status === "ativo" && p.valorAplicadoOrdem !== undefined && p.valorAplicado > p.valorAplicadoOrdem + 0.005) && <p className="mt-1 text-[10px] text-slate-600">Há recebimentos compartilhados com outros vales ou ordens. Os cards mostram somente a parte desta ordem.</p>}
    </div>
    <div className="grid xl:grid-cols-[0.85fr_1.35fr]">
      <div className="border-b border-slate-300 xl:border-b-0 xl:border-r">
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3"><div><p className="text-[11px] font-black uppercase text-slate-800">Vales vinculados</p><p className="text-[9px] font-bold text-slate-500">{ordem.vales.length} documento(s)</p></div>{ordem.status === "aberta" && <button type="button" onClick={onEditarVales} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 text-[9px] font-black uppercase text-blue-800"><Edit3 size={12}/> Alterar</button>}</div>
        <div className="divide-y divide-slate-100">{ordem.vales.map((vale) => <div key={vale.id} className="grid grid-cols-[0.65fr_0.9fr_1fr] items-center gap-2 px-3 py-2 text-[11px]"><button type="button" onClick={() => onOpenVale(vale.vendaId)} className="text-left font-mono font-bold text-blue-700 underline">Vale #{vale.numeroSequencial}</button><span className="font-bold text-slate-600">{formatDate(vale.data)}</span><span className="text-right font-mono font-black">{formatCurrency(vale.valorVinculado)}</span></div>)}</div>
        <div className="grid grid-cols-[1fr_auto] border-t-2 border-slate-800 bg-slate-100 px-3 py-2 text-xs"><strong className="uppercase">Total dos vales</strong><strong className="font-mono">{formatCurrency(ordem.vales.reduce((total, vale) => total + Number(vale.valorVinculado), 0))}</strong></div>
      </div>
      <div className="divide-y divide-slate-200">
        <p className="bg-slate-50 px-3 py-2 text-xs font-bold">Pagamentos</p>
        {(ordem.pagamentos || []).map(p => <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-x-3 gap-y-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
          <button type="button" onClick={() => onOpenPagamento(p.id)} className="text-left text-blue-700 underline">{formatDate(p.data)} · {FORMAS_PAGAMENTO.find(f => f.value === p.formaPagamento)?.label || p.formaPagamento}{p.formaPagamento === 'cartao_credito' && ` · ${p.parcelasCartao}x`}</button>
          <strong className="whitespace-nowrap text-right font-mono tabular-nums">{formatCurrency(p.valorRecebido + p.bonusUtilizado)}</strong>
          <span className={`col-span-2 text-left sm:col-span-1 ${p.statusPagamento === 'compensado' ? 'text-emerald-800' : 'text-amber-800'}`}>{p.statusPagamento === 'compensado' ? 'Confirmado' : p.statusPagamento === 'recusado' ? 'Recusado' : 'Aguardando'}</span>
        </div>)}
        {!ordem.pagamentos?.length && <p className="px-3 py-2 text-xs text-slate-500">Nenhum pagamento registrado.</p>}
      </div>
    </div>
  </section>;
}

export function OrdemCobrancaDetalhesModal({ ordem, onClose, onChanged, recebimentoDestaque }: { recebimentoDestaque?: string; ordem: OrdemCobranca; onClose: () => void; onChanged: (ordem: OrdemCobranca) => void }) {
  const gerente = useEhGerente();
  const pagamentosRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!recebimentoDestaque) return;
    const linha = Array.from<HTMLTableRowElement>(pagamentosRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-recebimento-id]") || [])
      .find(item => item.dataset.recebimentoId === recebimentoDestaque);
    linha?.scrollIntoView({ block: "center" });
    linha?.focus({ preventScroll: true });
  }, [recebimentoDestaque]);
  const [recebimentoAberto, setRecebimentoAberto] = useState<string | null>(null);
  const [valeAberto, setValeAberto] = useState<Venda | null>(null);
  const abrirVale = async (id: string) => { try { setValeAberto(await api.getVenda(id)); } catch (e: any) { setError(e.message); } };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [abaDetalhe, setAbaDetalhe] = useState<"parcelas" | "historico">("parcelas");
  const [encerramento, setEncerramento] = useState(false);
  const [pinEncerramento, setPinEncerramento] = useState("");
  const [motivoEncerramento, setMotivoEncerramento] = useState("");
  const [comprovante, setComprovante] = useState<ComprovanteRecebimento | null>(null);
  const [editandoVales, setEditandoVales] = useState(false);
  const [novoPagamento, setNovoPagamento] = useState(false);
  const [demonstrativoAberto, setDemonstrativoAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<ItemAcaoPagamentoOrdem[]>([]);
  const [acao, setAcao] = useState<{ acao: "estornar" | "excluir"; itens: ItemAcaoPagamentoOrdem[] } | null>(null);
  const [edicoes, setEdicoes] = useState<Set<string>>(new Set());
  const marcarEdicao = (id: string, valor: boolean) => setEdicoes(atuais => {
    if (atuais.has(id) === valor) return atuais;
    const n = new Set(atuais); if (valor) n.add(id); else n.delete(id); return n;
  });
  const abrirAcao = (pedido: { acao: "estornar" | "excluir"; itens: ItemAcaoPagamentoOrdem[] }) => { if (edicoes.size) { setError("Salve ou cancele a edição antes desta ação."); return; } setError(""); setAcao(pedido); };
  const alternar = (item: ItemAcaoPagamentoOrdem) => setSelecionados(atual => atual.some(i => i.id === item.id) ? atual.filter(i => i.id !== item.id) : [...atual, item]);
  const podeGerenciar = gerente && ["aberta", "quitada"].includes(ordem.status);
  const aplicarAtualizacao = (atualizada: OrdemCobranca) => { setSelecionados([]); setAcao(null); setEdicoes(new Set()); onChanged(atualizada); };
  const atualizarPagamentos = async (resultado?: { estornado: boolean; ordem?: OrdemCobranca }) => {
    const atualizada = resultado?.ordem || (await api.getOrdensCobranca(ordem.clienteId)).find((item) => item.id === ordem.id);
    if (!atualizada) throw new Error("Ordem não encontrada ao atualizar.");
    aplicarAtualizacao(atualizada);
    setNovoPagamento(false);
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

  if (valeAberto) return <ValeDetalhesModal vale={valeAberto} onUpdated={ordem.status === "aberta" ? undefined : atualizado => { setValeAberto(atualizado); void api.getOrdensCobranca(ordem.clienteId).then(lista => { const atual = lista.find(o => o.id === ordem.id); if (atual) onChanged(atual); }).catch(e => setError(e.message)); }} ordemCobranca={ordem} onOpenOrdem={() => setValeAberto(null)} onClose={() => setValeAberto(null)} />;
  return <>
  {recebimentoAberto && <RecebimentoDetalhesModal ordemContextoId={ordem.id} recebimentoId={recebimentoAberto} onClose={() => setRecebimentoAberto(null)} onSaved={atualizarPagamentos} onComprovante={id => { setRecebimentoAberto(null); void abrirComprovanteSalvo(id); }} />}
  {demonstrativoAberto && <OrdemCobrancaDemonstrativoModal ordem={ordem} onOpenOrdem={() => setDemonstrativoAberto(false)} onClose={() => setDemonstrativoAberto(false)} />}
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
        {editandoVales ? <EditarValesOrdem ordem={ordem} onCancel={() => setEditandoVales(false)} onSaved={(atualizada) => { setEditandoVales(false); setFeedback("Vales e saldo da ordem atualizados."); onChanged(atualizada); }}/>
        : (
          <ResumoCompartilhavelOrdem onOpenVale={id => void abrirVale(id)} onOpenPagamento={setRecebimentoAberto} ordem={ordem} onEditarVales={() => { setError(""); setFeedback(""); setEditandoVales(true); }}/>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={() => setAbaDetalhe("parcelas")} className={`rounded-lg px-3 py-2 text-xs font-bold ${abaDetalhe === "parcelas" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>Pagamentos</button>
          <button type="button" onClick={() => setAbaDetalhe("historico")} className={`rounded-lg px-3 py-2 text-xs font-bold ${abaDetalhe === "historico" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>Histórico da ordem</button>
        </div>
        {abaDetalhe === "parcelas" ? <div className="space-y-2">
          {acao && <ConfirmarAcaoPagamentosOrdem ordemId={ordem.id} acao={acao.acao} itens={acao.itens} onCancel={() => setAcao(null)} onSaved={aplicarAtualizacao}/>}
          <div className="flex flex-wrap justify-end gap-2">
            {podeGerenciar && <><button disabled={!!acao || edicoes.size > 0} onClick={() => setSelecionados([...(ordem.pagamentos || []).map(p => ({ tipo: "recebimento" as const, id: p.id })), ...(ordem.projecoes || []).map(p => ({ tipo: "projecao" as const, id: p.id }))])} className="rounded border px-2 py-1 text-xs">Selecionar todos</button>
            <button disabled={!!acao || edicoes.size > 0 || !selecionados.length || selecionados.some(i => i.tipo === "projecao")} onClick={() => abrirAcao({ acao: "estornar", itens: selecionados })} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Estornar selecionados</button>
            <button disabled={!!acao || edicoes.size > 0 || !selecionados.length} onClick={() => abrirAcao({ acao: "excluir", itens: selecionados })} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-40">Excluir selecionados</button></>}
          <button type="button" disabled={!!acao || edicoes.size > 0 || novoPagamento || ordem.saldo <= 0.005 || ordem.status !== 'aberta'} onClick={() => setNovoPagamento(true)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Adicionar pagamento</button></div>
          <div ref={pagamentosRef} className="overflow-x-auto rounded-xl border border-slate-300 bg-white"><table className="payments-table w-full min-w-[700px] text-left text-xs">
            <thead><tr><th className="w-8 p-2"><span className="sr-only">Selecionar</span></th>{['Data', 'Valor', 'Recebido', 'Forma de pagamento', 'Situação', 'Ações'].map(t => <th data-label={t} key={t} className="p-2">{t}</th>)}</tr></thead>
            <tbody>
              {novoPagamento && <LinhaPagamento key="novo" iniciarEditando colunasAntes={1} onEditingChange={v => marcarEdicao("novo", v)} clienteId={ordem.clienteId} clienteNome={ordem.clienteNome}
                clienteDocumento={ordem.clienteDocumento} saldo={ordem.saldo} alocar={alocarPagamento} ordemCobrancaId={ordem.id}
                referencia={`ordem #${ordem.numeroSequencial}`} onSaved={atualizarPagamentos} onCancel={() => { marcarEdicao("novo", false); setNovoPagamento(false); }}><td/></LinhaPagamento>}
              {!!ordem.projecoes?.length && <tr className="bg-blue-50"><th colSpan={7} className="p-2 text-left text-xs text-blue-900">Planejado · ainda não recebido</th></tr>}
              {(ordem.projecoes || []).map(p => <LinhaPagamento key={p.id} projecao={p} colunasAntes={1}
                clienteId={ordem.clienteId} clienteNome={ordem.clienteNome} clienteDocumento={ordem.clienteDocumento}
                saldo={ordem.saldo} alocar={alocarPagamento} onDetalhes={setRecebimentoAberto} ordemCobrancaId={ordem.id} referencia={`previsão ${p.id.slice(0, 8)}`}
                editavel={podeGerenciar && !acao} onEditingChange={v => marcarEdicao(p.id, v)} onSaved={atualizarPagamentos}
                onExcluir={() => abrirAcao({ acao: "excluir", itens: [{ tipo: "projecao", id: p.id }] })}>
                <td className="p-2"><input type="checkbox" aria-label="Selecionar previsão" disabled={!podeGerenciar || !!acao || edicoes.size > 0} checked={selecionados.some(i => i.id === p.id)} onChange={() => alternar({ tipo: "projecao", id: p.id })}/></td>
              </LinhaPagamento>)}
              {!!ordem.pagamentos?.length && <tr className="bg-slate-100"><th colSpan={7} className="p-2 text-left text-xs text-slate-700">Recebimentos registrados</th></tr>}
              {[...(ordem.pagamentos || [])].reverse().map(p => <LinhaPagamento key={p.id} pagamento={p} colunasAntes={1} onEditingChange={v => marcarEdicao(p.id, v)} clienteId={ordem.clienteId}
              clienteNome={ordem.clienteNome} clienteDocumento={ordem.clienteDocumento} saldo={0} alocar={alocarPagamento}
              onDetalhes={setRecebimentoAberto} ordemCobrancaId={ordem.id} referencia={`ordem #${ordem.numeroSequencial}`} editavel={podeGerenciar && !acao} onEstornar={() => abrirAcao({ acao: "estornar", itens: [{ tipo: "recebimento", id: p.id }] })} onExcluir={() => abrirAcao({ acao: "excluir", itens: [{ tipo: "recebimento", id: p.id }] })}
              onSaved={atualizarPagamentos} onComprovante={id => void abrirComprovanteSalvo(id)}><td className="p-2"><input type="checkbox" aria-label="Selecionar pagamento" disabled={!podeGerenciar || !!acao || edicoes.size > 0} checked={selecionados.some(i => i.id === p.id)} onChange={() => alternar({ tipo: "recebimento", id: p.id })}/></td></LinhaPagamento>)}

            </tbody>
          </table></div>
          <p className="text-right text-xs font-bold text-amber-900">Restante: {formatCurrency(financeiroOrdem(ordem).restante)}</p>
        </div> : <div className="divide-y divide-slate-200 rounded-xl border border-slate-300 bg-white">
          {ordem.parcelas.length > 0 && <details className="px-3 py-2 text-xs"><summary className="cursor-pointer font-bold">Parcelamento anterior (somente consulta)</summary>{ordem.parcelas.map(p => <p key={p.id} className="mt-1">Parcela {p.numero} · {formatDate(p.vencimento)} · {formatCurrency(p.valor)}</p>)}</details>}
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

export function OrdensCobrancaView({ refreshKey, onChanged }: Props) {
  const [ordens, setOrdens] = useState<OrdemCobranca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("aberta");
  const [numeroVale, setNumeroVale] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhadaId, setDetalhadaId] = useState<string | null>(null);
  const detalhada = ordens.find(o => o.id === detalhadaId) || null;
  const cargaVersao = useRef(0);
  const [ordenacao, setOrdenacao] = useState<"numero_desc" | "numero_asc" | "valor_desc" | "valor_asc">("numero_desc");

  const carregar = async () => {
    setLoading(true);
    setError("");
    const versao = ++cargaVersao.current;
    try { const lista = await api.getOrdensCobranca(); if (versao === cargaVersao.current) setOrdens(lista); }
    catch (err: any) { if (versao === cargaVersao.current) setError(err.message || "Não foi possível carregar as ordens."); }
    finally { if (versao === cargaVersao.current) setLoading(false); }
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

  const atualizar = (ordem: OrdemCobranca) => {
    const versao = ++cargaVersao.current;
    setLoading(false); setError("");
    setOrdens(lista => lista.map(o => o.id === ordem.id ? ordem : o));
    onChanged?.(ordem);
    // Um recebimento compartilhado pode alterar outras ordens da lista.
    api.getOrdensCobranca().then(lista => {
      if (versao === cargaVersao.current) setOrdens(lista);
    }).catch(err => {
      if (versao === cargaVersao.current) setError(err.message || "Atualize a lista para conferir as demais ordens.");
    });
  };

  return <div className="space-y-4">
    {detalhada && <OrdemCobrancaDetalhesModal ordem={detalhada} onClose={() => setDetalhadaId(null)} onChanged={atualizar}/>}
    <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[0.8fr_1.5fr_1fr_1fr_1fr_1fr_auto] xl:items-end"><label className="text-[10px] font-black uppercase text-slate-600">Nº do vale<input inputMode="numeric" value={numeroVale} onChange={(event) => setNumeroVale(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ex.: 123" className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Cliente<select value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="">Todos os clientes</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</select></label><label className="text-[10px] font-black uppercase text-slate-600">Data início<input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Data fim<input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="aberta">Em aberto</option><option value="quitada">Quitadas</option><option value="renegociada">Renegociadas</option><option value="cancelada">Canceladas</option><option value="todas">Todas</option></select></label><label className="text-[10px] font-black uppercase text-slate-600">Ordenar por<select value={ordenacao} onChange={(event) => setOrdenacao(event.target.value as typeof ordenacao)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="numero_desc">Nº da ordem (maior)</option><option value="numero_asc">Nº da ordem (menor)</option><option value="valor_desc">Valor (maior)</option><option value="valor_asc">Valor (menor)</option></select></label><button type="button" onClick={() => void carregar()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-black uppercase"><RefreshCw size={15}/> Atualizar</button></div></div>
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center font-bold text-slate-500">Carregando ordens...</div> : error ? <div className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 font-bold text-red-800"><AlertCircle size={18}/>{error}</div> : filtradasOrdenadas.length === 0 ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-10 text-center"><FileClock className="mx-auto text-blue-600" size={34}/><p className="mt-3 font-black text-blue-950">Nenhuma ordem neste filtro</p></div> : <div className="grid gap-3">{filtradasOrdenadas.map((ordem) => {
      const agenda = situacaoAgendaOrdem(ordem);
      return <article key={ordem.id} className="grid gap-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm lg:grid-cols-[0.5fr_1.3fr_0.7fr_0.7fr_0.7fr_0.9fr_auto] lg:items-center"><div><p className="text-[10px] font-black uppercase text-slate-500">Ordem</p><p className="font-mono text-lg font-black">#{ordem.numeroSequencial}</p><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusClass[ordem.status]}`}>{statusLabel[ordem.status]}</span></div><div><p className="text-[10px] font-black uppercase text-slate-500">Cliente</p><p className="font-black uppercase text-slate-950">{ordem.clienteNome}</p><p className="text-[10px] font-bold text-slate-500">CPF/CNPJ: {ordem.clienteDocumento || "NÃO INFORMADO"}</p><p className="text-xs font-bold text-slate-500">{ordem.vales.length} vale(s) · {ordem.pagamentos?.length || 0} pagamento(s)</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Negociado</p><p className="font-mono font-black">{formatCurrency(ordem.totalOriginal)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Recebido</p><p className="font-mono font-black text-emerald-800">{formatCurrency(financeiroOrdem(ordem).recebido)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Restante</p><p className="font-mono font-black text-amber-800">{formatCurrency(financeiroOrdem(ordem).restante)}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">{agenda.titulo}</p>{agenda.vencimento ? <><p className="inline-flex items-center gap-1 font-black text-amber-900"><CalendarClock size={14}/>{formatDate(agenda.vencimento)}</p><p className="font-mono text-xs font-black">{formatCurrency(agenda.valor || 0)}</p></> : <p className="inline-flex items-center gap-1 font-black text-emerald-800"><CheckCircle2 size={15}/>{agenda.texto}</p>}</div><div className="flex justify-end"><button type="button" onClick={() => setDetalhadaId(ordem.id)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-[10px] font-black uppercase text-white"><Eye size={14}/> Detalhes</button></div></article>;
    })}</div>}
  </div>;
}
