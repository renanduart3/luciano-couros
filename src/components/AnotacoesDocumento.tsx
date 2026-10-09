import React, { useEffect, useState } from "react";

export function AnotacoesDocumento({ valor, onSave }: { valor: string; onSave: (texto: string, anterior: string) => Promise<void> }) {
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  useEffect(() => { setTexto(valor); }, [valor]);
  return <form className="space-y-3 rounded-xl border border-slate-300 bg-white p-4" onSubmit={async event => {
    event.preventDefault();
    if (salvando) return;
    setSalvando(true); setMensagem("");
    try { await onSave(texto, valor); setMensagem("Anotação salva."); }
    catch (error: any) { setMensagem(error.message || "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }}>
    <label className="block text-sm font-semibold">Anotações<textarea aria-label="Anotações" value={texto} onChange={e => { setTexto(e.target.value); setMensagem(""); }} disabled={salvando} maxLength={2000} rows={7} placeholder="Escreva aqui…" className="mt-2 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm font-normal" /></label>
    <div className="flex items-center justify-between gap-3"><p role="status" className="text-xs text-slate-600">{mensagem}</p><button type="submit" disabled={salvando || texto === valor} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{salvando ? "Salvando…" : "Salvar anotação"}</button></div>
  </form>;
}
