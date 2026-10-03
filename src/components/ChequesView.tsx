import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Banknote, FileText, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { api } from "../lib/api";
import { formatCurrency, formatDate, todayLocalIso } from "../lib/utils";
import { ChequeGerencial, ComprovanteRecebimento } from "../types";
import { RecebimentoDetalhesModal } from "./RecebimentoDetalhesModal";
import { Pagination, paginate } from "./Pagination";
import { ComprovanteRecebimentoModal } from "./ComprovanteRecebimentoModal";

type Filtro = "aguardando" | "compensados_hoje" | "compensados" | "recusados" | "todos";

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
  const [cheques, setCheques] = useState<ChequeGerencial[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("aguardando");
  const [busca, setBusca] = useState("");
  const [vencimentoInicio, setVencimentoInicio] = useState("");
  const [vencimentoFim, setVencimentoFim] = useState("");
  const [page, setPage] = useState(1);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<ComprovanteRecebimento | null>(null);
  const [carregandoComprovanteId, setCarregandoComprovanteId] = useState<string | null>(null);

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

  const atualizarEditado = async () => { setCheques(await api.getCheques()); onChanged?.(); };
  const abrirComprovante = async (recebimentoId: string) => {
    setCarregandoComprovanteId(recebimentoId);
    setErro("");
    try { setComprovante(await api.getComprovanteRecebimento(recebimentoId)); }
    catch (error: any) { setErro(error.message || "Não foi possível abrir o comprovante."); }
    finally { setCarregandoComprovanteId(null); }
  };
  const pagina = paginate<ChequeGerencial>(filtrados, page, PAGE_SIZE);

  return <div className="space-y-4">
    {editandoId && <RecebimentoDetalhesModal recebimentoId={editandoId} onSaved={atualizarEditado} onClose={() => setEditandoId(null)} onComprovante={id => { setEditandoId(null); void abrirComprovante(id); }}/>}
    {comprovante && <ComprovanteRecebimentoModal comprovante={comprovante} onClose={() => setComprovante(null)} />}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[
        ["Valor", cheques.reduce((s,t)=>s+Math.round(Number(t.valorRecebido)*100),0)/100],
        ["Recebido", cheques.filter(t=>t.status==="compensado").reduce((s,t)=>s+Math.round(Number(t.valorRecebido)*100),0)/100],
        ["Restante", cheques.filter(t=>t.status!=="compensado").reduce((s,t)=>s+Math.round(Number(t.valorRecebido)*100),0)/100],
      ].map(([label,valor])=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{formatCurrency(Number(valor))}</p><p className="text-[10px] text-slate-500">Total dos cheques e boletos cadastrados</p></div>)}
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

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500">Carregando cheques e boletos...</div> : erro ? <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertCircle size={18}/>{erro}</div> : filtrados.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={34}/><p className="mt-3 font-black text-emerald-950">Nenhum título neste filtro</p></div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Situação / vencimento", "Título", "Cliente / titular", "Valor", "Vínculos", "Ações"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{pagina.map(cheque => <React.Fragment key={cheque.id}>
          <tr>
            <td className="p-3"><span className={`rounded px-2 py-1 text-[10px] font-bold ${classeStatus(cheque.status, cheque.vencimento)}`}>{textoStatus(cheque)}</span><p className="mt-2">{formatDate(cheque.vencimento)}</p>{cheque.dataCompensacao && <p className="text-[10px] text-emerald-700">Compensado em {formatDate(cheque.dataCompensacao)}</p>}</td>
            <td className="p-3"><strong>Nº {cheque.numeroCheque}</strong><p>{cheque.tipo.startsWith("duplicata") ? "Boleto" : "Cheque"} · {cheque.tipo.endsWith("terceiro") ? "terceiro" : "emitente"}</p>{cheque.tituloObservacao && <p className="text-[10px] text-slate-500">{cheque.tituloObservacao}</p>}</td>
            <td className="p-3"><strong>{cheque.clienteNome}</strong><p className="text-[10px] text-slate-500">{cheque.nomeTitular} · {cheque.cpfTitular}</p></td>
            <td className="p-3 text-right font-mono font-bold">{formatCurrency(cheque.valorRecebido)}</td>
            <td className="p-3"><div className="flex flex-wrap gap-1">{cheque.vales.map(v => <button key={v.vendaId} type="button" onClick={() => onOpenVale(v.vendaId)} className="rounded bg-slate-100 px-2 py-1">Vale #{v.numeroSequencial}</button>)}{cheque.ordens.map(o => <button key={o.ordemId} type="button" onClick={() => onOpenOrdem(o.ordemId)} className="rounded bg-blue-50 px-2 py-1 text-blue-800">Ordem #{o.numeroSequencial}</button>)}</div></td>
            <td className="p-3 text-right"><button title="Detalhes do cheque ou boleto" aria-label="Detalhes do cheque ou boleto" type="button" onClick={() => setEditandoId(cheque.recebimentoId)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold"><Banknote size={16}/></button><button type="button" title="Comprovante" aria-label="Comprovante" disabled={carregandoComprovanteId === cheque.recebimentoId} onClick={() => void abrirComprovante(cheque.recebimentoId)} className="ml-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-300 text-blue-800 disabled:opacity-50"><FileText size={16}/></button></td>
          </tr>
        </React.Fragment>)}</tbody>
      </table></div>
      <Pagination page={page} pageSize={PAGE_SIZE} totalItems={filtrados.length} onPageChange={setPage} alwaysVisible />
    </div>}
  </div>;
}
