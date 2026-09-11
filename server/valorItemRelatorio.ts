// Rateia o total líquido registrado entre os itens ainda vendidos. A base
// considera todos os itens da venda, inclusive os excluídos pelos filtros do
// relatório. O consumidor aplica a proporção da quantidade não devolvida.
export const valorItemRelatorioSql = `COALESCE(
  iv.total * v.totalLiquido / NULLIF((
    SELECT SUM(base.total * MAX(0.0, base.quantidade - COALESCE((
      SELECT SUM(ret.quantidade) FROM itens_devolucao ret
      WHERE ret.itemVendaId = base.id
    ), 0)) / NULLIF(base.quantidade, 0))
    FROM itens_venda base WHERE base.vendaId = v.id
  ), 0), 0)`;
