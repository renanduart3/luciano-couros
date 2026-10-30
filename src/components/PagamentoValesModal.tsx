import { ConfirmarAcaoPagamentosOrdem } from "./ConfirmarAcaoPagamentosOrdem";
import type { ItemAcaoPagamentoOrdem, PagamentoGerenciavel } from "../types";
import { LinhaPagamento } from "./LinhaPagamento";
import { useEhGerente } from "../auth/AuthContext";
import React, { useEffect, useMemo, useState } from "react";
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
  const [acaoCorrecao,setAcaoCorrecao] = useState<{acao:"excluir"|"estornar";itens:ItemAcaoPagamentoOrdem[]} | null>(null);
  const gerente = useEhGerente();
  const [corrigindo, setCorrigindo] = useState(false);
  const totalDivida = ordem ? ordem.saldo : vales.reduce((total, vale) => total + Number(vale.saldoRestante), 0);
  type Rascunho = { id: string; data: string; formaPagamento: string; valor: number; parcelasCartao: number; titulos: TituloRecebimento[] };
  const [diferencaManual, setDiferencaManual] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
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
    if (formaPagamento === "bonus" && !bonusManual) setBonus(Math.max(0, saldoBonus - lista.filter(l => l.formaPagamento === 'bonus' && l.id !== editando).reduce((s,l) => s + l.valor, 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }, [formaPagamento, bonusManual, saldoBonus, lista, editando]);

  const pagamentoTitulo = ehTituloPagamento(formaPagamento);
  const valorBase = parseBrazilianNumber(valor);
  const totalTitulos = useMemo(() => Math.round(titulos.reduce((soma, titulo) => soma + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0) * 100) / 100, [titulos]);
  const valorInformado = formaPagamento === "bonus" ? parseBrazilianNumber(bonus) : pagamentoTitulo ? totalTitulos : valorBase;
  const bonusUsado = formaPagamento === "bonus" ? valorInformado : 0;
  const adicionar = () => {
    if (salvando || enviados || corrigindo) return;
    if (!Number.isFinite(valorInformado) || valorInformado <= 0) return setErro("Informe um valor maior que zero.");
    if (pagamentoTitulo && titulos.some(t => !t.nomeTitular.trim() || !t.documentoTitular.trim() || !t.vencimento || !t.numeroDocumento.trim() || !Number.isFinite(t.valor) || t.valor <= 0)) return setErro('Preencha titular, CPF/CNPJ, vencimento e número do documento.');
    const outros = lista.filter(l => l.id !== editando);
    const usado = outros.filter(l => l.formaPagamento === 'bonus').reduce((s,l) => s+l.valor,0);
    if (bonusUsado + usado > saldoBonus + .005) return setErro("Bônus insuficiente para esta lista.");
    if (bonusUsado + usado > totalDivida + .005) return setErro("Bônus não pode ultrapassar a dívida.");
    const item = { id: editando || novaChave(), data, formaPagamento, valor: valorInformado, parcelasCartao, titulos: structuredClone(titulos) };
    setDiferencaManual(null); setLista(editando ? lista.map(l => l.id === editando ? item : l) : [...lista,item]);
    setEditando(null); setFormaPagamento('pix'); setValor('0,00'); setBonus(''); setBonusManual(true); setTitulos([]); setErro(''); setChave(novaChave());
  };
  const totalLista = lista.reduce((s,l) => s + Math.round(l.valor*100),0)/100;
  const bonusLista = lista.filter(l => l.formaPagamento === 'bonus').reduce((s,l) => s + Math.round(l.valor*100),0)/100;
  const diferencaAutomatica = Math.round((totalLista-totalDivida)*100)/100;
  const diferenca = diferencaManual === null ? diferencaAutomatica : parseBrazilianNumber(diferencaManual);
  const acrescimoDivida = diferenca < 0 ? Math.round(Math.max(0,diferencaAutomatica-diferenca)*100)/100 : 0;
  const totalAplicar = Math.round((totalDivida + acrescimoDivida + Math.min(0, diferenca)) * 100) / 100;
  const bonusDispensado = Math.round((Math.max(0, totalLista - totalAplicar) - Math.max(0, diferenca)) * 100) / 100;
  const registrar = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (salvando || enviados || corrigindo || !lista.length) return;
    if (editando) return setErro('Conclua a edição antes de salvar.');
    if (valorInformado > .005) return setErro('Adicione o pagamento preenchido à lista ou zere o campo antes de salvar.');
    if (!ordem && vales.length !== 1) return setErro('Selecione um vale ou uma ordem.');
    if (!Number.isFinite(diferenca)) return setErro('Informe um valor válido para o bônus ou saldo devedor.');
    if (totalAplicar < bonusLista - .005) return setErro('O saldo devedor informado conflita com o bônus utilizado. Reduza o bônus aplicado à lista.');
    if (event) { setErro(''); setConfirmando(true); return; }
    const saldos = ordem ? ordem.vales.map(v => ({ vendaId: v.vendaId, saldo: Math.min(Number(v.saldo),Number(v.saldoAtualVale)) })) : vales.map(v => ({ vendaId:v.id,saldo:Number(v.saldoRestante) }));
    let acrescimoRestante = Math.round(acrescimoDivida*100);
    let saldoParaRateio = Math.round(saldos.reduce((s,v)=>s+v.saldo,0)*100);
    const acrescimosDivida = saldos.flatMap(v => {
      const saldoCentavos = Math.round(v.saldo*100);
      const parte = saldoParaRateio > 0 ? Math.round(acrescimoRestante*saldoCentavos/saldoParaRateio) : 0;
      saldoParaRateio -= saldoCentavos; acrescimoRestante -= parte;
      v.saldo = (saldoCentavos+parte)/100;
      return parte > 0 ? [{vendaId:v.vendaId,valor:parte/100}] : [];
    });
    // Crédito existente é aplicado primeiro; o ajuste manual determina o novo bônus.
    const ordenados = [...lista].sort((a,b) => Number(b.formaPagamento === 'bonus')-Number(a.formaPagamento === 'bonus'));
    let dinheiroRestante = Math.round((totalLista-bonusLista)*100);
    let dividaDinheiro = Math.max(0,Math.round((totalAplicar-bonusLista)*100));
    const pagamentos = ordenados.map((l, indice) => {
      const centavos = Math.round(l.valor*100);
      const aplicar = l.formaPagamento === 'bonus' ? centavos + (totalLista === bonusLista && indice === ordenados.length - 1 ? Math.round((totalAplicar-bonusLista)*100) : 0) : (dinheiroRestante > 0 ? Math.round(dividaDinheiro*centavos/dinheiroRestante) : 0);
      if(l.formaPagamento !== 'bonus') { dinheiroRestante -= centavos; dividaDinheiro -= aplicar; }
      const descontoLinha = Math.max(0,Math.round((aplicar/100 - l.valor) * 100) / 100);
      let restante = aplicar/100;
      const alocacoes = saldos.flatMap(v => {
        const valor = Math.round(Math.max(0,Math.min(v.saldo,restante))*100)/100;
        v.saldo = Math.round((v.saldo-valor)*100)/100; restante = Math.round((restante-valor)*100)/100;
        return valor > 0 ? [{ vendaId:v.vendaId,valor }] : [];
      });
      return { acrescimosDivida: indice === 0 ? acrescimosDivida : undefined, descontoRecebimento: descontoLinha, bonusDispensado: 0, data:l.data, formaPagamento:l.formaPagamento, valorRecebido:l.formaPagamento === 'bonus' ? 0 : l.valor, bonusUtilizado:l.formaPagamento === 'bonus' ? l.valor : 0, ordemCobrancaId:ordem?.id, parcelasCartao:l.formaPagamento === 'cartao_credito' ? l.parcelasCartao : undefined, valoresParcelasCartao:l.formaPagamento === 'cartao_credito' ? distribuirCentavos(l.valor,l.parcelasCartao) : undefined, titulos:ehTituloPagamento(l.formaPagamento) ? l.titulos : undefined, alocacoes };
    });
    let dispensar = bonusDispensado;
    for (const p of [...pagamentos].sort((a,b) => a.bonusUtilizado-b.bonusUtilizado)) {
      const excedente = Math.max(0,p.valorRecebido + p.bonusUtilizado - p.alocacoes.reduce((s,a)=>s+a.valor,0));
      p.bonusDispensado = Math.round((dispensar < 0 ? dispensar : Math.min(dispensar,excedente))*100)/100;
      dispensar = Math.round((dispensar-p.bonusDispensado)*100)/100;
    }
    if (pagamentos.some(p => !p.alocacoes.length)) return setErro('O abatimento de uma linha ficou menor que um centavo. Agrupe os valores dessa forma de pagamento.');
    setSalvando(true); setErro('');
    try {
      await api.salvarRecebimentosLote(clienteId,chave,pagamentos);
      setConfirmando(false); setEnviados(true); setFeedback('Pagamentos salvos.');
      await onSaved(); onClose();
    } catch (e: any) { setErro(e.message || 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  };

  const valeAtual = vales[0];
  const legado: PagamentoGerenciavel | undefined = !ordem && !valeAtual?.recebimentos?.length && Number(valeAtual?.valorPago)>0.005 ? {
    id:valeAtual.id, recebimentoId:valeAtual.id, clienteId,clienteNome,data:valeAtual.ultimoPagamentoData || valeAtual.data,valorRecebido:Math.max(0,Number(valeAtual.valorPago)-Number(valeAtual.bonusLegado || 0)),valorAplicado:Number(valeAtual.valorPago),bonusUtilizado:Number(valeAtual.bonusLegado || 0),bonusGerado:0,formaPagamento:valeAtual.formaPagamento || 'Pagamento antigo',status:'ativo',statusPagamento:'compensado',titulos:[],alocacoes:[],historico:[],createdAt:valeAtual.data,updatedAt:valeAtual.data
  } : undefined;
  const pagamentosRegistrados = ordem?.pagamentos || (legado ? [legado] : valeAtual?.recebimentos || []);
  const alocarCorrecao = (valor: number) => {
    let restante = valor;
    return (ordem ? ordem.vales.map(v=>({id:v.vendaId,saldo:Math.min(Number(v.saldo),Number(v.saldoAtualVale))})) : vales.map(v=>({id:v.id,saldo:Number(v.saldoRestante)}))).flatMap(v=>{const aplicado=Math.max(0,Math.min(restante,v.saldo));restante-=aplicado;return aplicado>0?[{vendaId:v.id,valor:aplicado}]:[];});
  };
  const atualizarCorrecao = async () => { await onSaved(); onClose(); };
  return <>{confirmando && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="confirmar-recebimento" className="receber-confirmacao"><h2 id="confirmar-recebimento">ATENÇÃO</h2><div><p>Tem certeza que deseja receber a quantia de <strong>{formatCurrency(totalLista)}</strong> do cliente:</p><p><strong>{clienteNome}</strong></p><div className="receber-certificacao"><strong>CERTIFICAÇÃO DOS VALORES</strong><p>Soma dos títulos: <b>{formatCurrency(totalDivida)}</b><br/>Total Recebimento: <b>{formatCurrency(totalLista)}</b><br/>BÔNUS DO CLIENTE OU VALOR A RECEBER DO CLIENTE: <b>{formatCurrency(diferenca)}</b> {diferenca < 0 ? '(VALE)' : diferenca > 0 ? '(BÔNUS)' : '()'}<br/>Acréscimo nos vales: <b>{formatCurrency(acrescimoDivida)}</b><br/>Valor do Juros: <b>{formatCurrency(0)}</b></p></div>{erro && <p role="alert" className="text-red-700">{erro}</p>}</div><footer><button type="button" autoFocus disabled={salvando || enviados} onClick={()=>void registrar()}>{salvando?'Salvando…':'Sim'}</button><button type="button" disabled={salvando} onClick={()=>setConfirmando(false)}>Não</button></footer></section></div>}{acaoCorrecao && ordem && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/70 p-4"><ConfirmarAcaoPagamentosOrdem ordemId={ordem.id} acao={acaoCorrecao.acao} itens={acaoCorrecao.itens} onCancel={()=>setAcaoCorrecao(null)} onSaved={()=>void atualizarCorrecao()}/></div>}<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-3">
    <form noValidate inert={confirmando} onSubmit={registrar} role="dialog" aria-modal="true" aria-labelledby="pagamento-vales-titulo" className="receber-painel">
      <header><h2 id="pagamento-vales-titulo">Gestão de recebimentos · {ordem ? `Ordem #${ordem.numeroSequencial}` : `Vale #${vales[0]?.numeroSequencial}`}</h2><div><button type="submit" disabled={salvando || enviados || corrigindo || !lista.length || Boolean(editando)} className="receber-salvar">{salvando ? 'Salvando…' : 'Salvar pagamentos'}</button><button type="button" disabled={salvando} onClick={onClose}>Fechar</button></div></header>
      <fieldset disabled={salvando || enviados}>
        <div className="receber-identificacao"><label>Cliente<input readOnly value={clienteNome}/></label><label>CPF/CNPJ<input readOnly value={clienteDocumento || ''}/></label><label>Dívida<input readOnly value={formatCurrency(totalDivida)}/></label><label>Data<input type="date" value={data} onChange={e=>setData(e.target.value)}/></label></div>
        <div className={`receber-entrada ${pagamentoTitulo ? "receber-com-titulos" : ""}`}>
          <aside className="receber-documentos"><strong>Vales a receber</strong><ul>{(ordem ? ordem.vales.map(v=>({id:v.vendaId,numero:v.numeroSequencial,saldo:Math.min(Number(v.saldo),Number(v.saldoAtualVale))})) : vales.map(v=>({id:v.id,numero:v.numeroSequencial,saldo:v.saldoRestante}))).map(v=><li key={v.id}>#{v.numero} · {formatCurrency(Number(v.saldo))}</li>)}</ul><span>Soma dos títulos <b>{formatCurrency(totalDivida)}</b></span></aside>
          <div className="receber-forma"><label>Forma de pagamento<select value={formaPagamento} onChange={e=>{setFormaPagamento(e.target.value);setBonusManual(false);setTitulos([]);setValor(Math.max(0,totalDivida-lista.filter(l=>l.id!==editando).reduce((s,l)=>s+l.valor,0)).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));setErro('');}}>{FORMAS_PAGAMENTO.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>{<label>{formaPagamento==='bonus'?'Bônus a utilizar':pagamentoTitulo?'Valor para dividir':'Valor do pagamento'}<input aria-label={formaPagamento==='bonus'?'Bônus a utilizar':'Valor do pagamento'} inputMode="decimal" value={formaPagamento==='bonus'?bonus:valor} onChange={e=>{if(formaPagamento==='bonus'){setBonus(e.target.value);setBonusManual(true);}else setValor(e.target.value);}}/></label>}{formaPagamento==='bonus' && <small>Disponível: {formatCurrency(Math.max(0,saldoBonus-bonusLista))}</small>}</div>
          <div className="receber-especificos">{pagamentoTitulo && <div key={`${formaPagamento}-${editando || "novo"}`}><TitulosPagamentoEditor formaPagamento={formaPagamento} clienteId={clienteId} clienteNome={clienteNome} clienteDocumento={clienteDocumento} valorPagamento={valorBase} titulos={titulos} onChange={setTitulos} mostrarObservacao={false}/></div>} {formaPagamento==='cartao_credito' && <ParcelamentoCartaoSelect formaPagamento={formaPagamento} parcelas={parcelasCartao} onChange={setParcelasCartao} valorTotal={valorBase} disabled={salvando}/>}</div>
        </div>
        <div className="receber-lancamentos"><nav>        <div className="flex gap-2"><button type="button" onClick={adicionar} className={`receber-adicionar rounded-lg ${editando ? "bg-emerald-700" : "bg-blue-700"} px-3 py-2 text-xs font-bold text-white}`}>{editando ? 'Salvar' : '+ Adicionar pagamento'}</button>{editando && <button type="button" onClick={() => { setEditando(null); setFormaPagamento('pix'); setValor('0,00'); setTitulos([]); }} className="rounded-lg bg-red-700 px-3 py-2 text-xs text-white">Cancelar</button>}</div>
</nav><div className="receber-lista">        <div className="overflow-auto rounded-lg border bg-white"><table className="w-full text-xs"><thead className="bg-slate-100 text-left"><tr><th className="p-2">Data</th><th>Forma / documento</th><th>Titular</th><th>Vencimento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{lista.flatMap(l => {
  const linhas = ehTituloPagamento(l.formaPagamento) ? l.titulos : [null];
  return linhas.map((titulo, indice) => <tr key={`${l.id}-${indice}`} className="border-t" data-rascunho-id={l.id}>
    <td className="p-2">{l.data.split('-').reverse().join('/')}</td>
    <td>{FORMAS_PAGAMENTO.find(f => f.value === l.formaPagamento)?.label}{titulo && ` · Nº ${titulo.numeroDocumento}`}</td>
    <td>{titulo?.nomeTitular || '—'}</td><td>{titulo?.vencimento ? titulo.vencimento.split('-').reverse().join('/') : '—'}</td>
    <td className="font-mono">{formatCurrency(titulo ? titulo.valor : l.valor)}</td>
    <td className="space-x-3"><button type="button" onClick={() => {
      setEditando(l.id); setData(l.data); setFormaPagamento(l.formaPagamento); setValor(l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}));
      setBonus(l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})); setBonusManual(true); setParcelasCartao(l.parcelasCartao);
      setTitulos(structuredClone(l.titulos).map(t=>({...t,valorManual:true})));
      requestAnimationFrame(()=>document.querySelector('.receber-especificos')?.scrollIntoView({block:'nearest',behavior:'smooth'}));
    }} className="text-blue-700">{titulo ? 'Editar títulos' : 'Editar'}</button><button type="button" disabled={Boolean(editando)} onClick={() => {
      setDiferencaManual(null);
      const restantes = l.titulos.filter((_,i)=>i!==indice);
      setLista(lista.flatMap(x => x.id !== l.id ? [x] : titulo && restantes.length ? [{...x,titulos:restantes,valor:Math.round(restantes.reduce((s,t)=>s+t.valor,0)*100)/100}] : []));
      setChave(novaChave());
    }} className="text-red-700">Remover</button></td>
  </tr>);
})}</tbody></table>{!lista.length && <p className="p-3 text-xs text-slate-500">Adicione os pagamentos antes de salvar.</p>}</div>
</div><aside className="receber-totais"><label>Bônus/Diferença recebimento<div className="receber-zeravel"><input aria-label="Bônus/Diferença recebimento" inputMode="decimal" value={diferencaManual ?? diferencaAutomatica.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} onChange={e=>{setDiferencaManual(e.target.value);setChave(novaChave());}}/><button type="button" aria-label="Zerar bônus ou saldo devedor" onClick={()=>{setDiferencaManual('0,00');setChave(novaChave());}}>×</button></div></label><label>Acréscimo nos vales<output>{formatCurrency(acrescimoDivida)}</output></label><label>Valor do juros<output>{formatCurrency(0)}</output></label><label>Total recebimento<output>{formatCurrency(totalLista)}</output></label></aside></div>
        {(pagamentosRegistrados.length > 0 || !!ordem?.projecoes?.length) && <section className="mt-3"><h3 className="mb-1 font-bold">Pagamentos registrados · correções</h3>{lista.length > 0 && <p>Salve ou remova os novos lançamentos antes de corrigir pagamentos anteriores.</p>}<div className="overflow-auto"><table className="payments-table w-full min-w-[700px] text-xs"><thead><tr>{['Data','Valor','Recebido','Forma de pagamento','Situação','Ações'].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{pagamentosRegistrados.map(p=><LinhaPagamento listarTitulosSeparados key={p.id} pagamento={p} somenteReabertura={Boolean(legado)} alvoReabertura={legado ? {tipo:"vale",id:valeAtual.id} : undefined} onEstornar={ordem ? ()=>setAcaoCorrecao({acao:"estornar",itens:[{tipo:"recebimento",id:p.id}]}) : undefined} onExcluir={ordem ? ()=>setAcaoCorrecao({acao:"excluir",itens:[{tipo:"recebimento",id:p.id}]}) : undefined} clienteId={clienteId} clienteNome={clienteNome} clienteDocumento={clienteDocumento} saldo={0} ordemCobrancaId={ordem?.id} vendaIdContexto={ordem ? undefined : vales[0]?.id} referencia={ordem ? `ordem #${ordem.numeroSequencial}` : `vale #${vales[0]?.numeroSequencial}`} alocar={alocarCorrecao} editavel={gerente && !lista.length} onSaved={atualizarCorrecao} onEditingChange={setCorrigindo} onSavingChange={setSalvando}/>)}{ordem?.projecoes?.map(p=><LinhaPagamento listarTitulosSeparados key={p.id} projecao={p} onExcluir={()=>setAcaoCorrecao({acao:"excluir",itens:[{tipo:"projecao",id:p.id}]})} clienteId={clienteId} clienteNome={clienteNome} clienteDocumento={clienteDocumento} saldo={totalDivida} ordemCobrancaId={ordem.id} referencia="previsão" alocar={alocarCorrecao} editavel={gerente && !lista.length} onSaved={atualizarCorrecao} onEditingChange={setCorrigindo} onSavingChange={setSalvando}/>)}</tbody></table></div></section>}
        {feedback && <p role="status">{feedback}</p>}{erro && <p role="alert" className="text-red-700">{erro}</p>}
      </fieldset>
    </form>
  </div></>;
}
