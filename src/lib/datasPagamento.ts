const diasNoMes = (ano: number, mes: number): number =>
  mes === 2 ? (ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31;

/** Data civil ISO: sem horário/fuso e sem rollover de dias inválidos. */
export function somarMesesVencimento(data: string, meses = 1): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!partes || !Number.isSafeInteger(meses) || meses < 0) return '';
  const ano = Number(partes[1]), mes = Number(partes[2]), dia = Number(partes[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return '';
  const indice = ano * 12 + mes - 1 + meses;
  const novoAno = Math.floor(indice / 12), novoMes = indice % 12 + 1;
  if (novoAno > 9999) return '';
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}-${String(Math.min(dia, diasNoMes(novoAno, novoMes))).padStart(2, '0')}`;
}
