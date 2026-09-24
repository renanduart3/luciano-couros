import { queryAll } from "./db.js";
import { calcularFinanceiroVale } from "../src/lib/financeiro.js";

/** Consulta em lote, sem modificar os saldos reservados pelos títulos no banco. */
export function anexarFinanceiroVales(vendas: any[]) {
  if (!vendas.length) return vendas;
  const instrumentos = queryAll<any>("SELECT * FROM instrumentos_recebimento WHERE deletedAt IS NULL ORDER BY createdAt DESC");
  const instrumentoPorVale = new Map<string,any>();
  for (const i of instrumentos) if (!instrumentoPorVale.has(i.vendaId)) instrumentoPorVale.set(i.vendaId,i);
  const recebimentos = queryAll<any>("SELECT * FROM recebimentos_cliente WHERE deletedAt IS NULL AND status = 'ativo'");
  const titulos = queryAll<any>("SELECT * FROM recebimento_titulos WHERE deletedAt IS NULL");
  const alocacoes = queryAll<any>("SELECT * FROM recebimento_alocacoes WHERE deletedAt IS NULL");
  const porRecebimento = new Map(recebimentos.map(p=>[p.id,{...p,titulos:[] as any[],alocacoes:[] as any[],statusPagamento:'compensado'}]));
  for (const t of titulos) porRecebimento.get(t.recebimentoId)?.titulos.push(t);
  const porVale = new Map<string,Set<string>>();
  for (const a of alocacoes) {
    porRecebimento.get(a.recebimentoId)?.alocacoes.push(a);
    if (!porVale.has(a.vendaId)) porVale.set(a.vendaId,new Set());
    porVale.get(a.vendaId)!.add(a.recebimentoId);
  }
  for (const venda of vendas) {
    venda.instrumentoRecebimento ??= instrumentoPorVale.get(venda.id);
    const pagamentos = [...(porVale.get(venda.id)||[])].map(id=>porRecebimento.get(id)).filter(Boolean);
    venda.financeiro = calcularFinanceiroVale({...venda,recebimentos:pagamentos});
  }
  return vendas;
}

// Para o balanço, um título entregue é considerado pago desde o registro. A data
// de compensação continua disponível somente para controle e títulos recusados saem do cálculo.
export const pagamentosConfirmadosSql = `
 SELECT p.id, p.clienteId, p.vendaId, CASE WHEN p.formaPagamento LIKE 'cheque%' OR p.formaPagamento LIKE 'duplicata%' THEN
 COALESCE((SELECT i.vencimento FROM instrumentos_recebimento i WHERE i.vendaId=p.vendaId AND i.deletedAt IS NULL AND i.status='compensado' ORDER BY i.createdAt DESC LIMIT 1),p.data) ELSE p.data END AS data, p.valor, p.formaPagamento, p.parcelasCartao,
 p.observacao, p.recebimentoId, p.deletedAt, p.createdAt
 FROM pagamentos p
 WHERE p.deletedAt IS NULL
 AND NOT EXISTS (SELECT 1 FROM recebimento_titulos t WHERE t.recebimentoId = p.recebimentoId AND t.deletedAt IS NULL)
 AND NOT EXISTS (SELECT 1 FROM recebimentos_cliente r WHERE r.id = p.recebimentoId AND (r.deletedAt IS NOT NULL OR r.status <> 'ativo'))
 AND NOT EXISTS (SELECT 1 FROM instrumentos_recebimento i WHERE i.vendaId = p.vendaId AND i.deletedAt IS NULL AND i.status = 'recusado' AND (p.formaPagamento LIKE 'cheque%' OR p.formaPagamento LIKE 'duplicata%'))
 UNION ALL
 SELECT t.id, p.clienteId, p.vendaId, CASE WHEN t.status = 'compensado' THEN COALESCE(NULLIF(t.dataCompensacao,''), p.data) ELSE p.data END, t.valor,
 t.tipo, p.parcelasCartao, p.observacao, p.recebimentoId, p.deletedAt, p.createdAt
 FROM pagamentos p JOIN recebimentos_cliente r ON r.id = p.recebimentoId
 JOIN recebimento_titulos t ON t.recebimentoId = r.id
 WHERE p.deletedAt IS NULL AND r.deletedAt IS NULL AND r.status = 'ativo'
 AND t.deletedAt IS NULL AND t.status IN ('aguardando', 'compensado')`;
