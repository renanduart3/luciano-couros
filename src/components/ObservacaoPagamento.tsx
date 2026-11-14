import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export function ObservacaoPagamento({ tipo, id, valor, onSavingChange }: {
  tipo: 'vale' | 'ordem'; id: string; valor: string;
  onSavingChange: (salvando: boolean) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const [anterior, setAnterior] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [falhaCarga, setFalhaCarga] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    setCarregando(true); setFalhaCarga(false); setMensagem('');
    api.getObservacaoPagamento(tipo, id).then(documento => {
      if (ativo) { setTexto(documento.observacaoPagamento || ''); setAnterior(documento.observacaoPagamento || ''); }
    }).catch((error: any) => { if (ativo) { setFalhaCarga(true); setMensagem(error.message || 'Não foi possível carregar a observação.'); } })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [tipo, id, tentativa]);
  const salvar = async () => {
    if (salvando || carregando || falhaCarga) return;
    setSalvando(true); onSavingChange(true); setMensagem('');
    try {
      const atualizado = await api.saveObservacaoPagamento(tipo, id, texto, anterior);
      const salvo = atualizado.observacaoPagamento || '';
      setTexto(salvo); setAnterior(salvo);
      setMensagem('Observação de pagamento salva.');
    } catch (error: any) { setMensagem(error.message || 'Não foi possível salvar a observação.'); }
    finally { setSalvando(false); onSavingChange(false); }
  };
  return <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-4">
    <p className="text-xs text-slate-600">Esta observação vale para todos os pagamentos {tipo === 'vale' ? 'deste vale' : 'desta ordem'}.</p>
    <label>Observação de pagamento<textarea aria-label="Observação de pagamento" rows={6} maxLength={2000} disabled={salvando || carregando || falhaCarga} value={texto} onChange={e => { setTexto(e.target.value); setMensagem(''); }} className="mt-2 w-full rounded border border-slate-400 p-3" /></label>
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status">{carregando ? 'Carregando observação…' : mensagem}</p>{falhaCarga && <button type="button" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</button>}<button type="button" disabled={salvando || carregando || falhaCarga || texto === anterior} onClick={() => void salvar()} className="bg-emerald-700 text-white">{salvando ? 'Salvando…' : 'Salvar observação'}</button></div>
  </section>;
}
