import React, { useState } from "react";
import { X } from "lucide-react";
import { OrdemCobranca, Venda } from "../types";
import { formatCurrency, formatDate, todayLocalIso } from "../lib/utils";
import { api } from "../lib/api";
import { OrdemCobrancaDemonstrativoModal } from "./OrdemCobrancaDemonstrativoModal";

interface Props {
  clienteId: string;
  clienteNome: string;
  vales: Venda[];
  valesDoCliente: Venda[];
  onOpenOrdem: (ordem: OrdemCobranca) => void;
  onClose: () => void;
  onSaved?: (ordem: OrdemCobranca) => void;
}

export function CobrancaValesModal({ clienteId, clienteNome, vales, onClose, onSaved, onOpenOrdem }: Props) {
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ordem, setOrdem] = useState<OrdemCobranca | null>(null);
  const total = vales.reduce((s, v) => s + Number(v.saldoRestante), 0);
  const registrar = async () => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const criada = await api.createOrdemCobranca({ clienteId, dataEmissao: todayLocalIso(), vendaIds: vales.map(v => v.id), observacao });
      setOrdem(criada); onSaved?.(criada);
    } catch (e: any) { setError(e.message || "Não foi possível criar a ordem."); }
    finally { setSaving(false); }
  };
  if (ordem) return <OrdemCobrancaDemonstrativoModal ordem={ordem} onOpenOrdem={() => onOpenOrdem(ordem)} onClose={onClose}/>;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="criar-ordem-titulo" className="payment-compact flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <header className="flex items-center justify-between bg-slate-900 px-3 py-2 text-white"><h2 id="criar-ordem-titulo" className="text-sm font-bold">Criar ordem de cobrança</h2><button disabled={saving} onClick={onClose} type="button" aria-label="Fechar cobrança"><X size={18}/></button></header>
      <div className="space-y-3 overflow-y-auto p-3">
        <div className="flex justify-between gap-3"><div><h3 className="font-bold">{clienteNome}</h3><p className="text-xs text-slate-500">{vales.length} vale(s) selecionado(s)</p></div><strong className="font-mono text-emerald-800">{formatCurrency(total)}</strong></div>
        <table className="w-full text-left text-xs"><thead><tr><th>Vale</th><th>Emissão</th><th className="text-right">Saldo</th></tr></thead><tbody>{vales.map(v => <tr key={v.id} className="border-t border-slate-200"><td>#{v.numeroSequencial}</td><td>{formatDate(v.data)}</td><td className="text-right font-mono">{formatCurrency(v.saldoRestante)}</td></tr>)}</tbody></table>
        <p className="text-xs text-slate-600">Adicione os pagamentos depois, com o valor e a forma desejados. O saldo permanece disponível para receber.</p>
        <label className="block text-xs font-bold">Observação<textarea disabled={saving} value={observacao} onChange={e => setObservacao(e.target.value.slice(0, 300))} rows={2} className="mt-1 w-full rounded-md border border-slate-300 p-2"/></label>
        {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 p-3"><button disabled={saving} onClick={onClose} type="button" className="rounded border px-3 py-1">Cancelar</button><button disabled={saving || !vales.length || total <= 0} onClick={() => void registrar()} type="button" className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-40">{saving ? "Salvando…" : "Criar ordem"}</button></footer>
    </section>
  </div>;
}
