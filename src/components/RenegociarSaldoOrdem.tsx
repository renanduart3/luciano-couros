import React, { useState } from 'react';
import { OrdemCobranca, OrdemCobrancaParcela } from '../types';
import { api } from '../lib/api';
import { formatCurrency, parseBrazilianNumber } from '../lib/utils';
import { distribuirCentavos } from '../lib/distribuicaoPagamento';

export function RenegociarSaldoOrdem({ ordem, origem, onSaved, onClose }: { ordem: OrdemCobranca; origem: OrdemCobrancaParcela; onSaved: (o: OrdemCobranca) => void; onClose: () => void }) {
  const [linhas, setLinhas] = useState([{ vencimento: origem.vencimento, valor: origem.saldo.toFixed(2).replace('.', ',') }]);
  const [pin, setPin] = useState(''); const [erro, setErro] = useState(''); const [saving, setSaving] = useState(false);
  const total = linhas.reduce((s, l) => s + Math.round(parseBrazilianNumber(l.valor) * 100), 0);
  const salvar = async () => {
    setSaving(true); setErro('');
    try { onSaved(await api.renegociarSaldoOrdem(ordem.id, { pin, updatedAt: ordem.updatedAt, parcelaId: origem.id, saldoEsperado: origem.saldo, parcelas: linhas.map(l => ({ vencimento: l.vencimento, valor: parseBrazilianNumber(l.valor) })) })); }
    catch (e: any) { setErro(e.message); } finally { setSaving(false); }
  };
  return <section className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs">
    <strong>Renegociar saldo da parcela {origem.numero}: {formatCurrency(origem.saldo)}</strong>
    <div className="my-2 flex items-center gap-2"><span>Novas parcelas</span><select disabled={saving} aria-label="Quantidade de novas parcelas" value={linhas.length} onChange={e => setLinhas(distribuirCentavos(origem.saldo, Number(e.target.value)).map((v, i) => { const d = new Date(`${linhas[0].vencimento}T12:00:00`); const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + i); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return { vencimento: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, valor: v.toFixed(2).replace('.', ',') }; }))} className="rounded border p-2">{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></div>
    {linhas.map((l, i) => <div key={i} className="my-1 flex gap-2"><span className="p-2">{i + 1}</span><input aria-label={`Novo vencimento ${i + 1}`} disabled={saving} type="date" value={l.vencimento} onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x))} className="rounded border p-2"/><input aria-label={`Novo valor ${i + 1}`} disabled={saving} inputMode="decimal" value={l.valor} onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} className="w-32 rounded border p-2 text-right"/></div>)}
    <p className="my-2">Total a renegociar: {formatCurrency(total / 100)}</p>
    <div className="flex flex-wrap gap-2"><input aria-label="Senha do gerente para renegociar" disabled={saving} type="password" autoComplete="off" placeholder="Senha do gerente" value={pin} onChange={e => setPin(e.target.value)} className="rounded border p-2"/><button type="button" disabled={saving || total !== Math.round(origem.saldo * 100) || pin.length < 4} onClick={() => void salvar()} className="rounded bg-blue-700 px-3 py-2 font-bold text-white disabled:opacity-40">Salvar negociação</button><button type="button" disabled={saving} onClick={onClose}>Cancelar</button></div>
    {erro && <p role="alert" className="mt-2 text-red-800">{erro}</p>}
  </section>;
}
