import React, { useEffect, useState } from 'react';
import { Minus } from 'lucide-react';
import { formatCurrency, parseBrazilianNumber } from '../lib/utils';
import type { ItemVenda } from '../types';
export type CompraDevolucao = ItemVenda & { numeroVenda: number; disponivel: number; preco: number };
export function SelecionarDevolucao({ clienteId, vendaId, onAdd }: { clienteId: string; vendaId?: string; onAdd: (item: CompraDevolucao, quantidade: number) => boolean }) {
  const [erro, setErro] = useState('');
  const [itens, setItens] = useState<CompraDevolucao[] | null>(null);
  const [selecionado, setSelecionado] = useState('');
  const [quantidade, setQuantidade] = useState('');
  useEffect(() => {
    let ativo = true;
    setItens(null); setErro(''); setSelecionado(''); setQuantidade('');
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/itens-devolucao?excluirVenda=${encodeURIComponent(vendaId || '')}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then((d: CompraDevolucao[]) => {
        const vistos = new Set<string>();
        if (ativo) setItens(d.filter(i => {
          const chave = JSON.stringify([i.produtoId, i.fornecedorId, i.unidade]);
          if (vistos.has(chave)) return false;
          vistos.add(chave); return true;
        }));
      }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [clienteId, vendaId]);
  const item = itens?.find(i => i.id === selecionado);
  const qtd = Math.abs(parseBrazilianNumber(quantidade));
  const adicionar = () => {
    if (!item) { setErro('Selecione um produto.'); return; }
    if (!Number.isFinite(qtd) || qtd <= 0) { setErro('informe a quantidade maior que zero'); return; }
    if (onAdd(item, qtd)) { setSelecionado(''); setQuantidade(''); setErro(''); }
  };
  return <tr className="bg-red-50 text-red-800">
    <td className="px-2 py-2 text-center"><button type="button" onClick={adicionar} title="Adicionar devolução" aria-label="Adicionar devolução" disabled={!itens?.length} className="rounded-md bg-red-600 p-2 text-white hover:bg-red-700 disabled:opacity-50"><Minus size={14} /></button></td>
    <td className="px-2 py-2"><select aria-label="Produto para devolução" value={selecionado} onChange={e => { setSelecionado(e.target.value); setErro(''); }} className="w-full rounded-md border border-red-200 bg-white px-2 py-1.5 text-xs font-bold">
      <option value="">{!itens ? 'Carregando compras…' : itens.length ? 'Selecione um produto já comprado…' : 'Cliente sem produtos comprados'}</option>
      {itens?.map(i => <option key={i.id} value={i.id}>{i.referencia ? `${i.referencia} · ` : ''}{i.descricao}{i.fornecedorReferencia ? ` · ${i.fornecedorReferencia}` : ''} · {i.unidade}</option>)}
    </select>{erro && <p role="alert" className="mt-1 text-xs">{erro}</p>}</td>
    <td className="px-2 py-2"><input aria-label="Quantidade a devolver" inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value.replace(/-/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} placeholder="0" className="w-full rounded-md border border-red-200 bg-white px-2 py-1.5 text-right font-bold" /></td>
    <td className="px-2 py-2 text-center">{item?.unidade || '—'}</td>
    <td className="px-2 py-2 text-right font-mono">{formatCurrency(item?.preco || 0)}</td>
    <td className="px-2 py-2 text-right font-mono font-bold">{formatCurrency(-(qtd * (item?.preco || 0)))}</td>
    <td className="px-2 py-2 text-center">—</td>
  </tr>;
}
