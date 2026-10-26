import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComprovanteFinalizacao, OrdemCobranca, Venda } from '../types';
import { VendaComprovante } from './VendaComprovante';
import { ComprovanteFinalizacaoOrdem } from './ComprovanteFinalizacaoOrdem';

export function ComprovantesFinalizacao({ tipo, comprovantes }: {
  key?: string; tipo: 'vale' | 'ordem'; comprovantes: ComprovanteFinalizacao<Venda | OrdemCobranca>[];
}) {
  const [selecionado, setSelecionado] = useState('');
  const [impressao, setImpressao] = useState(false);
  const registro = comprovantes.find(c => c.id === selecionado) || comprovantes[0];
  if (!registro) return <p>Nenhum comprovante de finalização salvo.</p>;
  const conteudo = tipo === 'vale'
    ? <VendaComprovante venda={registro.documento as Venda} demonstrativoPagamento/>
    : <ComprovanteFinalizacaoOrdem ordem={registro.documento as OrdemCobranca}/>;
  return <div className="space-y-3">
    <div className="flex flex-wrap justify-between gap-3 print:hidden">
      <label className="text-sm font-bold">Finalização salva <select aria-label="Finalização salva" className="rounded border p-2" value={registro.id} onChange={e => setSelecionado(e.target.value)}>
        {comprovantes.map(c => <option key={c.id} value={c.id}>{new Date(c.data).toLocaleString('pt-BR')}</option>)}
      </select></label>
      <button type="button" onClick={() => setImpressao(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Imprimir / salvar PDF</button>
    </div>
    {conteudo}
    {impressao && createPortal(<div id="print-receipt" role="dialog" aria-modal="true" aria-label="Comprovante de finalização salvo" className="fixed inset-0 z-[150] overflow-y-auto bg-slate-950/75 p-3 print:p-0">
      <div className="mx-auto max-w-5xl"><header className="mb-3 flex justify-end gap-3 print:hidden">
        <button type="button" className="rounded bg-white p-3" onClick={() => window.print()}>Imprimir / salvar PDF</button>
        <button type="button" className="rounded bg-white p-3" onClick={() => setImpressao(false)}>Fechar</button>
      </header>{conteudo}</div>
    </div>, document.body)}
  </div>;
}
