import crypto from 'node:crypto';
import { execute, queryAll, queryOne, runInTransaction } from './db.js';

type Tipo = 'ordem' | 'vale';
const falha = (mensagem: string): never => { throw Object.assign(new Error(mensagem), { statusCode: 409 }); };

export function criarReaberturaFinalizacao(deps: {
  recalcularVale: (id: string) => void;
  recalcularOrdem: (id: string) => void;
  auditar: (usuario: string, acao: string, entidade: string, id: string, dados: any) => void;
}) {
  function preparar(tipo: Tipo, id: string) {
    if (!['ordem', 'vale'].includes(tipo)) falha('Documento inválido.');
    const tabela = tipo === 'ordem' ? 'ordens_cobranca' : 'vendas';
    const alvo = queryOne<any>(`SELECT * FROM ${tabela} WHERE id=? AND finalizadoAt IS NOT NULL AND deletedAt IS NULL`, [id]);
    if (!alvo || ['cancelada', 'renegociada'].includes(alvo.status)) falha('Este documento não está finalizado ou já foi reaberto.');
    if (tipo === 'vale') {
      const ordem = queryOne<any>(`SELECT o.numeroSequencial FROM ordens_cobranca o JOIN ordem_cobranca_vales v ON v.ordemId=o.id
        WHERE v.vendaId=? AND v.removidoAt IS NULL AND o.finalizadoAt IS NOT NULL AND o.deletedAt IS NULL`, [id]);
      if (ordem) falha(`Reabra a ordem #${ordem.numeroSequencial} para editar os vales finalizados por ela.`);
    }
    const evento = queryOne<any>(`SELECT * FROM auditoria WHERE entidadeId=? AND acao=? ORDER BY createdAt DESC, rowid DESC LIMIT 1`,
      [id, tipo === 'ordem' ? 'ordem_cobranca_finalizada' : 'vale_finalizado']);
    if (!evento) falha('O histórico da finalização precisa ser conciliado antes da reabertura.');
    const dados = JSON.parse(evento.detalhes);
    const vales = tipo === 'vale' ? [alvo] : queryAll<any>(`SELECT v.* FROM vendas v JOIN ordem_cobranca_vales ov ON ov.vendaId=v.id
      WHERE ov.ordemId=? AND ov.removidoAt IS NULL ORDER BY v.id`, [id]);
    if (!vales.length || vales.some(v => v.deletedAt || v.status === 'cancelada' || v.clienteId !== alvo.clienteId)) falha('Os vales da finalização mudaram. Concilie seus vínculos antes de reabrir.');
    if (tipo === 'ordem' && Array.isArray(dados.vales) && JSON.stringify([...dados.vales].sort()) !== JSON.stringify(vales.map(v => v.numeroSequencial).sort())) falha('Os vínculos da ordem divergem da finalização. Concilie o histórico antes de reabrir.');
    for (const vale of vales) {
      const conflito = queryOne<any>(`SELECT o.numeroSequencial FROM ordens_cobranca o JOIN ordem_cobranca_vales ov ON ov.ordemId=o.id
        WHERE ov.vendaId=? AND ov.removidoAt IS NULL AND o.deletedAt IS NULL AND o.status='aberta' AND o.id<>?`, [vale.id, tipo === 'ordem' ? id : '']);
      if (conflito) falha(`O vale #${vale.numeroSequencial} está na ordem #${conflito.numeroSequencial}. Concilie essa negociação antes de reabrir.`);
    }
    const residualId = alvo.valeResidualId || dados.valeResidual?.id;
    const residual = residualId ? queryOne<any>('SELECT * FROM vendas WHERE id=?', [residualId]) : null;
    if (residualId && (!residual || residual.deletedAt || residual.status === 'cancelada' || residual.clienteId !== alvo.clienteId)) falha('O vale residual mudou. Sua origem precisa ser conciliada antes de reabrir.');
    if (residual && (residual.finalizadoAt || Number(residual.valorPago) > 0.005
      || Math.abs(Number(residual.totalLiquido) - Number(dados.valeResidual?.valor)) > 0.005
      || Math.abs(Number(residual.saldoRestante) - Number(residual.totalLiquido)) > 0.005
      || queryOne('SELECT id FROM recebimento_alocacoes WHERE vendaId=? AND deletedAt IS NULL', [residual.id])
      || queryOne('SELECT id FROM pagamentos WHERE vendaId=? AND deletedAt IS NULL', [residual.id])
      || queryOne('SELECT id FROM ordem_cobranca_vales WHERE vendaId=? AND removidoAt IS NULL', [residual.id])
      || queryOne('SELECT id FROM devolucoes_venda WHERE vendaId=?', [residual.id])
      || queryOne('SELECT id FROM cliente_bonus_movimentos WHERE vendaId=? AND deletedAt IS NULL', [residual.id]))) {
      falha('O vale residual já foi movimentado ou renegociado. Sua reconciliação será necessária antes de reabrir a origem.');
    }
    if (dados.excedenteZerado && !Array.isArray(dados.bonusDebitoIds)) falha('O bônus zerado nesta finalização antiga precisa ser conciliado antes de reabrir.');
    const bonus = (dados.bonusDebitoIds || []).map((bonusId: string) => queryOne<any>('SELECT * FROM cliente_bonus_movimentos WHERE id=?', [bonusId]));
    if (bonus.some((b: any) => !b || b.deletedAt || b.tipo !== 'debito' || b.clienteId !== alvo.clienteId)) falha('O ajuste de bônus da finalização mudou. Atualize o histórico.');
    const parcelas = vales.flatMap(v => queryAll<any>('SELECT * FROM vale_parcelas WHERE vendaId=? AND deletedAt IS NULL ORDER BY id', [v.id]));
    const vinculos = tipo === 'ordem' ? queryAll<any>('SELECT * FROM ordem_cobranca_vales WHERE ordemId=? ORDER BY id', [id]) : [];
    const parcelasOrdem = tipo === 'ordem' ? queryAll<any>('SELECT * FROM ordem_cobranca_parcelas WHERE ordemId=? AND deletedAt IS NULL ORDER BY id', [id]) : [];
    const estado = { tipo, id, alvo, evento, vales, residual, bonus, parcelas, vinculos, parcelasOrdem };
    const revisao = crypto.createHash('sha256').update(JSON.stringify(estado)).digest('hex');
    return { ...estado, revisao };
  }
  return {
    preparar: (tipo: Tipo, id: string) => {
      const p = preparar(tipo, id);
      return { revisao: p.revisao, numero: p.alvo.numeroSequencial, vales: p.vales.map(v => v.numeroSequencial),
        residual: p.residual ? { numero: p.residual.numeroSequencial, valor: p.residual.totalLiquido } : null,
        bonusRestituido: p.bonus.reduce((s: number, b: any) => s + Number(b.valor), 0) };
    },
    executar: (tipo: Tipo, id: string, revisao: string, usuario: string, motivo: string) => runInTransaction(() => {
      const p = preparar(tipo, id);
      if (!revisao || revisao !== p.revisao) falha('O documento mudou. Confira a reabertura novamente.');
      const agora = new Date().toISOString();
      if (p.residual) {
        execute("UPDATE vendas SET deletedAt=?, status='cancelada', saldoRestante=0, updatedAt=? WHERE id=?", [agora, agora, p.residual.id]);
        execute("UPDATE vale_parcelas SET deletedAt=?, status='cancelada', saldo=0, updatedAt=? WHERE vendaId=? AND deletedAt IS NULL", [agora, agora, p.residual.id]);
      }
      for (const b of p.bonus) execute('UPDATE cliente_bonus_movimentos SET deletedAt=? WHERE id=?', [agora, b.id]);
      for (const v of p.vales) {
        const saldo = Math.round(Math.max(0, Number(v.totalLiquido) - Number(v.valorPago)) * 100) / 100;
        execute('UPDATE vendas SET finalizadoAt=NULL, saldoRestante=?, status=?, updatedAt=? WHERE id=?', [saldo, saldo > 0.005 ? 'pendente' : 'paga', agora, v.id]);
        deps.recalcularVale(v.id);
      }
      if (tipo === 'ordem') {
        execute("UPDATE ordens_cobranca SET finalizadoAt=NULL, valeResidualId=NULL, status='aberta', updatedAt=? WHERE id=?", [agora, id]);
        deps.recalcularOrdem(id);
      }
      deps.auditar(usuario, 'finalizacao_reaberta', tipo === 'ordem' ? 'ordem_cobranca' : 'venda', id,
        { motivo, finalizacaoId: p.evento.id, residualCancelado: p.residual?.id, vales: p.vales.map(v => v.id), bonusRestituido: p.bonus.map((b: any) => b.id) });
      return { success: true };
    }),
  };
}
