import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Coins, Loader2, X } from "lucide-react";
import { Venda } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";
import { CamposCheque } from "./CamposCheque";
import { dadosChequeVazios, DadosCheque, ehCheque, FORMAS_PAGAMENTO } from "../lib/pagamentos";
import { ParcelamentoCartaoSelect } from "./ParcelamentoCartaoSelect";

interface Props {
  clienteId: string;
  clienteNome: string;
  clienteDocumento?: string;
  vales: Venda[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const hoje = () => new Date().toISOString().slice(0, 10);

export function PagamentoValesModal({ clienteId, clienteNome, clienteDocumento, vales, onClose, onSaved }: Props) {
  const totalDivida = vales.reduce((total, vale) => total + Number(vale.saldoRestante), 0);
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState(totalDivida.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [dadosCheque, setDadosCheque] = useState<DadosCheque>(() => ({ ...dadosChequeVazios(), cpfTitular: clienteDocumento || "" }));
  const [saldoBonus, setSaldoBonus] = useState(0);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.getCarteiraResumo(clienteId).then((resumo) => setSaldoBonus(Number(resumo.saldoBonus || 0))).catch(() => setSaldoBonus(0));
  }, [clienteId]);

  const valorInformado = parseBrazilianNumber(valor);
  const alocacoes = useMemo(() => {
    let restante = Math.max(0, valorInformado);
    return [...vales]
      .sort((a, b) => a.data.localeCompare(b.data) || Number(a.numeroSequencial) - Number(b.numeroSequencial))
      .flatMap((vale) => {
        if (restante <= 0.005) return [];
        const aplicado = Math.round(Math.min(restante, Number(vale.saldoRestante)) * 100) / 100;
        restante = Math.round(Math.max(0, restante - aplicado) * 100) / 100;
        return aplicado > 0.005 ? [{ vendaId: vale.id, numero: vale.numeroSequencial, valor: aplicado }] : [];
      });
  }, [vales, valorInformado]);
  const totalAplicado = alocacoes.reduce((total, item) => total + item.valor, 0);
  const bonusGerado = formaPagamento === "bonus" ? 0 : Math.max(0, valorInformado - totalAplicado);

  const registrar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (valorInformado <= 0) return setErro("Informe um valor maior que zero.");
    if (formaPagamento === "bonus" && valorInformado > saldoBonus + 0.005) return setErro("O valor ultrapassa o bônus disponível do cliente.");
    if (formaPagamento === "bonus" && valorInformado > totalDivida + 0.005) return setErro("O bônus aplicado não pode ultrapassar a dívida selecionada.");
    if (ehCheque(formaPagamento) && (!dadosCheque.vencimento || !dadosCheque.cpfTitular.trim() || !dadosCheque.banco.trim() || !dadosCheque.numeroCheque.trim() || (formaPagamento === "cheque_terceiro" && !dadosCheque.cpfTerceiro.trim()))) {
      return setErro("Preencha todos os dados obrigatórios do cheque.");
    }
    setSalvando(true);
    setErro("");
    setFeedback("");
    try {
      const resultado = await api.createRecebimentoCliente(clienteId, {
        data,
        valorRecebido: formaPagamento === "bonus" ? 0 : valorInformado,
        bonusUtilizado: formaPagamento === "bonus" ? valorInformado : 0,
        formaPagamento,
        parcelasCartao: formaPagamento === "cartao_credito" ? parcelasCartao : undefined,
        observacao: observacao || `Pagamento múltiplo de ${vales.length} vale(s)`,
        dadosCheque: ehCheque(formaPagamento) ? dadosCheque : undefined,
        alocacoes: alocacoes.map(({ vendaId, valor: valorAlocado }) => ({ vendaId, valor: valorAlocado })),
      });
      setValor("0,00");
      setObservacao("");
      setFeedback(`Pagamento registrado: ${formatCurrency(resultado.valorAplicado)} abatido` + (resultado.bonusGerado > 0.005 ? ` e ${formatCurrency(resultado.bonusGerado)} gerado em bônus.` : "."));
      void Promise.resolve(onSaved()).catch(() => {
        setErro("O pagamento foi registrado, mas não foi possível atualizar os saldos automaticamente. Feche e abra a tela para atualizar.");
      });
    } catch (error: any) {
      setErro(error.message || "Não foi possível registrar o pagamento.");
    } finally {
      setSalvando(false);
    }
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 px-[10vw] py-[5vh] backdrop-blur-sm">
    <form onSubmit={registrar} role="dialog" aria-modal="true" aria-labelledby="pagamento-vales-titulo" className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-300 bg-slate-950 p-4 text-white"><div><h2 id="pagamento-vales-titulo" className="text-lg font-black">Pagamento de vales selecionados</h2><p className="mt-1 text-xs font-bold text-slate-300">{clienteNome} · {vales.length} vale(s) · dívida {formatCurrency(totalDivida)}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X size={20}/></button></header>
      <div className="space-y-4 overflow-y-auto bg-slate-100 p-4">
        <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-3 sm:grid-cols-3"><label className="text-[10px] font-black uppercase text-slate-600">Data<input type="date" value={data} onChange={(event) => setData(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-bold" /></label><label className="text-[10px] font-black uppercase text-slate-600">Valor do pagamento<input autoFocus inputMode="decimal" value={valor} onChange={(event) => setValor(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-right font-mono text-lg font-black text-emerald-900" /></label><label className="text-[10px] font-black uppercase text-slate-600">Forma de pagamento<select value={formaPagamento} onChange={(event) => { setFormaPagamento(event.target.value); setErro(""); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-bold">{FORMAS_PAGAMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}</select></label></div>
        <ParcelamentoCartaoSelect formaPagamento={formaPagamento} parcelas={parcelasCartao} onChange={setParcelasCartao} className="max-w-xs" />
        {formaPagamento === "bonus" && <div className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-xs font-black text-violet-900">BÔNUS DISPONÍVEL: {formatCurrency(saldoBonus)}</div>}
        <CamposCheque formaPagamento={formaPagamento} dados={dadosCheque} onChange={setDadosCheque} documentoCliente={clienteDocumento} />
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-white"><div className="border-b border-slate-300 bg-slate-50 p-3 text-xs font-black uppercase text-slate-700">Distribuição automática — vales mais antigos primeiro</div><table className="w-full text-sm"><thead className="bg-slate-200 text-[10px] font-black uppercase"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Emissão</th><th className="p-2 text-right">Saldo antes</th><th className="p-2 text-right">Abatimento</th><th className="p-2 text-right">Saldo depois</th></tr></thead><tbody className="divide-y divide-slate-200">{[...vales].sort((a, b) => a.data.localeCompare(b.data)).map((vale) => { const aplicado = alocacoes.find((item) => item.vendaId === vale.id)?.valor || 0; return <tr key={vale.id}><td className="p-2 font-black">#{vale.numeroSequencial}</td><td className="p-2 font-bold">{formatDate(vale.data)}</td><td className="p-2 text-right font-mono font-bold">{formatCurrency(vale.saldoRestante)}</td><td className="p-2 text-right font-mono font-black text-emerald-800">{formatCurrency(aplicado)}</td><td className="p-2 text-right font-mono font-black">{formatCurrency(Math.max(0, Number(vale.saldoRestante) - aplicado))}</td></tr>; })}</tbody></table></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase text-emerald-700">Abatido nos vales</p><p className="font-mono text-lg font-black text-emerald-900">{formatCurrency(totalAplicado)}</p></div><div className="rounded-xl border border-violet-300 bg-violet-50 p-3"><p className="text-[10px] font-black uppercase text-violet-700">Bônus gerado pelo excedente</p><p className="font-mono text-lg font-black text-violet-900">{formatCurrency(bonusGerado)}</p></div><label className="text-[10px] font-black uppercase text-slate-600">Observação<textarea rows={2} value={observacao} onChange={(event) => setObservacao(event.target.value.slice(0, 300))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-bold" /></label></div>
        {feedback && <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-black text-emerald-800"><CheckCircle2 size={16}/>{feedback}</div>}
        {erro && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-black text-red-800">{erro}</div>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-300 bg-white p-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black uppercase">Voltar</button><button type="submit" disabled={salvando || valorInformado <= 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40">{salvando ? <Loader2 className="animate-spin" size={16}/> : bonusGerado > 0.005 ? <CheckCircle2 size={16}/> : <Coins size={16}/>}Registrar pagamento</button></footer>
    </form>
  </div>;
}
