import { formatarQuantidades, unidadeResumida } from "../lib/quantidades";
import { financeiroVale } from "../lib/financeiro";
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDecimal } from "../lib/utils";
import { ItemVenda, Venda } from "../types";
import logo from "../img/logo.png";
import { descreverParcelamentoCartao, normalizarQuantidadeParcelas } from "./ParcelamentoCartaoSelect";

interface VendaComprovanteProps {
  venda: Venda;
  demonstrativoPagamento?: boolean;
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

// Versão de avaliação com mais respiro. Voltar para 18 reativa
// automaticamente as medidas compactas preservadas no CSS.
const ITENS_POR_FOLHA = 15;
type ItemComprovante = ItemVenda & { linhaDevolucao?: boolean; linhaSaldo?: boolean };

function ViaComprovante({ venda, loja, via, itens, todosItens, ultimaPagina, limiteItens, demonstrativoPagamento }: { venda: Venda; loja: LojaComprovante; via: string; itens: ItemComprovante[]; todosItens: ItemComprovante[]; ultimaPagina: boolean; limiteItens: number; demonstrativoPagamento: boolean }) {
  const residual = Number(venda.contabilizaReceita ?? 1) === 0;
  const layoutRespirado = ITENS_POR_FOLHA === 15;
  const linhasVazias = Array.from({ length: Math.max(0, limiteItens - (itens?.length || 0)) });
  const bonusDevolucao = (venda.devolucoes || []).reduce((soma, devolucao) => soma + (devolucao.modalidade === "bonus_integral" ? Number(devolucao.valorCredito) : 0), 0);
  const subtotalAtual = residual ? Number(venda.totalLiquido) : (venda.items || []).reduce((soma, item) => soma + Number(item.total), 0)
    - (venda.devolucoes || []).reduce((soma, devolucao) => soma + Number(devolucao.valorCredito), 0);
  const abatimentoAtual = Math.round((subtotalAtual - Number(venda.totalMercadoriasAposDevolucoes ?? venda.totalLiquido) + Number(venda.creditoLinhaDevolucao || 0)) * 100) / 100;
  const instrumento = venda.instrumentoRecebimento;
  const ehVale = Boolean(venda.vencimento);
  const formaPagamento = String(venda.formaPagamento || (ehVale ? "vale" : "não informada"));
  const parcelasCartao = normalizarQuantidadeParcelas(venda.parcelasCartao);
  const financeiro = financeiroVale(venda);
  const saldoAcerto = Math.round((Number(venda.totalLiquido) - financeiro.presumido) * 100) / 100;
  const valorRecebido = Math.max(0, financeiro.recebido - financeiro.creditoUtilizado);
  const observacaoDevolucao = (venda.devolucoes || []).find((devolucao) => devolucao.observacoes?.trim())?.observacoes;
  const observacaoComprovante = String(observacaoDevolucao || venda.observacoes || "").trim().slice(0, 100);
  const titulo = residual ? "VALE DE SALDO DEVEDOR" : instrumento?.tipo?.startsWith("cheque")
    ? "VENDA / CHEQUE"
    : ehVale
      ? "VENDA / VALE"
      : "VENDA";
  const viaCurta = via.replace(" — CLIENTE", "").replace(" — LOJA", "");

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
          <strong>{demonstrativoPagamento ? "DEMONSTRATIVO DE PAGAMENTO" : titulo} • {viaCurta}</strong>
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
        <thead><tr><th className="receipt-ref">REF.</th><th className="receipt-supplier-ref">FORN.</th><th className="receipt-qty">{layoutRespirado ? "QTD." : "QUANT."}</th><th>DISCRIMINAÇÃO</th><th className="receipt-money receipt-unit-money">{layoutRespirado ? "UNITÁRIO" : "P. UNITÁRIO"}</th><th className="receipt-money">PREÇO TOTAL</th></tr></thead>
        <tbody>
          {itens.map((item, index) => (
            <tr key={item.id || index} className={item.linhaDevolucao ? "receipt-return-row" : undefined}>
              <td className="receipt-product-code">{String(item.referencia || "").slice(0, 4)}</td>
              <td className="receipt-supplier-code">{String(item.fornecedorReferencia || "").slice(0, 4)}</td>
              <td className="receipt-number">{item.linhaSaldo ? "" : `${formatDecimal(item.quantidade)} ${unidadeResumida(item.unidade)}`}</td>
              <td>{item.linhaDevolucao ? `DEVOLVIDO: ${item.descricao}` : item.descricao}</td>
              <td className="receipt-number">{item.linhaSaldo ? "" : formatCurrency(item.precoUnitario)}</td>
              <td className="receipt-number">{item.linhaSaldo ? "" : formatCurrency(item.total)}</td>
            </tr>
          ))}
          {linhasVazias.map((_, index) => <tr key={`empty-${index}`} aria-hidden="true"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>)}
        </tbody>
      </table>

      {ultimaPagina && <>
      {(Math.abs(abatimentoAtual) >= 0.01 || bonusDevolucao >= 0.01) && <div className="receipt-payment-line">
        <span><b>SUBTOTAL DOS ITENS:</b> {formatCurrency(subtotalAtual)}</span>
        <span><b>{bonusDevolucao >= 0.01 ? "BÔNUS DEV. (DÍVIDA MANTIDA):" : "DESCONTOS / AJUSTES DE DEVOLUÇÃO:"}</b> {formatCurrency(bonusDevolucao >= 0.01 ? bonusDevolucao : abatimentoAtual)}</span>
      </div>}
      {Number(venda.valorTransferido || 0) > 0 && <div className="receipt-payment-line"><span>TRANSFERIDO PARA OUTRO VALE: {formatCurrency(venda.valorTransferido!)}</span></div>}
      <div className="receipt-payment-line">
        <span className="receipt-payment-method"><b>FORMA:</b> {formaPagamento.replaceAll("_", " ").toUpperCase()}{formaPagamento === "cartao_credito" ? ` · ${descreverParcelamentoCartao(valorRecebido, parcelasCartao)}` : ""}</span>
        {financeiro.creditoUtilizado > 0 && <span className="receipt-payment-value"><b>BÔNUS UTILIZADO:</b> {formatCurrency(financeiro.creditoUtilizado)}</span>}
        <span className="receipt-payment-value"><b>VALOR RECEBIDO:</b> {formatCurrency(valorRecebido)}</span>
        <span className="receipt-payment-observation"><b>OBSERVAÇÃO:</b> <span title={observacaoComprovante}>{observacaoComprovante || "—"}</span></span>
      </div>

      {Number(venda.creditoLinhaDevolucao || 0)>0 && <div className="receipt-payment-line"><b>CRÉDITO NA CARTEIRA: {formatCurrency(venda.creditoLinhaDevolucao!)}</b></div>}
      </>}
      {ultimaPagina ? <footer className="receipt-footer">
        <div className="receipt-counts">{demonstrativoPagamento ? <><span>VALE #{venda.numeroSequencial}</span><span className="receipt-signature">ASS. CLIENTE:</span></> : residual ? <><span>SALDO ATUAL: <b>{formatCurrency(financeiroVale(venda).restantePresumido)}</b></span><span className="receipt-signature">ASS. CLIENTE:</span></> : <><span>QUANTIDADE: <b>{formatarQuantidades(todosItens)}</b></span><span className="receipt-signature">ASS. CLIENTE:</span></>}</div>
        <div className="receipt-total"><span>{demonstrativoPagamento ? saldoAcerto < 0 ? "BÔNUS GERADO" : saldoAcerto > 0 ? "DEVEDOR" : "SALDO" : residual ? "VALOR DO VALE" : "VALOR TOTAL"}</span><strong>{formatCurrency(demonstrativoPagamento ? saldoAcerto : venda.totalLiquido)}</strong></div>
      </footer> : <div className="receipt-payment-line">CONTINUA NA PRÓXIMA FOLHA · TOTAIS NA ÚLTIMA FOLHA</div>}
    </section>
  );
}

export function VendaComprovante({ venda, demonstrativoPagamento = false }: VendaComprovanteProps) {
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
  const itensAtuais = useMemo(() => {
    if (Number(venda.contabilizaReceita ?? 1) === 0) {
      const origem = venda.origemSaldo;
      const descricao = origem?.ordem
        ? `Devedor da ordem #${origem.ordem.numero}`
        : origem?.vales.length
        ? `Devedor ${origem.vales.length === 1 ? 'do vale' : 'dos vales'} ${origem.vales.map(v => `#${v.numero}`).join(', ')}`
        : origem?.descricao || venda.observacoes || 'Saldo devedor transferido';
      return [{ id: 'origem', vendaId: venda.id, produtoId: '', descricao,
        quantidade: 1, unidade: 'un', precoUnitario: Number(venda.totalLiquido), custoUnitario: 0, desconto: 0,
        total: Number(venda.totalLiquido), custoTotal: 0, lucroBruto: 0 } as ItemComprovante];
    }
    const devolvidos = new Map<string, { quantidade: number; credito: number }>();
    for (const devolucao of venda.devolucoes || []) {
      for (const item of devolucao.items || []) {
        const atual = devolvidos.get(item.itemVendaId) || { quantidade: 0, credito: 0 };
        devolvidos.set(item.itemVendaId, {
          quantidade: atual.quantidade + Number(item.quantidade),
          credito: atual.credito + Number(item.totalCredito)
        });
      }
    }
    const itensOriginais = (venda.items || []).map(i=>({...i, linhaDevolucao: Number(i.quantidade)<0}));
    const linhasDevolvidas = itensOriginais.flatMap((item) => {
      const devolvido = devolvidos.get(item.id);
      if (!devolvido || devolvido.quantidade <= 0.005) return [];
      return [{
        ...item,
        id: `${item.id}-devolvido`,
        quantidade: -devolvido.quantidade,
        precoUnitario: devolvido.quantidade > 0 ? devolvido.credito / devolvido.quantidade : 0,
        total: -Math.round(devolvido.credito * 100) / 100,
        linhaDevolucao: true
      }];
    });
    const comparar = (a: ItemComprovante, b: ItemComprovante) =>
      a.descricao.localeCompare(b.descricao, "pt-BR", { sensitivity: "base", numeric: true });
    const linhas = [...itensOriginais, ...linhasDevolvidas];
    return [
      ...linhas.filter(item => !item.linhaDevolucao).sort(comparar),
      ...linhas.filter(item => item.linhaDevolucao).sort(comparar),
    ];
  }, [venda]);
  const itensDemonstrativo = useMemo(() => {
    const pago = financeiroVale(venda).presumido;
    if (!demonstrativoPagamento || pago <= 0) return itensAtuais;
    const pagamento: ItemComprovante = { id: 'pagamento-acerto', vendaId: venda.id, produtoId: '', descricao: 'PAGO',
      quantidade: 1, unidade: 'un', precoUnitario: -pago, custoUnitario: 0, desconto: 0,
      total: -pago, custoTotal: 0, lucroBruto: 0 };
    return [...itensAtuais, pagamento];
  }, [venda, itensAtuais, demonstrativoPagamento]);
  // Cada faixa financeira ocupa aproximadamente três linhas da tabela.
  const faixasExtras = Number(Boolean(venda.desconto || venda.devolucoes?.length || venda.items?.some(i => i.quantidade < 0)))
    + Number(Number(venda.valorTransferido || 0) > 0)
    + Number(Number(venda.creditoLinhaDevolucao || 0) > 0)
    + Number(financeiroVale(venda).creditoUtilizado > 0);
  const limiteItens = Math.max(3, ITENS_POR_FOLHA - faixasExtras * 3);
  const paginas = useMemo(() => {
    const itens = itensDemonstrativo;
    if (itens.length === 0) return [[]];
    const resultado: ItemComprovante[][] = [];
    for (let inicio = 0; inicio < itens.length; inicio += limiteItens) {
      resultado.push(itens.slice(inicio, inicio + limiteItens));
    }
    return resultado;
  }, [itensDemonstrativo, limiteItens]);

  return (
    <div className="receipt-pages" data-receipt={chave} data-items-per-sheet={ITENS_POR_FOLHA}>
      {paginas.map((itens, pagina) => {
        const complemento = paginas.length > 1 ? ` • FOLHA ${pagina + 1}/${paginas.length}` : "";
        return (
          <div className="receipt-sheet-a4" data-receipt-page={pagina + 1} key={`${chave}-${pagina}`}>
            <ViaComprovante venda={venda} loja={loja} itens={itens} todosItens={itensDemonstrativo} limiteItens={limiteItens} ultimaPagina={pagina === paginas.length - 1} demonstrativoPagamento={demonstrativoPagamento} via={`1ª VIA — CLIENTE${complemento}`} />
            <div className="receipt-cut"><span>✂ corte aqui</span></div>
            <ViaComprovante venda={venda} loja={loja} itens={itens} todosItens={itensDemonstrativo} limiteItens={limiteItens} ultimaPagina={pagina === paginas.length - 1} demonstrativoPagamento={demonstrativoPagamento} via={`2ª VIA — LOJA${complemento}`} />
          </div>
        );
      })}
    </div>
  );
}
