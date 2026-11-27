import React, { useEffect, useMemo, useState } from 'react';
import { Send, X } from 'lucide-react';
import { api } from '../lib/api';

type Contato = { id: string; nome: string; numero: string };

const base64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const leitor = new FileReader();
  leitor.onload = () => resolve(String(leitor.result).replace(/^data:[^,]*,/, ''));
  leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
  leitor.readAsDataURL(blob);
});

export function EnviarImagemPlanilha({ imagem, nome, legendaInicial, fechar }: { imagem: Blob; nome: string; legendaInicial: string; fechar: () => void }) {
  const [contatos, setContatos] = useState<Contato[] | null>(null);
  const [conectado, setConectado] = useState(false);
  const [contato, setContato] = useState('');
  const [legenda, setLegenda] = useState(legendaInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState('');
  const previa = useMemo(() => URL.createObjectURL(imagem), [imagem]);
  useEffect(() => () => URL.revokeObjectURL(previa), [previa]);
  useEffect(() => {
    let ativo = true;
    api.getContatosWhatsApp().then(r => {
      if (!ativo) return;
      setContatos(r.contatos); setConectado(r.conectado);
      if (r.contatos.length === 1) setContato(r.contatos[0].id);
    }).catch(e => { if (ativo) { setContatos([]); setErro(e.message); } });
    return () => { ativo = false; };
  }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) fechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [enviando, fechar]);
  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contato || enviando) return;
    setEnviando(true); setErro(''); setEnviado('');
    try {
      await api.enviarImagemWhatsApp({ id: contato, legenda, nome, imagem: await base64(imagem) });
      setEnviado(`Imagem enviada para ${contatos?.find(c => c.id === contato)?.nome || 'o contato'}.`);
    } catch (e: any) { setErro(e.message); } finally { setEnviando(false); }
  };
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !enviando) fechar(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="enviar-imagem-titulo" onSubmit={enviar} className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3"><h2 id="enviar-imagem-titulo" className="font-black">Enviar imagem pelo WhatsApp</h2><button type="button" aria-label="Fechar" disabled={enviando} onClick={fechar} className="rounded border p-1.5"><X size={16}/></button></div>
      <div className="min-h-0 flex-1 overflow-auto rounded border bg-slate-100 p-2"><img src={previa} alt="Prévia da seleção" className="mx-auto block max-w-full bg-white shadow-sm"/></div>
      {contatos === null ? <p role="status" className="text-sm">Carregando contatos…</p>
        : !conectado ? <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O WhatsApp da Automação está desconectado. Conecte o celular na aba Automação e tente de novo.</p>
        : contatos.length === 0 ? <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Nenhum contato tem WhatsApp salvo. Cadastre os números na aba Automação.</p>
        : <label className="block text-sm font-bold">Contato<select value={contato} onChange={e => { setContato(e.target.value); setEnviado(''); }} disabled={enviando} className="mt-1 w-full rounded border p-2 font-normal">
          <option value="">Selecione…</option>
          {contatos.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.numero}</option>)}
        </select></label>}
      <label className="block text-sm font-bold">Legenda (opcional)<input maxLength={1000} value={legenda} onChange={e => setLegenda(e.target.value)} disabled={enviando} className="mt-1 w-full rounded border p-2 font-normal"/></label>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      {enviado && <p role="status" className="text-sm font-bold text-emerald-800">{enviado}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={enviando} onClick={fechar} className="rounded border px-4 py-2">{enviado ? 'Fechar' : 'Cancelar'}</button>
        <button type="submit" disabled={enviando || !contato || !conectado} className="flex items-center gap-2 rounded bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-40"><Send size={15}/>{enviando ? 'Enviando…' : 'Enviar'}</button>
      </div>
    </form>
  </div>;
}
