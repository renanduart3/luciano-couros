// TSV usado pelo Excel: aspas duplicadas e campos com tabulações/quebras protegidos.
export function escreverTSV(linhas: string[][]): string {
  return linhas.map(linha => linha.map(valor => /[\t\r\n"]/.test(valor) ? '"' + valor.replace(/"/g, '""') + '"' : valor).join('\t')).join('\r\n');
}

export function lerTSV(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [], campo = '', aspas = false, inicio = true;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else aspas = false;
      } else campo += c;
    } else if (c === '"' && inicio) { aspas = true; inicio = false; }
    else if (c === '\t') { linha.push(campo); campo = ''; inicio = true; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = ''; inicio = true;
    } else { campo += c; inicio = false; }
  }
  if (aspas) throw new Error('O conteúdo copiado contém aspas sem fechamento. Copie novamente o intervalo.');
  if (campo || linha.length || !linhas.length || !/[\r\n]$/.test(texto)) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
