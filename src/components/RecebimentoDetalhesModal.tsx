import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { PagamentoGerenciavel } from "../types";
import { LinhaPagamento } from "./LinhaPagamento";
import { formatCurrency, formatDate } from "../lib/utils";
import { useEhGerente } from "../auth/AuthContext";

export function RecebimentoDetalhesModal({ recebimentoId, onSaved, onClose, onComprovante }: {
  recebimentoId: string; onSaved: () => Promise<void>; onClose: () => void;
  onComprovante: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gerente = useEhGerente();
  const [pagamento, setPagamento] = useState<PagamentoGerenciavel | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let ativo = true;
    api.getRecebimentoGerenciavel(recebimentoId).then(p => { if (ativo) setPagamento(p); })
      .catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; dialog.current?.close(); };
  }, [recebimentoId]);
  const atualizar = async () => {
    setPagamento(await api.getRecebimentoGerenciavel(recebimentoId));
    await onSaved();
  };
  return <dialog ref={dialog} aria-labelledby="recebimento-titulo" className="payment-details-dialog payment-compact bg-white text-xs text-slate-900" onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}>
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-white">
      <div><h2 id="recebimento-titulo" className="font-bold">Detalhes do recebimento</h2>{pagamento && <p className="mt-1">{pagamento.clienteNome}{pagamento.clienteDocumento && <span className="ml-2 text-slate-300">CPF/CNPJ: {pagamento.clienteDocumento}</span>}</p>}</div>
      <div className="flex gap-2">{pagamento && <button disabled={saving} type="button" onClick={() => onComprovante(recebimentoId)} className="rounded border border-slate-500 px-2">Comprovante</button>}<button disabled={saving} type="button" onClick={onClose} className="rounded border border-slate-500 px-2">Fechar</button></div>
    </header>
    <div className="space-y-2 p-3">
      {erro && <p role="alert" className="text-red-800">{erro}</p>}
      {!pagamento && !erro && <p>Carregando recebimento…</p>}
      {pagamento && <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead><tr>{["Data", "Pagamento", "Forma de pagamento", "Status", "Ações"].map(t => <th key={t}>{t}</th>)}</tr></thead>
            <tbody><LinhaPagamento pagamento={pagamento} clienteId={pagamento.clienteId} clienteNome={pagamento.clienteNome}
              clienteDocumento={pagamento.clienteDocumento} saldo={0} alocar={() => []} referencia="recebimento"
              editavel={gerente} onEditingChange={setEditando} onSavingChange={setSaving} onSaved={atualizar}/></tbody>
          </table>
        </div>
        {!editando && <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[660px] text-left text-xs">
          <thead><tr>{["Título", "Titular", "Vencimento", "Valor", "Status", "Compensação"].map(t => <th key={t}>{t}</th>)}</tr></thead>
          <tbody>{pagamento.titulos.map((t, i) => <tr key={t.id || i} className="border-t border-slate-200">
            <td>{t.numeroDocumento || i + 1}{t.observacao && <div className="max-w-52 whitespace-normal text-slate-500">{t.observacao}</div>}</td><td>{t.nomeTitular}<div className="text-slate-500">{t.documentoTitular}</div></td>
            <td>{formatDate(t.vencimento)}</td><td className="font-mono">{formatCurrency(t.valor)}</td>
            <td>{t.status === "compensado" ? "Pago" : t.status === "recusado" ? "Recusado" : "Aguardando"}</td>
            <td>{t.dataCompensacao ? formatDate(t.dataCompensacao) : "—"}</td>
          </tr>)}</tbody>
        </table></div>}
      </>}
    </div>
  </dialog>;
}
