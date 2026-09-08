import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, X } from "lucide-react";

export function AutorizacaoGerenteModal({ titulo, children, textoConfirmar, onConfirm, onClose, disabled = false }: {
  titulo: string;
  children: React.ReactNode;
  textoConfirmar: string;
  onConfirm: (pin: string) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const confirmar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (salvando || disabled || pin.length < 4) return;
    setSalvando(true);
    setErro("");
    try { await onConfirm(pin); }
    catch (error: any) { setErro(error.message || "Não foi possível concluir a alteração."); setPin(""); }
    finally { setSalvando(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
    <form onSubmit={confirmar} role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b p-4"><h2 className="font-black text-slate-950">{titulo}</h2><button type="button" disabled={salvando} onClick={onClose} aria-label="Fechar" className="rounded-lg p-2"><X size={20}/></button></header>
      <div className="space-y-4 p-4 text-sm text-slate-700">{children}<label className="block text-xs font-bold">Senha do gerente<input autoFocus type="password" autoComplete="off" maxLength={64} value={pin} disabled={salvando} onChange={(event) => setPin(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"/></label>{erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{erro}</p>}</div>
      <footer className="flex justify-end gap-2 border-t p-4"><button type="button" disabled={salvando} onClick={onClose} className="rounded-lg border px-4 py-2 font-bold">Voltar</button><button disabled={disabled || salvando || pin.length < 4} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-40"><ShieldCheck size={16}/>{salvando ? "Salvando…" : textoConfirmar}</button></footer>
    </form>
  </div>, document.body);
}
