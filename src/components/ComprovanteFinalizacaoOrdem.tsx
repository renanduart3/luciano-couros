import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { api } from "../lib/api";
import { totaisValesOrdem } from "../lib/demonstrativoOrdem";
import { formatCurrency, formatDate, todayLocalIso } from "../lib/utils";
import type { OrdemCobranca } from "../types";
import logo from "../img/logo.png";

interface LojaComprovante { nome: string; endereco: string; telefone: string; celular: string; email: string; }
const LOJA_PADRAO: LojaComprovante = {
  nome: "Luciano Couros",
  endereco: "R. Lunard, 289 - B. Caiçara - CEP: 30.770-030 - BH/MG",
  telefone: "(31) 3413-5778",
  celular: "98800-5778 e 98719-4108",
  email: "lucianocouros@hotmail.com",
};

function ViaOrdem({ ordem, loja, via, totalVales, pago, saldo, data }: {
  ordem: OrdemCobranca; loja: LojaComprovante; via: string;
  totalVales: number; pago: number; saldo: number; data: string;
}) {
  return <section className="receipt-copy">
    <header className="receipt-header">
      <img src={logo} alt={loja.nome} className="receipt-logo" />
      <div className="receipt-store"><strong>{loja.endereco}</strong><span>Fone: {loja.telefone} • Cel: {loja.celular}</span><span>E-mail: <em>{loja.email}</em></span></div>
      <div className="receipt-document-meta"><strong>DEMONSTRATIVO DE PAGAMENTO • {via}</strong><span className="receipt-meta-row"><b>DATA:</b><span>{data}</span></span><span className="receipt-meta-row"><b>Nº:</b><span>{String(ordem.numeroSequencial).padStart(6, "0")}</span></span></div>
    </header>
    <div className="receipt-client-grid">
      <span className="receipt-field receipt-client-name"><b>Cliente:</b> {ordem.clienteNome}</span>
      <span className="receipt-field"><b>Tel:</b> {ordem.clienteTelefone || ""}</span>
      <span className="receipt-field receipt-client-address"><b>Endereço:</b> {ordem.clienteEndereco || ""}</span>
      <span className="receipt-field"><b>Nº documento:</b> {ordem.clienteDocumento || ""}</span>
    </div>
    <table className="receipt-items-table"><thead><tr><th className="receipt-ref">REF.</th><th className="receipt-supplier-ref">FORN.</th><th className="receipt-qty">QTD.</th><th>DISCRIMINAÇÃO</th><th className="receipt-money receipt-unit-money">UNITÁRIO</th><th className="receipt-money">PREÇO TOTAL</th></tr></thead>
      <tbody>
        <tr><td></td><td></td><td className="receipt-number">1,00 un</td><td>ORDEM DE COBRANÇA #{ordem.numeroSequencial}</td><td className="receipt-number">{formatCurrency(totalVales)}</td><td className="receipt-number">{formatCurrency(totalVales)}</td></tr>
        <tr><td></td><td></td><td className="receipt-number">1,00 un</td><td>PAGO</td><td className="receipt-number">{formatCurrency(-pago)}</td><td className="receipt-number">{formatCurrency(-pago)}</td></tr>
        {Array.from({ length: 13 }, (_, i) => <tr key={i} aria-hidden="true"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>)}
      </tbody>
    </table>
    <div className="receipt-payment-line"><span className="receipt-payment-method"><b>FORMA:</b> ORDEM DE COBRANÇA</span><span className="receipt-payment-value"><b>TOTAL PAGO:</b> {formatCurrency(pago)}</span><span className="receipt-payment-observation"><b>OBSERVAÇÃO:</b> <span title={ordem.observacao || ""}>{ordem.observacao || "—"}</span></span></div>
    <footer className="receipt-footer"><div className="receipt-counts"><span>ORDEM #{ordem.numeroSequencial}</span><span className="receipt-signature">ASS. CLIENTE:</span></div><div className="receipt-total"><span>{saldo < 0 ? "BÔNUS GERADO" : saldo > 0 ? "DEVEDOR" : "SALDO"}</span><strong>{formatCurrency(saldo)}</strong></div></footer>
  </section>;
}

export function ComprovanteFinalizacaoOrdem({ ordem }: { ordem: OrdemCobranca }) {
  const [loja, setLoja] = useState<LojaComprovante>(LOJA_PADRAO);
  useEffect(() => {
    let ativo = true;
    api.getConfig().then(config => {
      if (ativo) setLoja({ nome: config.store_name || config.nome_loja || LOJA_PADRAO.nome,
        endereco: config.store_address || LOJA_PADRAO.endereco, telefone: config.store_phone || LOJA_PADRAO.telefone,
        celular: config.store_mobile || LOJA_PADRAO.celular, email: config.store_email || LOJA_PADRAO.email });
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, []);
  const totais = totaisValesOrdem(ordem);
  const totalVales = totais.total, pago = totais.pago, saldo = totais.devedor - totais.bonus;
  const data = ordem.finalizadoAt ? new Date(ordem.finalizadoAt).toLocaleDateString("pt-BR") : formatDate(todayLocalIso());
  return <div className="receipt-pages" data-items-per-sheet="15" data-order-finalization={ordem.id}>
    <div className="receipt-sheet-a4">
      <ViaOrdem ordem={ordem} loja={loja} via="1ª VIA" totalVales={totalVales} pago={pago} saldo={saldo} data={data}/>
      <div className="receipt-cut"><span>✂ corte aqui</span></div>
      <ViaOrdem ordem={ordem} loja={loja} via="2ª VIA" totalVales={totalVales} pago={pago} saldo={saldo} data={data}/>
    </div>
  </div>;
}

export function ComprovanteFinalizacaoOrdemModal({ ordem, onClose }: { ordem: OrdemCobranca; onClose: () => void }) {
  return createPortal(<div id="print-receipt" role="dialog" aria-modal="true" aria-label={`Comprovante da ordem #${ordem.numeroSequencial}`} className="fixed inset-0 z-[150] overflow-y-auto bg-slate-950/75 p-3 print:p-0">
    <div className="mx-auto max-w-5xl"><header className="mb-3 flex justify-end gap-2 print:hidden"><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white"><Printer size={16}/> Imprimir / salvar PDF</button><button type="button" onClick={onClose} aria-label="Fechar comprovante" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-black uppercase"><X size={16}/> Fechar</button></header><ComprovanteFinalizacaoOrdem ordem={ordem}/></div>
  </div>, document.body);
}
