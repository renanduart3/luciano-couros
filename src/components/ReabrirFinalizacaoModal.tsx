import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

export function ReabrirFinalizacaoModal({ tipo, id, onClose, onSaved }: {
  tipo: 'ordem' | 'vale'; id: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [plano, setPlano] = useState<Awaited<ReturnType<typeof api.previaReabrirFinalizacao>> | null>(null);
  const [pin, setPin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    let ativo = true;
    api.previaReabrirFinalizacao(tipo, id).then(p => { if (ativo) setPlano(p); }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [tipo, id]);
  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plano || salvando) return;
    setSalvando(true); setErro('');
    try {
      await api.reabrirFinalizacao(tipo, id, { pin, motivo, revisao: plano.revisao });
      await onSaved(); onClose();
    } catch (e: any) { setErro(e.message); setPin(''); }
    finally { setSalvando(false); }
  };
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/75 p-4">
    <form onSubmit={confirmar} role="dialog" aria-modal="true" aria-labelledby="reabrir-finalizacao-titulo" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      <h2 id="reabrir-finalizacao-titulo" className="font-black">Reabrir {tipo} para editar</h2>
      <p className="text-sm">Os pagamentos serão preservados. A finalização será desfeita e os saldos serão recalculados para permitir as correções.</p>
      {plano ? <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
        <p>Vales: {plano.vales.map(n => `#${n}`).join(', ')}</p>
        {plano.residual && <p>O vale residual #{plano.residual.numero}, de {formatCurrency(plano.residual.valor)}, será cancelado e o saldo voltará à origem.</p>}
        {plano.bonusRestituido > 0 && <p>Bônus restituído: {formatCurrency(plano.bonusRestituido)}.</p>}
      </div> : !erro && <p>Conferindo a finalização…</p>}
      <label className="block text-sm font-bold">Motivo<textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} className="mt-1 w-full rounded border p-2" /></label>
      <label className="block text-sm font-bold">Senha do gerente<input type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} maxLength={64} className="mt-1 w-full rounded border p-2" /></label>
      {erro && <p role="alert" className="text-sm font-bold text-red-700">{erro}</p>}
      <footer className="flex justify-end gap-2"><button type="button" disabled={salvando} onClick={onClose} className="rounded border px-4 py-2">Voltar</button><button disabled={!plano || salvando || pin.length < 4} className="rounded bg-amber-700 px-4 py-2 font-bold text-white disabled:opacity-40">{salvando ? 'Reabrindo…' : 'Reabrir para editar'}</button></footer>
    </form>
  </div>;
}
