// Rateia o total líquido registrado entre os itens ainda vendidos. A base
// considera todos os itens da venda, inclusive os excluídos pelos filtros do
// relatório. O consumidor aplica a proporção da quantidade não devolvida.
export const valorItemRelatorioSql = `CASE
  WHEN iv.quantidade < 0 THEN iv.total
  WHEN EXISTS (SELECT 1 FROM itens_venda retorno WHERE retorno.vendaId=v.id AND retorno.quantidade<0)
  THEN COALESCE(iv.total * (v.totalLiquido - COALESCE(v.creditoLinhaDevolucao,0)
    - (SELECT SUM(retorno.total) FROM itens_venda retorno WHERE retorno.vendaId=v.id AND retorno.quantidade<0))
    / NULLIF((SELECT SUM(base.total * MAX(0.0,base.quantidade-COALESCE((SELECT SUM(ret.quantidade)
        FROM itens_devolucao ret WHERE ret.itemVendaId=base.id),0))/base.quantidade)
      FROM itens_venda base WHERE base.vendaId=v.id AND base.quantidade>0),0),0)
  ELSE COALESCE(
  iv.total * v.totalLiquido / NULLIF((
    SELECT SUM(base.total * MAX(0.0, base.quantidade - COALESCE((
      SELECT SUM(ret.quantidade) FROM itens_devolucao ret
      WHERE ret.itemVendaId = base.id
    ), 0)) / NULLIF(base.quantidade, 0))
    FROM itens_venda base WHERE base.vendaId = v.id
  ), 0), 0) END`;
