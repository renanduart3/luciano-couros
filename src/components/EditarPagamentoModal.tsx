import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { PagamentoGerenciavel } from "../types";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";
import { CamposCheque } from "./CamposCheque";
import { dadosChequeVazios, DadosCheque, ehCheque, FORMAS_PAGAMENTO } from "../lib/pagamentos";

const dinheiro = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function EditarPagamentoModal({ recebimentoId, onClose, onSaved }: { recebimentoId: string; onClose: () => void; onSaved: (pagamento: PagamentoGerenciavel) => void }) {
  const [pagamento, setPagamento] = useState<PagamentoGerenciavel | null>(null);
  const [valorRecebido, setValorRecebido] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [dadosCheque, setDadosCheque] = useState<DadosCheque>(dadosChequeVazios());
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const preencher = (dados: PagamentoGerenciavel) => {
    setPagamento(dados);
    setValorRecebido(dinheiro(dados.formaPagamento === "bonus" ? dados.bonusUtilizado : dados.valorRecebido));
    setValores(Object.fromEntries(dados.alocacoes.map((item) => [item.vendaId, dinheiro(item.valor)])));
    setDadosCheque({ vencimento: dados.vencimento || "", cpfTitular: dados.cpfTitular || dados.clienteDocumento || "", cpfTerceiro: dados.cpfTerceiro || "", banco: dados.banco || "", numeroCheque: dados.numeroCheque || "" });
  };

  useEffect(() => {
    let ativo = true;
    api.getRecebimentoGerenciavel(recebimentoId).then((dados) => { if (ativo) preencher(dados); }).catch((error) => { if (ativo) setErro(error.message || "Não foi possível carregar o pagamento."); }).finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [recebimentoId]);

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pagamento || pin.length < 4) return;
    const alocacoes = pagamento.alocacoes.map((item) => ({ vendaId: item.vendaId, valor: parseBrazilianNumber(valores[item.vendaId] || "") })).filter((item) => item.valor > 0);
    setSaving(true);
    setErro("");
    setFeedback("");
    try {
      const atualizado = await api.updateRecebimentoCliente(recebimentoId, {
        pin,
        status: ehCheque(pagamento.formaPagamento) ? pagamento.statusPagamento : "compensado",
        data: pagamento.data,
        valorRecebido: parseBrazilianNumber(valorRecebido),
        formaPagamento: pagamento.formaPagamento,
        observacao: pagamento.observacao,
        motivoStatus: pagamento.motivoStatus,
        dadosCheque: ehCheque(pagamento.formaPagamento) ? dadosCheque : undefined,
        alocacoes,
      });
      preencher(atualizado);
      setPin("");
      setFeedback("Pagamento atualizado e saldos recalculados.");
      onSaved(atualizado);
    } catch (error: any) {
      setErro(error.message || "Não foi possível alterar o pagamento.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/80 px-[10vw] py-[5vh] backdrop-blur-sm">
    <form onSubmit={salvar} role="dialog" aria-modal="true" aria-labelledby="editar-pagamento-gerencial" className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-950 p-4 text-white"><div><p className="text-[10px] font-black text-slate-400">EDIÇÃO GERENCIAL</p><h2 id="editar-pagamento-gerencial" className="text-lg font-black">{pagamento ? `${pagamento.clienteNome} · ${formatCurrency(pagamento.formaPagamento === "bonus" ? pagamento.bonusUtilizado : pagamento.valorRecebido)}` : "Carregando pagamento"}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20}/></button></header>
      <div className="space-y-4 overflow-y-auto bg-slate-100 p-4">
        {loading ? <p className="p-10 text-center text-sm font-bold text-slate-500">Carregando pagamento...</p> : pagamento && <>
          <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-3 md:grid-cols-4">
            <label className="text-[10px] font-black uppercase text-slate-600">Data<input type="date" value={pagamento.data} onChange={(event) => setPagamento({ ...pagamento, data: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"/></label>
            <label className="text-[10px] font-black uppercase text-slate-600">Valor recebido<input value={valorRecebido} onChange={(event) => setValorRecebido(event.target.value)} inputMode="decimal" className="mt-1 min-h-10 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-right font-mono font-black text-emerald-900"/></label>
            <label className="text-[10px] font-black uppercase text-slate-600">Forma de pagamento<select value={pagamento.formaPagamento} onChange={(event) => setPagamento({ ...pagamento, formaPagamento: event.target.value, statusPagamento: ehCheque(event.target.value) ? pagamento.statusPagamento : "compensado" })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold">{FORMAS_PAGAMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}</select></label>
            {ehCheque(pagamento.formaPagamento) ? <label className="text-[10px] font-black uppercase text-slate-600">Situação<select value={pagamento.statusPagamento} onChange={(event) => setPagamento({ ...pagamento, statusPagamento: event.target.value as PagamentoGerenciavel["statusPagamento"] })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 font-bold"><option value="aguardando">Aguardando compensação</option><option value="compensado">Compensado</option><option value="recusado">Recusado</option></select></label> : <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-black text-emerald-800">PAGAMENTO CONFIRMADO</div>}
          </div>
          {ehCheque(pagamento.formaPagamento) && <CamposCheque formaPagamento={pagamento.formaPagamento} dados={dadosCheque} onChange={setDadosCheque} documentoCliente={pagamento.clienteDocumento} />}
          {pagamento.statusPagamento === "recusado" && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-900">Ao salvar como recusado, o valor será retirado dos vales e das ordens e qualquer bônus gerado por este pagamento será removido.</p>}
          <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Valores aplicados nos vales</div><div className="divide-y divide-slate-200">{pagamento.alocacoes.map((item) => <label key={item.vendaId} className="grid grid-cols-[1fr_160px] items-center gap-3 p-3 text-xs"><span><strong className="block text-slate-950">VALE #{item.numeroSequencial}</strong><span className="font-bold text-slate-500">Saldo atual: {formatCurrency(item.saldoRestante)}</span></span><input value={valores[item.vendaId] || ""} onChange={(event) => setValores((atuais) => ({ ...atuais, [item.vendaId]: event.target.value }))} inputMode="decimal" className="min-h-10 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-right font-mono font-black text-emerald-900"/></label>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase text-slate-600">Observação<input value={pagamento.observacao || ""} onChange={(event) => setPagamento({ ...pagamento, observacao: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-bold"/></label>{ehCheque(pagamento.formaPagamento) && <label className="text-[10px] font-black uppercase text-slate-600">Motivo da situação<input value={pagamento.motivoStatus || ""} onChange={(event) => setPagamento({ ...pagamento, motivoStatus: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-bold"/></label>}</div>
          {pagamento.historico.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Controle de alterações</div><div className="divide-y divide-slate-200">{pagamento.historico.map((evento) => <div key={evento.id} className="grid gap-1 p-3 text-xs sm:grid-cols-[170px_1fr]"><div><p className="font-mono font-black text-slate-600">{formatDate(evento.createdAt)}</p><p className="text-[10px] font-bold text-slate-500">{evento.usuarioNome}</p></div><p className="font-bold text-slate-800">{evento.acao === "pagamento_alterado" ? `Pagamento alterado para ${String(evento.detalhes?.depois?.formaPagamento || "").replaceAll("_", " ").toUpperCase()} em ${formatCurrency(Number(evento.detalhes?.depois?.valorRecebido || 0))}.` : "Pagamento registrado."}</p></div>)}</div></div>}
        </>}
        {feedback && <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-black text-emerald-800"><CheckCircle2 size={16}/>{feedback}</div>}
        {erro && <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800"><AlertCircle size={16}/>{erro}</div>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-300 bg-white p-3"><label className="text-[10px] font-black uppercase text-slate-600">Senha do gerente<input type="password" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.slice(0, 64))} className="ml-2 min-h-10 rounded-lg border border-slate-300 px-3 text-center font-black tracking-widest"/></label><button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-black uppercase">Fechar</button><button type="submit" disabled={saving || loading || !pagamento || pin.length < 4} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-xs font-black uppercase text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16}/> : <ShieldCheck size={16}/>}Salvar alterações</button></footer>
    </form>
  </div>;
}
