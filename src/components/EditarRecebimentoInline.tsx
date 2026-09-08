import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PagamentoGerenciavel } from "../types";
import { LinhaPagamento } from "./LinhaPagamento";

export function EditarRecebimentoInline({ recebimentoId, onSaved, onClose }: {
  recebimentoId: string; onSaved: () => Promise<void>; onClose: () => void;
}) {
  const [pagamento, setPagamento] = useState<PagamentoGerenciavel | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    api.getRecebimentoGerenciavel(recebimentoId).then(p => { if (ativo) setPagamento(p); })
      .catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [recebimentoId]);
  if (!pagamento) return <div className="p-3 text-xs">{erro || "Carregando pagamento…"}<button type="button" onClick={onClose} className="ml-3 font-bold">Cancelar</button></div>;
  return <div className="overflow-x-auto border-y border-blue-200 bg-blue-50 p-2">
    <table className="w-full min-w-[720px] text-xs text-left">
      <thead><tr>{["Data", "Pagamento", "Forma de pagamento", "Status do recebimento", "Ações"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead>
      <tbody><LinhaPagamento pagamento={pagamento} clienteId={pagamento.clienteId} clienteNome={pagamento.clienteNome}
        clienteDocumento={pagamento.clienteDocumento} saldo={0} alocar={() => []} referencia="recebimento"
        iniciarEditando onCancel={onClose} onSaved={async () => { await onSaved(); onClose(); }}/></tbody>
    </table>
  </div>;
}
