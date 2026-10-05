export const unidadeResumida = (valor: string) => {
  const unidade = String(valor || '').trim().toLowerCase();
  if (['m', 'mt', 'mts', 'metro', 'metros'].includes(unidade)) return 'm';
  if (['un', 'un.', 'und', 'unid', 'unidade', 'unidades'].includes(unidade)) return 'un';
  return unidade || 'sem unidade';
};

export function quantidadesPorUnidade(itens: ReadonlyArray<{ quantidade: number; unidade: string }>) {
  const totais = new Map<string, number>();
  for (const item of itens) {
    const unidade = unidadeResumida(item.unidade);
    if (Number.isFinite(Number(item.quantidade))) {
      totais.set(unidade, (totais.get(unidade) || 0) + Math.round(Number(item.quantidade) * 1e6));
    }
  }
  return [...totais].map(([unidade, quantidade]) => ({ unidade, quantidade: quantidade / 1e6 }));
}

export const formatarQuantidades = (itens: ReadonlyArray<{ quantidade: number; unidade: string }>) =>
  quantidadesPorUnidade(itens).map(i => `${i.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${i.unidade}`).join(' e ') || '—';
