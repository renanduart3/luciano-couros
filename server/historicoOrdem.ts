// Textos derivados exclusivamente dos snapshots de auditoria, nunca do pagamento atual.
export function textoHistoricoOrdem(acao: string, d: any): string | null {
  const moeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const forma = (v: any) => String(v || '').replaceAll('_', ' ');
  const status = (v: string) => ({ compensado: 'pago', aguardando: 'aguardando compensação', recusado: 'recusado' }[v] || v);
  const data = (v: any) => String(v || '').split('-').reverse().join('/');
  switch (acao) {
    case 'saldo_ordem_renegociado': return `Saldo de ${moeda(d.valor)} da parcela ${d.parcelaOrigem} renegociado: ${(d.novas || []).map((p: any) => `parcela ${p.numero}, ${data(p.vencimento)}, ${moeda(p.valor)}`).join('; ')}. Pagamentos preservados.`;
    case 'ordem_cobranca_criada': return `Ordem criada com ${d.parcelas?.length || 0} parcela(s), total ${moeda(d.totalOriginal)}.`;
    case 'registrar_recebimento': return `Pagamento registrado: ${moeda(Number(d.recebido || 0) + Number(d.bonusUtilizado || 0))}, ${forma(d.formaPagamento)}${d.parcelaNumero ? `, parcela ${d.parcelaNumero}` : ''}.`;
    case 'pagamento_alterado': {
      const a = d.antes || {}, b = d.depois || {};
      const alteracoes = [];
      if (a.valorRecebido !== b.valorRecebido) alteracoes.push(`${moeda(a.valorRecebido)} → ${moeda(b.valorRecebido)}`);
      if (a.formaPagamento !== b.formaPagamento) alteracoes.push(`${forma(a.formaPagamento)} → ${forma(b.formaPagamento)}`);
      if (a.status !== b.status) alteracoes.push(`${status(a.status)} → ${status(b.status)}`);
      if (a.data !== b.data) alteracoes.push(`${data(a.data)} → ${data(b.data)}`);
      return `Pagamento alterado: ${alteracoes.join('; ') || 'dados dos títulos atualizados'}.`;
    }
    case 'ordem_cobranca_parcelas_alteradas': return `Parcelamento alterado: ${(d.depois || []).map((p: any) => `${p.numero}: ${data(p.vencimento)}, ${moeda(p.valor)}`).join('; ')}.`;
    case 'ordem_cobranca_vales_alterados': return `Vales alterados: ${d.adicionados?.length || 0} incluído(s), ${d.removidos?.length || 0} removido(s). Total ${moeda(d.totalOriginal)}.`;
    case 'estornar_recebimento': return `Pagamento estornado: ${moeda(d.valorRecebido)}. ${d.motivo || ''}`.trim();
    case 'titulo_recusado': return `Título ${d.numeroDocumento || ''} recusado${d.motivo ? `: ${d.motivo}` : '.'}`;
    case 'titulo_compensado':
    case 'titulo_compensado_automaticamente': return `Título ${d.numeroDocumento || ''} compensado${d.dataCompensacao ? ` em ${data(d.dataCompensacao)}` : ''}.`;
    case 'ordem_cobranca_encerrada': return `Ordem ${d.status === 'renegociada' ? 'encerrada para renegociação' : 'cancelada'}${d.motivo ? `: ${d.motivo}` : '.'}`;
    default: return null;
  }
}
