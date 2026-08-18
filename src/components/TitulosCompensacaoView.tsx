import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Edit3, FileClock, Loader2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { TituloCompensacao } from "../types";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";

const dinheiro = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusLabel: Record<TituloCompensacao["status"], string> = { aguardando: "AGUARDANDO", compensado: "COMPENSADO", recusado: "RECUSADO" };
const statusClass: Record<TituloCompensacao["status"], string> = { aguardando: "bg-amber-100 text-amber-900", compensado: "bg-emerald-100 text-emerald-800", recusado: "bg-red-100 text-red-800" };

export function TitulosCompensacaoView({ onChanged }: { onChanged?: () => void }) {
  const [titulos, setTitulos] = useState<TituloCompensacao[]>([]);
  const [filtro, setFiltro] = useState<"todos" | TituloCompensacao["status"]>("aguardando");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<TituloCompensacao | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [valorRecebido, setValorRecebido] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    setErro("");
    try { setTitulos(await api.getTitulosCompensacao()); }
    catch (error: any) { setErro(error.message || "Não foi possível carregar os títulos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void carregar(); }, []);

  const abrirEdicao = (titulo: TituloCompensacao) => {
    setEditando({ ...titulo });
    setValorRecebido(dinheiro(titulo.valorRecebido));
    setValores(Object.fromEntries(titulo.alocacoes.map((item) => [item.vendaId, dinheiro(item.valor)])));
    setPin("");
    setErro("");
    setFeedback("");
  };

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return titulos.filter((titulo) => (filtro === "todos" || titulo.status === filtro)
      && (!termo || titulo.clienteNome.toLowerCase().includes(termo) || titulo.numeroCheque.toLowerCase().includes(termo)
        || titulo.alocacoes.some((item) => String(item.numeroSequencial).includes(termo))));
  }, [titulos, filtro, busca]);

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editando || pin.length < 4) return;
    const alocacoes = editando.alocacoes.map((item) => ({ vendaId: item.vendaId, valor: parseBrazilianNumber(valores[item.vendaId] || "") })).filter((item) => item.valor > 0);
    setSaving(true);
    setErro("");
    setFeedback("");
    try {
      const atualizado = await api.updateTituloCompensacao(editando.recebimentoId, {
        pin,
        status: editando.status,
        data: editando.data,
        valorRecebido: parseBrazilianNumber(valorRecebido),
        formaPagamento: editando.formaPagamento,
        observacao: editando.observacao,
        motivoStatus: editando.motivoStatus,
        dadosCheque: {
          vencimento: editando.vencimento,
          cpfTitular: editando.cpfTitular,
          cpfTerceiro: editando.cpfTerceiro,
          banco: editando.banco,
          numeroCheque: editando.numeroCheque,
        },
        alocacoes,
      });
      setTitulos((atuais) => atuais.map((item) => item.recebimentoId === atualizado.recebimentoId ? atualizado : item));
      setEditando(atualizado);
      setValorRecebido(dinheiro(atualizado.valorRecebido));
      setValores(Object.fromEntries(atualizado.alocacoes.map((item) => [item.vendaId, dinheiro(item.valor)])));
      setPin("");
      setFeedback("Alterações salvas e saldos recalculados com sucesso.");
      onChanged?.();
    } catch (error: any) {
      setErro(error.message || "Não foi possível alterar o título.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4">
    {editando && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 px-[10vw] py-[5vh] backdrop-blur-sm">
      <form onSubmit={salvar} role="dialog" aria-modal="true" aria-labelledby="editar-titulo-titulo" className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-950 p-4 text-white"><div><p className="text-[10px] font-black text-slate-400">CONTROLE DE COMPENSAÇÃO</p><h2 id="editar-titulo-titulo" className="text-lg font-black">Cheque {editando.numeroCheque} · {editando.clienteNome}</h2></div><button type="button" onClick={() => setEditando(null)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20}/></button></header>
        <div className="space-y-4 overflow-y-auto bg-slate-100 p-4">
          <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-3 md:grid-cols-4">
            <label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={editando.status} onChange={(event) => { const status = event.target.value as TituloCompensacao["status"]; setEditando({ ...editando, status }); setErro(""); }} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"><option value="aguardando">Aguardando compensação</option><option value="compensado">Compensado</option><option value="recusado">Recusado</option></select></label>
            <label className="text-[10px] font-black uppercase text-slate-600">Data do pagamento<input type="date" value={editando.data} onChange={(event) => setEditando({ ...editando, data: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>
            <label className="text-[10px] font-black uppercase text-slate-600">Valor recebido<input value={valorRecebido} onChange={(event) => setValorRecebido(event.target.value)} inputMode="decimal" className="mt-1 min-h-10 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-right font-mono font-black text-emerald-900"/></label>
            <label className="text-[10px] font-black uppercase text-slate-600">Tipo<select value={editando.formaPagamento} onChange={(event) => setEditando({ ...editando, formaPagamento: event.target.value as TituloCompensacao["formaPagamento"], tipo: event.target.value as TituloCompensacao["tipo"] })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"><option value="cheque_emitente">Cheque emitente</option><option value="cheque_terceiro">Cheque terceiro</option></select></label>
          </div>
          {editando.status === "recusado" && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-bold leading-5 text-red-900">Ao salvar como recusado, o pagamento e qualquer bônus originado por este cheque serão retirados, e os saldos dos vales e ordens serão restaurados.</div>}
          <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-[10px] font-black uppercase text-slate-600">Vencimento<input type="date" value={editando.vencimento} onChange={(event) => setEditando({ ...editando, vencimento: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>
            <label className="text-[10px] font-black uppercase text-slate-600">CPF/CNPJ titular<input value={editando.cpfTitular} onChange={(event) => setEditando({ ...editando, cpfTitular: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>
            {editando.formaPagamento === "cheque_terceiro" && <label className="text-[10px] font-black uppercase text-slate-600">CPF/CNPJ terceiro<input value={editando.cpfTerceiro || ""} onChange={(event) => setEditando({ ...editando, cpfTerceiro: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>}
            <label className="text-[10px] font-black uppercase text-slate-600">Banco<input value={editando.banco} onChange={(event) => setEditando({ ...editando, banco: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>
            <label className="text-[10px] font-black uppercase text-slate-600">Número do cheque<input value={editando.numeroCheque} onChange={(event) => setEditando({ ...editando, numeroCheque: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Distribuição do pagamento</div><div className="divide-y divide-slate-200">{editando.alocacoes.map((item) => <label key={item.vendaId} className="grid grid-cols-[1fr_160px] items-center gap-3 p-3 text-xs"><span><strong className="block text-slate-950">VALE #{item.numeroSequencial}</strong><span className="font-bold text-slate-500">Saldo atual: {formatCurrency(item.saldoRestante)}</span></span><input value={valores[item.vendaId] || ""} onChange={(event) => setValores((atuais) => ({ ...atuais, [item.vendaId]: event.target.value }))} inputMode="decimal" className="min-h-10 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-right font-mono font-black text-emerald-900"/></label>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase text-slate-600">Observação<input value={editando.observacao || ""} onChange={(event) => setEditando({ ...editando, observacao: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-bold"/></label><label className="text-[10px] font-black uppercase text-slate-600">Motivo da situação<input value={editando.motivoStatus || ""} onChange={(event) => setEditando({ ...editando, motivoStatus: event.target.value })} placeholder="Ex.: cheque devolvido pelo banco" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-bold"/></label></div>
          {editando.historico.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Controle de alterações</div><div className="divide-y divide-slate-200">{editando.historico.map((evento) => <div key={evento.id} className="grid gap-1 p-3 text-xs sm:grid-cols-[170px_1fr]"><div><p className="font-mono font-black text-slate-600">{formatDate(evento.createdAt)}</p><p className="text-[10px] font-bold text-slate-500">{evento.usuarioNome}</p></div><p className="font-bold text-slate-800">{evento.acao === "titulo_compensacao_alterado" ? `Título alterado para ${String(evento.detalhes?.depois?.status || "").toUpperCase()}, em ${formatCurrency(Number(evento.detalhes?.depois?.valorRecebido || 0))}.` : "Recebimento registrado."}</p></div>)}</div></div>}
          {feedback && <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-black text-emerald-800"><CheckCircle2 size={16}/>{feedback}</div>}
          {erro && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800"><AlertCircle size={16}/>{erro}</div>}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-300 bg-white p-3"><label className="text-[10px] font-black uppercase text-slate-600">Senha do gerente<input type="password" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.slice(0, 64))} className="ml-2 min-h-10 rounded-lg border border-slate-300 px-3 text-center font-black tracking-widest"/></label><button type="button" onClick={() => setEditando(null)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-black uppercase">Fechar</button><button type="submit" disabled={saving || pin.length < 4} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-xs font-black uppercase text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16}/> : <ShieldCheck size={16}/>}Salvar alterações</button></footer>
      </form>
    </div>}

    <div className="grid gap-3 sm:grid-cols-3">{(["aguardando", "compensado", "recusado"] as const).map((status) => <button type="button" key={status} onClick={() => setFiltro(status)} className={`rounded-xl border p-3 text-left ${filtro === status ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}><p className="text-[10px] font-black uppercase opacity-70">{statusLabel[status]}</p><p className="mt-1 text-2xl font-black">{titulos.filter((titulo) => titulo.status === status).length}</p></button>)}</div>
    <div className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="CLIENTE, CHEQUE OU Nº DO VALE" className="min-h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-xs font-bold"/></label><select value={filtro} onChange={(event) => setFiltro(event.target.value as typeof filtro)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-black uppercase"><option value="aguardando">Aguardando compensação</option><option value="compensado">Compensados</option><option value="recusado">Recusados</option><option value="todos">Todos</option></select><button type="button" onClick={() => void carregar()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-black uppercase"><RefreshCw size={15}/>Atualizar</button></div>
    {erro && !editando && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800">{erro}</div>}
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-900 text-[10px] font-black uppercase text-white"><tr><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Cheque</th><th className="p-3 text-left">Vencimento</th><th className="p-3 text-right">Valor</th><th className="p-3 text-left">Vales</th><th className="p-3 text-center">Situação</th><th className="p-3 text-center">Ação</th></tr></thead><tbody className="divide-y divide-slate-200">{filtrados.map((titulo) => <tr key={titulo.recebimentoId}><td className="p-3 font-black uppercase">{titulo.clienteNome}</td><td className="p-3"><p className="font-mono font-black">{titulo.numeroCheque}</p><p className="text-[10px] font-bold text-slate-500">{titulo.banco}</p></td><td className="p-3 font-bold">{formatDate(titulo.vencimento)}</td><td className="p-3 text-right font-mono font-black">{formatCurrency(titulo.valorRecebido)}</td><td className="p-3 font-bold">{titulo.alocacoes.map((item) => `#${item.numeroSequencial}`).join(", ")}</td><td className="p-3 text-center"><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusClass[titulo.status]}`}>{statusLabel[titulo.status]}</span></td><td className="p-3 text-center"><button type="button" onClick={() => abrirEdicao(titulo)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-[10px] font-black uppercase text-white"><Edit3 size={14}/>Editar</button></td></tr>)}</tbody></table></div>{!loading && filtrados.length === 0 && <p className="p-8 text-center text-xs font-bold text-slate-500">Nenhum título encontrado neste filtro.</p>}{loading && <p className="p-8 text-center text-xs font-bold text-slate-500">Carregando títulos...</p>}</div>
  </div>;
}
