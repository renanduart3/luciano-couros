import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Planilha } from '../types';
import { documentoImpressaoPlanilha } from '../lib/impressaoPlanilha';

export function PlanilhaImpressaoPreview({ planilha, inicio, fim, fechar }: { planilha: Planilha; inicio: string; fim: string; fechar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);
  const [paisagem, setPaisagem] = useState(false);
  const [pronto, setPronto] = useState(false);
  const documento = useMemo(() => documentoImpressaoPlanilha(planilha, inicio, fim, paisagem), [planilha, inicio, fim, paisagem]);
  useEffect(() => { dialogo.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialogo} onCancel={e => { e.preventDefault(); fechar(); }} aria-labelledby="titulo-impressao-planilha" className="m-auto w-[96vw] max-w-6xl rounded-xl border border-slate-300 bg-white p-4 shadow-xl backdrop:bg-slate-950/70">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="titulo-impressao-planilha" className="font-bold">Prévia de impressão · {inicio === fim ? inicio : `${inicio}:${fim}`}</h2><p className="text-sm text-slate-600">{planilha.nome} · Versão de demonstração</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">Orientação <select aria-label="Orientação do papel" value={paisagem ? 'paisagem' : 'retrato'} onChange={e => { setPronto(false); setPaisagem(e.target.value === 'paisagem'); }} className="rounded border p-2"><option value="retrato">A4 retrato</option><option value="paisagem">A4 paisagem</option></select></label>
        <button type="button" disabled={!pronto} onClick={() => { quadro.current?.contentWindow?.focus(); quadro.current?.contentWindow?.print(); }} className="rounded bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Imprimir / salvar PDF</button>
        <button type="button" autoFocus onClick={fechar} className="rounded border px-3 py-2 text-sm">Fechar prévia</button>
      </div>
    </div>
    <p className="my-3 text-sm text-slate-600">Somente as células selecionadas serão impressas, usando os valores atuais, mesmo sem salvar. As colunas cabem na largura do papel; seleções longas continuam em outras páginas. Confira as quebras na janela de impressão e desative os cabeçalhos e rodapés do navegador.</p>
    <iframe ref={quadro} title="Prévia das células selecionadas" srcDoc={documento} onLoad={() => {
      setPronto(true);
      quadro.current?.contentDocument?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } });
    }} className="h-[65vh] w-full rounded border border-slate-300 bg-slate-200"/>
  </dialog>, document.body);
}
