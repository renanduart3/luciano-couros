import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDecimal } from '../lib/utils';
import type { Venda } from '../types';

/** Consulta sob demanda: não expande a cadeia inteira nem altera a dívida. */
export function HistoricoOrigemVale({ vale }: { vale: Venda }) {
  const [caminho, setCaminho] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const requisicao = useRef(0);
  useEffect(() => { setCaminho([]); setErro(''); setCarregando(false); requisicao.current++; return () => { requisicao.current++; }; }, [vale.id]);
  const atual = caminho[caminho.length - 1] || vale;
  const consultar = async (id: string) => {
    if (carregando) return;
    if (id === vale.id || caminho.some(v => v.id === id)) { setErro('Esta referência já está no caminho consultado. Confira o histórico da origem.'); return; }
    const versao = ++requisicao.current;
    setCarregando(true); setErro('');
    try {
      const origem = await api.getVenda(id);
      if (versao !== requisicao.current) return;
      if (origem.clienteId !== vale.clienteId) throw new Error('A referência pertence a outro cliente. Confira o histórico.');
      setCaminho(anteriores => [...anteriores, origem]);
    } catch (e: any) { if (versao === requisicao.current) setErro(e.message || 'Não foi possível consultar a origem.'); }
    finally { if (versao === requisicao.current) setCarregando(false); }
  };
  return <div className="mt-3 space-y-2 border-t border-amber-300 pt-3 text-xs">
    <p className="font-bold">Consultar vales e materiais de origem</p>
    {caminho.length > 0 && <><button type="button" disabled={carregando} onClick={() => { setCaminho(c => c.slice(0, -1)); setErro(''); }} className="rounded border border-amber-400 px-2 py-1 font-bold">Voltar</button><p>Vale #{vale.numeroSequencial} → {caminho.map(v => `Vale #${v.numeroSequencial}`).join(' → ')}</p></>}
    {atual.origemSaldo && <><p className="font-bold">{atual.origemSaldo.descricao}</p><div className="flex flex-wrap gap-2">{atual.origemSaldo.vales.map(v => <button type="button" key={v.numero} disabled={!v.id || carregando} onClick={() => v.id && void consultar(v.id)} className="rounded border border-amber-400 bg-white px-2 py-1 font-bold text-blue-800 underline disabled:opacity-50">Vale #{v.numero}</button>)}</div></>}
    {caminho.length > 0 && <><p>Valor original do documento: {formatCurrency(atual.totalLiquido)}. Consulta histórica, sem somar novamente à dívida.</p><ul className="space-y-1">{atual.items?.map(i => <li key={i.id}>{formatDecimal(i.quantidade)} {i.unidade} · {i.descricao} · {formatCurrency(i.total)}</li>)}</ul>{!atual.items?.length && !atual.origemSaldo && <p>Este registro não possui materiais disponíveis no histórico.</p>}</>}
    {carregando && <p role="status">Carregando origem…</p>}{erro && <p role="alert" className="text-red-800">{erro}</p>}
  </div>;
}
