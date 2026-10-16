import React, { useState } from "react";
import { CheckCircle2, FileText, ReceiptText, ShieldCheck, X } from "lucide-react";
import { formatCurrency } from "../lib/utils";

export function FinalizarFinanceiroModal({ titulo, restante, excedente, demonstrativo, recebimento, onClose, onConfirm }: {
  titulo: string;
  restante: number;
  excedente: number;
  demonstrativo: React.ReactNode;
  recebimento: React.ReactNode;
  onClose: () => void;
  onConfirm: (dados: { pin: string; destinoRestante: "novo_vale"; bonusFinal: number; motivo: string }) => Promise<{ mensagem: string }>;
}) {
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [bonusFinal, setBonusFinal] = useState(excedente.toFixed(2));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [visualizacao, setVisualizacao] = useState<"demonstrativo" | "recebimento" | null>(null);
  const confirmar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pin.length < 4) return setErro("Informe a senha do gerente.");
    if (!bonusFinal.trim() || !Number.isFinite(Number(bonusFinal)) || Number(bonusFinal) < 0) return setErro("Informe um bônus válido, maior ou igual a zero.");
    setSalvando(true); setErro("");
    try { const resultado = await onConfirm({ pin, destinoRestante: "novo_vale", bonusFinal: Number(bonusFinal), motivo }); setSucesso(resultado.mensagem); }
    catch (error: any) { setErro(error.message || "Não foi possível finalizar."); setPin(""); }
    finally { setSalvando(false); }
  };
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
    {visualizacao ? <section role="dialog" aria-modal="true" aria-label={`${visualizacao === "demonstrativo" ? "Demonstrativo" : "Recebimento"} de ${titulo}`} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-slate-50 p-4">
        <div className="min-w-0"><h2 className="font-black text-slate-950">{visualizacao === "demonstrativo" ? "Demonstrativo" : "Recebimento"} · {titulo}</h2><p className="text-xs font-bold text-slate-500">Confira os detalhes antes de finalizar.</p></div>
        <button type="button" onClick={() => setVisualizacao(null)} className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-800">Voltar à finalização</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 sm:p-5">{visualizacao === "demonstrativo" ? demonstrativo : recebimento}</div>
    </section> : <form onSubmit={confirmar} role="dialog" aria-modal="true" aria-label={`Finalizar ${titulo}`} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between border-b bg-slate-50 p-4"><div><h2 className="font-black text-slate-950">Finalizar {titulo}</h2><p className="mt-1 text-xs font-bold text-slate-500">Pagamentos e vínculos serão mantidos.</p></div><button type="button" onClick={onClose} aria-label="Fechar finalização" className="p-2"><X size={18}/></button></header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        {sucesso ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><CheckCircle2 className="mb-2"/>{sucesso}</div> : <>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={salvando} onClick={() => setVisualizacao("demonstrativo")} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"><FileText size={16}/> Demonstrativo</button><button type="button" disabled={salvando} onClick={() => setVisualizacao("recebimento")} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"><ReceiptText size={16}/> Recebimento</button></div>
          <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border bg-slate-50 p-3"><span className="text-[10px] font-black uppercase text-slate-500">Devedor</span><strong className="block font-mono text-lg text-amber-800">{formatCurrency(restante)}</strong></div><label className="rounded-xl border bg-slate-50 p-3"><span className="text-[10px] font-black uppercase text-slate-500">Bônus (R$)</span><input aria-label="Bônus" type="number" min="0" step="0.01" required value={bonusFinal} onChange={e => setBonusFinal(e.target.value)} className="block w-full rounded border bg-white p-1 font-mono text-lg font-bold text-violet-800"/></label></div>
          {restante > 0.005 && <p className="rounded-xl border p-3 text-sm font-bold">O saldo devedor será transferido para outro vale, identificado com todos os vales de origem.</p>}

          <label className="block text-[10px] font-black uppercase text-slate-600">Observação<textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 300))} className="mt-1 w-full rounded-xl border p-3 text-sm font-bold"/></label>
          <label className="block text-[10px] font-black uppercase text-slate-600">Senha do gerente<input type="password" autoComplete="off" value={pin} onChange={e => { setPin(e.target.value.slice(0, 64)); setErro(""); }} className="mt-1 w-full rounded-xl border p-3 text-center font-black tracking-widest"/></label>
          {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-800">{erro}</p>}
        </>}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-xs font-black uppercase">{sucesso ? "Fechar" : "Voltar"}</button>{!sucesso && <button type="submit" disabled={salvando || pin.length < 4} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"><ShieldCheck size={16}/>{salvando ? "Finalizando…" : "Finalizar"}</button>}</footer>
    </form>}
  </div>;
}
