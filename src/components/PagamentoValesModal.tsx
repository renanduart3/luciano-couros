import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Coins, Loader2, X } from "lucide-react";
import { OrdemCobranca, TituloRecebimento, Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, parseBrazilianNumber, todayLocalIso } from "../lib/utils";
import { ehTituloPagamento, FORMAS_PAGAMENTO } from "../lib/pagamentos";
import { ParcelamentoCartaoSelect } from "./ParcelamentoCartaoSelect";
import { TitulosPagamentoEditor } from "./TitulosPagamentoEditor";

import { distribuirCentavos } from "../lib/distribuicaoPagamento";

interface Props {
  clienteId: string;
  clienteNome: string;
  clienteDocumento?: string;
  vales: Venda[];
  ordem?: OrdemCobranca;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  fecharAoSalvar?: boolean;
}

const hoje = todayLocalIso;
const novaChave = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');

export function PagamentoValesModal({ clienteId, clienteNome, clienteDocumento, vales, ordem, onClose, onSaved, fecharAoSalvar = false }: Props) {
  const totalDivida = ordem ? ordem.saldo : vales.reduce((total, vale) => total + Number(vale.saldoRestante), 0);
  type Rascunho = { id: string; data: string; formaPagamento: string; valor: number; parcelasCartao: number; titulos: TituloRecebimento[] };
  const [lista, setLista] = useState<Rascunho[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [chave, setChave] = useState(() => novaChave());
  const [enviados, setEnviados] = useState(false);
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState(totalDivida.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [titulos, setTitulos] = useState<TituloRecebimento[]>([]);
  const [bonus, setBonus] = useState("");
  const [bonusManual, setBonusManual] = useState(false);
  const [saldoBonus, setSaldoBonus] = useState(0);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.getCarteiraResumo(clienteId).then((resumo) => setSaldoBonus(Number(resumo.saldoBonus || 0))).catch(() => setSaldoBonus(0));
  }, [clienteId]);
  useEffect(() => {
    if (formaPagamento === "bonus" && !bonusManual) setBonus(Math.min(Math.max(0, saldoBonus), Math.max(0, totalDivida)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }, [formaPagamento, bonusManual, saldoBonus, totalDivida]);

  const pagamentoTitulo = ehTituloPagamento(formaPagamento);
  const valorBase = parseBrazilianNumber(valor);
  const totalTitulos = useMemo(() => Math.round(titulos.reduce((soma, titulo) => soma + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0) * 100) / 100, [titulos]);
  const valorInformado = formaPagamento === "bonus" ? parseBrazilianNumber(bonus) : pagamentoTitulo ? totalTitulos : valorBase;
  const bonusUsado = formaPagamento === "bonus" ? valorInformado : 0;
  const adicionar = () => {
    if (salvando || enviados) return;
    if (!Number.isFinite(valorInformado) || valorInformado <= 0) return setErro("Informe um valor maior que zero.");
    const outros = lista.filter(l => l.id !== editando);
    const usado = outros.filter(l => l.formaPagamento === 'bonus').reduce((s,l) => s+l.valor,0);
    if (bonusUsado + usado > saldoBonus + .005) return setErro("Bônus insuficiente para esta lista.");
    if (bonusUsado + usado > totalDivida + .005) return setErro("Bônus não pode ultrapassar a dívida.");
    const item = { id: editando || novaChave(), data, formaPagamento, valor: valorInformado, parcelasCartao, titulos: structuredClone(titulos) };
    setLista(editando ? lista.map(l => l.id === editando ? item : l) : [...lista,item]);
    setEditando(null); setValor('0,00'); setBonus(''); setBonusManual(true); setTitulos([]); setErro(''); setChave(novaChave());
  };
  const totalLista = lista.reduce((s,l) => s + Math.round(l.valor*100),0)/100;
  const bonusLista = lista.filter(l => l.formaPagamento === 'bonus').reduce((s,l) => s + Math.round(l.valor*100),0)/100;
  const restanteLista = Math.max(0, Math.round((totalDivida-totalLista)*100)/100);
  const excedenteLista = Math.max(0, Math.round((totalLista-totalDivida)*100)/100);
  const registrar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (salvando || enviados || !lista.length) return;
    if (editando) return setErro('Conclua a edição antes de salvar.');
    if (valorInformado > .005) return setErro('Adicione o pagamento preenchido à lista ou zere o campo antes de salvar.');
    if (!ordem && vales.length !== 1) return setErro('Selecione um vale ou uma ordem.');
    const saldos = ordem ? ordem.vales.map(v => ({ vendaId: v.vendaId, saldo: Math.min(Number(v.saldo),Number(v.saldoAtualVale)) })) : vales.map(v => ({ vendaId:v.id,saldo:Number(v.saldoRestante) }));
    // Bônus é aplicado primeiro; somente dinheiro excedente gera novo crédito.
    const ordenados = [...lista].sort((a,b) => Number(b.formaPagamento === 'bonus')-Number(a.formaPagamento === 'bonus'));
    let dinheiroRestante = Math.round((totalLista-bonusLista)*100);
    let dividaDinheiro = Math.max(0,Math.round((totalDivida-bonusLista)*100));
    const pagamentos = ordenados.map(l => {
      const centavos = Math.round(l.valor*100);
      const aplicar = l.formaPagamento === 'bonus' ? centavos : Math.min(centavos, dinheiroRestante > 0 ? Math.round(dividaDinheiro*centavos/dinheiroRestante) : 0);
      if(l.formaPagamento !== 'bonus') { dinheiroRestante -= centavos; dividaDinheiro -= aplicar; }
      let restante = aplicar/100;
      const alocacoes = saldos.flatMap(v => {
        const valor = Math.round(Math.max(0,Math.min(v.saldo,restante))*100)/100;
        v.saldo = Math.round((v.saldo-valor)*100)/100; restante = Math.round((restante-valor)*100)/100;
        return valor > 0 ? [{ vendaId:v.vendaId,valor }] : [];
      });
      return { data:l.data, formaPagamento:l.formaPagamento, valorRecebido:l.formaPagamento === 'bonus' ? 0 : l.valor, bonusUtilizado:l.formaPagamento === 'bonus' ? l.valor : 0, ordemCobrancaId:ordem?.id, parcelasCartao:l.formaPagamento === 'cartao_credito' ? l.parcelasCartao : undefined, valoresParcelasCartao:l.formaPagamento === 'cartao_credito' ? distribuirCentavos(l.valor,l.parcelasCartao) : undefined, titulos:ehTituloPagamento(l.formaPagamento) ? l.titulos : undefined, alocacoes };
    });
    if (pagamentos.some(p => !p.alocacoes.length)) return setErro('O abatimento de uma linha ficou menor que um centavo. Agrupe os valores dessa forma de pagamento.');
    setSalvando(true); setErro('');
    try {
      await api.salvarRecebimentosLote(clienteId,chave,pagamentos);
      setEnviados(true); setFeedback('Pagamentos salvos.');
      await onSaved(); onClose();
    } catch (e: any) { setErro(e.message || 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6 backdrop-blur-sm">
    <form onSubmit={registrar} role="dialog" aria-modal="true" aria-labelledby="pagamento-vales-titulo" className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-950 p-4 text-white"><div><h2 id="pagamento-vales-titulo" className="text-sm font-black">Gerenciar pagamentos · {ordem ? `Ordem #${ordem.numeroSequencial}` : `Vale #${vales[0]?.numeroSequencial}`}</h2><p className="mt-1 text-xs font-bold text-slate-300">{clienteNome} · CPF/CNPJ: {clienteDocumento || "Não informado"}</p></div><button type="button" disabled={salvando} onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20}/></button></header>
      <fieldset disabled={salvando || enviados} className="min-w-0 space-y-3 overflow-x-hidden overflow-y-auto bg-slate-100 p-4">
        <div className={`grid items-start gap-3 rounded-xl border border-slate-300 bg-white p-3 ${formaPagamento === "cartao_credito" ? "sm:grid-cols-2 lg:grid-cols-4" : formaPagamento === "bonus" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}><label className="flex min-w-0 flex-col text-[10px] font-black uppercase text-slate-600">Data<input type="date" readOnly={pagamentoTitulo} value={data} onChange={(event) => setData(event.target.value)} className={`mt-1 h-8 w-full rounded-lg border px-3 font-bold ${pagamentoTitulo ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500" : "border-slate-300"}`} /></label>{formaPagamento !== "bonus" && <label className="flex min-w-0 flex-col text-[10px] font-black uppercase text-slate-600">{pagamentoTitulo ? "Valor para distribuir" : "Valor do pagamento"}<input autoFocus={!pagamentoTitulo} inputMode="decimal" value={valor} onChange={(event) => setValor(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-right font-mono text-sm font-black text-emerald-900" />{pagamentoTitulo && <span className="mt-1 block text-[9px] font-bold text-sky-700">Valor total para distribuir entre os títulos.</span>}</label>}<label className="flex min-w-0 flex-col text-[10px] font-black uppercase text-slate-600">Forma de pagamento<select value={formaPagamento} onChange={(event) => { setFormaPagamento(event.target.value); setBonusManual(false); setTitulos([]); setErro(""); }} className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-3 font-bold">{FORMAS_PAGAMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}</select></label>{formaPagamento === "cartao_credito" && <ParcelamentoCartaoSelect formaPagamento={formaPagamento} parcelas={parcelasCartao} onChange={setParcelasCartao} valorTotal={valorBase} disabled={salvando} className="!max-w-none [&_select]:h-8"/>}</div>
        {formaPagamento === "bonus" && <label className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-300 bg-violet-50 p-3 text-xs font-black text-violet-900"><span>Bônus disponível: {formatCurrency(saldoBonus)}</span><span>Bônus a utilizar</span><input aria-label="Bônus a utilizar" inputMode="decimal" value={bonus} disabled={salvando} onChange={event => { setBonusManual(true); setBonus(event.target.value); }} className="w-32 rounded-lg border border-violet-300 bg-white p-2 text-right font-mono"/></label>}
        <TitulosPagamentoEditor mostrarObservacao={false} formaPagamento={formaPagamento} clienteId={clienteId} clienteNome={clienteNome} clienteDocumento={clienteDocumento} valorPagamento={formaPagamento === "bonus" ? 0 : valorBase} titulos={titulos} onChange={setTitulos} />
        <div className="flex gap-2"><button type="button" onClick={adicionar} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">{editando ? 'Aplicar edição' : '+ Adicionar pagamento'}</button>{editando && <button type="button" onClick={() => { setEditando(null); setValor('0,00'); setTitulos([]); }} className="text-xs">Cancelar edição</button>}</div>
        <div className="overflow-auto rounded-lg border bg-white"><table className="w-full text-xs"><thead className="bg-slate-100 text-left"><tr><th className="p-2">Data</th><th>Forma</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{lista.map(l => <tr key={l.id} className="border-t"><td className="p-2">{l.data.split('-').reverse().join('/')}</td><td>{FORMAS_PAGAMENTO.find(f => f.value === l.formaPagamento)?.label}{l.titulos.length > 0 && ` · ${l.titulos.length} título(s)`}</td><td className="font-mono">{formatCurrency(l.valor)}</td><td className="space-x-3"><button type="button" onClick={() => { setEditando(l.id); setData(l.data); setFormaPagamento(l.formaPagamento); setValor(l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})); setBonus(l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})); setBonusManual(true); setParcelasCartao(l.parcelasCartao); setTitulos(structuredClone(l.titulos)); }} className="text-blue-700">Editar</button><button type="button" onClick={() => { setLista(lista.filter(x => x.id !== l.id)); if(editando === l.id) setEditando(null); setChave(novaChave()); }} className="text-red-700">Remover</button></td></tr>)}</tbody></table>{!lista.length && <p className="p-3 text-xs text-slate-500">Adicione os pagamentos antes de salvar.</p>}</div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{[['Total da lista',totalLista],['Recebido em dinheiro/títulos',totalLista-bonusLista],['Dívida',totalDivida],['Abatimento',Math.min(totalDivida,totalLista)],['Restante',restanteLista],['Bônus utilizado',bonusLista],['Novo bônus',excedenteLista],['Bônus após salvar',Math.max(0,saldoBonus-bonusLista+excedenteLista)]].map(([rotulo,v]) => <div key={String(rotulo)} className="rounded-lg border bg-white p-2"><span className="block text-slate-500">{rotulo}</span><strong className="font-mono">{formatCurrency(Number(v))}</strong></div>)}</div>
        {feedback && <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-black text-emerald-800"><CheckCircle2 size={16}/>{feedback}</div>}
        {erro && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800">{erro}</div>}
      </fieldset>
      <footer className="flex justify-end gap-2 border-t border-slate-300 bg-white p-3"><button type="button" disabled={salvando} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black uppercase">Voltar</button><button type="submit" disabled={salvando || enviados || !lista.length || Boolean(editando)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40">{salvando ? <Loader2 className="animate-spin" size={16}/> : excedenteLista > 0.005 ? <CheckCircle2 size={16}/> : <Coins size={16}/>}Salvar pagamentos</button></footer>
    </form>
  </div>;
}
