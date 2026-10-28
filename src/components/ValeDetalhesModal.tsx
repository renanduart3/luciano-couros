import { OrdemCobrancaDetalhesModal } from "./OrdensCobrancaView";
import { AnotacoesDocumento } from "./AnotacoesDocumento";
import { HistoricoOrigemVale } from "./HistoricoOrigemVale";
import React, { useEffect, useRef, useState } from "react";
import { Eye, FileClock, FileText, List, MessageCircle, Printer, RotateCcw, ShieldCheck, X } from "lucide-react";
import { ComprovanteRecebimento, OrdemCobranca, PagamentoGerenciavel, Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal, todayLocalIso, whatsappUrl } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { api } from "../lib/api";
import { useEhGerente } from "../auth/AuthContext";
import { ComprovanteRecebimentoModal } from "./ComprovanteRecebimentoModal";
import { RecebimentoDetalhesModal } from "./RecebimentoDetalhesModal";
import { financeiroVale } from "../lib/financeiro";
import { PagamentoValesModal } from "./PagamentoValesModal";
import { LinhaPagamento } from "./LinhaPagamento";
import { FinalizarFinanceiroModal } from "./FinalizarFinanceiroModal";
import { ReabrirFinalizacaoModal } from "./ReabrirFinalizacaoModal";
import { Pagination, paginate } from "./Pagination";
import { ResumoFinanceiroFixo } from "./ResumoFinanceiroFixo";
import { ComprovantesFinalizacao } from "./ComprovantesFinalizacao";

interface ValeDetalhesModalProps {
  key?: string;
  vale: Venda;
  onClose: () => void;
  onUpdated?: (vale: Venda | null) => void;
  ordemCobranca?: OrdemCobranca | null;
  onOpenOrdem?: () => void;
}

