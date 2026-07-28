import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

type OpcoesConfirmacao = {
  titulo?: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  variante?: "perigo" | "atencao";
};

export function useConfirmacao() {
  const [pedido, setPedido] = useState<OpcoesConfirmacao | null>(null);
  const resolverRef = useRef<((resultado: boolean) => void) | null>(null);

  const responder = useCallback((resultado: boolean) => {
    resolverRef.current?.(resultado);
    resolverRef.current = null;
    setPedido(null);
  }, []);

  const confirmar = useCallback((opcoes: OpcoesConfirmacao | string) => {
    resolverRef.current?.(false);
    setPedido(typeof opcoes === "string" ? { mensagem: opcoes } : opcoes);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!pedido) return;
    const aoPressionarTecla = (event: KeyboardEvent) => {
      if (event.key === "Escape") responder(false);
    };
    window.addEventListener("keydown", aoPressionarTecla);
    return () => window.removeEventListener("keydown", aoPressionarTecla);
  }, [pedido, responder]);

  useEffect(() => () => resolverRef.current?.(false), []);

  const dialogo = pedido && typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) responder(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmacao-titulo"
            aria-describedby="confirmacao-mensagem"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <span className={`rounded-xl p-2 ${pedido.variante === "atencao" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                  <AlertTriangle size={21} />
                </span>
                <div>
                  <h2 id="confirmacao-titulo" className="font-black uppercase text-slate-950">
                    {pedido.titulo || "Confirmar operação"}
                  </h2>
                  <p className="text-xs font-semibold text-slate-500">Confira antes de continuar.</p>
                </div>
              </div>
              <button type="button" onClick={() => responder(false)} aria-label="Fechar confirmação" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </header>
            <div className="p-5">
              <p id="confirmacao-mensagem" className="whitespace-pre-line text-sm font-bold leading-6 text-slate-700">
                {pedido.mensagem}
              </p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" autoFocus onClick={() => responder(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black uppercase text-slate-700 hover:bg-slate-100">
                {pedido.textoCancelar || "Cancelar"}
              </button>
              <button type="button" onClick={() => responder(true)} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase text-white ${pedido.variante === "atencao" ? "bg-amber-600 hover:bg-amber-700" : "bg-red-700 hover:bg-red-800"}`}>
                {pedido.textoConfirmar || "Confirmar"}
              </button>
            </footer>
          </section>
        </div>,
        document.body
      )
    : null;

  return { confirmar, dialogo };
}
