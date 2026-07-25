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
  const todosItens = (venda.items || itens)
    .map((item) => ({ ...item, quantidade: Number(item.quantidadeDisponivel ?? item.quantidade) }))
    .filter((item) => item.quantidade > 0.005);
  const quantidadeMetros = todosItens
    .filter((item) => item.unidade.toLowerCase().includes("metro"))
    .reduce((total, item) => total + Number(item.quantidade), 0);
  const linhasVazias = Array.from({ length: Math.max(0, ITENS_POR_FOLHA - itens.length) });
  const instrumento = venda.instrumentoRecebimento;
  const ehVale = Boolean(venda.vencimento);
  const forma = instrumento?.tipo || (ehVale ? "vale" : venda.formaPagamento || "");
  const titulo = instrumento?.tipo?.startsWith("cheque")
    ? "VENDA / CHEQUE"
    : ehVale
      ? "VENDA / VALE"
      : "VENDA";
  const vencimento = instrumento?.vencimento || venda.vencimento;
  const viaCurta = via.startsWith("1ª") ? "1ª VIA" : "2ª VIA";

  return (
    <section className="receipt-copy">
      <header className="receipt-header">
        <img src={logo} alt={loja.nome} className="receipt-logo" />
        <div className="receipt-store">
          <strong>{loja.endereco}</strong>
          <span>Fone: {loja.telefone} • Cel: {loja.celular}</span>
          <span>E-mail: <em>{loja.email}</em></span>
        </div>
        <div className="receipt-document-meta">
          <strong>{titulo} • {viaCurta}</strong>
          <span className="receipt-meta-row"><b>DATA:</b><span>{formatDate(venda.data)}</span></span>
          <span className="receipt-meta-row"><b>Nº:</b><span>{String(venda.numeroSequencial).padStart(6, "0")}</span></span>
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
        {(venda.devolucoes || []).length > 0 && <span><b>Atualizado após devolução:</b> {(venda.devolucoes || []).length} registro(s)</span>}
        {Number(venda.desconto) > 0 && <span><b>Desconto:</b> {formatCurrency(venda.desconto)}</span>}
        {instrumento && <span><b>Nº:</b> {instrumento.numeroDocumento} • <b>Emitente:</b> {instrumento.emitente}</span>}
        {venda.saldoRestante > 0 && <span><b>Saldo do Vale:</b> {formatCurrency(venda.saldoRestante)}</span>}
        <span><b>Vencimento:</b> {vencimento ? formatDate(vencimento) : "À vista"}</span>
      </div>

      <footer className="receipt-footer">
        <div className="receipt-counts"><span>Nº ITENS: <b>{todosItens.length}</b></span><span>TOTAL METROS: <b>{formatDecimal(quantidadeMetros)}</b></span><span className="receipt-signature">ASS. CLIENTE:</span></div>
        <div className="receipt-total"><span>VALOR TOTAL</span><strong>{formatCurrency(venda.totalLiquido)}</strong></div>
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
  const itensAtuais = useMemo(() => (venda.items || [])
    .map((item) => {
      const quantidade = Number(item.quantidadeDisponivel ?? item.quantidade);
      const proporcao = Number(item.quantidade) > 0 ? quantidade / Number(item.quantidade) : 0;
      return {
        ...item,
        quantidade,
        total: Math.round(Number(item.total) * proporcao * 100) / 100
      };
    })
    .filter((item) => item.quantidade > 0.005), [venda.items]);
  const paginas = useMemo(() => {
    const itens = itensAtuais;
    if (itens.length === 0) return [[]];
    const resultado: Venda["items"][] = [];
    for (let inicio = 0; inicio < itens.length; inicio += ITENS_POR_FOLHA) {
      resultado.push(itens.slice(inicio, inicio + ITENS_POR_FOLHA));
    }
    return resultado;
  }, [itensAtuais]);

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
