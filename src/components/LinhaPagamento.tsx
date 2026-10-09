import React, { useEffect, useState } from "react";
import { Banknote, FileText, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { recebidoDaLinha } from "../lib/financeiro";
import { api } from "../lib/api";
import { OrdemCobranca, ProjecaoPagamentoOrdem, PagamentoGerenciavel, TituloRecebimento } from "../types";
import { formatCurrency, formatDate, parseBrazilianNumber, todayLocalIso } from "../lib/utils";
import { ehTituloPagamento, FORMAS_PAGAMENTO } from "../lib/pagamentos";
import { TitulosPagamentoEditor } from "./TitulosPagamentoEditor";
import { ParcelamentoCartaoSelect, ResumoParcelamentoCartao } from "./ParcelamentoCartaoSelect";
import { distribuirCentavos } from '../lib/distribuicaoPagamento';

type Situacao = "em_aberto" | "compensado" | "aguardando" | "recusado";
const nomes: Record<Situacao, string> = { em_aberto: "Em aberto", compensado: "Confirmado", aguardando: "Aguardando", recusado: "Recusado" };
const campo = "h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100";

export function LinhaPagamento({ children, mostrarAbatimento = false, colunasAntes = 0, pagamento, clienteId, clienteNome, clienteDocumento, saldo,
  vendaIdContexto, onDetalhes, projecao, onEstornar, onExcluir, alocar, parcelaOrdemId, ordemCobrancaId, referencia, onSaved, onComprovante, editavel = true, alvoReabertura, somenteReabertura = false, iniciarEditando = false, onCancel, statusSemPagamento, formaPagamentoPrevista, onEditingChange, onSavingChange,
}: {
  mostrarAbatimento?: boolean;
  vendaIdContexto?: string;
  projecao?: ProjecaoPagamentoOrdem; onEstornar?: () => void; onExcluir?: () => void;
  key?: string; children?: React.ReactNode; colunasAntes?: number; pagamento?: PagamentoGerenciavel; somenteReabertura?: boolean;
  clienteId: string; clienteNome: string; clienteDocumento?: string; saldo: number;
  alocar: (valor: number) => Array<{ vendaId: string; valor: number }>;
  parcelaOrdemId?: string; ordemCobrancaId?: string; referencia: string; onSaved: (resultado?: { estornado: boolean; ordem?: OrdemCobranca }) => Promise<void>;
  onDetalhes?: (id: string) => void;
  onComprovante?: (id: string) => void; editavel?: boolean;
  alvoReabertura?: { tipo: "vale" | "parcela" | "recebimento"; id: string };
  iniciarEditando?: boolean; onCancel?: () => void; statusSemPagamento?: string; formaPagamentoPrevista?: string | null;
  onEditingChange?: (editing: boolean) => void; onSavingChange?: (saving: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [novo, setNovo] = useState(!pagamento);
  const [data, setData] = useState(todayLocalIso());
  const [bonus, setBonus] = useState("");
  const [bonusAtivo, setBonusAtivo] = useState(false);
  const [saldoBonus, setSaldoBonus] = useState(0);
  useEffect(() => { if (editando) api.getCarteiraResumo(clienteId).then(r => setSaldoBonus(Number(r.saldoBonus || 0))).catch(() => setSaldoBonus(0)); }, [clienteId, editando]);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState("pix");
  const [situacao, setSituacao] = useState<Situacao>("compensado");
  const [titulos, setTitulos] = useState<TituloRecebimento[]>([]);
  const [cartao, setCartao] = useState(1);
  const credito = distribuirCentavos(parseBrazilianNumber(valor), cartao);
  const [pin, setPin] = useState("");
  const [revisaoEdicao, setRevisaoEdicao] = useState<string>();
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { onEditingChange?.(editando); }, [editando, onEditingChange]);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);
  const [plano, setPlano] = useState<Awaited<ReturnType<typeof api.getReaberturaPagamento>> | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const titulo = ehTituloPagamento(forma);
  const total = titulo ? Math.round(titulos.reduce((s, t) => s + (t.status === "recusado" ? 0 : Number(t.valor || 0)), 0) * 100) / 100 : parseBrazilianNumber(valor);
  const bonusUsado = forma === "bonus" ? total : bonusAtivo ? parseBrazilianNumber(bonus) : 0;
  const totalAbatimento = forma === "bonus" ? total : total + bonusUsado;
  const recebido = pagamento ? recebidoDaLinha(pagamento, vendaIdContexto, ordemCobrancaId) : 0;
  const colunas = colunasAntes + 6 + Number(mostrarAbatimento);
  const iniciar = (criar = false) => {
    setExcluindo(false);
    const existente = criar ? undefined : pagamento || projecao?.dados;
    setRevisaoEdicao(projecao?.revisao || existente?.revisao);
    setNovo(!pagamento || criar); setConcluido(false); setPlano(null); setConfirmado(false); setErro(""); setPin("");
    setBonus(String(existente?.formaPagamento === "bonus" ? 0 : existente?.bonusUtilizado || 0).replace(".", ","));
    setBonusAtivo(Number(existente?.bonusUtilizado || 0) > 0);
    setData(existente?.data || todayLocalIso());
    setValor(Number(existente ? (existente.formaPagamento === "bonus" ? existente.bonusUtilizado : existente.valorRecebido) : saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const formaInicial = existente?.formaPagamento || formaPagamentoPrevista || pagamento?.formaPagamento || "pix";
    setForma(formaInicial); setSituacao(projecao ? "em_aberto" : existente?.statusPagamento || (ehTituloPagamento(formaInicial) ? "aguardando" : "compensado"));
    setTitulos(existente?.titulos || []); setCartao(existente?.parcelasCartao || 1); setEditando(true);
  };
  const trocarStatus = async (status: Situacao) => {
    setSituacao(status); setErro(""); setPlano(null); setConfirmado(false);
    if (projecao) { setTitulos(itens => itens.map(t => ({ ...t, status: status === "compensado" ? "compensado" : "aguardando", dataCompensacao: status === "compensado" ? data : undefined }))); return; }
    if (status !== "em_aberto") {
      setTitulos((itens) => itens.map((t) => ({ ...t, status, dataCompensacao: status === "compensado" ? data : undefined })));
      return;
    }
    if (novo || !pagamento) return;
    setRevisando(true);
    try { setPlano(await api.getReaberturaPagamento(alvoReabertura?.tipo || "recebimento", alvoReabertura?.id || pagamento.id)); }
    catch (error: any) { setErro(error.message); }
    finally { setRevisando(false); }
  };
  useEffect(() => { if (iniciarEditando) iniciar(); }, []);
  const salvar = async () => {
    if (saving || revisando || concluido) return;
    setErro("");
    if (somenteReabertura && !novo && situacao !== "em_aberto") return setErro("Selecione Em aberto para corrigir o pagamento.");
    if ((!novo || projecao) && pin.length < 4) return setErro("Informe a senha do gerente.");
    if (situacao === "em_aberto" && !projecao && (!plano || !confirmado)) return setErro("Confira e confirme o estorno abaixo.");
    if (situacao !== "em_aberto" && (!data || !Number.isFinite(totalAbatimento) || bonusUsado < 0 || total < 0 || (totalAbatimento <= 0 && situacao !== "recusado"))) return setErro("Informe data e valor válidos.");
    setSaving(true);
    try {
      let ordemAtualizada: OrdemCobranca | undefined;
      if (projecao && situacao === "em_aberto") {
        ordemAtualizada = await api.updateProjecaoOrdem(ordemCobrancaId!, projecao.id, { pin, revisao: revisaoEdicao!,
          data, formaPagamento: forma, valorRecebido: total, bonusUtilizado: bonusUsado, parcelasCartao: forma === "cartao_credito" ? credito.length : cartao,
          valoresParcelasCartao: forma === "cartao_credito" ? credito : undefined, titulos: titulo ? titulos : undefined });
      } else if (situacao === "em_aberto" && pagamento && plano) {
        await api.reabrirPagamento(alvoReabertura?.tipo || "recebimento", alvoReabertura?.id || pagamento.id, { pin, revisao: plano.revisao, motivo: `Reabertura de ${referencia}` });
      } else if (!novo && pagamento) {
        const resultado = await api.updateRecebimentoCliente(pagamento.id, { pin, revisao: revisaoEdicao, ordemCobrancaId, status: situacao as PagamentoGerenciavel["statusPagamento"], data,
          valorRecebido: total, bonusUtilizado: bonusUsado, formaPagamento: forma, parcelasCartao: forma === 'cartao_credito' ? credito.length : cartao, valoresParcelasCartao: forma === 'cartao_credito' ? credito : undefined,
          dataCompensacao: situacao === "compensado" ? data : undefined,
          observacao: pagamento.observacao, titulos: titulo ? titulos : undefined, alocacoes: [], distribuicaoAutomatica: true });
        ordemAtualizada = resultado.ordemAtualizada;
      } else {
        if (forma === "bonus" && total > saldo + 0.005) throw new Error("O uso de bônus não pode ultrapassar o saldo.");
        const resultado = await api.createRecebimentoCliente(clienteId, { projecaoId: projecao?.id, projecaoRevisao: revisaoEdicao, pin: projecao ? pin : undefined, data, valorRecebido: forma === "bonus" ? 0 : total, bonusUtilizado: bonusUsado,
          formaPagamento: forma, parcelasCartao: forma === 'cartao_credito' ? credito.length : cartao, valoresParcelasCartao: forma === 'cartao_credito' ? credito : undefined, titulos: titulo ? titulos : undefined,
          parcelaOrdemId, ordemCobrancaId, observacao: `Pagamento de ${referencia}`, alocacoes: alocar(totalAbatimento) });
        ordemAtualizada = resultado.ordemAtualizada;
      }
      // A gravação terminou; falha no recarregamento não pode repetir um recebimento.
      setConcluido(true); setPin("");
      await onSaved({ estornado: !projecao && situacao === 'em_aberto', ordem: ordemAtualizada });
      setEditando(false); setPlano(null);
    } catch (error: any) { setErro(error.message || "Não foi possível salvar o pagamento."); }
    finally { setSaving(false); }
  };
  return <>
    <tr data-recebimento-id={pagamento?.id} tabIndex={-1} className={editando ? "payment-row payment-compact bg-blue-50" : "payment-row payment-compact bg-white"}>{children}
      <td data-label="Data" className="p-2">{editando ? <input aria-label={`Data ${referencia}`} type="date" value={data} disabled={saving || (!projecao && situacao === "em_aberto") || concluido} onChange={e => setData(e.target.value)} className={campo}/> : pagamento || projecao ? formatDate((pagamento || projecao!.dados).data) : "—"}</td>
      <td data-label="Valor" className="p-2 text-right font-mono">{editando ? <input aria-label={`Valor ${referencia}`} inputMode="decimal" value={titulo ? total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : valor} readOnly={titulo} disabled={saving || (!projecao && situacao === "em_aberto") || concluido} onChange={e => setValor(e.target.value)} className={`${campo} min-w-24 text-right`}/>  : pagamento || projecao ? <>
        <span className="font-bold">{formatCurrency((pagamento || projecao!.dados).valorRecebido)}</span>
        {Number((pagamento || projecao!.dados).bonusUtilizado) > 0 && <span className="block text-[10px] font-sans text-violet-800">+ {formatCurrency((pagamento || projecao!.dados).bonusUtilizado)} em bônus utilizado</span>}
        {pagamento?.status === "ativo" && pagamento.bonusGerado > 0 && <span className="block text-[10px] font-sans text-violet-800">Excedente em bônus: {formatCurrency(pagamento.bonusGerado)}</span>}
      </> : "—"}</td>
      {mostrarAbatimento && <td data-label="Abatido" className="p-2 text-right font-mono font-bold">{pagamento ? formatCurrency(pagamento.status === "ativo" ? pagamento.valorAplicadoOrdem ?? pagamento.valorAplicado : 0) : "—"}</td>}
      <td data-label={mostrarAbatimento ? "Confirmado" : "Recebido"} className="p-2 text-right font-mono font-bold text-emerald-800">{pagamento ? formatCurrency(recebido) : "—"}</td>
      <td data-label="Forma de pagamento" className="p-2">{editando ? <select aria-label={`Forma ${referencia}`} value={forma} disabled={saving || (!projecao && situacao === "em_aberto") || concluido} onChange={e => { setForma(e.target.value); setTitulos([]); setSituacao(projecao && situacao === "em_aberto" ? "em_aberto" : ehTituloPagamento(e.target.value) ? "aguardando" : "compensado"); }} className={`${campo} min-w-32`}>{FORMAS_PAGAMENTO.filter(f => f.value !== "bonus" || forma === "bonus").map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select> : <>{projecao ? FORMAS_PAGAMENTO.find(f => f.value === projecao.dados.formaPagamento)?.label : pagamento ? FORMAS_PAGAMENTO.find(f => f.value === pagamento.formaPagamento)?.label || pagamento.formaPagamento : FORMAS_PAGAMENTO.find(f => f.value === formaPagamentoPrevista)?.label || "—"}<ResumoParcelamentoCartao formaPagamento={(pagamento || projecao?.dados)?.formaPagamento || ""} parcelasCartao={(pagamento || projecao?.dados)?.parcelasCartao} valoresParcelasCartao={(pagamento || projecao?.dados)?.valoresParcelasCartao} valorTotal={(pagamento || projecao?.dados)?.valorRecebido || 0} className="mt-1" /></>}</td>
      <td data-label="Situação" className="p-2 font-bold">{editando ? <select aria-label={`Status ${referencia}`} value={situacao} disabled={saving || revisando || concluido} onChange={e => void trocarStatus(e.target.value as Situacao)} className={`${campo} min-w-32`}>
        {!onEstornar && !novo && pagamento?.status === "ativo" && <option value="em_aberto">Em aberto</option>}
        {projecao && <option value="em_aberto">Planejado (não recebido)</option>}<option value="compensado">Confirmado</option>{titulo && <option value="aguardando">Aguardando</option>}{titulo && !novo && <option value="recusado">Recusado</option>}
      </select> : <span className={pagamento?.statusPagamento === "compensado" ? "text-emerald-800" : "text-amber-800"}>{pagamento ? nomes[pagamento.statusPagamento] : projecao ? "Planejado · não recebido" : statusSemPagamento || nomes.em_aberto}</span>}</td>
      <td data-label="Ações" className="p-2"><div className="payment-actions">{editando ? <><button type="button" disabled={saving || revisando || concluido || (!projecao && situacao === "em_aberto" && (!plano || !confirmado))} onClick={() => void salvar()} className="rounded-lg bg-emerald-700 px-2 py-1 text-[10px] font-black text-white disabled:opacity-40">{saving ? "Salvando…" : excluindo ? "Confirmar exclusão" : projecao && situacao === "em_aberto" ? "Salvar previsão" : novo ? "Registrar" : "Salvar"}</button><button type="button" disabled={saving} onClick={() => { setEditando(false); setErro(""); setPin(""); onCancel?.(); }} className="rounded-lg border px-2 py-1 text-[10px] font-bold">Cancelar</button></> : <>
        {editavel && <button type="button" title="Editar" aria-label="Editar" onClick={() => iniciar()} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-black"><Pencil size={16}/></button>}
        {editavel && onEstornar && <button type="button" title="Estornar" aria-label="Estornar" onClick={onEstornar} className="rounded-lg border px-2 py-1 text-[10px] font-bold"><RotateCcw size={16}/></button>}
        {editavel && (onExcluir || pagamento) && <button type="button" title="Excluir" aria-label="Excluir" onClick={() => { if (onExcluir) onExcluir(); else { iniciar(); setExcluindo(true); void trocarStatus("em_aberto"); } }} className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold text-red-700"><Trash2 size={16}/></button>}
        {editavel && pagamento && saldo > 0.005 && <button type="button" onClick={() => iniciar(true)} className="rounded-lg border border-emerald-300 px-2 py-1 text-[10px] font-bold text-emerald-800">Receber saldo</button>}
        {pagamento && onDetalhes && <button type="button" title="Ver títulos / boletos" aria-label="Ver títulos / boletos" onClick={() => onDetalhes(pagamento.id)} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg px-2 py-1 text-[10px] font-bold text-blue-800"><Banknote size={16}/></button>}
        {pagamento && onComprovante && <button type="button" title="Comprovante" aria-label="Comprovante" onClick={() => onComprovante(pagamento.id)} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg px-2 py-1 text-[10px] font-bold text-blue-800"><FileText size={16}/></button>}
      </>}</div></td>
    </tr>
    {editando && <tr className="payment-editor-row payment-compact bg-blue-50"><td colSpan={colunas} className="px-3 pb-3">
      {(projecao || situacao !== "em_aberto") && <div className="my-2 space-y-2 text-xs">
        {forma !== "bonus" && <div className="flex items-center gap-2"><span className="font-bold text-slate-700">Bônus</span><button type="button" role="switch" aria-label={`Ativar bônus ${referencia}`} aria-checked={bonusAtivo} disabled={saving || concluido} onClick={() => {
          if (bonusAtivo && !titulo) setValor(Math.max(0, total + bonusUsado).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          setBonusAtivo(!bonusAtivo); setBonus("");
        }} className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 ${bonusAtivo ? "bg-violet-600" : "bg-slate-300"}`}><span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${bonusAtivo ? "translate-x-4" : "translate-x-0"}`} /></button></div>}
        {(bonusAtivo || forma === "bonus") && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-900">
          <span className="font-bold">Saldo da carteira: {formatCurrency(saldoBonus + (!novo && pagamento?.status === "ativo" ? pagamento.bonusUtilizado : 0))}</span>
          {forma !== "bonus" && <label className="inline-flex items-center gap-2">Bônus a utilizar<input aria-label={`Bônus ${referencia}`} inputMode="decimal" value={bonus} onChange={e => { const proximo = parseBrazilianNumber(e.target.value); if (!titulo && Number.isFinite(proximo)) setValor(Math.max(0, total + bonusUsado - proximo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); setBonus(e.target.value); }} disabled={saving || concluido} placeholder="0,00" className={`${campo} max-w-32`}/></label>}
          <span className="font-bold">Pagamento + bônus: {formatCurrency(totalAbatimento)}</span>
        </div>}
      </div>}
      {(projecao || situacao !== "em_aberto") && <><TitulosPagamentoEditor mostrarObservacao={false} formaPagamento={forma} clienteId={clienteId} clienteNome={clienteNome} clienteDocumento={clienteDocumento} valorPagamento={parseBrazilianNumber(valor)} titulos={titulos} onChange={itens => { const atualizados = itens.map(t => ({ ...t, status: t.status || situacao as TituloRecebimento["status"], dataCompensacao: (t.status || situacao) === "compensado" ? t.dataCompensacao || data : undefined })); setTitulos(atualizados); if (atualizados.length && !(projecao && situacao === "em_aberto")) setSituacao(atualizados.every(t => t.status === "recusado") ? "recusado" : atualizados.some(t => t.status === "aguardando") ? "aguardando" : "compensado"); }} editarStatus={!novo} referenciaPagamento={referencia} limiteLinhas={Math.max(12, pagamento?.titulos.length || 0)}/>{forma === "cartao_credito" && <ParcelamentoCartaoSelect formaPagamento={forma} parcelas={cartao} onChange={setCartao} valorTotal={total} disabled={saving || concluido}/>}</>}
      {revisando && <p className="text-xs">Conferindo estorno…</p>}
      {plano && situacao === "em_aberto" && <label className="my-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"><input type="checkbox" checked={confirmado} disabled={saving || concluido} onChange={e => setConfirmado(e.target.checked)}/><span>{excluindo ? "Excluir este pagamento, estornar" : "Estornar"} {formatCurrency(plano.totalFinanceiro)} e reabrir o saldo. Vales afetados: {plano.vales.map(v => `#${v.numero} (${formatCurrency(v.valor)})`).join(", ")}.{plano.compartilhado && " O pagamento é compartilhado: o estorno atinge todos os vales acima."}{Math.abs(plano.variacaoBonus) > 0.005 && ` Ajuste na carteira: ${formatCurrency(plano.variacaoBonus)}.`}</span></label>}
      {(!novo || projecao) && <label className="mt-2 inline-flex items-center gap-2 text-[10px] font-bold">Senha do gerente<input type="password" autoComplete="off" maxLength={64} disabled={saving || concluido} value={pin} onChange={e => setPin(e.target.value)} className={`${campo} max-w-44`}/></label>}
      {erro && <p role="alert" className="mt-2 text-xs font-bold text-red-800">{concluido ? "Pagamento salvo; atualize a tela para carregar os saldos. " : ""}{erro}</p>}
    </td></tr>}
  </>;
}
