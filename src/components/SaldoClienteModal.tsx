import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Cliente } from "../types";
import { api } from "../lib/api";
import { demonstrativoSaldoCliente } from "../lib/saldoCliente";
import { SaldoClienteComprovante } from "./SaldoClienteComprovante";

export function SaldoClienteModal({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const [dados, setDados] = useState<ReturnType<typeof demonstrativoSaldoCliente> | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    api.getClienteHistorico(cliente.id).then(h => {
      if (ativo) setDados(demonstrativoSaldoCliente(h.cliente, h.vendas));
    }).catch(e => { if (ativo) setErro(e.message || "Não foi possível carregar o saldo."); });
    return () => { ativo = false; };
  }, [cliente.id]);
  return createPortal(<div id="print-receipt" role="dialog" aria-modal="true" aria-label="Demonstrativo de saldo devedor" className="fixed inset-0 z-[100] overflow-auto bg-slate-950/70 p-3">
    <div className="mx-auto w-fit max-w-full rounded-xl bg-slate-100">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-white p-3 print:hidden">
        <strong className="text-sm">Saldo devedor · {cliente.nome}</strong>
        <div className="flex gap-2"><button disabled={!dados} onClick={() => window.print()} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Imprimir / PDF</button><button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Fechar</button></div>
      </header>
      {erro ? <p role="alert" className="p-4 text-red-800">{erro}</p> : dados
        ? <div className="overflow-x-auto print:overflow-visible"><SaldoClienteComprovante dados={dados}/></div>
        : <p className="p-4">Atualizando saldo…</p>}
    </div>
  </div>, document.body);
}
