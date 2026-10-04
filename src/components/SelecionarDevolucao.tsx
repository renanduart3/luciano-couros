import React, { useEffect, useState } from 'react';
import { formatCurrency, formatDecimal } from '../lib/utils';
import type { ItemVenda } from '../types';
export type CompraDevolucao = ItemVenda & { numeroVenda: number; disponivel: number; preco: number };
export function SelecionarDevolucao({ clienteId, vendaId, onAdd }: { clienteId: string; vendaId?: string; onAdd: (item: CompraDevolucao) => void }) {
  const [aberto,setAberto] = useState(false), [erro,setErro] = useState('');
  const [itens,setItens] = useState<CompraDevolucao[] | null>(null);
  useEffect(()=>{setAberto(false);setItens(null);setErro('');},[clienteId,vendaId]);
  useEffect(()=>{
    if (!aberto) return;
    let ativo=true; setItens(null);setErro('');
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/itens-devolucao?excluirVenda=${encodeURIComponent(vendaId || '')}`)
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;})
      .then(d=>{if(ativo)setItens(d);}).catch(e=>{if(ativo)setErro(e.message);});
    return ()=>{ativo=false;};
  },[aberto,clienteId,vendaId]);
  return <div className="my-3 rounded-xl border border-red-200 p-3">
    <button type="button" onClick={()=>setAberto(!aberto)} className="font-bold text-red-800">{aberto ? 'Fechar compras para devolução' : 'Adicionar devolução de compra anterior'}</button>
    {aberto && <><p className="my-2 text-xs">Escolha a compra e ajuste a quantidade negativa na venda. O preço é o último vendido a este cliente, com descontos. O excedente vira crédito na carteira.</p>
      {erro && <p role="alert">{erro}</p>}{!itens && !erro && <p>Carregando compras…</p>}
      {itens?.length===0 && <p>Nenhuma compra com quantidade disponível.</p>}
      <div className="max-h-64 overflow-auto">{itens?.map(i=><button type="button" key={i.id} onClick={()=>{onAdd(i);setAberto(false);}} className="block w-full border-b p-2 text-left text-sm hover:bg-red-50">
        <strong>{i.descricao}</strong> · Compra #{i.numeroVenda} · Disponível: {formatDecimal(i.disponivel)} {i.unidade} · {formatCurrency(i.preco)}
      </button>)}</div></>}
  </div>;
}
