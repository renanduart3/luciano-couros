import React, { useState } from 'react';
import { OrdemCobranca, OrdemCobrancaParcela } from '../types';
import { api } from '../lib/api';
import { formatCurrency, parseBrazilianNumber, isValidIsoDate } from '../lib/utils';
import { distribuirCentavos } from '../lib/distribuicaoPagamento';
import { somarMesesVencimento } from '../lib/datasPagamento';
import { FORMAS_PAGAMENTO } from '../lib/pagamentos';

const campo = 'h-8 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-xs disabled:bg-slate-100';

export function RenegociarSaldoOrdem({ ordem, origem, onSaved, onClose }: { key?: string; ordem: OrdemCobranca; origem: OrdemCobrancaParcela; onSaved: (o: OrdemCobranca) => void; onClose: () => void }) {
  const [linhas, setLinhas] = useState([{ vencimento: origem.vencimento, valor: origem.saldo.toFixed(2).replace('.', ',') }]);
  const [formaPagamento, setFormaPagamento] = useState(origem.formaPagamentoPrevista || origem.pagamentos?.[0]?.formaPagamento || 'pix');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const total = linhas.reduce((s, l) => s + Math.round(parseBrazilianNumber(l.valor) * 100), 0);
  const diferenca = Math.round(origem.saldo * 100) - total;
  const valido = diferenca === 0 && linhas.every((l, i) => isValidIsoDate(l.vencimento) && parseBrazilianNumber(l.valor) > 0 && (!i || l.vencimento >= linhas[i - 1].vencimento));
  const salvar = async () => {
    if (!valido || saving) return;
    setSaving(true); setErro('');
    try { onSaved(await api.renegociarSaldoOrdem(ordem.id, { pin, updatedAt: ordem.updatedAt, parcelaId: origem.id, saldoEsperado: origem.saldo, formaPagamento, parcelas: linhas.map(l => ({ vencimento: l.vencimento, valor: parseBrazilianNumber(l.valor) })) })); }
    catch (e: any) { setErro(e.message); } finally { setSaving(false); }
  };
  return <section aria-label="Renegociar saldo" className="payment-compact overflow-hidden rounded-xl border border-blue-200 bg-white text-xs shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-2 py-1.5">
      <div><h3 className="font-bold text-slate-900">Renegociar saldo</h3><p className="mt-1 text-slate-600">Parcela {origem.numero}</p></div>
      <div className="text-right"><span className="text-slate-600">Saldo a distribuir</span><p className="mt-1 text-sm font-bold tabular-nums text-blue-900">{formatCurrency(origem.saldo)}</p></div>
    </header>
    <div className="space-y-2 p-3">
      <div className="grid gap-3 sm:grid-cols-[100px_240px]">
        <label className="grid gap-1.5 font-semibold text-slate-700">Novas parcelas<select disabled={saving} aria-label="Quantidade de novas parcelas" value={linhas.length} onChange={e => setLinhas(distribuirCentavos(origem.saldo, Number(e.target.value)).map((v, i) => ({ vencimento: somarMesesVencimento(linhas[0].vencimento, i), valor: v.toFixed(2).replace('.', ',') })))} className={campo}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <label className="grid gap-1.5 font-semibold text-slate-700">Forma de pagamento<select aria-label="Forma de pagamento da renegociação" disabled={saving} value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className={campo}>{FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 bg-slate-100 px-2 py-1.5 font-semibold text-slate-600"><span>Nº</span><span>Vencimento</span><span className="text-right">Valor</span></div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">{linhas.map((l, i) => <div key={i} className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-2 py-1.5">
          <span className="font-semibold text-slate-500">{i + 1}/{linhas.length}</span>
          <input aria-label={`Novo vencimento ${i + 1}`} disabled={saving} type="date" value={l.vencimento} onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x))} className={campo}/>
          <input aria-label={`Novo valor ${i + 1}`} disabled={saving} inputMode="decimal" value={l.valor} onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} className={`${campo} text-right tabular-nums`}/>
        </div>)}</div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50 px-2 py-2 font-semibold"><span>Total: {formatCurrency(total / 100)}</span><span className={diferenca === 0 ? 'text-emerald-700' : 'text-amber-800'}>{diferenca === 0 ? 'Saldo distribuído' : `${diferenca > 0 ? 'Falta' : 'Excede'} ${formatCurrency(Math.abs(diferenca) / 100)}`}</span></div>
      </div>
      <div className="flex flex-wrap items-end justify-end gap-2">
        <label className="grid w-40 gap-1 font-semibold text-slate-700">Senha do gerente<input aria-label="Senha do gerente para renegociar" disabled={saving} type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} className={campo}/></label>
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="h-8 rounded-md border border-slate-300 px-3 font-semibold">Cancelar</button><button type="button" disabled={saving || !valido || pin.length < 4} onClick={() => void salvar()} className="h-8 rounded-md bg-blue-700 px-3 font-bold text-white disabled:opacity-40">{saving ? 'Salvando…' : 'Salvar negociação'}</button></div>
      </div>
      {erro && <p role="alert" className="text-red-800">{erro}</p>}
    </div>
  </section>;
}
