import React from "react";
import { Printer, X } from "lucide-react";
import { ComprovanteRecebimento } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";

export function ComprovanteRecebimentoModal({ comprovante, onClose }: { comprovante: ComprovanteRecebimento; onClose: () => void }) {
  return <div className="fixed inset-0 z-[180] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 sm:p-8">
    <div id="comprovante-recebimento" className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
      <header className="flex items-start justify-between gap-3 border-b-2 border-slate-900 p-5">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Comprovante de pagamento</p><h2 className="text-xl font-black text-slate-950">{comprovante.clienteNome}</h2><p className="text-xs font-bold text-slate-600">CPF/CNPJ: {comprovante.clienteDocumento || "Não informado"} · Data: {formatDate(comprovante.data)}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar comprovante" className="rounded-lg border border-slate-300 p-2 print:hidden"><X size={18}/></button>
      </header>
      <main className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-3"><Resumo titulo="Valor devido antes" valor={comprovante.valorDevidoAntes}/><Resumo titulo="Valor recebido" valor={comprovante.valorRecebido}/><Resumo titulo="Abatido nos vales" valor={comprovante.valorAplicado}/></div>
        <section><h3 className="mb-2 text-xs font-black uppercase text-slate-700">Forma do pagamento</h3><p className="rounded-lg bg-slate-100 p-3 text-sm font-black uppercase">{comprovante.formaPagamento.replaceAll("_", " ")}</p></section>
        {comprovante.titulos.length > 0 && <section><h3 className="mb-2 text-xs font-black uppercase text-slate-700">Cheques / boletos recebidos</h3><div className="overflow-hidden rounded-lg border border-slate-300"><table className="w-full text-xs"><thead className="bg-slate-900 text-white"><tr><th className="p-2 text-left">Tipo / número</th><th className="p-2 text-left">Titular</th><th className="p-2 text-left">CPF/CNPJ</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-200">{comprovante.titulos.map((titulo, indice) => <tr key={titulo.id || indice}><td className="p-2 font-black uppercase">{titulo.tipo.startsWith("duplicata") ? "Boleto" : "Cheque"} {titulo.numeroDocumento}</td><td className="p-2 font-bold">{titulo.nomeTitular}</td><td className="p-2 font-bold">{titulo.documentoTitular}</td><td className="p-2 font-bold">{formatDate(titulo.vencimento)}</td><td className="p-2 text-right font-mono font-black">{formatCurrency(titulo.valor)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-900 bg-slate-100"><td colSpan={4} className="p-2 text-right font-black uppercase">Total recebido em títulos</td><td className="p-2 text-right font-mono font-black">{formatCurrency(comprovante.titulos.reduce((soma, titulo) => soma + titulo.valor, 0))}</td></tr></tfoot></table></div></section>}
        <section><h3 className="mb-2 text-xs font-black uppercase text-slate-700">Vales pagos</h3><div className="overflow-hidden rounded-lg border border-slate-300"><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Vale</th><th className="p-2 text-right">Devia antes</th><th className="p-2 text-right">Pago agora</th><th className="p-2 text-right">Saldo depois</th></tr></thead><tbody className="divide-y divide-slate-200">{comprovante.vales.map((vale) => <tr key={vale.numeroSequencial}><td className="p-2 font-black">#{vale.numeroSequencial}</td><td className="p-2 text-right font-mono">{formatCurrency(vale.saldoAntes)}</td><td className="p-2 text-right font-mono font-black text-emerald-800">{formatCurrency(vale.valorAplicado)}</td><td className="p-2 text-right font-mono font-black">{formatCurrency(vale.saldoDepois)}</td></tr>)}</tbody></table></div></section>
        {comprovante.observacao && <p className="text-xs font-bold text-slate-600">Observação: {comprovante.observacao}</p>}
        <div className="grid grid-cols-2 gap-8 pt-12 text-center text-[10px] font-black uppercase text-slate-500"><div className="border-t border-slate-500 pt-2">Responsável pelo recebimento</div><div className="border-t border-slate-500 pt-2">Cliente</div></div>
      </main>
      <footer className="flex justify-end gap-2 border-t border-slate-200 p-4 print:hidden"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black uppercase">Fechar</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white"><Printer size={16}/>Imprimir comprovante</button></footer>
    </div>
  </div>;
}

function Resumo({ titulo, valor }: { titulo: string; valor: number }) {
  return <div className="rounded-lg border border-slate-300 p-3"><p className="text-[9px] font-black uppercase text-slate-500">{titulo}</p><p className="mt-1 font-mono text-lg font-black">{formatCurrency(valor)}</p></div>;
}
