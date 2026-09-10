import { Cliente, Venda } from "../types";
import { formatDate, todayLocalIso } from "./utils";

// Somente consulta: valores atuais dos vales, sem duplicar sua dívida pelas ordens.
export function demonstrativoSaldoCliente(cliente: Cliente, vendas: Venda[]) {
  const vales = vendas.filter(v => v.clienteId === cliente.id && !v.deletedAt &&
    v.status === "pendente" && Number(v.saldoRestante) > 0.005)
    .sort((a, b) => a.data.localeCompare(b.data) || a.numeroSequencial - b.numeroSequencial);
  const somar = (campo: "totalLiquido" | "valorPago" | "saldoRestante") =>
    vales.reduce((s, v) => s + Math.round(Number(v[campo] || 0) * 100), 0) / 100;
  const totais = { totalVale: somar("totalLiquido"), totalPago: somar("valorPago"), saldo: somar("saldoRestante") };
  const linhas = vales.length > 15
    ? [{ id: "consolidado", descricao: `${vales.length} vales pendentes — consolidado`, ...totais }]
    : vales.map(v => ({ id: v.id, descricao: `Vale #${v.numeroSequencial} · ${formatDate(v.data)}`,
      totalVale: Number(v.totalLiquido), totalPago: Number(v.valorPago), saldo: Number(v.saldoRestante) }));
  return { cliente, data: todayLocalIso(), quantidadeVales: vales.length, linhas, totais };
}
