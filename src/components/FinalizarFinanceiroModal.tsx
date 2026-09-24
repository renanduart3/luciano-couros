import React, { useState } from "react";
import { CheckCircle2, ShieldCheck, X } from "lucide-react";
import { formatCurrency } from "../lib/utils";

export function FinalizarFinanceiroModal({ titulo, restante, excedente, onClose, onConfirm }: {
  titulo: string;
  restante: number;
  excedente: number;
  onClose: () => void;
  onConfirm: (dados: { pin: string; destinoRestante: "novo_vale" | "zerar"; zerarExcedente: boolean; motivo: string }) => Promise<{ mensagem: string }>;
}) {
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [destinoRestante, setDestinoRestante] = useState<"novo_vale" | "zerar">("novo_vale");
  const [zerarExcedente, setZerarExcedente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const confirmar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pin.length < 4) return setErro("Informe a senha do gerente.");
    setSalvando(true); setErro("");
    try { const resultado = await onConfirm({ pin, destinoRestante, zerarExcedente, motivo }); setSucesso(resultado.mensagem); }
    catch (error: any) { setErro(error.message || "Não foi possível finalizar."); setPin(""); }
    finally { setSalvando(false); }
  };
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
    <form onSubmit={confirmar} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b bg-slate-50 p-4"><div><h2 className="font-black text-slate-950">Finalizar {titulo}</h2><p className="mt-1 text-xs font-bold text-slate-500">O fechamento não apaga pagamentos e mantém todos os vínculos para consulta e edição.</p></div><button type="button" onClick={onClose} className="p-2"><X size={18}/></button></header>
      <div className="space-y-4 p-5">
        {sucesso ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><CheckCircle2 className="mb-2"/>{sucesso}</div> : <>
          <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border bg-slate-50 p-3"><span className="text-[10px] font-black uppercase text-slate-500">Ainda devido</span><strong className="block font-mono text-lg text-amber-800">{formatCurrency(restante)}</strong></div><div className="rounded-xl border bg-slate-50 p-3"><span className="text-[10px] font-black uppercase text-slate-500">Excedente</span><strong className="block font-mono text-lg text-violet-800">{formatCurrency(excedente)}</strong></div></div>
          {restante > 0.005 && <fieldset className="space-y-2"><legend className="text-xs font-black uppercase text-slate-600">Destino do restante</legend><label className="flex gap-2 rounded-xl border p-3 text-sm font-bold"><input type="radio" checked={destinoRestante === "novo_vale"} onChange={() => setDestinoRestante("novo_vale")}/>Gerar outro vale, identificado com todos os vales de origem</label><label className="flex gap-2 rounded-xl border p-3 text-sm font-bold"><input type="radio" checked={destinoRestante === "zerar"} onChange={() => setDestinoRestante("zerar")}/>Zerar o restante sem gerar novo vale</label></fieldset>}
          {excedente > 0.005 && <label className="flex gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-violet-950"><input type="checkbox" checked={zerarExcedente} onChange={e => setZerarExcedente(e.target.checked)}/><span>Zerar também o excedente, em vez de mantê-lo como bônus na carteira</span></label>}
          <label className="block text-[10px] font-black uppercase text-slate-600">Observação<textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 300))} className="mt-1 w-full rounded-xl border p-3 text-sm font-bold"/></label>
          <label className="block text-[10px] font-black uppercase text-slate-600">Senha do gerente<input type="password" autoComplete="off" value={pin} onChange={e => { setPin(e.target.value.slice(0, 64)); setErro(""); }} className="mt-1 w-full rounded-xl border p-3 text-center font-black tracking-widest"/></label>
          {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-800">{erro}</p>}
        </>}
      </div>
      <footer className="flex justify-end gap-2 border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-xs font-black uppercase">{sucesso ? "Fechar" : "Voltar"}</button>{!sucesso && <button type="submit" disabled={salvando || pin.length < 4} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"><ShieldCheck size={16}/>{salvando ? "Finalizando…" : "Finalizar"}</button>}</footer>
    </form>
  </div>;
}
