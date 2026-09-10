import React from "react";
import { demonstrativoOrdem } from "../lib/demonstrativoOrdem";
import { createPortal } from "react-dom";
import { CalendarDays, MessageCircle, Printer, WalletCards, X } from "lucide-react";
import { OrdemCobranca, OrdemCobrancaParcela } from "../types";
import { formatCurrency, formatDate, whatsappUrl } from "../lib/utils";

interface Props {
  ordem: OrdemCobranca;
  onClose: () => void;
}

const situacaoParcela = (parcela: OrdemCobrancaParcela) => {
  if (parcela.status === "paga" || (Number(parcela.saldo) <= 0.005 && parcela.status !== "renegociada" && parcela.status !== "cancelada")) {
    return { texto: "QUITADA", classe: "bg-emerald-100 text-emerald-900", linha: "bg-emerald-50/60" };
  }
  if (parcela.status === "cancelada") {
    return { texto: "CANCELADA", classe: "bg-slate-200 text-slate-700", linha: "bg-slate-50" };
  }
  if (parcela.status === "renegociada") {
    return { texto: "RENEGOCIADA", classe: "bg-blue-100 text-blue-900", linha: "bg-blue-50/60" };
  }
  if (Number(parcela.valorPago) > 0.005) {
    return { texto: "PARCIAL", classe: "bg-blue-100 text-blue-900", linha: "bg-blue-50/60" };
  }
  return { texto: "EM ABERTO", classe: "bg-amber-100 text-amber-900", linha: "bg-amber-50/40" };
};

export function OrdemCobrancaDemonstrativoModal({ ordem, onClose }: Props) {
  const resumo = demonstrativoOrdem(ordem);
  const linkWhatsApp = whatsappUrl(ordem.clienteTelefone);

  return createPortal(
    <div id="print-cobranca-vales" className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 px-[8vw] py-[4vh] backdrop-blur-sm print:p-0">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-demonstrativo-ordem" className="flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="print:hidden flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 id="titulo-demonstrativo-ordem" className="font-black uppercase text-slate-950">Demonstrativo atualizado para cobrança</h2>
            <p className="text-xs font-bold text-slate-500">Ordem #{ordem.numeroSequencial} · posição atual dos pagamentos</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {linkWhatsApp && <a href={linkWhatsApp} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-black uppercase text-white"><MessageCircle size={16}/> Abrir WhatsApp</a>}
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-black uppercase text-white"><Printer size={16}/> Imprimir / salvar PDF</button>
            <button type="button" onClick={onClose} aria-label="Fechar demonstrativo" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-black uppercase text-slate-800 hover:bg-slate-100"><X size={16}/> Fechar</button>
          </div>
        </header>

        <div className="overflow-y-auto bg-slate-200 p-2 sm:p-4 print:overflow-visible print:bg-white print:p-0">
          <section className="mx-auto max-w-[900px] overflow-hidden rounded-lg border-2 border-slate-900 bg-white text-slate-950 shadow-sm print:max-w-none print:shadow-none">
            <header className="flex items-start justify-between gap-4 bg-slate-900 px-4 py-3 text-white">
              <div>
                <div className="flex items-center gap-2"><WalletCards size={20}/><strong className="text-base font-black uppercase">Ordem de cobrança #{ordem.numeroSequencial}</strong></div>
                <p className="mt-1 text-xs font-bold text-slate-300">DEMONSTRATIVO ATUALIZADO · POSIÇÃO DE PAGAMENTOS</p>
              </div>
              <div className="text-right text-xs font-black"><span className="block text-slate-300">DATA DA ORDEM</span>{formatDate(ordem.dataEmissao)}<span className="mt-1 block text-[9px] text-slate-400">ATUALIZADO EM {formatDate(ordem.updatedAt)}</span></div>
            </header>

            <div className="border-b-2 border-slate-900 bg-amber-50 px-4 py-3">
              <span className="text-[10px] font-black uppercase text-amber-800">Cliente</span>
              <h3 className="text-lg font-black uppercase text-slate-950">{ordem.clienteNome}</h3>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-slate-700">
                <span>CPF/CNPJ: <strong>{ordem.clienteDocumento || "NÃO INFORMADO"}</strong></span>
                {ordem.clienteTelefone && <span>TELEFONE: <strong>{ordem.clienteTelefone}</strong></span>}
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[620px] text-xs print:min-w-0">
                <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-700"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-left">Emissão</th><th className="p-2 text-right">Negociado</th></tr></thead>
                <tbody className="divide-y divide-slate-200">{ordem.vales.map(v => <tr key={v.id}><td className="p-2 font-mono font-black">#{v.numeroSequencial}</td><td className="p-2">{formatDate(v.data)}</td><td className="p-2 text-right font-mono">{formatCurrency(v.valorVinculado)}</td></tr>)}</tbody>
              </table>
            </div>

            <div className="border-t-2 border-slate-900 p-3">
              <h3 className="mb-2 text-xs font-bold">Pagamentos registrados</h3>
              <div className="overflow-x-auto"><table className="w-full min-w-[550px] table-fixed text-xs print:min-w-0">
                <thead className="bg-slate-100"><tr><th className="w-24 p-2 text-left">Data / venc.</th><th className="p-2 text-left">Forma / documento</th><th className="w-28 p-2 text-right">Valor</th><th className="w-28 p-2 text-left">Situação</th></tr></thead>
                <tbody>{resumo.linhas.map(l => <tr key={l.id} className="border-t border-slate-200">
                  <td className="p-2 whitespace-nowrap">{formatDate(l.data)}</td>
                  <td className="p-2">{l.forma}{l.referencia && ` · #${l.referencia}`}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(l.valor)}</td>
                  <td className={`p-2 ${l.status === 'compensado' ? 'text-emerald-800' : 'text-amber-900'}`}>{l.status === 'compensado' ? 'Pago' : l.status === 'recusado' ? 'Recusado' : 'Aguardando'}</td>
                </tr>)}</tbody>
              </table></div>
              {!ordem.pagamentos?.length && <p className="text-xs text-slate-500">Nenhum pagamento registrado.</p>}
            </div>

            {ordem.observacao && <div className="border-t border-slate-300 bg-slate-50 px-4 py-3 text-xs"><strong className="block text-[10px] uppercase text-slate-500">Observação da negociação</strong><span className="font-bold text-slate-800">{ordem.observacao}</span></div>}

            <footer className="grid grid-cols-3 border-t-2 border-slate-900 bg-emerald-100 text-right">
              <div className="border-r border-emerald-300 px-4 py-3"><span className="block text-[9px] font-black uppercase text-emerald-800">Negociado</span><strong className="font-mono text-base text-emerald-950">{formatCurrency(ordem.totalOriginal)}</strong></div>
              <div className="border-r border-emerald-300 px-4 py-3"><span className="block text-[9px] font-black uppercase text-emerald-800">Total pago</span><strong className="font-mono text-base text-emerald-950">{formatCurrency(resumo.pago)}</strong></div>
              <div className="px-4 py-3"><span className="block text-[9px] font-black uppercase text-emerald-800">Restante a pagar</span><strong className="font-mono text-xl text-emerald-950">{formatCurrency(resumo.restante)}</strong></div>
            </footer>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
