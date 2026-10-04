import { queryAll, queryOne } from './db.js';

export function carregarOrigemSaldo(venda: any) {
  if (Number(venda.contabilizaReceita ?? 1) !== 0) return undefined;
  let valorOriginal = Number(venda.totalLiquido);
  let linhas = queryAll<any>('SELECT * FROM vale_residual_origens WHERE valeResidualId=? ORDER BY numeroValeOrigem', [venda.id]);
  if (!linhas.length) {
    // Compatibilidade somente leitura: a auditoria identifica a origem sem alterar registros antigos.
    const evento = queryOne<any>(`SELECT entidadeId,acao,detalhes FROM auditoria WHERE json_valid(detalhes)
      AND acao IN ('ordem_cobranca_finalizada','vale_finalizado') AND json_extract(detalhes,'$.valeResidual.id')=?
      ORDER BY createdAt DESC,rowid DESC LIMIT 1`, [venda.id]);
    const dados = evento ? JSON.parse(evento.detalhes) : {};
    valorOriginal = Number(dados.valeResidual?.valor ?? venda.totalLiquido);
    const ordem = evento?.acao === 'ordem_cobranca_finalizada'
      ? queryOne<any>('SELECT id,numeroSequencial FROM ordens_cobranca WHERE id=? AND clienteId=?', [evento.entidadeId, venda.clienteId]) : null;
    let numeros: number[] = [];
    try { numeros = JSON.parse(venda.valeOrigemIds || '[]'); } catch { /* Sem vínculo legível, preservar observação. */ }
    if (!Array.isArray(numeros)) numeros = [];
    if (!numeros.length && Array.isArray(dados.vales)) numeros = dados.vales;
    linhas = numeros.map(numero => {
      const origem = queryOne<any>('SELECT id FROM vendas WHERE numeroSequencial=? AND clienteId=?', [numero, venda.clienteId]);
      return { vendaOrigemId: origem?.id, numeroValeOrigem: numero, ordemOrigemId: ordem?.id, numeroOrdemOrigem: ordem?.numeroSequencial, valorTransferido: null };
    });
  }
  const ordem = linhas.find(l => l.ordemOrigemId);
  const vales = linhas.map(l => ({ id: l.vendaOrigemId, numero: l.numeroValeOrigem, valor: l.valorTransferido }));
  const descricao = `Saldo devedor${ordem ? ` da ordem #${ordem.numeroOrdemOrigem}` : ''}${vales.length ? ` — vales ${vales.map(v => `#${v.numero}`).join(', ')}` : ''}`;
  return { ordem: ordem ? { id: ordem.ordemOrigemId, numero: ordem.numeroOrdemOrigem } : null,
    vales, descricao: vales.length ? descricao : String(venda.observacoes || descricao), valorTransferido: linhas.length && linhas.every(l => l.valorTransferido !== null) ? Math.round(linhas.reduce((s,l) => s + Number(l.valorTransferido), 0) * 100) / 100 : valorOriginal };
}

/** Transferência histórica: não depende do saldo ou do destino atual do residual. */
export function transferidoVale(id: string): number {
  return Number(queryOne<any>('SELECT COALESCE(SUM(valorTransferido),0) total FROM vale_residual_origens WHERE vendaOrigemId=?', [id])?.total || 0);
}
export function transferidoOrdem(id: string, vendaId?: string): number {
  return Number(queryOne<any>(`SELECT COALESCE(SUM(valorTransferido),0) total FROM vale_residual_origens WHERE ordemOrigemId=?${vendaId ? ' AND vendaOrigemId=?' : ' AND EXISTS (SELECT 1 FROM ordem_cobranca_vales ov WHERE ov.ordemId=vale_residual_origens.ordemOrigemId AND ov.vendaId=vale_residual_origens.vendaOrigemId AND ov.removidoAt IS NULL)'}`, vendaId ? [id,vendaId] : [id])?.total || 0);
}
export const saldoVale = (id: string, total: number, pago: number) => Math.round(Math.max(0, total - pago - transferidoVale(id)) * 100) / 100;
