import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { api } from "../lib/api";
import { FORMAS_PAGAMENTO } from "../lib/pagamentos";
import { centavos, linhasDoPagamento } from "../lib/linhasComprovante";
import { formatCurrency, formatDate } from "../lib/utils";
import { ComprovanteRecebimento, TituloRecebimento } from "../types";
import logo from "../img/logo.png";
import { descreverParcelamentoCartao, normalizarQuantidadeParcelas } from "./ParcelamentoCartaoSelect";

interface LojaComprovante { nome: string; endereco: string; telefone: string; celular: string; email: string; }

const LOJA_PADRAO: LojaComprovante = {
  nome: "Luciano Couros",
  endereco: "R. Lunard, 289 - B. Caiçara - CEP: 30.770-030 - BH/MG",
  telefone: "(31) 3413-5778",
  celular: "98800-5778 e 98719-4108",
  email: "lucianocouros@hotmail.com",
};

const nomeTipo = (titulo: TituloRecebimento) => {
  const documento = titulo.tipo.startsWith("duplicata") ? "BOLETO" : "CHEQUE";
  return `${documento} ${titulo.tipo.endsWith("terceiro") ? "DE TERCEIRO" : "DO EMITENTE"}`;
};

const formatarDataHora = (valor?: string) => {
  if (!valor) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatDate(valor);
  const data = new Date(valor.includes("T") ? valor : `${valor.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return formatDate(valor);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
};

export function ComprovanteRecebimentoModal({ comprovante, onClose, embedded = false }: { comprovante: ComprovanteRecebimento; onClose: () => void; embedded?: boolean }) {
  const [loja, setLoja] = useState<LojaComprovante>(LOJA_PADRAO);
  const acumulados = comprovante.pagamentosVale;
  const linhasAcumuladas = (acumulados || []).flatMap(p => linhasDoPagamento(p,
    p.formaPagamento === "cartao_credito"
      ? descreverParcelamentoCartao(p.valorRecebido, normalizarQuantidadeParcelas(p.parcelasCartao), p.valoresParcelasCartao)
      : undefined, { vendaId: comprovante.resumoOrdem ? undefined : comprovante.vales[0]?.vendaId, ordemId: comprovante.resumoOrdem?.id }));
  const totalPagoVale = linhasAcumuladas.reduce((total, linha) => total + centavos(linha.valor), 0) / 100;
  const titulos = comprovante.titulos || [];
  const vales = comprovante.vales || [];
  const ordens = comprovante.ordens || [];
  const bonusGerado = Number(comprovante.bonusGerado || 0);
  const bonusUtilizado = Number(comprovante.bonusUtilizado || 0);
  const totalTitulosValidos = useMemo(() => titulos.reduce(
    (total, titulo) => total + (titulo.status === "recusado" ? 0 : Number(titulo.valor || 0)), 0
  ), [titulos]);

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

  const forma = FORMAS_PAGAMENTO.find(f => f.value === comprovante.formaPagamento)?.label || comprovante.formaPagamento.replaceAll("_", " ").toUpperCase();
  const totalVales = vales.reduce((total, vale) => total + centavos(vale.valorVale ?? vale.saldoAntes), 0) / 100;
  const devedor = Math.max(0, Math.round((totalVales - totalPagoVale) * 100) / 100);
  const bonusExcedenteVale = Math.max(0, Math.round((totalPagoVale - totalVales) * 100) / 100);
  const totalOriginal = totalVales;
  const saldoDepois = vales.reduce((total, vale) => total + Math.round(Number(vale.saldoDepois) * 100), 0) / 100;
  const saldoAtual = comprovante.resumoOrdem?.saldo ?? vales.reduce((total, vale) => total + Math.round(Number(vale.saldoAtual ?? vale.saldoDepois) * 100), 0) / 100;
  const valeDevedor = comprovante.resumoOrdem?.valeDevedor ?? vales[0]?.valeDevedor;
  const abatido = Number(comprovante.valorAplicado || 0);
  const totalRegistrado = (titulos.length ? totalTitulosValidos : Number(comprovante.valorRecebido)) + bonusUtilizado;
  const referencia = comprovante.id.replace(/^rec_/, "").slice(-8).toUpperCase();
  const parcelamento = comprovante.formaPagamento === "cartao_credito"
    ? descreverParcelamentoCartao(comprovante.valorRecebido, normalizarQuantidadeParcelas(comprovante.parcelasCartao), comprovante.valoresParcelasCartao)
    : "";

  const conteudo = <div id="print-payment-receipt" role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-label="Comprovante de recebimento" className={embedded ? "min-h-0 w-full flex-1 overflow-y-auto print:overflow-visible" : "fixed inset-0 z-[180] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-3 sm:p-8"}>
    <div id="comprovante-recebimento" className="w-full max-w-5xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-white p-3 print:hidden">
        <div><p className="text-[10px] font-black uppercase text-slate-500">Comprovante salvo · dados atualizados</p><h2 className="font-black text-slate-950">Recebimento {referencia}</h2></div>
        <div className="flex gap-2"><button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-black uppercase text-white"><Printer size={16}/>Imprimir</button>{!embedded && <button type="button" onClick={onClose} aria-label="Fechar comprovante" className="rounded-lg border border-slate-300 p-2"><X size={18}/></button>}</div>
      </div>

      <article className={`payment-receipt-paper${acumulados ? " payment-receipt-individual" : ""}${comprovante.resumoOrdem ? " payment-receipt-order" : ""}`}>
        <header className="payment-receipt-header">
          <img src={logo} alt={loja.nome} />
          <div className="payment-receipt-store"><strong>{loja.nome}</strong><span>{loja.endereco}</span><span>Fone: {loja.telefone} · Cel: {loja.celular}</span><span>{loja.email}</span></div>
          <div className="payment-receipt-meta"><strong>RECIBO DE PAGAMENTO</strong><span><b>Nº:</b> {referencia}</span><span><b>EMISSÃO:</b> {formatarDataHora(comprovante.createdAt || comprovante.data)}</span></div>
        </header>

        <section className="payment-receipt-client">
          <span className="wide"><b>CLIENTE:</b> {comprovante.clienteNome}</span><span><b>CPF/CNPJ:</b> {comprovante.clienteDocumento || "NÃO INFORMADO"}</span>
        </section>

        {acumulados ? <>
          <section className="payment-receipt-section">
            <h3>{comprovante.resumoOrdem ? `ORDEM DE COBRANÇA Nº ${comprovante.resumoOrdem.numero} · VALES` : "VALE"}</h3>
            <table className="payment-receipt-vales payment-receipt-vales-summary"><thead><tr><th>VALE</th><th>Nº VALE</th><th>DATA EMISSÃO</th><th className="number">VALOR ORIGINAL</th></tr></thead>
              <tbody>{vales.map(v => <tr key={v.numeroSequencial}><td>VALE</td><td>#{v.numeroSequencial}</td><td>{v.data ? formatDate(v.data) : "—"}</td><td className="number">{formatCurrency(v.valorVale ?? v.saldoAntes)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>TOTAL VALES</td><td className="number">{formatCurrency(totalVales)}</td></tr></tfoot>
            </table>
          </section>
          <section className="payment-receipt-section">
            <h3>PAGAMENTOS</h3>
            <table className="payment-receipt-methods"><thead><tr><th>FORMA DE PAGAMENTO</th><th>Nº CHEQUE / BOLETO</th><th>DATA</th><th>SITUAÇÃO</th><th className="number">VALOR</th></tr></thead>
              <tbody>{linhasAcumuladas.map(linha => <tr key={linha.id}><td>{linha.forma}{linha.titular && ` · ${linha.titular}`}{linha.detalhe && <small>{linha.detalhe}</small>}</td><td>{linha.numero}</td><td>{formatDate(linha.data)}</td><td>{linha.situacao}</td><td className="number strong">{formatCurrency(linha.valor)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={4}>TOTAL PAGAMENTOS</td><td className="number">{formatCurrency(totalPagoVale)}</td></tr></tfoot>
            </table>
            <dl className="payment-receipt-balance">
              <div><dt>TOTAL</dt><dd>{formatCurrency(totalVales)}</dd></div>
              <div><dt>PAGO</dt><dd>{formatCurrency(totalPagoVale)}</dd></div>
              <div><dt>DEVEDOR</dt><dd>{formatCurrency(devedor)}</dd></div>
              <div><dt>BÔNUS</dt><dd>{formatCurrency(bonusExcedenteVale)}</dd></div>
            </dl>
            {valeDevedor && <p className="payment-receipt-transfer">Saldo devedor transferido para o vale #{valeDevedor}.</p>}
          </section>
        </> : <>
        <div className="payment-receipt-columns">
        <section className="payment-receipt-section">
          <h3>VALES</h3>
          <div className="payment-receipt-table-wrap"><table className="payment-receipt-vales"><thead><tr><th>VALE</th><th className="number">VALOR ORIGINAL</th><th className="number">ABATIDO ATÉ ESTE RECIBO</th><th className="number">FALTA</th></tr></thead><tbody>
            {vales.map((vale, i) => <tr key={`${vale.numeroSequencial}-${i}`}><td><b>#{vale.numeroSequencial}</b></td><td className="number">{formatCurrency(vale.valorVale ?? vale.saldoAntes)}</td><td className="number">{formatCurrency(Math.max(0, Number(vale.valorVale ?? vale.saldoAntes) - Number(vale.saldoDepois)))}</td><td className="number strong">{formatCurrency(vale.saldoDepois)}</td></tr>)}
            {!vales.length && <tr><td colSpan={4}>Recebimento sem vínculo ativo com vale</td></tr>}
          </tbody><tfoot><tr><td>TOTAL</td><td className="number">{formatCurrency(totalOriginal)}</td><td className="number">{formatCurrency(Math.max(0, totalOriginal - saldoDepois))}</td><td className="number">{formatCurrency(saldoDepois)}</td></tr></tfoot></table></div>
          {vales.length > 0 && <p className="payment-receipt-note">Este pagamento abateu {formatCurrency(abatido)}, já incluídos acima.</p>}
          {Math.abs(saldoAtual - saldoDepois) > 0.005 && <p className="payment-receipt-current-balance payment-receipt-note">Saldo atual: <b>{formatCurrency(saldoAtual)}</b> (após outras movimentações).</p>}
          {ordens.length > 0 && <p className="payment-receipt-orders">VÍNCULO: {ordens.map((ordem) => `ORDEM Nº ${ordem.numeroSequencial}`).join(" · ")}</p>}
        </section>

        <section className="payment-receipt-section">
          <h3>PAGAMENTO DESTE RECIBO</h3>
          <div className="payment-receipt-table-wrap"><table className="payment-receipt-methods"><thead><tr><th>FORMA / TITULAR</th>{titulos.length > 0 && <th>Nº CHEQUE / BOLETO</th>}<th>DATA</th><th>SITUAÇÃO</th><th className="number">VALOR</th></tr></thead><tbody>
            {titulos.map((titulo, indice) => <tr key={titulo.id || indice} className={titulo.status === "recusado" ? "rejected" : ""}><td><b>{nomeTipo(titulo)}</b><small>{titulo.nomeTitular} · {titulo.documentoTitular || "CPF/CNPJ não informado"}</small>{titulo.observacao && <small>Obs.: {titulo.observacao}</small>}</td><td>{titulo.numeroDocumento}</td><td>{formatDate(comprovante.data)}</td><td>{(titulo.status || "aguardando").toUpperCase()}{titulo.dataCompensacao ? <small>em {formatDate(titulo.dataCompensacao)}</small> : null}{titulo.motivoStatus ? <small>{titulo.motivoStatus}</small> : null}</td><td className="number strong">{formatCurrency(titulo.valor)}</td></tr>)}
            {titulos.length === 0 && comprovante.formaPagamento !== "bonus" && <tr><td><b>{forma}</b>{parcelamento && <small>{parcelamento}</small>}</td>{titulos.length > 0 && <td>—</td>}<td>{formatDate(comprovante.data)}</td><td>{comprovante.status === "recusado" ? "RECUSADO" : "RECEBIDO"}</td><td className="number strong">{formatCurrency(comprovante.valorRecebido)}</td></tr>}
            {bonusUtilizado > 0 && <tr><td><b>BÔNUS UTILIZADO</b></td>{titulos.length > 0 && <td>—</td>}<td>{formatDate(comprovante.data)}</td><td>APLICADO</td><td className="number strong">{formatCurrency(bonusUtilizado)}</td></tr>}
          </tbody><tfoot><tr><td colSpan={titulos.length > 0 ? 4 : 3}>TOTAL DESTE PAGAMENTO</td><td className="number">{formatCurrency(totalRegistrado)}</td></tr></tfoot></table></div>
        </section>

        </div>

        </>}

        {!acumulados && bonusGerado > 0.005 && <div className="payment-receipt-bonus"><span>BÔNUS GERADO PELO EXCEDENTE: <b>{formatCurrency(bonusGerado)}</b></span></div>}
        <div className="payment-receipt-observation"><b>OBSERVAÇÃO:</b> {comprovante.observacao || "—"}</div>

        <footer className="payment-receipt-footer">
          <p>{loja.nome}, {formatDate(comprovante.data)}</p>
          <div><span>{comprovante.clienteNome}</span><span>{loja.nome}</span></div>
          <small>{loja.nome} · {loja.endereco} · {loja.telefone}</small>
        </footer>
      </article>
    </div>
  </div>;
  return embedded ? conteudo : createPortal(conteudo, document.body);
}
