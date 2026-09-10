import crypto from "node:crypto";
import { execute, queryAll, runInTransaction } from "./db.js";

export function dataFinanceiraHoje() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(tipo => partes.find(p => p.type === tipo)!.value).join("-");
}

export function dataFinanceiraValida(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < "1900-01-01") return false;
  const valor = new Date(data + "T12:00:00Z");
  return Number.isFinite(valor.getTime()) && valor.toISOString().slice(0, 10) === data;
}

export function registrarMovimentacaoFinanceira(recebimentoId: string, tipo: string, valor: number,
  detalhes: unknown, usuarioId: string | null = null, tituloId: string | null = null) {
  execute(`INSERT INTO movimentacoes_financeiras
    (id, recebimentoId, tituloId, tipo, valor, usuarioId, detalhes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), recebimentoId, tituloId, tipo, valor, usuarioId, JSON.stringify(detalhes)]);
}

// Um título editado não pode voltar a compensar por causa de uma leitura/reinício.
// Apenas mudar o vencimento para uma nova data futura reativa sua programação.
export function programacaoDoTitulo(titulo: any, anterior: any, hoje = dataFinanceiraHoje()) {
  if (titulo.status !== "aguardando" || !dataFinanceiraValida(titulo.vencimento)) return 0;
  if (!anterior) return titulo.vencimento >= hoje ? 1 : 0;
  if (anterior.vencimento !== titulo.vencimento) return titulo.vencimento >= hoje ? 1 : 0;
  if (anterior.status !== titulo.status) return 0;
  return Number(anterior.compensacaoAutomatica) === 1 ? 1 : 0;
}

export function compensarPagamentosProgramados(hoje = dataFinanceiraHoje(), aoCompensar?: (recebimentoId: string) => void) {
  if (!dataFinanceiraValida(hoje)) throw new Error("Data de processamento inválida.");
  return runInTransaction(() => {
    const titulos = queryAll<any>(`SELECT t.* FROM recebimento_titulos t
      JOIN recebimentos_cliente r ON r.id = t.recebimentoId
      WHERE t.deletedAt IS NULL AND r.deletedAt IS NULL AND r.status = 'ativo'
        AND t.tipo IN ('cheque_emitente','cheque_terceiro','duplicata_emitente','duplicata_terceiro')
        AND t.status = 'aguardando' AND t.compensacaoAutomatica = 1 AND t.vencimento <= ?
      ORDER BY t.vencimento, t.id`, [hoje]);
    let quantidade = 0;
    for (const titulo of titulos) {
      if (!dataFinanceiraValida(titulo.vencimento)) continue;
      const mudou = execute(`UPDATE recebimento_titulos SET status = 'compensado',
        dataCompensacao = vencimento, compensacaoAutomatica = 0, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'aguardando' AND compensacaoAutomatica = 1 AND deletedAt IS NULL`, [titulo.id]);
      if (!mudou.changes) continue;
      const detalhes = { tituloId: titulo.id, numeroDocumento: titulo.numeroDocumento,
        valor: titulo.valor, status: "compensado", dataCompensacao: titulo.vencimento,
        processadoEm: hoje, origem: "programacao_automatica" };
      registrarMovimentacaoFinanceira(titulo.recebimentoId, "compensacao_automatica", titulo.valor, detalhes, null, titulo.id);
      execute(`INSERT INTO auditoria (id, usuarioId, acao, entidade, entidadeId, detalhes)
        VALUES (?, NULL, 'titulo_compensado', 'recebimento_cliente', ?, ?)`,
        [crypto.randomUUID(), titulo.recebimentoId, JSON.stringify(detalhes)]);
      // O recebimento já abate o vale na entrada. Não reaplicar dívida ou bônus.
      execute("UPDATE recebimentos_cliente SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [titulo.recebimentoId]);
      aoCompensar?.(titulo.recebimentoId);
      quantidade++;
    }
    return quantidade;
  });
}
