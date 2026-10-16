import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { ValeDetalhesModal } from './ValeDetalhesModal';
import type { Venda } from '../types';

/** Referência histórica compacta; os documentos de origem são consultados sob demanda. */
export function HistoricoOrigemVale({ vale, onOpenOrdem }: { vale: Venda; onOpenOrdem?: (id: string) => void }) {
  const [documento, setDocumento] = useState<Venda | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const requisicao = useRef(0);
  useEffect(() => { setDocumento(null); setErro(''); setCarregando(false); requisicao.current++; return () => { requisicao.current++; }; }, [vale.id]);
  const origem = vale.origemSaldo;
  if (!origem) return null;

  const consultarVale = async (id: string) => {
    if (carregando || id === vale.id) return;
    const versao = ++requisicao.current;
    setCarregando(true);
    setErro('');
    try {
      const anterior = await api.getVenda(id);
      if (versao !== requisicao.current) return;
      if (anterior.clienteId !== vale.clienteId) throw new Error('A referência pertence a outro cliente. Confira o histórico.');
      setDocumento(anterior);
    } catch (e: any) {
      if (versao === requisicao.current) setErro(e.message || 'Não foi possível consultar a origem.');
    } finally {
      if (versao === requisicao.current) setCarregando(false);
    }
  };

  return <>
    <span> · Origem: {origem.ordem ? <>Devedor da <button type="button" onClick={() => onOpenOrdem?.(origem.ordem!.id)} className="font-bold text-blue-800 underline hover:text-blue-950">Ordem #{origem.ordem.numero}</button></> : origem.vales.length ? <>Devedor do {origem.vales.length === 1 ? 'vale' : 'vales'} {origem.vales.map((v, index) => <React.Fragment key={v.id || v.numero}>{index > 0 && ', '}{v.id ? <button type="button" disabled={carregando || v.id === vale.id} onClick={() => void consultarVale(v.id!)} className="font-bold text-blue-800 underline hover:text-blue-950 disabled:opacity-50">Vale #{v.numero}</button> : `Vale #${v.numero}`}</React.Fragment>)}</> : origem.descricao}</span>
    {carregando && <span role="status"> · Carregando origem…</span>}
    {erro && <span role="alert" className="text-red-800"> · {erro}</span>}
    {documento && createPortal(<ValeDetalhesModal vale={documento} onClose={() => setDocumento(null)}/>, document.body)}
  </>;
}
