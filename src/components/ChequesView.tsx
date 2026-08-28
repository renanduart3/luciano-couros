import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Ban, CalendarCheck2, CheckCircle2, Edit3, Eye, Loader2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useEhGerente } from "../auth/AuthContext";
import { api } from "../lib/api";
import { formatCurrency, formatDate, todayLocalIso } from "../lib/utils";
import { ChequeGerencial, PagamentoGerenciavel } from "../types";
import { EditarPagamentoModal } from "./EditarPagamentoModal";
import { Pagination, paginate } from "./Pagination";

type Filtro = "aguardando" | "compensados_hoje" | "compensados" | "recusados" | "todos";
type Acao = { cheque: ChequeGerencial; status: "compensado" | "recusado" };

const PAGE_SIZE = 10;
const hojeIso = todayLocalIso;

const classeStatus = (status: ChequeGerencial["status"], vencimento: string) => {
  if (status === "recusado") return "bg-red-100 text-red-800";
  if (status === "compensado") return "bg-emerald-100 text-emerald-800";
  if (vencimento < hojeIso()) return "bg-red-100 text-red-800";
  if (vencimento === hojeIso()) return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-900";
};

const textoStatus = (cheque: ChequeGerencial) => {
  if (cheque.status === "recusado") return "RECUSADO";
  if (cheque.status === "compensado") return "COMPENSADO";
  if (cheque.vencimento < hojeIso()) return "VENCIDO · AGUARDANDO";
  if (cheque.vencimento === hojeIso()) return "VENCE HOJE";
  return "AGUARDANDO";
};

