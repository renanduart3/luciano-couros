import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { demonstrativoSaldoCliente } from "../lib/saldoCliente";
import logo from "../img/logo.png";

// Documento próprio. Compartilha apenas as classes de layout, sem alterar a venda.
export function SaldoClienteComprovante({ dados }: { dados: ReturnType<typeof demonstrativoSaldoCliente> }) {
  const [config, setConfig] = useState<Record<string, string>>({});
  useEffect(() => {
    let ativo = true;
    api.getConfig().then(c => { if (ativo) setConfig(c); }).catch(() => undefined);
    return () => { ativo = false; };
  }, []);
  const { cliente, linhas, totais } = dados;
  const vazias = Math.max(0, 15 - Math.max(1, linhas.length));
  const via = (numero: number) => <section className="receipt-copy">
    <header className="receipt-header">
      <img src={logo} alt={config.store_name || "Luciano Couros"} className="receipt-logo"/>
      <div className="receipt-store">
        <strong>{config.store_address || "R. Lunard, 289 - B. Caiçara - CEP: 30.770-030 - BH/MG"}</strong>
        <span>Fone: {config.store_phone || "(31) 3413-5778"} • Cel: {config.store_mobile || "98800-5778 e 98719-4108"}</span>
        <span>E-mail: <em>{config.store_email || "lucianocouros@hotmail.com"}</em></span>
      </div>
      <div className="receipt-document-meta"><strong>SALDO DEVEDOR • {numero}ª VIA</strong><span className="receipt-meta-row"><b>DATA:</b><span>{formatDate(dados.data)}</span></span></div>
    </header>
    <div className="receipt-client-grid">
      <span className="receipt-field receipt-client-name"><b>Cliente:</b> {cliente.nome}</span>
      <span className="receipt-field"><b>Tel:</b> {cliente.telefone || ""}</span>
      <span className="receipt-field receipt-client-address"><b>Endereço:</b> {cliente.endereco || ""}</span>
      <span className="receipt-field"><b>CPF/CNPJ:</b> {cliente.documento || ""}</span>
    </div>
    <table className="receipt-items-table">
      <thead><tr><th>VALE / EMISSÃO</th><th className="receipt-money">TOTAL DO VALE</th><th className="receipt-money">TOTAL PAGO</th><th className="receipt-money">SALDO DEVEDOR</th></tr></thead>
      <tbody>
        {linhas.map(l => <tr key={l.id}><td>{l.descricao}</td><td className="receipt-number">{formatCurrency(l.totalVale)}</td><td className="receipt-number">{formatCurrency(l.totalPago)}</td><td className="receipt-number">{formatCurrency(l.saldo)}</td></tr>)}
        {!linhas.length && <tr><td colSpan={4}>Nenhum vale com saldo pendente.</td></tr>}
        {Array.from({ length: vazias }, (_, i) => <tr key={i} aria-hidden="true"><td>&nbsp;</td><td/><td/><td/></tr>)}
      </tbody>
    </table>
    <div className="receipt-payment-line"><span style={{ gridColumn: "1 / -1" }}>Somente vales com saldo pendente. Demonstrativo de cobrança, não comprova pagamento.</span></div>
    <footer className="receipt-footer">
      <div className="receipt-counts"><span>VALES: <b>{dados.quantidadeVales}</b></span><span>TOTAL: <b>{formatCurrency(totais.totalVale)}</b></span><span>PAGO: <b>{formatCurrency(totais.totalPago)}</b></span></div>
      <div className="receipt-total"><span>SALDO DEVEDOR</span><strong>{formatCurrency(totais.saldo)}</strong></div>
    </footer>
  </section>;
  return <div className="receipt-pages" data-items-per-sheet="15"><div className="receipt-sheet-a4" data-receipt-page="1">
    {via(1)}<div className="receipt-cut"><span>✂ corte aqui</span></div>{via(2)}
  </div></div>;
}
