import React, { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { api } from "../lib/api";
import { ValeDetalhesModal } from "./ValeDetalhesModal";
import { OrdemCobrancaDetalhesModal } from "./OrdensCobrancaView";
import { OrdemCobranca, Venda, PagamentoGerenciavel } from "../types";
import { LinhaPagamento } from "./LinhaPagamento";
import { formatCurrency, formatDate } from "../lib/utils";
import { ordensDoRecebimento } from "../lib/ordensDoRecebimento";
import { useEhGerente } from "../auth/AuthContext";

export function RecebimentoDetalhesModal({ recebimentoId, onSaved, onClose, onComprovante, somenteLeitura = false, ordemContextoId }: {
  somenteLeitura?: boolean;
  ordemContextoId?: string;
  recebimentoId: string; onSaved: () => Promise<void>; onClose: () => void;
  onComprovante: (id: string) => void;
}) {
  const [vale, setVale] = useState<Venda | null>(null);
  const [ordem, setOrdem] = useState<OrdemCobranca | null>(null);
  const [ordens, setOrdens] = useState<OrdemCobranca[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const gerente = useEhGerente();
  const [pagamento, setPagamento] = useState<PagamentoGerenciavel | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!vale && !ordem) dialog.current?.showModal();
    let ativo = true;
    api.getRecebimentoGerenciavel(recebimentoId).then(async p => { const lista = await api.getOrdensCobranca(p.clienteId); if (ativo) { setPagamento(p); setOrdens(lista); } })
      .catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; dialog.current?.close(); };
  }, [recebimentoId, vale, ordem]);
  const atualizar = async (resultado?: { estornado: boolean }) => {
    if (resultado?.estornado) { await onSaved(); onClose(); return; }
    setPagamento(await api.getRecebimentoGerenciavel(recebimentoId));
    await onSaved();
  };
  const vinculadas = pagamento ? ordensDoRecebimento(pagamento, ordens) : [];
  const possuiVinculoOrdem = vinculadas.length > 0 || Boolean(pagamento?.ordemCobrancaId) || Boolean(pagamento?.parcelasOrdem?.length);
  const abrirOrdem = (destino: OrdemCobranca) => {
    if (destino.id === ordemContextoId) { onClose(); return; }
    setOrdem(destino);
  };
  if (vale) return <ValeDetalhesModal vale={vale} ordemCobranca={ordens.find(o => o.status === 'aberta' && o.vales.some(v => v.vendaId === vale.id))} onOpenOrdem={() => { setOrdem(ordens.find(o => o.status === 'aberta' && o.vales.some(v => v.vendaId === vale.id)) || null); setVale(null); }} onClose={() => setVale(null)} />;
  if (ordem) return <OrdemCobrancaDetalhesModal recebimentoDestaque={recebimentoId} ordem={ordem} onClose={() => setOrdem(null)} onChanged={atualizada => { setOrdem(atualizada); void onSaved(); }} />;
  return <dialog ref={dialog} aria-labelledby="recebimento-titulo" className="payment-details-dialog payment-compact bg-white text-xs text-slate-900" onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}>
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-white">
      <div><h2 id="recebimento-titulo" className="font-bold">Detalhes do recebimento</h2>{pagamento && <p className="mt-1">{pagamento.clienteNome}{pagamento.clienteDocumento && <span className="ml-2 text-slate-300">CPF/CNPJ: {pagamento.clienteDocumento}</span>}</p>}</div>
      <div className="flex gap-2">{pagamento && <button title="Comprovante" aria-label="Comprovante" disabled={saving} type="button" onClick={() => onComprovante(recebimentoId)} className="rounded border border-slate-500 px-2"><FileText size={16}/></button>}<button disabled={saving} type="button" onClick={onClose} className="rounded border border-slate-500 px-2">Fechar</button></div>
    </header>
    <div className="space-y-2 p-3">
      {erro && <p role="alert" className="text-red-800">{erro}</p>}
      {!pagamento && !erro && <p>Carregando recebimento…</p>}
      {pagamento && <>
        <div className="flex flex-wrap gap-2">
          {pagamento.alocacoes.map(a => <button key={a.id} type="button" disabled={editando || saving} onClick={() => { void api.getVenda(a.vendaId).then(setVale).catch(e => setErro(e.message)); }} className="rounded border px-2 py-1 text-blue-700">Vale #{a.numeroSequencial}</button>)}
        </div>
        {possuiVinculoOrdem && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-blue-950">{vinculadas.length === 0
            ? "Este recebimento possui vínculo com uma ordem."
            : vinculadas.some(o => o.status === "aberta")
            ? "Este recebimento está vinculado a uma ordem. Faça as alterações pelos pagamentos da ordem."
            : "Este recebimento pertence a uma ordem encerrada. Consulte a ordem para corrigir ou estornar o pagamento."}</p>
          <div className="flex flex-wrap gap-2">{vinculadas.map(o => <button key={o.id} type="button" onClick={() => abrirOrdem(o)} className="rounded-md bg-blue-700 px-3 py-2 font-bold text-white">{gerente && ["aberta", "quitada"].includes(o.status) ? "Editar na ordem" : "Abrir ordem"} #{o.numeroSequencial}</button>)}</div>
          {vinculadas.length === 0 && <p role="alert" className="text-red-800">Não foi possível localizar a ordem vinculada. Feche e abra os detalhes para atualizar.</p>}
        </div>}
        <div className="overflow-x-auto">
          <table className="payments-table w-full min-w-[700px] text-left text-xs">
            <thead><tr>{["Data", "Valor", "Recebido", "Forma de pagamento", "Status", "Ações"].map(t => <th data-label={t} key={t}>{t}</th>)}</tr></thead>
            <tbody><LinhaPagamento pagamento={pagamento} clienteId={pagamento.clienteId} clienteNome={pagamento.clienteNome}
              clienteDocumento={pagamento.clienteDocumento} saldo={0} alocar={() => []} referencia="recebimento"
              ordemCobrancaId={pagamento.ordemCobrancaId || undefined} editavel={gerente && !somenteLeitura && !possuiVinculoOrdem} onEditingChange={setEditando} onSavingChange={setSaving} onSaved={atualizar}/></tbody>
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