export function ChequesView({ onOpenVale, onOpenOrdem, onChanged }: {
  onOpenVale: (vendaId: string) => void;
  onOpenOrdem: (ordemId: string) => void;
  onChanged?: () => void;
}) {
  const gerente = useEhGerente();
  const [cheques, setCheques] = useState<ChequeGerencial[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("aguardando");
  const [busca, setBusca] = useState("");
  const [vencimentoInicio, setVencimentoInicio] = useState("");
  const [vencimentoFim, setVencimentoFim] = useState("");
  const [page, setPage] = useState(1);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [pin, setPin] = useState("");
  const [dataCompensacao, setDataCompensacao] = useState(hojeIso());
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    setErro("");
    try { setCheques(await api.getCheques()); }
    catch (error: any) { setErro(error.message || "Não foi possível carregar os cheques."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void carregar(); }, []);
  useEffect(() => { setPage(1); }, [filtro, busca, vencimentoInicio, vencimentoFim]);

  const filtrados = useMemo(() => cheques.filter((cheque) => {
    if (filtro === "aguardando" && cheque.status !== "aguardando") return false;
    if (filtro === "compensados_hoje" && (cheque.status !== "compensado" || cheque.dataCompensacao !== hojeIso())) return false;
    if (filtro === "compensados" && cheque.status !== "compensado") return false;
    if (filtro === "recusados" && cheque.status !== "recusado") return false;
    if (vencimentoInicio && cheque.vencimento < vencimentoInicio) return false;
    if (vencimentoFim && cheque.vencimento > vencimentoFim) return false;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return true;
    return [cheque.clienteNome, cheque.clienteDocumento, cheque.nomeTitular, cheque.cpfTitular, cheque.cpfTerceiro, cheque.numeroCheque,
      ...cheque.vales.map((vale) => String(vale.numeroSequencial)), ...cheque.ordens.map((ordem) => String(ordem.numeroSequencial))]
      .some((valor) => String(valor || "").toLocaleLowerCase("pt-BR").includes(termo));
  }), [cheques, filtro, busca, vencimentoInicio, vencimentoFim]);

  const totais = useMemo(() => {
    const aguardando = cheques.filter((cheque) => cheque.status === "aguardando");
    const compensadosHoje = cheques.filter((cheque) => cheque.status === "compensado" && cheque.dataCompensacao === hojeIso());
    const recusados = cheques.filter((cheque) => cheque.status === "recusado");
    return {
      aguardando: aguardando.length,
      valorAguardando: aguardando.reduce((total, cheque) => total + Number(cheque.valorRecebido), 0),
      compensadosHoje: compensadosHoje.length,
      valorCompensadoHoje: compensadosHoje.reduce((total, cheque) => total + Number(cheque.valorRecebido), 0),
      recusados: recusados.length,
    };
  }, [cheques]);

  const abrirAcao = (cheque: ChequeGerencial, status: Acao["status"]) => {
    setAcao({ cheque, status });
    setPin("");
    setMotivo("");
    setDataCompensacao(hojeIso());
    setErro("");
  };

  const confirmarAcao = async () => {
    if (!acao || pin.length < 4) return setErro("Informe a senha do gerente.");
    if (acao.status === "recusado" && !motivo.trim()) return setErro("Informe o motivo da recusa ou devolução.");
    setSalvando(true);
    setErro("");
    try {
      if (acao.status === "compensado") {
        await api.updateTituloRecebimentoStatus(acao.cheque.id, { pin, status: "compensado", dataCompensacao });
        setAcao(null);
        await carregar();
        onChanged?.();
        return;
      }
      await api.updateTituloRecebimentoStatus(acao.cheque.id, { pin, status: "recusado", motivo: motivo.trim() });
      setAcao(null);
      await carregar();
      onChanged?.();
    } catch (error: any) { setErro(error.message || "Não foi possível atualizar o cheque."); }
    finally { setSalvando(false); }
  };

  const atualizarEditado = (_pagamento: PagamentoGerenciavel) => { void carregar(); onChanged?.(); };
  const pagina = paginate<ChequeGerencial>(filtrados, page, PAGE_SIZE);

  return <div className="space-y-4">
    {editandoId && <EditarPagamentoModal recebimentoId={editandoId} onClose={() => setEditandoId(null)} onSaved={atualizarEditado} />}
    {acao && <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="acao-cheque-titulo" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className={`flex items-start justify-between gap-3 p-4 text-white ${acao.status === "compensado" ? "bg-emerald-800" : "bg-red-800"}`}><div><p className="text-[10px] font-black uppercase opacity-75">{acao.cheque.tipo.startsWith("duplicata") ? "Boleto" : "Cheque"} nº {acao.cheque.numeroCheque}</p><h2 id="acao-cheque-titulo" className="text-lg font-black">{acao.status === "compensado" ? "Confirmar compensação" : "Registrar recusa/devolução"}</h2><p className="mt-1 text-sm font-bold opacity-90">{acao.cheque.clienteNome} · {formatCurrency(acao.cheque.valorRecebido)}</p></div><button type="button" onClick={() => setAcao(null)} className="rounded-lg p-2 hover:bg-white/10"><X size={20}/></button></header>
        <div className="space-y-3 p-4">
          {acao.status === "compensado" ? <label className="block text-xs font-black uppercase text-slate-600">Data da compensação<input autoFocus type="date" value={dataCompensacao} onChange={(event) => setDataCompensacao(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold"/></label> : <><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-900">Somente este título será recusado. Os demais cheques/boletos do recebimento serão preservados, e os saldos e o bônus serão recalculados automaticamente.</div><label className="block text-xs font-black uppercase text-slate-600">Motivo *<textarea autoFocus value={motivo} onChange={(event) => setMotivo(event.target.value.slice(0, 300))} rows={3} placeholder="Informe o motivo da recusa" className="mt-1 w-full rounded-xl border border-red-300 px-3 py-2 text-sm font-bold normal-case"/></label></>}
          <label className="block text-xs font-black uppercase text-slate-600">Senha do gerente<input type="password" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.slice(0, 64))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-lg font-black tracking-widest"/></label>
          {erro && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"><AlertCircle size={16}/>{erro}</div>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-3"><button type="button" onClick={() => setAcao(null)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-black uppercase">Cancelar</button><button type="button" disabled={salvando || pin.length < 4 || (acao.status === "recusado" && !motivo.trim()) || (acao.status === "compensado" && !dataCompensacao)} onClick={() => void confirmarAcao()} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-black uppercase text-white disabled:opacity-40 ${acao.status === "compensado" ? "bg-emerald-700" : "bg-red-700"}`}>{salvando ? <Loader2 className="animate-spin" size={16}/> : <ShieldCheck size={16}/>} Confirmar</button></footer>
      </div>
    </div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button type="button" onClick={() => setFiltro("aguardando")} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm"><p className="text-[10px] font-black uppercase text-amber-700">Em carteira</p><p className="mt-1 text-2xl font-black text-amber-950">{totais.aguardando}</p><p className="text-xs font-bold text-amber-800">{formatCurrency(totais.valorAguardando)}</p></button>
      <button type="button" onClick={() => setFiltro("compensados_hoje")} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left shadow-sm"><p className="text-[10px] font-black uppercase text-blue-700">Compensados hoje</p><p className="mt-1 text-2xl font-black text-blue-950">{totais.compensadosHoje}</p><p className="text-xs font-bold text-blue-700">{formatCurrency(totais.valorCompensadoHoje)}</p></button>
      <button type="button" onClick={() => setFiltro("recusados")} className="rounded-2xl border border-red-200 bg-red-50 p-4 text-left shadow-sm"><p className="text-[10px] font-black uppercase text-red-700">Com problema</p><p className="mt-1 text-2xl font-black text-red-950">{totais.recusados}</p><p className="text-xs font-bold text-red-800">recusados / devolvidos</p></button>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase text-slate-500">No filtro atual</p><p className="mt-1 text-2xl font-black text-slate-950">{filtrados.length}</p><p className="text-xs font-bold text-slate-600">{formatCurrency(filtrados.reduce((total, cheque) => total + Number(cheque.valorRecebido), 0))}</p></div>
    </div>

    <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-[1.5fr_0.9fr_0.8fr_0.8fr_auto]">
        <label className="relative block"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Cliente, CPF/CNPJ, cheque, boleto, vale ou ordem" className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm font-bold"/></label>
        <select aria-label="Situação dos títulos" value={filtro} onChange={(event) => setFiltro(event.target.value as Filtro)} className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"><option value="aguardando">Em carteira</option><option value="compensados_hoje">Compensados hoje</option><option value="compensados">Compensados</option><option value="recusados">Com problema</option><option value="todos">Todos</option></select>
        <input aria-label="Vencimento inicial" title="Vencimento inicial" type="date" value={vencimentoInicio} onChange={(event) => setVencimentoInicio(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/>
        <input aria-label="Vencimento final" title="Vencimento final" type="date" value={vencimentoFim} onChange={(event) => setVencimentoFim(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold"/>
        <button type="button" onClick={() => void carregar()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-black uppercase text-slate-700"><RefreshCw className={loading ? "animate-spin" : ""} size={16}/>Atualizar</button>
      </div>
    </div>

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500">Carregando cheques e boletos...</div> : erro && !acao ? <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertCircle size={18}/>{erro}</div> : filtrados.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={34}/><p className="mt-3 font-black text-emerald-950">Nenhum título neste filtro</p></div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr><th className="p-3">Situação / vencimento</th><th className="p-3">Título</th><th className="p-3">Cliente / titular</th><th className="p-3 text-right">Valor</th><th className="p-3">Aplicado em</th><th className="p-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{pagina.map((cheque) => <tr key={cheque.id} className="hover:bg-slate-50"><td className="p-3"><span className={`inline-block rounded-lg px-2 py-1 text-[9px] font-black ${classeStatus(cheque.status, cheque.vencimento)}`}>{textoStatus(cheque)}</span><p className="mt-1 font-bold text-slate-800">{formatDate(cheque.vencimento)}</p>{cheque.dataCompensacao && <p className="text-[10px] font-bold text-emerald-700">Compensado em {formatDate(cheque.dataCompensacao)}</p>}</td><td className="p-3"><p className="font-mono font-black text-slate-950">Nº {cheque.numeroCheque}</p><p className="text-xs font-bold text-slate-500">{cheque.tipo.startsWith("duplicata") ? "boleto" : "cheque"} · {cheque.tipo.endsWith("terceiro") ? "terceiro" : "emitente"}</p>{cheque.tituloObservacao && <p className="mt-1 max-w-64 text-[10px] font-bold text-slate-600">{cheque.tituloObservacao}</p>}</td><td className="p-3"><p className="font-black uppercase text-slate-950">{cheque.clienteNome}</p><p className="text-[10px] font-bold text-slate-500">CPF/CNPJ titular: {cheque.cpfTitular}</p></td><td className="p-3 text-right font-mono font-black text-slate-950">{formatCurrency(cheque.valorRecebido)}</td><td className="p-3"><div className="flex max-w-72 flex-wrap gap-1">{cheque.vales.map((vale) => <button key={vale.vendaId} type="button" onClick={() => onOpenVale(vale.vendaId)} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700 hover:bg-slate-200">VALE #{vale.numeroSequencial}</button>)}{cheque.ordens.map((ordem) => <button key={ordem.ordemId} type="button" onClick={() => onOpenOrdem(ordem.ordemId)} className="rounded-md bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-800 hover:bg-blue-200">ORDEM #{ordem.numeroSequencial}</button>)}</div></td><td className="p-3"><div className="flex justify-end gap-1">{gerente && cheque.status === "aguardando" && <button type="button" onClick={() => abrirAcao(cheque, "compensado")} title="Compensar antes do vencimento" className="rounded-lg bg-emerald-700 p-2 text-white"><CalendarCheck2 size={16}/></button>}{gerente && cheque.status !== "recusado" && <button type="button" onClick={() => abrirAcao(cheque, "recusado")} title="Informar problema e recusar este título" className="rounded-lg border border-red-200 p-2 text-red-700"><Ban size={16}/></button>}{gerente && <button type="button" onClick={() => setEditandoId(cheque.recebimentoId)} title="Ver e editar detalhes" className="rounded-lg border border-slate-300 p-2 text-slate-700"><Edit3 size={16}/></button>}</div></td></tr>)}</tbody></table></div>
      <div className="divide-y divide-slate-100 md:hidden">{pagina.map((cheque) => <article key={cheque.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><span className={`inline-block rounded-lg px-2 py-1 text-[9px] font-black ${classeStatus(cheque.status, cheque.vencimento)}`}>{textoStatus(cheque)}</span><h3 className="mt-2 font-black uppercase text-slate-950">{cheque.clienteNome}</h3><p className="text-xs font-bold text-slate-500">{cheque.tipo.startsWith("duplicata") ? "Boleto" : "Cheque"} nº {cheque.numeroCheque}</p>{cheque.tituloObservacao && <p className="mt-1 text-[10px] font-bold text-slate-600">{cheque.tituloObservacao}</p>}</div><p className="font-mono text-lg font-black">{formatCurrency(cheque.valorRecebido)}</p></div><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><div><p className="font-black uppercase text-slate-500">Recebido</p><p className="font-bold">{formatDate(cheque.dataRecebimento)}</p></div><div><p className="font-black uppercase text-slate-500">Vencimento</p><p className="font-bold">{formatDate(cheque.vencimento)}</p></div>{cheque.dataCompensacao && <div className="col-span-2 border-t border-slate-200 pt-2"><p className="font-black uppercase text-emerald-700">Compensado em</p><p className="font-bold text-emerald-900">{formatDate(cheque.dataCompensacao)}</p></div>}{cheque.motivoStatus && <div className="col-span-2 border-t border-slate-200 pt-2"><p className="font-black uppercase text-red-700">Motivo</p><p className="font-bold text-red-900">{cheque.motivoStatus}</p></div>}</div><div className="flex flex-wrap gap-1">{cheque.vales.map((vale) => <button key={vale.vendaId} type="button" onClick={() => onOpenVale(vale.vendaId)} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black">VALE #{vale.numeroSequencial}</button>)}{cheque.ordens.map((ordem) => <button key={ordem.ordemId} type="button" onClick={() => onOpenOrdem(ordem.ordemId)} className="rounded-md bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-800">ORDEM #{ordem.numeroSequencial}</button>)}</div>{gerente && <div className="grid grid-cols-2 gap-2">{cheque.status === "aguardando" && <button type="button" onClick={() => abrirAcao(cheque, "compensado")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black uppercase text-white"><CheckCircle2 size={15}/>Compensar</button>}{cheque.status !== "recusado" && <button type="button" onClick={() => abrirAcao(cheque, "recusado")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-black uppercase text-red-700"><Ban size={15}/>Informar problema</button>}<button type="button" onClick={() => setEditandoId(cheque.recebimentoId)} className={`${cheque.status === "recusado" ? "col-span-2" : ""} inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-black uppercase`}><Eye size={15}/>Ver detalhes</button></div>}</article>)}</div>
      <Pagination page={page} pageSize={PAGE_SIZE} totalItems={filtrados.length} onPageChange={setPage} alwaysVisible />
    </div>}
  </div>;
}
