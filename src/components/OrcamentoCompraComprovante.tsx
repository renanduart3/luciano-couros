import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatDate, formatDecimal } from "../lib/utils";
import { Fornecedor, OrcamentoCompra } from "../types";
import logo from "../img/logo.png";

interface Props {
  orcamento: OrcamentoCompra;
  fornecedor: Fornecedor;
}

interface LojaPedido {
  nome: string;
  endereco: string;
  telefone: string;
  celular: string;
  email: string;
}

const LOJA_PADRAO: LojaPedido = {
  nome: "Luciano Couros",
  endereco: "R. Lunard, 289 - B. Caiçara - CEP: 30.770-030 - BH/MG",
  telefone: "(31) 3413-5778",
  celular: "98800-5778 e 98719-4108",
  email: "lucianocouros@hotmail.com",
};

const ITENS_POR_FOLHA = 22;

export function OrcamentoCompraComprovante({ orcamento, fornecedor }: Props) {
  const [loja, setLoja] = useState<LojaPedido>(LOJA_PADRAO);

  useEffect(() => {
    let ativo = true;
    api.getConfig().then((config) => {
      if (!ativo) return;
      setLoja({
        nome: config.store_name || config.nome_loja || LOJA_PADRAO.nome,
        endereco: config.store_address || LOJA_PADRAO.endereco,
        telefone: config.store_phone || LOJA_PADRAO.telefone,
        celular: config.store_mobile || LOJA_PADRAO.celular,
        email: config.store_email || LOJA_PADRAO.email,
      });
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, []);

  const paginas = useMemo(() => {
    if (orcamento.items.length === 0) return [[]];
    const resultado: OrcamentoCompra["items"][] = [];
    for (let inicio = 0; inicio < orcamento.items.length; inicio += ITENS_POR_FOLHA) {
      resultado.push(orcamento.items.slice(inicio, inicio + ITENS_POR_FOLHA));
    }
    return resultado;
  }, [orcamento.items]);

  return <div className="budget-pages">
    {paginas.map((itens, pagina) => {
      const vazias = Array.from({ length: Math.max(0, ITENS_POR_FOLHA - itens.length) });
      return <div className="budget-sheet-a4 purchase-budget-sheet" key={`${orcamento.id}-${pagina}`}>
        <section className="receipt-copy budget-copy">
          <div className="receipt-copy-label">PEDIDO DE ORÇAMENTO{paginas.length > 1 ? ` • FOLHA ${pagina + 1}/${paginas.length}` : ""}</div>
          <header className="receipt-header">
            <img src={logo} alt={loja.nome} className="receipt-logo" />
            <div className="receipt-store"><strong>{loja.endereco}</strong><span>Fone: {loja.telefone} • Cel: {loja.celular}</span><span>E-mail: <em>{loja.email}</em></span></div>
            <div className="receipt-document-meta"><strong>PEDIDO DE COTAÇÃO</strong><span className="receipt-meta-row"><b>DATA:</b><span>{formatDate(orcamento.data)}</span></span><span className="receipt-meta-row"><b>Nº:</b><span>{String(orcamento.numeroSequencial).padStart(6, "0")}</span></span></div>
          </header>

          <div className="receipt-client-grid">
            <span className="receipt-field receipt-client-name"><b>Fornecedor:</b> {fornecedor.nome}</span>
            <span className="receipt-field"><b>Tel:</b> {fornecedor.telefone || ""}</span>
            <span className="receipt-field receipt-client-address"><b>Referência:</b> {fornecedor.referencia || ""}</span>
            <span className="receipt-field"><b>Documento:</b> {fornecedor.documento || ""}</span>
          </div>

          <table className="receipt-items-table">
            <thead><tr><th className="receipt-ref">REF.</th><th>PRODUTO / MATERIAL</th><th className="receipt-qty">QUANTIDADE</th><th className="receipt-qty">UNIDADE</th></tr></thead>
            <tbody>
              {itens.map((item, index) => <tr key={item.id || index}><td>{item.produtoCodigo || ""}</td><td><strong>{item.produtoNome || "Produto"}</strong></td><td className="receipt-number"><strong>{formatDecimal(item.quantidade)}</strong></td><td>{item.unidade}</td></tr>)}
              {vazias.map((_, index) => <tr key={`vazia-${index}`} aria-hidden="true"><td>&nbsp;</td><td></td><td></td><td></td></tr>)}
            </tbody>
          </table>

          <div className="receipt-payment-line"><span><b>Validade solicitada:</b> {orcamento.validade ? formatDate(orcamento.validade) : "A combinar"}</span>{orcamento.observacao && <span className="budget-observation"><b>Observações:</b> {orcamento.observacao}</span>}</div>
          <footer className="receipt-footer"><div className="receipt-counts"><span>Nº DE ITENS: <b>{orcamento.items.length}</b></span><span>Favor informar preço, disponibilidade e prazo de entrega.</span></div><div className="receipt-total"><span>PEDIDO</span><strong>COTAÇÃO</strong></div></footer>
        </section>
      </div>;
    })}
  </div>;
}
