import React, { useEffect, useState } from "react";
import { CalendarClock, Coins, Eye, FileClock, FileText, List, Printer, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { OrdemCobranca, Venda } from "../types";
import { formatCurrency, formatDate, formatDecimal, parseBrazilianNumber } from "../lib/utils";
import { VendaComprovante } from "./VendaComprovante";
import { api } from "../lib/api";
import { useEhGerente } from "../auth/AuthContext";
import { CamposCheque } from "./CamposCheque";
import { dadosChequeVazios, DadosCheque, ehCheque, FORMAS_PAGAMENTO } from "../lib/pagamentos";

interface ValeDetalhesModalProps {
  vale: Venda;
  onClose: () => void;
  onUpdated?: (vale: Venda | null) => void;
  ordemCobranca?: OrdemCobranca | null;
  onOpenOrdem?: () => void;
}

export function ValeDetalhesModal({ vale, onClose, onUpdated, ordemCobranca, onOpenOrdem }: ValeDetalhesModalProps) {
  const gerente = useEhGerente();
  const [aba, setAba] = useState<"itens" | "comprovante">("itens");
  const [modo, setModo] = useState<"devolver" | "cancelar" | null>(null);
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [dataDevolucao, setDataDevolucao] = useState(new Date().toISOString().slice(0, 10));
  const [quantidadesDevolucao, setQuantidadesDevolucao] = useState<Record<string, string>>({});
  const [resultadoDevolucao, setResultadoDevolucao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [valorPagamento, setValorPagamento] = useState(Number(vale.saldoRestante || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [dadosCheque, setDadosCheque] = useState<DadosCheque>(() => ({ ...dadosChequeVazios(), cpfTitular: vale.clienteDocumento || "" }));
  const [saldoBonus, setSaldoBonus] = useState(0);
  const [feedbackPagamento, setFeedbackPagamento] = useState("");
  const itens = vale.items || [];
  const devolucoes = vale.devolucoes || [];
  const totalDevolvido = devolucoes.reduce((total, devolucao) => total + Number(devolucao.valorCredito), 0);

  useEffect(() => {
    setValorPagamento(Number(vale.saldoRestante || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    api.getCarteiraResumo(vale.clienteId).then((carteira) => setSaldoBonus(Number(carteira.saldoBonus || 0))).catch(() => setSaldoBonus(0));
  }, [vale]);

  const imprimir = () => {
    setAba("comprovante");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const registrarPagamentoVale = async () => {
    const valorInformado = parseBrazilianNumber(valorPagamento);
    const recebido = formaPagamento === "bonus" ? 0 : valorInformado;
    const bonusUtilizado = formaPagamento === "bonus" ? valorInformado : 0;
    if (valorInformado <= 0) return setErro("Informe o valor do pagamento.");
    if (bonusUtilizado > saldoBonus + 0.005) return setErro("O bônus utilizado ultrapassa o saldo disponível.");
    if (formaPagamento === "bonus" && bonusUtilizado > Number(vale.saldoRestante) + 0.005) return setErro("O bônus utilizado não pode ultrapassar o saldo deste vale.");
    if (ehCheque(formaPagamento) && (!dadosCheque.vencimento || !dadosCheque.cpfTitular.trim() || !dadosCheque.banco.trim() || !dadosCheque.numeroCheque.trim() || (formaPagamento === "cheque_terceiro" && !dadosCheque.cpfTerceiro.trim()))) return setErro("Preencha todos os dados obrigatórios do cheque.");
    const valorAplicado = Math.min(Number(vale.saldoRestante), recebido + bonusUtilizado);
    setSalvando(true);
    setErro("");
    setFeedbackPagamento("");
    try {
      const resultado = await api.createRecebimentoCliente(vale.clienteId, {
        data: dataPagamento,
        valorRecebido: recebido,
        bonusUtilizado,
        formaPagamento,
        observacao: `Pagamento direto do vale #${vale.numeroSequencial}`,
        dadosCheque: ehCheque(formaPagamento) ? dadosCheque : undefined,
        alocacoes: [{ vendaId: vale.id, valor: valorAplicado }]
      });
      const atualizado = await api.getVenda(vale.id);
      const carteira = await api.getCarteiraResumo(vale.clienteId);
      setSaldoBonus(Number(carteira.saldoBonus || 0));
      setFeedbackPagamento(`${formatCurrency(resultado.valorAplicado)} abatido do vale` + (resultado.bonusGerado > 0.005 ? ` e ${formatCurrency(resultado.bonusGerado)} gerado em bônus.` : "."));
      onUpdated?.(atualizado);
    } catch (error: any) {
      setErro(error.message || "Não foi possível registrar o pagamento.");
    } finally {
      setSalvando(false);
    }
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

  return (
    <div id="print-vale-detail-overlay" className="fixed inset-0 z-[80] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
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
            <button type="button" onClick={() => setAba("itens")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "itens" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><List size={16} /> Detalhes</button>
            <button type="button" onClick={() => setAba("comprovante")} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase sm:flex-none ${aba === "comprovante" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}><FileText size={16} /> Comprovante</button>
            {onUpdated && vale.status !== "cancelada" && itens.some((item) => Number(item.quantidadeDisponivel ?? item.quantidade) > 0.005) && <button type="button" onClick={() => { setModo("devolver"); setErro(""); setPin(""); setMotivo(""); setResultadoDevolucao(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 text-xs font-black uppercase text-violet-800 sm:flex-none"><RotateCcw size={15} /> Devolver</button>}
            {gerente && onUpdated && vale.status !== "cancelada" && <button type="button" onClick={() => { setModo("cancelar"); setErro(""); setPin(""); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-black uppercase text-red-800 sm:flex-none"><Trash2 size={15} /> Cancelar</button>}
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

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
              <Resumo titulo="Total atual" valor={formatCurrency(vale.totalLiquido)} />
              <Resumo titulo="Devolvido" valor={formatCurrency(totalDevolvido)} destaque={totalDevolvido > 0 ? "text-violet-800" : "text-slate-500"} />
              <Resumo titulo="Valor pago" valor={formatCurrency(vale.valorPago)} destaque="text-blue-800" />
              <Resumo titulo="Saldo atual" valor={formatCurrency(vale.saldoRestante)} destaque="text-amber-800" />
              <Resumo titulo="Itens" valor={String(itens.length)} />
              <Resumo titulo="Vencimento" valor={vale.vencimento ? formatDate(vale.vencimento) : "Sem vencimento"} icone />
            </div>

            {ordemCobranca && <button type="button" onClick={onOpenOrdem} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-left text-blue-950 transition-colors hover:border-blue-500 hover:bg-blue-100"><span className="flex items-center gap-2 text-xs font-black uppercase"><FileClock size={17}/> Vinculado à ordem de cobrança #{ordemCobranca.numeroSequencial}</span><span className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black uppercase text-white shadow-sm group-hover:bg-blue-800">Abrir ordem <Eye size={15}/></span></button>}

            {vale.status === "pendente" && Number(vale.saldoRestante) > 0.005 && <div className="overflow-hidden rounded-xl border border-emerald-300 bg-white">
              <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2"><h3 className="text-xs font-black uppercase text-emerald-950">Registrar pagamento deste vale</h3><p className="text-[10px] font-bold text-emerald-800">Bônus disponível: {formatCurrency(saldoBonus)}. O uso do bônus só ocorre quando informado abaixo.</p></div>
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
                <label className="text-[10px] font-black uppercase text-slate-600">Data<input type="date" value={dataPagamento} onChange={(event) => setDataPagamento(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 font-bold"/></label>
                <label className="text-[10px] font-black uppercase text-slate-600">Pagamento<input type="text" inputMode="decimal" value={valorPagamento} onChange={(event) => setValorPagamento(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-right font-mono font-black text-emerald-900"/></label>
                <label className="text-[10px] font-black uppercase text-slate-600">Forma<select value={formaPagamento} onChange={(event) => setFormaPagamento(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 font-bold">{FORMAS_PAGAMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}</select></label>
                <button type="button" disabled={salvando} onClick={() => void registrarPagamentoVale()} className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg bg-emerald-700 px-4 text-xs font-black uppercase text-white disabled:opacity-40"><Coins size={16}/> Registrar</button>
              </div>
              <div className="px-3 pb-3"><CamposCheque formaPagamento={formaPagamento} dados={dadosCheque} onChange={setDadosCheque} documentoCliente={vale.clienteDocumento} /></div>
              {feedbackPagamento && <p className="mx-3 mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-black text-emerald-800">{feedbackPagamento}</p>}
              {erro && <p className="mx-3 mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-800">{erro}</p>}
            </div>}

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
