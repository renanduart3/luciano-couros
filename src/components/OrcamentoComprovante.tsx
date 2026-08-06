import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { Orcamento } from "../types";
import logo from "../img/logo.png";

interface OrcamentoComprovanteProps {
  orcamento: Orcamento;
}

interface LojaComprovante {
  nome: string;
  endereco: string;
  telefone: string;
  celular: string;
  email: string;
}

const LOJA_PADRAO: LojaComprovante = {
  nome: "Luciano Couros",
  endereco: "R. Lunard, 289 - B. Caiçara - CEP: 30.770-030 - BH/MG",
  telefone: "(31) 3413-5778",
  celular: "98800-5778 e 98719-4108",
  email: "lucianocouros@hotmail.com",
};

const ITENS_POR_FOLHA = 18;

function ViaOrcamento({
  orcamento,
  loja,
  itens,
  pagina,
  totalPaginas,
}: {
  orcamento: Orcamento;
  loja: LojaComprovante;
  itens: Orcamento["items"];
  pagina: number;
  totalPaginas: number;
}) {
  const linhasVazias = Array.from({ length: Math.max(0, ITENS_POR_FOLHA - itens.length) });
  const quantidadeMetros = orcamento.items
    .filter((item) => item.unidade.toLowerCase().includes("metro"))
    .reduce((total, item) => total + Number(item.quantidade), 0);
  const descontoPercentual = Number(orcamento.subtotal) > 0
    ? (Number(orcamento.desconto) / Number(orcamento.subtotal)) * 100
    : 0;

  return (
    <section className="receipt-copy budget-copy">
      <div className="receipt-copy-label">ORÇAMENTO{totalPaginas > 1 ? ` • FOLHA ${pagina}/${totalPaginas}` : ""}</div>
      <header className="receipt-header">
        <img src={logo} alt={loja.nome} className="receipt-logo" />
        <div className="receipt-store">
          <strong>{loja.endereco}</strong>
          <span>Fone: {loja.telefone} • Cel: {loja.celular}</span>
          <span>E-mail: <em>{loja.email}</em></span>
        </div>
        <div className="receipt-document-meta">
          <strong>ORÇAMENTO</strong>
          <span className="receipt-meta-row"><b>DATA:</b><span>{formatDate(orcamento.data)}</span></span>
          <span className="receipt-meta-row"><b>Nº:</b><span>{String(orcamento.numeroSequencial).padStart(6, "0")}</span></span>
        </div>
      </header>

      <div className="receipt-client-grid">
        <span className="receipt-field receipt-client-name"><b>Cliente:</b> {orcamento.clienteNome || ""}</span>
        <span className="receipt-field"><b>Tel:</b> {orcamento.clienteTelefone || ""}</span>
        <span className="receipt-field receipt-client-address"><b>Endereço:</b> {orcamento.clienteEndereco || ""}</span>
        <span className="receipt-field"><b>Nº documento:</b> {orcamento.clienteDocumento || ""}</span>
      </div>

      <table className="receipt-items-table">
        <thead><tr><th className="receipt-ref">REF.</th><th className="receipt-supplier-ref">FORN.</th><th className="receipt-qty">QUANT.</th><th>DISCRIMINAÇÃO</th><th className="receipt-money">P. UNITÁRIO</th><th className="receipt-money">PREÇO TOTAL</th></tr></thead>
        <tbody>
          {itens.map((item, index) => (
            <tr key={item.id || index}>
              <td>{item.referencia || ""}</td>
              <td className="receipt-supplier-code">{item.fornecedorReferencia || ""}</td>
              <td className="receipt-number">{formatDecimal(item.quantidade)}</td>
              <td>{item.descricao}{item.faltante === 1 ? " — FALTANTE" : ""}</td>
              <td className="receipt-number">{formatCurrency(item.precoUnitario)}</td>
              <td className="receipt-number">{formatCurrency(item.total)}</td>
            </tr>
          ))}
          {linhasVazias.map((_, index) => <tr key={`empty-${index}`} aria-hidden="true"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>)}
        </tbody>
      </table>

      <div className="receipt-payment-line">
        <span><b>Validade:</b> {orcamento.validade ? formatDate(orcamento.validade) : "Sem validade"}</span>
        <span><b>Desconto:</b> {formatDecimal(descontoPercentual)}% ({formatCurrency(orcamento.desconto)})</span>
        {orcamento.observacoes && <span className="budget-observation"><b>Obs.:</b> {orcamento.observacoes}</span>}
      </div>

      <footer className="receipt-footer">
        <div className="receipt-counts"><span>Nº ITENS: <b>{orcamento.items.length}</b></span><span>TOTAL METROS: <b>{formatDecimal(quantidadeMetros)}</b></span><span className="receipt-signature">ASS. CLIENTE:</span></div>
        <div className="receipt-total"><span>VALOR TOTAL</span><strong>{formatCurrency(orcamento.totalLiquido)}</strong></div>
      </footer>
    </section>
  );
}

export function OrcamentoComprovante({ orcamento }: OrcamentoComprovanteProps) {
  const [loja, setLoja] = useState<LojaComprovante>(LOJA_PADRAO);

  useEffect(() => {
    let active = true;
    api.getConfig().then((config) => {
      if (!active) return;
      setLoja({
        nome: config.store_name || config.nome_loja || LOJA_PADRAO.nome,
        endereco: config.store_address || LOJA_PADRAO.endereco,
        telefone: config.store_phone || LOJA_PADRAO.telefone,
        celular: config.store_mobile || LOJA_PADRAO.celular,
        email: config.store_email || LOJA_PADRAO.email,
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const paginas = useMemo(() => {
    if (orcamento.items.length === 0) return [[]];
    const resultado: Orcamento["items"][] = [];
    for (let inicio = 0; inicio < orcamento.items.length; inicio += ITENS_POR_FOLHA) {
      resultado.push(orcamento.items.slice(inicio, inicio + ITENS_POR_FOLHA));
    }
    return resultado;
  }, [orcamento.items]);

  return (
    <div className="budget-pages">
      {paginas.map((itens, index) => (
        <div className="budget-sheet-a4" key={`${orcamento.id}-${index}`}>
          <ViaOrcamento
            orcamento={orcamento}
            loja={loja}
            itens={itens}
            pagina={index + 1}
            totalPaginas={paginas.length}
          />
        </div>
      ))}
    </div>
  );
}
