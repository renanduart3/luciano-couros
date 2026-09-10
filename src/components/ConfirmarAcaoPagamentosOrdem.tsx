import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ItemAcaoPagamentoOrdem, OrdemCobranca } from "../types";
import { formatCurrency } from "../lib/utils";

export function ConfirmarAcaoPagamentosOrdem({ ordemId, acao, itens, onCancel, onSaved }: {
  ordemId: string; acao: "estornar" | "excluir"; itens: ItemAcaoPagamentoOrdem[];
  onCancel: () => void; onSaved: (ordem: OrdemCobranca) => void;
}) {
  const [plano, setPlano] = useState<Awaited<ReturnType<typeof api.previaAcaoPagamentosOrdem>> | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);
  const [concluido, setConcluido] = useState(false);
  useEffect(() => {
    let ativo = true;
    api.previaAcaoPagamentosOrdem(ordemId, acao, itens).then(p => { if (ativo) setPlano(p); }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [ordemId, acao, itens]);
  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plano || saving || concluido) return;
    setSaving(true); setErro("");
    try {
      const atualizada = await api.acaoPagamentosOrdem(ordemId, { acao, itens, pin, revisao: plano.revisao });
      setConcluido(true); setPin(""); onSaved(atualizada);
    } catch (e: any) { setErro(e.message); setPin(""); }
    finally { setSaving(false); }
  };
  return <form onSubmit={confirmar} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
    <p className="mb-2 font-bold">{plano ? `${acao === "estornar" ? "Estornar" : "Excluir"} ${plano.quantidade} pagamento(s) · estorno financeiro: ${formatCurrency(plano.totalFinanceiro)}` : erro ? "Operação indisponível" : "Conferindo valores…"}</p>
    <p className="mb-2">{acao === "estornar" ? "As linhas ficam pendentes, sem compensação automática." : "As linhas saem do controle ativo; o histórico é preservado."} A ordem permanece ativa.</p>
    <div className="flex flex-wrap items-center gap-2"><label>Senha do gerente <input autoFocus type="password" autoComplete="off" maxLength={64} value={pin} onChange={e => setPin(e.target.value)} disabled={saving || concluido} className="h-8 w-40 rounded border px-2"/></label><button disabled={!plano || saving || concluido || pin.length < 4} className="rounded bg-red-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Confirmar</button><button type="button" disabled={saving} onClick={onCancel} className="rounded border px-3 py-1.5">Voltar</button></div>
    {erro && <p role="alert" className="mt-2 font-bold text-red-800">{erro}</p>}
  </form>;
}
