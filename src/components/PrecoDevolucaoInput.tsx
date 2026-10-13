import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { LockKeyhole } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate, parseBrazilianNumber } from '../lib/utils';

export function PrecoDevolucaoInput({ clienteId, produtoId, unidade, vendaId, value, onAuthorized }: {
  clienteId: string; produtoId: string; unidade: string; vendaId?: string; value: string;
  onAuthorized: (valor: string) => void;
}) {
  const [referencia, setReferencia] = useState<{ preco: number; dataUltimaVenda: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [preco, setPreco] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const abrir = async () => {
    setAberto(true); setReferencia(null); setErro(''); setPin(''); setPreco(value); setOcupado(true);
    try {
      const r = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/itens-devolucao?excluirVenda=${encodeURIComponent(vendaId || '')}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error);
      const item = dados.find((i: any) => i.produtoId === produtoId && i.unidade === unidade);
      if (!item) throw new Error('Não há compra anterior deste produto para o cliente.');
      setReferencia(item);
    } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };
  const salvar = async () => {
    const valor = parseBrazilianNumber(preco);
    if (!preco.trim() || !Number.isFinite(valor) || valor < 0) { setErro('Informe um preço válido.'); return; }
    setOcupado(true); setErro('');
    try {
      await api.verificarPinAdministrador(pin, 'alterar_preco');
      onAuthorized(valor.toFixed(2).replace('.', ',')); setAberto(false); setPin('');
    } catch (e: any) { setErro(e.message); setPin(''); } finally { setOcupado(false); }
  };
  return <div className="flex items-center justify-end gap-1">
    <span>{formatCurrency(parseBrazilianNumber(value))}</span>
    <button type="button" onClick={abrir} aria-label="Alterar preço de devolução" title="Alterar preço com senha do administrador" className="rounded-md border bg-white p-1.5"><LockKeyhole size={13} /></button>
    {aberto && createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-label="Alterar preço de devolução" className="w-full max-w-md rounded-xl bg-white p-5 text-slate-900 shadow-xl">
      <h3 className="font-bold">Alterar preço de devolução</h3>
      {referencia ? <p className="my-3">O último preço vendido deste produto para este cliente foi {formatCurrency(referencia.preco)} na data {formatDate(referencia.dataUltimaVenda)}. Para devolver por outro preço, informe a senha do administrador.</p> : <p className="my-3">{ocupado ? 'Consultando a última venda…' : 'Não foi possível consultar a última venda.'}</p>}
      <label className="block">Preço de devolução<input aria-label="Novo preço de devolução" inputMode="decimal" value={preco} onChange={e => setPreco(e.target.value)} className="mb-3 block w-full rounded border p-2" /></label>
      <label className="block">Senha do administrador<input aria-label="Senha para alterar preço de devolução" type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.slice(0,64))} className="block w-full rounded border p-2" /></label>
      {erro && <p role="alert" className="my-2 text-red-700">{erro}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={ocupado} onClick={() => { setAberto(false); setPin(''); }} className="rounded border px-3 py-2">Cancelar</button><button type="button" disabled={ocupado || !referencia || !pin} onClick={salvar} className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-50">Autorizar alteração</button></div>
    </div></div>, document.body)}
  </div>;
}
