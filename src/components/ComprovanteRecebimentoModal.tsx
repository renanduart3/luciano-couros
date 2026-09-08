import React, { useEffect, useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { api } from "../lib/api";
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
  const data = new Date(valor.includes("T") ? valor : `${valor.replace(" ", "T")}Z`);
  if (Number.isNaN(data.getTime())) return formatDate(valor);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
};

export function ComprovanteRecebimentoModal({ comprovante, onClose }: { comprovante: ComprovanteRecebimento; onClose: () => void }) {
  const [loja, setLoja] = useState<LojaComprovante>(LOJA_PADRAO);
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

  const forma = comprovante.formaPagamento.replaceAll("_", " ").toUpperCase();
  const referencia = comprovante.id.replace(/^rec_/, "").slice(-8).toUpperCase();
  const parcelamento = comprovante.formaPagamento === "cartao_credito"
    ? descreverParcelamentoCartao(comprovante.valorRecebido, normalizarQuantidadeParcelas(comprovante.parcelasCartao), comprovante.valoresParcelasCartao)
    : "";

  return <div className="fixed inset-0 z-[180] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-3 sm:p-8">
    <div id="comprovante-recebimento" className="w-full max-w-5xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-white p-3 print:hidden">
        <div><p className="text-[10px] font-black uppercase text-slate-500">Comprovante salvo · dados atualizados</p><h2 className="font-black text-slate-950">Recebimento {referencia}</h2></div>
        <div className="flex gap-2"><button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-black uppercase text-white"><Printer size={16}/>Imprimir</button><button type="button" onClick={onClose} aria-label="Fechar comprovante" className="rounded-lg border border-slate-300 p-2"><X size={18}/></button></div>
      </div>

      <article className="payment-receipt-paper">
        <header className="payment-receipt-header">
          <img src={logo} alt={loja.nome} />
          <div className="payment-receipt-store"><strong>{loja.nome}</strong><span>{loja.endereco}</span><span>Fone: {loja.telefone} · Cel: {loja.celular}</span><span>{loja.email}</span></div>
          <div className="payment-receipt-meta"><strong>RECIBO DE PAGAMENTO</strong><span><b>Nº:</b> {referencia}</span><span><b>EMISSÃO:</b> {formatarDataHora(comprovante.createdAt || comprovante.data)}</span></div>
        </header>

        <section className="payment-receipt-client">
          <span className="wide"><b>CLIENTE:</b> {comprovante.clienteNome}</span><span><b>CPF/CNPJ:</b> {comprovante.clienteDocumento || "NÃO INFORMADO"}</span>
          <span className="wide"><b>ENDEREÇO:</b> {comprovante.clienteEndereco || "NÃO INFORMADO"}</span><span><b>TELEFONE:</b> {comprovante.clienteTelefone || "NÃO INFORMADO"}</span>
          <span><b>DATA DO PAGAMENTO:</b> {formatDate(comprovante.data)}</span><span><b>OPERADOR:</b> {comprovante.operadorNome || "SISTEMA"}</span>
        </section>

        <section className="payment-receipt-section">
          <h3>TÍTULOS / DÍVIDAS PAGAS</h3>
          <div className="payment-receipt-table-wrap"><table><thead><tr><th>REFERÊNCIA</th><th className="number">SALDO ANTES</th><th className="number">PAGO AGORA</th><th className="number">SALDO DEPOIS</th></tr></thead><tbody>
            {vales.map((vale) => <tr key={`vale-${vale.numeroSequencial}`}><td><b>VALE Nº {vale.numeroSequencial}</b></td><td className="number">{formatCurrency(vale.saldoAntes)}</td><td className="number strong">{formatCurrency(vale.valorAplicado)}</td><td className="number">{formatCurrency(vale.saldoDepois)}</td></tr>)}
            {vales.length === 0 && <tr><td colSpan={4} className="empty">Recebimento sem vínculo ativo com vale</td></tr>}
          </tbody><tfoot><tr><td>TOTAIS</td><td className="number">{formatCurrency(comprovante.valorDevidoAntes)}</td><td className="number">{formatCurrency(comprovante.valorAplicado)}</td><td className="number">{formatCurrency(Math.max(0, comprovante.valorDevidoAntes - comprovante.valorAplicado))}</td></tr></tfoot></table></div>
          {ordens.length > 0 && <p className="payment-receipt-orders">VÍNCULO: {ordens.map((ordem) => `ORDEM Nº ${ordem.numeroSequencial} (${formatCurrency(ordem.valor)})`).join(" · ")}</p>}
        </section>

        <section className="payment-receipt-section">
          <h3>FORMA DE PAGAMENTO</h3>
          <div className="payment-receipt-table-wrap"><table><thead><tr><th>FORMA / TITULAR</th><th>Nº CHEQUE / BOLETO</th><th>VENCIMENTO</th><th>SITUAÇÃO</th><th className="number">VALOR</th></tr></thead><tbody>
            {titulos.map((titulo, indice) => <tr key={titulo.id || indice} className={titulo.status === "recusado" ? "rejected" : ""}><td><b>{nomeTipo(titulo)}</b><small>{titulo.nomeTitular} · {titulo.documentoTitular || "CPF/CNPJ não informado"}</small>{titulo.observacao && <small>Obs.: {titulo.observacao}</small>}</td><td>{titulo.numeroDocumento}</td><td>{formatDate(titulo.vencimento)}</td><td>{(titulo.status || "aguardando").toUpperCase()}{titulo.dataCompensacao ? <small>em {formatDate(titulo.dataCompensacao)}</small> : null}{titulo.motivoStatus ? <small>{titulo.motivoStatus}</small> : null}</td><td className="number strong">{formatCurrency(titulo.valor)}</td></tr>)}
            {titulos.length === 0 && <tr><td><b>{forma}</b>{parcelamento && <small>{parcelamento}</small>}</td><td>—</td><td>{formatDate(comprovante.data)}</td><td>{comprovante.status === "recusado" ? "RECUSADO" : "RECEBIDO"}</td><td className="number strong">{formatCurrency(comprovante.valorRecebido)}</td></tr>}
          </tbody><tfoot><tr><td colSpan={4}>TOTAL VÁLIDO RECEBIDO</td><td className="number">{formatCurrency(titulos.length ? totalTitulosValidos : comprovante.valorRecebido)}</td></tr></tfoot></table></div>
        </section>

        {(bonusGerado > 0.005 || bonusUtilizado > 0.005) && <div className="payment-receipt-bonus">{bonusGerado > 0.005 && <span>BÔNUS GERADO: <b>{formatCurrency(bonusGerado)}</b></span>}{bonusUtilizado > 0.005 && <span>BÔNUS UTILIZADO: <b>{formatCurrency(bonusUtilizado)}</b></span>}</div>}
        <div className="payment-receipt-observation"><b>OBSERVAÇÃO:</b> {comprovante.observacao || "—"}</div>

        <footer className="payment-receipt-footer">
          <p>{loja.nome}, {formatDate(comprovante.data)}</p>
          <div><span>{comprovante.clienteNome}</span><span>{loja.nome}</span></div>
          <small>{loja.nome} · {loja.endereco} · {loja.telefone}</small>
        </footer>
      </article>
    </div>
  </div>;
}
