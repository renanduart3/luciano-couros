import React from 'react';
import { sugerirValores } from '../lib/distribuicaoPagamento';
import { formatCurrency, parseBrazilianNumber } from '../lib/utils';
export type LinhaCredito = { valor: number; valorManual?: boolean };
export function ParcelasCreditoEditor({ linhas, total, onChange }: { linhas: LinhaCredito[]; total: number; onChange: (l: LinhaCredito[]) => void }) {
  return <section className="rounded border border-blue-200 bg-blue-50 p-2 text-xs">
    <div className="mb-2 flex items-center justify-between"><strong>Crédito · Total: {formatCurrency(linhas.reduce((s, l) => s + l.valor, 0))}</strong><button type="button" disabled={linhas.length >= 12} onClick={() => onChange(sugerirValores([...linhas, { valor: 0 }], total))} className="rounded bg-blue-700 px-2 py-1 text-white disabled:opacity-40">Adicionar linha ({linhas.length}/12)</button></div>
    <div className="flex flex-wrap gap-2">{linhas.map((l, i) => <label key={i} className="flex items-center gap-1">{i + 1}/{linhas.length}<input aria-label={`Valor crédito ${i + 1}`} inputMode="decimal" defaultValue={l.valor.toFixed(2).replace('.', ',')} key={`${i}-${l.valor}`} onBlur={e => onChange(linhas.map((x, j) => j === i ? { valor: parseBrazilianNumber(e.target.value), valorManual: true } : x))} className="w-24 rounded border px-2 py-1 text-right"/><button type="button" disabled={linhas.length === 1} aria-label={`Excluir crédito ${i + 1}`} onClick={() => onChange(sugerirValores(linhas.filter((_, j) => j !== i), total))} className="px-1 text-red-700 disabled:invisible">×</button></label>)}</div>
  </section>;
}
