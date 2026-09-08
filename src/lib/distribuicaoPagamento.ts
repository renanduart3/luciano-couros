export function distribuirCentavos(total: number, quantidade: number): number[] {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 12) return [];
  const centavos = Math.max(0, Math.round(total * 100));
  return Array.from({ length: quantidade }, (_, i) => (Math.floor(centavos / quantidade) + (i < centavos % quantidade ? 1 : 0)) / 100);
}

// Valores manuais e títulos existentes são preservados. Só sugestões novas são redistribuídas.
export function sugerirValores<T extends { valor: number; id?: string; status?: string; valorManual?: boolean }>(linhas: T[], total: number): T[] {
  const livres = linhas.filter(l => !l.id && !l.valorManual && l.status !== 'recusado');
  const fixo = linhas.filter(l => l.status !== 'recusado' && (l.id || l.valorManual)).reduce((s, l) => s + Math.round(l.valor * 100), 0);
  const valores = distribuirCentavos(Math.max(0, Math.round(total * 100) - fixo) / 100, livres.length);
  let i = 0;
  return linhas.map(l => livres.includes(l) ? { ...l, valor: valores[i++] } : l);
}
