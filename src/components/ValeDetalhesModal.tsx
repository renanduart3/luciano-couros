import React, { useState } from "react";
import { CalendarClock, Eye, FileClock, FileText, List, MessageCircle, Printer, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { ComprovanteRecebimento, OrdemCobranca, PagamentoGerenciavel, Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal, todayLocalIso, whatsappUrl } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { api } from "../lib/api";
import { useEhGerente } from "../auth/AuthContext";
import { ComprovanteRecebimentoModal } from "./ComprovanteRecebimentoModal";
import { RecebimentoDetalhesModal } from "./RecebimentoDetalhesModal";
import { financeiroVale } from "../lib/financeiro";
import { resumoRecebimentos } from "../lib/resumoRecebimentos";
import { LinhaPagamento } from "./LinhaPagamento";

interface ValeDetalhesModalProps {
  vale: Venda;
  onClose: () => void;
  onUpdated?: (vale: Venda | null) => void;
  ordemCobranca?: OrdemCobranca | null;
  onOpenOrdem?: () => void;
}

export function ValeDetalhesModal({ vale, onClose, onUpdated, ordemCobranca, onOpenOrdem }: ValeDetalhesModalProps) {
  const [recebimentoAberto, setRecebimentoAberto] = useState<string | null>(null);
  const gerente = useEhGerente();
  const bloqueado = ordemCobranca?.status === "aberta";
  const [novoPagamento, setNovoPagamento] = useState(false);
  const atualizarPagamentos = async () => { onUpdated?.(await api.getVenda(vale.id)); setNovoPagamento(false); };
  const [aba, setAba] = useState<"itens" | "comprovante">("itens");
  const [modo, setModo] = useState<"devolver" | "cancelar" | null>(null);
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [dataDevolucao, setDataDevolucao] = useState(todayLocalIso());
  const [quantidadesDevolucao, setQuantidadesDevolucao] = useState<Record<string, string>>({});
  const [resultadoDevolucao, setResultadoDevolucao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [comprovante, setComprovante] = useState<ComprovanteRecebimento | null>(null);
  const itens = vale.items || [];
  const legado: PagamentoGerenciavel | undefined = !vale.recebimentos?.length && Number(vale.valorPago) > 0.005 ? {
    id: vale.id, recebimentoId: vale.id, clienteId: vale.clienteId, clienteNome: vale.clienteNome || "Cliente",
    data: vale.ultimoPagamentoData || vale.data, valorRecebido: Number(vale.valorPago), valorAplicado: Number(vale.valorPago),
    bonusUtilizado: 0, bonusGerado: 0, formaPagamento: vale.formaPagamento || "Pagamento antigo", status: "ativo", statusPagamento: "compensado",
    titulos: [], alocacoes: [], historico: [], createdAt: vale.data, updatedAt: vale.data,
  } : undefined;
  const financeiro = financeiroVale(vale);
  const resumo = resumoRecebimentos(vale.recebimentos || [], vale.id);
  const devolucoes = vale.devolucoes || [];
  const totalDevolvido = devolucoes.reduce((total, devolucao) => total + Number(devolucao.valorCredito), 0);
  const linkWhatsApp = whatsappUrl(vale.clienteTelefone);

  const imprimir = () => {
    setAba("comprovante");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const cancelarVale = async () => {
    if (pin.length < 4 || pin.length > 64) return setErro("Informe a senha do gerente.");
    setSalvando(true);
    setErro("");
    try {
      await api.cancelarVale(vale.id, pin, motivo);
      onUpdated?.(null);
    } catch (error: any) {
      setPin("");
      setErro(error.message || "Não foi possível cancelar o vale.");
    } finally {
      setSalvando(false);
    }
  };

  const devolverItens = async () => {
    if (pin.length < 4 || pin.length > 64) return setErro("Informe a senha do gerente.");
    const selecionados = itens
      .map((item) => ({
        itemVendaId: item.id,
        quantidade: Number(String(quantidadesDevolucao[item.id] || "").replace(",", "."))
      }))
      .filter((item) => Number.isFinite(item.quantidade) && item.quantidade > 0);
    if (selecionados.length === 0) return setErro("Informe a quantidade de ao menos um item.");

    setSalvando(true);
    setErro("");
    try {
      const resultado = await api.createDevolucaoVenda(vale.id, {
        data: dataDevolucao,
        observacoes: motivo,
        pin,
        items: selecionados
      });
      setModo(null);
      setPin("");
      setMotivo("");
      setQuantidadesDevolucao({});
      setResultadoDevolucao(
        `${formatCurrency(resultado.abatimentoVale)} abatido do vale` +
        (resultado.bonusGerado > 0 ? ` e ${formatCurrency(resultado.bonusGerado)} creditado como bônus.` : ".")
      );
      onUpdated?.(resultado.venda);
    } catch (error: any) {
      setPin("");
      setErro(error.message || "Não foi possível registrar a devolução.");
    } finally {
      setSalvando(false);
    }
  };

  const abrirComprovanteRecebimento = async (recebimentoId: string) => {
    setErro("");
    try { setComprovante(await api.getComprovanteRecebimento(recebimentoId)); }
    catch (error: any) { setErro(error.message || "Não foi possível abrir o comprovante."); }
  };

  if (recebimentoAberto) return <RecebimentoDetalhesModal somenteLeitura={bloqueado || !onUpdated} recebimentoId={recebimentoAberto} onClose={() => setRecebimentoAberto(null)} onSaved={atualizarPagamentos} onComprovante={id => { setRecebimentoAberto(null); void abrirComprovanteRecebimento(id); }} />;
  if (comprovante) return <ComprovanteRecebimentoModal comprovante={comprovante} onClose={() => setComprovante(null)} />;
  return (
    <div id="print-vale-detail-overlay" className="fixed inset-0 z-[110] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-100 p-2 text-amber-800"><FileText size={20} /></span>
            <div>
              <h2 className="font-black uppercase text-slate-950">Vale #{vale.numeroSequencial}</h2>
              <p className="text-xs font-bold text-slate-500">{vale.clienteNome || "Cliente não informado"} • {formatDate(vale.data)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {linkWhatsApp && <a href={linkWhatsApp} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black uppercase text-white sm:flex-none"><MessageCircle size={16}/> WhatsApp</a>}
            <button type="button" onClick={() => setAba("itens")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "itens" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><List size={16} /> Detalhes</button>
            <button type="button" onClick={() => setAba("comprovante")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "comprovante" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><FileText size={16} /> Comprovante</button>
            {!bloqueado && onUpdated && vale.status !== "cancelada" && itens.some((item) => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005) && <button type="button" onClick={() => { setModo("devolver"); setErro(""); setPin(""); setMotivo(""); setResultadoDevolucao(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 text-xs font-black uppercase text-violet-800 sm:flex-none"><RotateCcw size={15} /> Devolver</button>}
            {!bloqueado && gerente && onUpdated && vale.status !== "cancelada" && <button type="button" onClick={() => { setModo("cancelar"); setErro(""); setPin(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-black uppercase text-red-800 sm:flex-none"><Trash2 size={15} /> Cancelar</button>}
            <button type="button" onClick={imprimir} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-black uppercase text-white sm:flex-none"><Printer size={16} /> Imprimir</button>
            <button type="button" aria-label="Fechar detalhes do vale" onClick={onClose} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-slate-600"><X size={18} /></button>
          </div>
        </header>

        {aba === "itens" ? (
          <div className="space-y-4 p-3 sm:p-5 print:hidden">
            {resultadoDevolucao && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><span>{resultadoDevolucao}</span><button type="button" onClick={imprimir} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 font-black uppercase text-white"><Printer size={14} /> Imprimir vale atualizado</button></div>}

            {modo === "devolver" && <div className="space-y-3 rounded-2xl border border-violet-300 bg-violet-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-violet-950">Devolver itens do vale #{vale.numeroSequencial}</h3><p className="text-xs font-semibold text-violet-800">O valor abate primeiro o saldo do vale. Qualquer excedente pago entra como bônus na carteira do cliente.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-violet-800"><X size={17} /></button></div>
              <div className="overflow-hidden rounded-xl border border-violet-200 bg-white">
                <div className="divide-y divide-slate-100">
                  {itens.filter((item) => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005).map((item) => {
                    const disponivel = Number(item.quantidadeDisponivel ?? item.quantidade);
                    return <label key={item.id} className="grid grid-cols-[1fr_120px] items-center gap-3 p-3 text-xs">
                      <span><strong className="block text-slate-950">{item.descricao}</strong><span className="font-bold text-slate-500">Disponível: {formatDecimal(disponivel)} {item.unidade}</span></span>
                      <input type="number" min="0" max={disponivel} step="0.01" value={quantidadesDevolucao[item.id] || ""} onChange={(event) => { setQuantidadesDevolucao((atuais) => ({ ...atuais, [item.id]: event.target.value })); setErro(""); }} placeholder="0" className="min-h-10 rounded-lg border border-violet-200 px-3 text-right font-mono font-black" />
                    </label>;
                  })}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-black uppercase text-violet-900">Data da devolução<input type="date" value={dataDevolucao} onChange={(event) => setDataDevolucao(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" /></label><label className="text-[10px] font-black uppercase text-violet-900">Observação<input value={motivo} maxLength={100} onChange={(event) => setMotivo(event.target.value.slice(0, 100))} placeholder="Motivo ou detalhes (opcional, até 100 caracteres)" className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case" /></label></div>
              <div className="flex flex-col gap-2 sm:flex-row"><input type="password" value={pin} onChange={(event) => { setPin(event.target.value.slice(0, 64)); setErro(""); }} placeholder="Senha do gerente" className="min-h-11 flex-1 rounded-xl border border-violet-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={devolverItens} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Validar devolução</button></div>
              {erro && <p className="rounded-lg border border-red-200 bg-white p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

            {modo === "cancelar" && <div className="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-red-950">Cancelar vale #{vale.numeroSequencial}</h3><p className="text-xs font-semibold text-red-800">Ele sairá da contabilidade ativa, mas continuará disponível no histórico.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-red-800"><X size={17} /></button></div>
              <input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo do cancelamento (opcional)" className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm font-bold" />
              <div className="flex flex-col gap-2 sm:flex-row"><input type="password" value={pin} onChange={(event) => { setPin(event.target.value.slice(0, 64)); setErro(""); }} placeholder="Senha do gerente" className="min-h-11 flex-1 rounded-xl border border-red-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={cancelarVale} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Confirmar cancelamento</button></div>
              {erro && <p className="rounded-lg border border-red-200 bg-white p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Resumo titulo="Valor" valor={formatCurrency(vale.totalLiquido)} />
              <Resumo titulo="Recebido" valor={formatCurrency(financeiro.recebido)} destaque="text-blue-800" />
              <Resumo titulo="Restante" valor={formatCurrency(financeiro.restante)} destaque="text-amber-800" />
            </div>
            <p className="text-xs text-slate-600">Vencimento: {vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"} · {itens.length} itens{totalDevolvido > 0 && ` · Devolvido: ${formatCurrency(totalDevolvido)}`}</p>
            {!!vale.recebimentos?.length && <div className="rounded-xl border border-slate-300 bg-white p-3">
              <h3 className="mb-2 text-xs font-bold text-slate-700">Valores dos recebimentos vinculados</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs text-slate-600">Cheques / boletos a compensar</p><strong className="font-mono text-lg text-amber-800">{formatCurrency(financeiro.aguardando)}</strong></div>
                <div><p className="text-xs text-slate-600">Excedente gerado em bônus</p><strong className="font-mono text-lg text-violet-800">{formatCurrency(financeiro.bonus)}</strong></div>
              </div>
              {financeiro.bonus > 0 && <p className="mt-2 text-xs text-violet-800">O excedente foi registrado como crédito na carteira do cliente. Este valor é o bônus gerado pelos pagamentos, não o saldo disponível atual da carteira.</p>}
              {resumo.bonusUtilizado > 0 && <p className="mt-2 text-xs text-slate-600">Bônus utilizado: {formatCurrency(resumo.bonusUtilizado)}. É crédito anterior, não um novo recebimento.</p>}
            </div>}

            {bloqueado && <p className="text-xs font-bold text-blue-900">Este vale está disponível somente para consulta. Gerencie os pagamentos pela ordem até seu encerramento.</p>}
            {ordemCobranca && <button type="button" onClick={onOpenOrdem} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-left text-blue-950 transition-colors hover:border-blue-500 hover:bg-blue-100"><span className="flex items-center gap-2 text-xs font-black uppercase"><FileClock size={17}/> Vinculado à ordem de cobrança #{ordemCobranca.numeroSequencial}</span><span className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black uppercase text-white shadow-sm group-hover:bg-blue-800">Abrir ordem <Eye size={15}/></span></button>}

            <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
              <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2"><h3 className="text-xs font-black uppercase text-slate-700">Pagamentos</h3>{!bloqueado && onUpdated && vale.status !== "cancelada" && <button type="button" disabled={novoPagamento || Number(vale.saldoRestante) <= 0.005} onClick={() => setNovoPagamento(true)} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-40">Adicionar pagamento</button>}</div>
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-slate-50 text-left"><tr>{["Data", "Valor", "Recebido", "Forma de pagamento", "Situação", "Ações"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead>
                <tbody>{(vale.recebimentos?.length ? vale.recebimentos : legado ? [legado] : []).map((pagamento) =>
                  <LinhaPagamento key={pagamento?.id || vale.id} pagamento={pagamento} vendaIdContexto={legado ? undefined : vale.id} clienteId={vale.clienteId}
                    clienteNome={vale.clienteNome || "Cliente"} clienteDocumento={vale.clienteDocumento}
                    saldo={0}
                    alocar={valor => [{ vendaId: vale.id, valor: Math.min(valor, Number(vale.saldoRestante)) }]}
                    referencia={`vale #${vale.numeroSequencial}`} onSaved={atualizarPagamentos}
                    somenteReabertura={Boolean(legado)} alvoReabertura={legado ? { tipo: "vale", id: vale.id } : undefined}
                    onDetalhes={legado ? undefined : setRecebimentoAberto}
                    onComprovante={legado ? undefined : id => void abrirComprovanteRecebimento(id)}
                    editavel={!bloqueado && Boolean(onUpdated) && vale.status !== "cancelada" && gerente}/>
                )}{!bloqueado && novoPagamento && <LinhaPagamento key="novo" iniciarEditando clienteId={vale.clienteId}
                  clienteNome={vale.clienteNome || "Cliente"} clienteDocumento={vale.clienteDocumento}
                  saldo={Number(vale.saldoRestante)} alocar={valor => [{ vendaId: vale.id, valor: Math.min(valor, Number(vale.saldoRestante)) }]}
                  referencia={`vale #${vale.numeroSequencial}`} onSaved={atualizarPagamentos} onCancel={() => setNovoPagamento(false)}/>}
                </tbody>
              </table>
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-300 bg-white md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-100 text-xs font-black uppercase text-slate-600">
                  <tr><th className="p-3 text-left">Ref.</th><th className="p-3 text-left">Material</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-left">Un.</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {itens.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/50">
                      <td className="p-3 font-mono text-xs font-bold text-slate-500">{item.referencia || "—"}</td>
                      <td className="p-3 font-black text-slate-950">{item.descricao}</td>
                      <td className="p-3 text-right font-mono font-black">{formatDecimal(item.quantidadeDisponivel ?? item.quantidade)}{Number(item.quantidadeDevolvida || 0) > 0 && <span className="block text-[9px] text-violet-700">devolvido: {formatDecimal(item.quantidadeDevolvida!)}</span>}</td>
                      <td className="p-3 font-bold text-slate-600">{item.unidade}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(item.precoUnitario)}</td>
                      <td className="p-3 text-right font-mono font-black">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-300 bg-white md:hidden">
              {itens.map((item) => (
                <article key={item.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-950">{item.descricao}</strong><strong className="shrink-0 font-mono text-sm">{formatCurrency(item.total)}</strong></div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500"><span>{item.referencia || "Sem referência"}</span><span>{formatDecimal(item.quantidade)} {item.unidade} × {formatCurrency(item.precoUnitario)}</span></div>
                </article>
              ))}
            </div>

            {itens.length === 0 && <p className="rounded-xl border border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">Nenhum item encontrado para esta venda.</p>}

            <div className="overflow-hidden rounded-xl border border-violet-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-3 py-2">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase text-violet-950"><RotateCcw size={15} /> Histórico de devoluções</h3>
                <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-violet-800">{devolucoes.length}</span>
              </div>
              {devolucoes.length === 0 ? (
                <p className="p-5 text-center text-xs font-bold text-slate-500">Nenhuma devolução registrada neste vale.</p>
              ) : (
                <div className="divide-y divide-violet-100">
                  {devolucoes.map((devolucao) => (
                    <article key={devolucao.id} className="space-y-2 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-500">Devolução em {formatDate(devolucao.data)}</p>
                          <p className="mt-1 text-sm font-black text-violet-900">{formatCurrency(devolucao.valorCredito)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                          <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">Dívida abatida: {formatCurrency(devolucao.abatimentoVale || 0)}</span>
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">Bônus: {formatCurrency(devolucao.bonusGerado || 0)}</span>
                        </div>
                      </div>
                      <p className="text-xs font-bold text-slate-700">{devolucao.items.map((item) => `${formatDecimal(item.quantidade)} ${item.unidade || ""} de ${item.descricao || "item"}`).join(" • ")}</p>
                      {devolucao.observacoes && <p className="text-xs text-slate-500">{devolucao.observacoes}</p>}
                    </article>
                  ))}
                </div>
              )}
            </div>

            {vale.observacoes && <div className="rounded-xl border border-slate-300 bg-white p-3"><span className="text-[10px] font-black uppercase text-slate-500">Observações</span><p className="mt-1 text-sm font-bold text-slate-800">{vale.observacoes}</p></div>}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto p-2 sm:p-4 print:overflow-visible print:p-0">
            <VendaComprovante venda={vale} />
          </div>
        )}
      </div>
    </div>
  );
}

function Resumo({ titulo, valor, destaque = "text-slate-950", icone = false }: { titulo: string; valor: string; destaque?: string; icone?: boolean }) {
  return <div className="rounded-xl border border-slate-300 bg-white p-3"><span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">{icone && <CalendarClock size={13} />}{titulo}</span><strong className={`mt-1 block text-base ${destaque}`}>{valor}</strong></div>;
}