function RecebimentosValeFinalizacao({ vale }: { vale: Venda }) {
  const [comprovante, setComprovante] = useState<ComprovanteRecebimento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const recebimentoId = vale.recebimentos?.find(pagamento => pagamento.status === "ativo")?.id;
  useEffect(() => {
    setComprovante(null);
    setErro("");
    setCarregando(false);
    if (!recebimentoId) return;
    let ativo = true;
    setCarregando(true);
    setErro("");
    api.getComprovanteRecebimento(recebimentoId, vale.id)
      .then(resultado => { if (ativo) setComprovante(resultado); })
      .catch((error: Error) => { if (ativo) setErro(error.message || "Não foi possível abrir o demonstrativo."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [recebimentoId, vale.id, vale.updatedAt]);
  if (erro) return <p role="alert" className="rounded-xl border border-red-300 bg-white p-4 text-sm font-bold text-red-700">{erro}</p>;
  if (comprovante) return <ComprovanteRecebimentoModal embedded comprovante={comprovante} onClose={() => {}}/>;
  return <p className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">{carregando ? "Carregando demonstrativo de recebimentos…" : "Nenhum recebimento registrado para este vale."}</p>;
}

export function ValeDetalhesModal(props: ValeDetalhesModalProps) {
  return <ConteudoValeDetalhes key={props.vale.id} {...props}/>;
}

function ConteudoValeDetalhes({ vale, onClose, onUpdated, ordemCobranca, onOpenOrdem }: ValeDetalhesModalProps) {
  const requisicaoComprovante = useRef(0);
  useEffect(() => () => { requisicaoComprovante.current++; }, []);
  const [ordemHistorico, setOrdemHistorico] = useState<OrdemCobranca | null>(null);
  const abrirOrdemHistorico = async (id: string) => { try { const lista = await api.getOrdensCobranca(vale.clienteId); const destino = lista.find(o => o.id === id); if (!destino) throw new Error("Ordem não encontrada."); setOrdemHistorico(destino); } catch (e: any) { setErro(e.message); } };
  const [anotacao, setAnotacao] = useState(vale.observacoes || "");
  useEffect(() => { setAnotacao(vale.observacoes || ""); }, [vale.id, vale.observacoes]);
  const [recebimentoAberto, setRecebimentoAberto] = useState<string | null>(null);
  const gerente = useEhGerente();
  const ordemAtiva = ordemCobranca?.status === "aberta" && ordemCobranca.vales.some(vinculo => vinculo.vendaId === vale.id);
  const bloqueado = ordemAtiva || Boolean(vale.finalizadoAt);
  const [novoPagamento, setNovoPagamento] = useState(false);
  const [paginaPagamentos, setPaginaPagamentos] = useState(1);
  const atualizarPagamentos = async () => { onUpdated?.(await api.getVenda(vale.id)); setNovoPagamento(false); setPaginaPagamentos(1); };
  const [aba, setAba] = useState<"itens" | "comprovante" | "recebimentos" | "devolucoes" | "anotacoes" | "finalizacao">("itens");
  const [modo, setModo] = useState<"devolver" | "cancelar" | null>(null);
  const [finalizacao, setFinalizacao] = useState(false);
  const [reabrirFinalizacao, setReabrirFinalizacao] = useState(false);
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
    data: vale.ultimoPagamentoData || vale.data, valorRecebido: Math.max(0, Number(vale.valorPago) - Number(vale.bonusLegado || 0)), valorAplicado: Number(vale.valorPago),
    bonusUtilizado: Number(vale.bonusLegado || 0), bonusGerado: 0, formaPagamento: vale.formaPagamento || "Pagamento antigo", status: "ativo", statusPagamento: "compensado",
    titulos: [], alocacoes: [], historico: [], createdAt: vale.data, updatedAt: vale.data,
  } : undefined;
  const financeiro = financeiroVale(vale);
  const pagamentosDoVale = vale.recebimentos?.length ? vale.recebimentos : legado ? [legado] : [];
  const pagamentosPagina = paginate(pagamentosDoVale, paginaPagamentos, 10);
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
        `${formatCurrency(resultado.abatimentoVale)} abatido da dívida. O saldo e as parcelas do vale foram atualizados.`
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
    const requisicao = ++requisicaoComprovante.current;
    setAba("recebimentos");
    setComprovante(null);
    setErro("");
    try { const resultado = await api.getComprovanteRecebimento(recebimentoId, vale.id); if (requisicao === requisicaoComprovante.current) setComprovante(resultado); }
    catch (error: any) { if (requisicao === requisicaoComprovante.current) setErro(error.message || "Não foi possível abrir o comprovante."); }
  };

  if (ordemHistorico) return <OrdemCobrancaDetalhesModal ordem={ordemHistorico} onClose={() => setOrdemHistorico(null)} onChanged={o => { setOrdemHistorico(o); void atualizarPagamentos(); }}/>;
  if (recebimentoAberto) return <RecebimentoDetalhesModal somenteLeitura={bloqueado || !onUpdated} recebimentoId={recebimentoAberto} onClose={() => setRecebimentoAberto(null)} onSaved={atualizarPagamentos} onComprovante={id => { setRecebimentoAberto(null); void abrirComprovanteRecebimento(id); }} />;

  return (
    <div id="print-vale-detail-overlay" className="fixed inset-0 z-[110] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-4 lg:p-6">
      <div className="flex h-[calc(100dvh-1.5rem)] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl sm:h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-3rem)] print:h-auto print:max-w-none print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
        {finalizacao && <FinalizarFinanceiroModal titulo={`vale #${vale.numeroSequencial}`} restante={financeiro.restantePresumido} excedente={financeiro.excedentePresumido} demonstrativo={<VendaComprovante venda={vale} demonstrativoPagamento/>} recebimento={<RecebimentosValeFinalizacao vale={vale}/>} onClose={() => setFinalizacao(false)} onConfirm={async dados => {
          const resultado = await api.finalizarVale(vale.id, dados);
          onUpdated?.(resultado.vale);
          setAba("finalizacao");
          return { mensagem: resultado.valeResidual ? `Vale finalizado. O restante foi transferido para o vale #${resultado.valeResidual.numeroSequencial}.` : "Vale finalizado e saldos encerrados." };
        }}/>}<header className="vale-header print:hidden">
          <div className="vale-header-identity">
            <span className="vale-header-symbol"><FileText size={22}/></span>
            <div className="min-w-0 flex-1"><h2>Vale #{vale.numeroSequencial}</h2><p>{vale.clienteNome || "Cliente não informado"}</p><span>CPF/CNPJ: {vale.clienteDocumento || "Não informado"}</span></div>
          </div>
          <div className="vale-header-navigation">
            <nav aria-label="Navegação do vale" className="vale-tabs">
              <button type="button" aria-pressed={aba === "itens"} onClick={() => setAba("itens")}><List size={16}/> Detalhes</button>
              <button type="button" aria-pressed={aba === "comprovante"} onClick={() => setAba("comprovante")}><FileText size={16}/> Vale</button>
              <button type="button" aria-pressed={aba === "recebimentos"} onClick={() => { setAba("recebimentos"); const pagamento = vale.recebimentos?.[0]; if (pagamento) void abrirComprovanteRecebimento(pagamento.id); }}><FileText size={16}/> Recebimentos</button>
              <button type="button" aria-pressed={aba === "devolucoes"} onClick={() => setAba("devolucoes")}><RotateCcw size={16}/> Histórico</button>
              <button type="button" aria-pressed={aba === "anotacoes"} onClick={() => setAba("anotacoes")}><FileText size={16}/> Anotações</button>
              {!!vale.comprovantesFinalizacao?.length && <button type="button" aria-pressed={aba === "finalizacao"} onClick={() => setAba("finalizacao")}><FileText size={16}/> Vale finalizado</button>}
            </nav>
            <div className="vale-header-tools">
              {linkWhatsApp && <a href={linkWhatsApp} target="_blank" rel="noreferrer noopener" title="WhatsApp" aria-label="WhatsApp" className="vale-icon-button text-emerald-700"><MessageCircle size={19}/></a>}
              <button type="button" onClick={imprimir} title="Imprimir vale" aria-label="Imprimir vale" className="vale-icon-button"><Printer size={19}/></button>
              {!bloqueado && onUpdated && vale.status !== "cancelada" && itens.some(item => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005) && <button type="button" onClick={() => { setAba("itens"); setModo("devolver"); setErro(""); setPin(""); setMotivo(""); setResultadoDevolucao(""); }} title="Devolver itens do vale (requer senha administrativa)" aria-label="Devolver itens do vale" className="vale-icon-button text-violet-800"><RotateCcw size={19}/></button>}
            </div>
          </div>
          <button type="button" title="Fechar" aria-label="Fechar detalhes do vale" onClick={onClose} className="vale-icon-button vale-header-close"><X size={20}/></button>
        </header>
        {reabrirFinalizacao && <ReabrirFinalizacaoModal cancelado={vale.status === "cancelada"} tipo="vale" id={vale.id} onClose={() => setReabrirFinalizacao(false)} onSaved={atualizarPagamentos}/>}

        {aba === "itens" ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5 print:hidden">
            {resultadoDevolucao && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><span>{resultadoDevolucao}</span><button type="button" onClick={imprimir} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 font-black uppercase text-white"><Printer size={14} /> Imprimir vale atualizado</button></div>}

            {modo === "devolver" && <div className="space-y-3 rounded-2xl border border-violet-300 bg-violet-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-violet-950">Devolver itens do vale #{vale.numeroSequencial}</h3><p className="text-xs font-semibold text-violet-800">A devolução abate a dívida e atualiza as parcelas. Se superar o saldo devedor, concilie os pagamentos antes.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-violet-800"><X size={17} /></button></div>
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
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-red-950">Cancelar vale #{vale.numeroSequencial}</h3><p className="text-xs font-semibold text-red-800">Sai da contabilidade e permanece no histórico.</p></div><button type="button" onClick={() => setModo(null)} className="rounded-lg p-2 text-red-800"><X size={17} /></button></div>
              <input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo do cancelamento (opcional)" className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm font-bold" />
              <div className="flex flex-col gap-2 sm:flex-row"><input type="password" value={pin} onChange={(event) => { setPin(event.target.value.slice(0, 64)); setErro(""); }} placeholder="Senha do gerente" className="min-h-11 flex-1 rounded-xl border border-red-300 bg-white px-3 text-center font-black tracking-widest" /><button type="button" disabled={salvando} onClick={cancelarVale} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><ShieldCheck size={16} /> Confirmar cancelamento</button></div>
              {erro && <p className="rounded-lg border border-red-200 bg-white p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

            <p className="text-xs text-slate-600">Vencimento: {vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"} · {itens.length} itens{totalDevolvido > 0 && ` · Devolvido: ${formatCurrency(totalDevolvido)}`}</p>
            {ordemAtiva && <p className="text-xs font-bold text-blue-900">Pagamentos gerenciados pela ordem.</p>}
            {ordemAtiva && ordemCobranca && <button type="button" onClick={() => onOpenOrdem ? onOpenOrdem() : void abrirOrdemHistorico(ordemCobranca.id)} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-left text-blue-950 transition-colors hover:border-blue-500 hover:bg-blue-100"><span className="flex items-center gap-2 text-xs font-black uppercase"><FileClock size={17}/> Vinculado à ordem de cobrança #{ordemCobranca.numeroSequencial}</span><span className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black uppercase text-white shadow-sm group-hover:bg-blue-800">Abrir ordem <Eye size={15}/></span></button>}

            <div className="grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
              <ResumoFinanceiroFixo negociado={Math.max(0, Math.round((vale.totalLiquido - (financeiro.transferido || 0)) * 100) / 100)} financeiro={financeiro} rotuloTotal="Devedor" bonusGerado={Number(vale.bonusGeradoVenda || 0)} vertical/>
            <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-300 bg-white">
              <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2"><h3 className="text-xs font-black uppercase text-slate-700">Pagamentos</h3>{!bloqueado && onUpdated && vale.status !== "cancelada" && <button type="button" disabled={novoPagamento || Number(vale.saldoRestante) <= 0.005} onClick={() => setNovoPagamento(true)} className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-40">Adicionar pagamento</button>}</div>
              <table className="payments-table w-full min-w-[720px] text-xs">
                <thead className="bg-slate-50 text-left"><tr>{["Data", "Valor", "Recebido", "Forma de pagamento", "Situação", "Ações"].map(t => <th data-label={t} key={t} className="p-2">{t}</th>)}</tr></thead>
                <tbody>{pagamentosPagina.map((pagamento) =>
                  <LinhaPagamento key={pagamento?.id || vale.id} pagamento={pagamento} vendaIdContexto={legado ? undefined : vale.id} clienteId={vale.clienteId}
                    clienteNome={vale.clienteNome || "Cliente"} clienteDocumento={vale.clienteDocumento}
                    saldo={0}
                    alocar={valor => [{ vendaId: vale.id, valor: Math.min(valor, Number(vale.saldoRestante)) }]}
                    referencia={`vale #${vale.numeroSequencial}`} onSaved={atualizarPagamentos}
                    somenteReabertura={Boolean(legado)} alvoReabertura={legado ? { tipo: "vale", id: vale.id } : undefined}
                    onDetalhes={legado ? undefined : setRecebimentoAberto}
                    editavel={!bloqueado && Boolean(onUpdated) && vale.status !== "cancelada" && gerente}/>
                )}
                </tbody>
              </table>{pagamentosDoVale.length > 10 && <Pagination page={paginaPagamentos} pageSize={10} totalItems={pagamentosDoVale.length} onPageChange={setPaginaPagamentos}/>}</div>
            </div>

          </div>
        ) : aba === "finalizacao" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><ComprovantesFinalizacao key={vale.id} tipo="vale" comprovantes={vale.comprovantesFinalizacao || []}/></div>
        ) : aba === "recebimentos" ? (
          comprovante ? <ComprovanteRecebimentoModal embedded comprovante={comprovante} onClose={() => setAba("itens")} /> : <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 print:hidden"><p className="text-sm text-slate-500">{vale.recebimentos?.length ? "Carregando recebimentos…" : "Nenhum recebimento registrado para este vale."}</p></div>
        ) : aba === "anotacoes" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 print:hidden"><AnotacoesDocumento valor={anotacao} onSave={async (texto, anterior) => { const atualizado = await api.saveAnotacaoVale(vale.id, texto, anterior); setAnotacao(atualizado.observacoes || ""); onUpdated?.(atualizado); }}/></div>
        ) : aba === "devolucoes" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 print:hidden">
            <div className="overflow-hidden rounded-xl border border-violet-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-3 py-2">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase text-violet-950"><RotateCcw size={15} /> Histórico</h3>

              </div>
              <div className="divide-y divide-slate-200">
                <p className="p-3 text-xs">Vale criado em {formatDate(vale.data)} · {formatCurrency(vale.totalLiquido)}{vale.origemSaldo && <HistoricoOrigemVale vale={vale} onOpenOrdem={abrirOrdemHistorico}/>}</p>
                {(vale.historicoMovimentacoes || []).map(evento => <article key={evento.id} className="space-y-1 p-3 text-xs">
                  <p className="font-bold capitalize">{evento.detalhes?.motivo?.startsWith("Exclusão") ? "Pagamento excluído" : evento.descricao || evento.acao.replaceAll("_", " ")}</p>
                  <p>{formatDate(evento.createdAt.slice(0, 10))}{evento.usuarioNome && ` · ${evento.usuarioNome}`}</p>
                  {evento.detalhes?.motivo && <p>{evento.detalhes.motivo}</p>}
                  {evento.ordemId && <button type="button" className="font-bold text-blue-800 underline" onClick={() => void abrirOrdemHistorico(evento.ordemId!)}>Abrir ordem #{evento.numeroOrdem}</button>}
                </article>)}
              </div>
              {erro && <p role="alert" className="p-3 text-xs text-red-800">{erro}</p>}
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

          </div>
        ) : (
          <div className="min-h-0 flex-1 max-w-full overflow-auto p-2 sm:p-4 print:overflow-visible print:p-0">
            <VendaComprovante venda={vale} />
          </div>
        )}
        {gerente && onUpdated && vale.status === "cancelada" && <footer className="border-t p-3"><button type="button" onClick={() => setReabrirFinalizacao(true)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white">Reabrir para editar</button></footer>}
        {gerente && onUpdated && vale.status !== "cancelada" && (vale.finalizadoAt || !bloqueado) && <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-300 bg-white p-3 print:hidden">
          {!bloqueado && <><button type="button" onClick={() => { setAba("itens"); setModo("cancelar"); setErro(""); setPin(""); }} className="mr-auto rounded-lg bg-red-700 px-4 py-2 text-xs font-black uppercase text-white">Cancelar vale</button><button type="button" onClick={() => setFinalizacao(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white">Finalizar vale</button></>}
          {vale.finalizadoAt && <button type="button" onClick={() => setReabrirFinalizacao(true)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-black text-white">Reabrir para editar</button>}
        </footer>}
      </div>
      {novoPagamento && !bloqueado && <PagamentoValesModal clienteId={vale.clienteId} clienteNome={vale.clienteNome || "Cliente"} clienteDocumento={vale.clienteDocumento} vales={[vale]} onClose={() => setNovoPagamento(false)} onSaved={atualizarPagamentos} fecharAoSalvar/>}
    </div>
  );
}
