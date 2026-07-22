import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { Venda } from "../types";
import logo from "../img/logo.png";

interface VendaComprovanteProps {
  venda: Venda;
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

const FORMAS: Record<string, string> = {
  avista_dinheiro: "À vista — dinheiro",
  avista_debito: "À vista — débito",
  dinheiro: "À vista — dinheiro",
  cartao_debito: "À vista — débito",
  cartao_credito: "Cartão de crédito",
  pix: "PIX",
  cheque_emitente: "Cheque do emitente",
  cheque_terceiro: "Cheque de terceiro",
  duplicata_emitente: "Duplicata do emitente",
  duplicata_terceiro: "Duplicata de terceiro",
  bonus: "Bônus / crédito",
  vale: "Vale",
  boleto: "Boleto",
};

const ITENS_POR_FOLHA = 18;

function ViaComprovante({ venda, loja, via, itens }: { venda: Venda; loja: LojaComprovante; via: string; itens: Venda["items"] }) {
  const quantidadeMetros = itens
    .filter((item) => item.unidade.toLowerCase().includes("metro"))
    .reduce((total, item) => total + Number(item.quantidade), 0);
  const linhasVazias = Array.from({ length: Math.max(0, ITENS_POR_FOLHA - itens.length) });
  const instrumento = venda.instrumentoRecebimento;
  const forma = instrumento?.tipo || venda.formaPagamento || (venda.saldoRestante > 0 ? "vale" : "");
  const titulo = instrumento?.tipo?.startsWith("cheque")
    ? "VENDA / CHEQUE"
    : venda.saldoRestante > 0
      ? "VENDA / VALE"
      : "VENDA";
  const vencimento = instrumento?.vencimento || venda.vencimento;

  return (
    <section className="receipt-copy">
      <div className="receipt-copy-label">{via}</div>
      <header className="receipt-header">
        <img src={logo} alt={loja.nome} className="receipt-logo" />
        <div className="receipt-store">
          <strong>{loja.endereco}</strong>
          <span>Fone: {loja.telefone} • Cel: {loja.celular}</span>
          <span>E-mail: <em>{loja.email}</em></span>
        </div>
        <div className="receipt-document-meta">
          <strong>{titulo}</strong>
          <span>Data: {formatDate(venda.data)}</span>
          <span>Nº {String(venda.numeroSequencial).padStart(6, "0")}</span>
        </div>
      </header>

      <div className="receipt-client-grid">
        <span className="receipt-field receipt-client-name"><b>Cliente:</b> {venda.clienteNome || ""}</span>
        <span className="receipt-field"><b>Tel:</b> {venda.clienteTelefone || ""}</span>
        <span className="receipt-field receipt-client-address"><b>Endereço:</b> {venda.clienteEndereco || ""}</span>
        <span className="receipt-field"><b>Nº documento:</b> {venda.clienteDocumento || ""}</span>
      </div>

      <table className="receipt-items-table">
        <thead><tr><th className="receipt-ref">REF.</th><th className="receipt-qty">QUANT.</th><th>DISCRIMINAÇÃO</th><th className="receipt-money">P. UNITÁRIO</th><th className="receipt-money">PREÇO TOTAL</th></tr></thead>
        <tbody>
          {itens.map((item, index) => (
            <tr key={item.id || index}>
              <td>{item.referencia || ""}</td>
              <td className="receipt-number">{formatDecimal(item.quantidade)}</td>
              <td>{item.descricao}</td>
              <td className="receipt-number">{formatCurrency(item.precoUnitario)}</td>
              <td className="receipt-number">{formatCurrency(item.total)}</td>
            </tr>
          ))}
          {linhasVazias.map((_, index) => <tr key={`empty-${index}`} aria-hidden="true"><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>)}
        </tbody>
      </table>

      <div className="receipt-payment-line">
        <span><b>Forma:</b> {FORMAS[forma] || forma || "Não informada"}</span>
        {instrumento && <span><b>Nº:</b> {instrumento.numeroDocumento} • <b>Emitente:</b> {instrumento.emitente}</span>}
        {venda.saldoRestante > 0 && <span><b>Saldo do Vale:</b> {formatCurrency(venda.saldoRestante)}</span>}
      </div>

      <footer className="receipt-footer">
        <div className="receipt-counts"><span>Nº Itens: <b>{itens.length}</b></span><span>Metros: <b>{formatDecimal(quantidadeMetros)}</b></span><span className="receipt-signature">ASS.CLIENTE:</span></div>
        <div className="receipt-total"><span>TOTAL R$</span><strong>{formatCurrency(venda.totalLiquido)}</strong></div>
        <div className="receipt-due"><span>VENCIMENTO:</span><strong>{vencimento ? formatDate(vencimento) : "À VISTA"}</strong></div>
      </footer>
    </section>
  );
}

export function VendaComprovante({ venda }: VendaComprovanteProps) {
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

  const chave = useMemo(() => `${venda.id}-${venda.updatedAt || venda.data}`, [venda]);
  const paginas = useMemo(() => {
    const itens = venda.items || [];
    if (itens.length === 0) return [[]];
    const resultado: Venda["items"][] = [];
    for (let inicio = 0; inicio < itens.length; inicio += ITENS_POR_FOLHA) {
      resultado.push(itens.slice(inicio, inicio + ITENS_POR_FOLHA));
    }
    return resultado;
  }, [venda.items]);

  return (
    <div className="receipt-pages" data-receipt={chave}>
      {paginas.map((itens, pagina) => {
        const complemento = paginas.length > 1 ? ` • FOLHA ${pagina + 1}/${paginas.length}` : "";
        return (
          <div className="receipt-sheet-a4" data-receipt-page={pagina + 1} key={`${chave}-${pagina}`}>
            <ViaComprovante venda={venda} loja={loja} itens={itens} via={`1ª VIA — CLIENTE${complemento}`} />
            <div className="receipt-cut"><span>✂ corte aqui</span></div>
            <ViaComprovante venda={venda} loja={loja} itens={itens} via={`2ª VIA — LOJA${complemento}`} />
          </div>
        );
      })}
    </div>
  );
}
