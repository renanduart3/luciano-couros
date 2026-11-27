// Aritmética racional: mantém casas decimais exatas até a apresentação em centavos.
export const LINHAS = 500;
export const MAX_PLANILHAS = 5;
export const MAX_TEXTO_CELULA = 300;
export const CORES_CELULA = { preto: '#000000', vermelho: '#dc2626', verde: '#15803d', amarelo: '#ca8a04' } as const;
export type FormatoCelula = { negrito?: boolean; cor?: keyof typeof CORES_CELULA };
export const COLUNAS = 15;
// Colunas de uma letra só (A até O); o código assume um caractere por coluna.
export const ULTIMA_COLUNA = String.fromCharCode(64 + COLUNAS);
export const colunaValida = (letra: string) => letra.length === 1 && letra >= 'A' && letra <= ULTIMA_COLUNA;
export const enderecoValido = (id: string) => /^[A-Z][1-9]\d{0,3}$/.test(id) && colunaValida(id[0]) && Number(id.slice(1)) <= LINHAS;
export const LARGURA_COLUNA_MIN = 60;
export const LARGURA_COLUNA_MAX = 800;
export const larguraColuna = (coluna: number, larguras?: Record<string, number>) => larguras?.[String.fromCharCode(65 + coluna)] ?? (coluna === 0 ? 260 : 140);
export const limitarLarguraColuna = (largura: number) => Math.max(LARGURA_COLUNA_MIN, Math.min(LARGURA_COLUNA_MAX, Math.round(largura)));
export type Celulas = Record<string, string>;
type LimiteCalculo = { restante: number };
type Decimal = { n: bigint; d: bigint };
const numero = (n: bigint, d = 1n): Decimal => {
  if (n.toString().length > 1000 || d.toString().length > 1000) throw new Error("#LIMITE!");
  if (d === 0n) throw new Error("#DIV/0!");
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) { const resto = a % b; a = b; b = resto; }
  return { n: n / (a || 1n), d: d / (a || 1n) };
};
const somar = (a: Decimal, b: Decimal) => numero(a.n * b.d + b.n * a.d, a.d * b.d);
const multiplicar = (a: Decimal, b: Decimal) => numero(a.n * b.n, a.d * b.d);
function literal(valor: string): Decimal {
  const normalizado = valor.trim().replace(/^R\$\s*/, "");
  const texto = normalizado.includes(",") ? normalizado.replace(/\./g, "").replace(",", ".") : normalizado;
  if (!/^[+-]?\d+(\.\d+)?$/.test(texto) || texto.length > 30) throw new Error("#VALOR!");
  const casas = texto.split(".")[1]?.length || 0;
  return numero(BigInt(texto.replace(".", "")), 10n ** BigInt(casas));
}
function numeroLiteral(valor: string): boolean {
  try { literal(valor.trim().endsWith('%') ? valor.trim().slice(0, -1) : valor); return true; }
  catch { return false; }
}
export function endereco(linha: number, coluna: number) { return `${String.fromCharCode(65 + coluna)}${linha + 1}`; }

// Datas como no Excel: dd/mm/aaaa (ou dd/mm/aa) vira o número de dias desde 30/12/1899,
// o que permite tirar a média de datas (prazo médio) e somar dias a uma data.
const BASE_DATA = Date.UTC(1899, 11, 30);
const DIA_MS = 86400000;
export function serialData(texto: string): number | null {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(texto.trim());
  if (!partes) return null;
  const dia = Number(partes[1]), mes = Number(partes[2]);
  let ano = Number(partes[3]);
  if (partes[3].length === 2) ano += ano < 30 ? 2000 : 1900;
  if (ano < 1900) return null;
  const utc = Date.UTC(ano, mes - 1, dia), data = new Date(utc);
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return Math.round((utc - BASE_DATA) / DIA_MS);
}
function formatarData({ n, d }: Decimal) {
  // Como o Excel, a fração do dia (horas) é descartada na exibição.
  let dias = n / d;
  if (n < 0n && n % d !== 0n) dias -= 1n;
  const data = new Date(BASE_DATA + Number(dias) * DIA_MS);
  if (Number.isNaN(data.getTime()) || data.getUTCFullYear() > 9999 || data.getUTCFullYear() < 1900) return "#VALOR!";
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}/${data.getUTCFullYear()}`;
}
type TiposData = Map<string, boolean>;
const formulaMediaDatas = /^=\s*(M[ÉE]DIA|MEDIANA)\s*\(\s*([A-Z]\d+)\s*:\s*([A-Z]\d+)\s*\)\s*$/i;
const formulaDataMaisDias = /^=\s*([A-Z]\d+)\s*(?:[+-]\s*\d+(?:[.,]\d+)?\s*)?$/i;
function intervaloSoDeDatas(celulas: Celulas, inicio: string, fim: string, tipos: TiposData, visitando: Set<string>) {
  if (!enderecoValido(inicio) || !enderecoValido(fim)) return false;
  const { primeiraLinha, ultimaLinha, primeiraColuna, ultimaColuna } = limitesSelecao(inicio, fim);
  let datas = 0;
  for (let l = primeiraLinha; l <= ultimaLinha; l++) for (let c = primeiraColuna; c <= ultimaColuna; c++) {
    const ref = endereco(l, c), conteudo = (celulas[ref] || "").trim();
    if (!conteudo) continue;
    if (ehData(celulas, ref, tipos, visitando)) datas++;
    else if (conteudo.startsWith("=") || numeroLiteral(conteudo)) return false;
  }
  return datas > 0;
}
/** Indica se a célula guarda (ou calcula) uma data: data digitada, média de datas ou data ± dias. */
export function ehData(celulas: Celulas, id: string, tipos: TiposData = new Map(), visitando = new Set<string>()): boolean {
  const salvo = tipos.get(id);
  if (salvo !== undefined) return salvo;
  if (visitando.has(id) || visitando.size > 100) return false;
  const texto = (celulas[id] || "").trim();
  let resultado = false;
  if (!texto.startsWith("=")) resultado = serialData(texto) !== null;
  else {
    visitando.add(id);
    const media = formulaMediaDatas.exec(texto), deslocamento = formulaDataMaisDias.exec(texto);
    if (media) resultado = intervaloSoDeDatas(celulas, media[2].toUpperCase(), media[3].toUpperCase(), tipos, visitando);
    else if (deslocamento) resultado = enderecoValido(deslocamento[1].toUpperCase()) && ehData(celulas, deslocamento[1].toUpperCase(), tipos, visitando);
    visitando.delete(id);
  }
  tipos.set(id, resultado);
  return resultado;
}

export function avaliarCelula(celulas: Celulas, id: string, caminho = new Set<string>(), cache = new Map<string, Decimal>(), limite: LimiteCalculo = { restante: 200000 }, tipos: TiposData = new Map()): Decimal {
  if (!enderecoValido(id)) throw new Error("#REF!");
  if (caminho.has(id)) throw new Error("#CICLO!");
  if (cache.has(id)) return cache.get(id)!;
  if (caminho.size > 100) throw new Error("#LIMITE!");
  const texto = (celulas[id] || "").trim();
  if (!texto) return numero(0n);
  const serial = texto.startsWith("=") ? null : serialData(texto);
  if (serial !== null) return numero(BigInt(serial));
  if (!texto.startsWith("=")) return texto.endsWith("%") ? multiplicar(literal(texto.slice(0, -1)), numero(1n, 100n)) : literal(texto);
  if (--limite.restante < 0) throw new Error("#LIMITE!");
  const fonte = texto.slice(1).toUpperCase();
  if (fonte.length > 300) throw new Error("#LIMITE!");
  const tokens = fonte.match(/MEDIANA|M[ÉE]DIA|SOMA|SUM|[A-Z]+\d+|\d+(?:[.,]\d+)?|[+\-*/()%:;]/g) || [];
  if (tokens.join("") !== fonte.replace(/\s/g, "")) throw new Error("#FÓRMULA!");
  let pos = 0;
  const proximo = new Set(caminho).add(id);
  const referencia = (ref: string) => avaliarCelula(celulas, ref, proximo, cache, limite, tipos);
  const exigir = (token: string) => { if (tokens[pos++] !== token) throw new Error("#FÓRMULA!"); };
  function primario(): Decimal {
    const token = tokens[pos++];
    let valor: Decimal;
    if (token === "+" || token === "-") { valor = primario(); return token === "-" ? numero(-valor.n, valor.d) : valor; }
    if (token === "(") { valor = expressao(); exigir(")"); }
    else if (token === "SOMA" || token === "SUM" || token === "MÉDIA" || token === "MEDIA" || token === "MEDIANA") {
      exigir("("); valor = numero(0n);
      const valores: Decimal[] = [];
      let quantidade = 0;
      const incluir = (item: Decimal) => {
        quantidade++;
        if (token === "MEDIANA") valores.push(item);
        else valor = somar(valor, item);
      };
      // Datas de um intervalo: a SOMA as ignora (como rótulos); MÉDIA e MEDIANA só as usam
      // quando o intervalo não tem números, para calcular a data média.
      const datas: string[] = [];
      do {
        if (tokens[pos] === ";") pos++;
        if (/^[A-Z]+\d+$/.test(tokens[pos] || "") && tokens[pos + 1] === ":") {
          const inicio = tokens[pos++]; pos++; const fim = tokens[pos++];
          if (!enderecoValido(inicio) || !enderecoValido(fim || "")) throw new Error("#REF!");
          const c1 = inicio.charCodeAt(0) - 65, c2 = fim.charCodeAt(0) - 65, l1 = Number(inicio.slice(1)) - 1, l2 = Number(fim.slice(1)) - 1;
          if (c1 > c2 || l1 > l2) throw new Error("#REF!");
          for (let l = l1; l <= l2; l++) for (let c = c1; c <= c2; c++) {
            if (--limite.restante < 0) throw new Error("#LIMITE!");
            const ref = endereco(l, c), conteudo = (celulas[ref] || "").trim();
            // Como em uma soma de planilha, rótulos em intervalos são ignorados.
            if (!conteudo) continue;
            if (ehData(celulas, ref, tipos)) { datas.push(ref); continue; }
            if (!conteudo.startsWith("=") && !numeroLiteral(conteudo)) continue;
            incluir(referencia(ref));
          }
        } else incluir(expressao());
      } while (tokens[pos] === ";");
      exigir(")");
      if (!quantidade && datas.length && token !== "SOMA" && token !== "SUM") for (const ref of datas) incluir(referencia(ref));
      if (token === "MEDIA" || token === "MÉDIA") valor = numero(valor.n, valor.d * BigInt(quantidade));
      if (token === "MEDIANA") {
        if (!quantidade) throw new Error("#VALOR!");
        // Reserva o custo da ordenação antes de iniciar a mediana.
        limite.restante -= quantidade * Math.ceil(Math.log2(quantidade));
        if (limite.restante < 0) throw new Error("#LIMITE!");
        valores.sort((a, b) => {
          const diferenca = a.n * b.d - b.n * a.d;
          return diferenca < 0n ? -1 : diferenca > 0n ? 1 : 0;
        });
        const meio = Math.floor(quantidade / 2);
        valor = quantidade % 2 ? valores[meio] : multiplicar(somar(valores[meio - 1], valores[meio]), numero(1n, 2n));
      }
    } else if (/^[A-Z]+\d+$/.test(token || "")) valor = referencia(token);
    else if (token && /^\d/.test(token)) valor = literal(token);
    else throw new Error("#FÓRMULA!");
    while (tokens[pos] === "%") { pos++; valor = numero(valor.n, valor.d * 100n); }
    return valor;
  }
  function produto(): Decimal {
    let valor = primario();
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos++], outro = primario();
      valor = op === "*" ? multiplicar(valor, outro) : multiplicar(valor, numero(outro.d, outro.n));
    }
    return valor;
  }
  function expressao(): Decimal {
    let valor = produto();
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++], outro = produto();
      valor = somar(valor, op === "+" ? outro : numero(-outro.n, outro.d));
    }
    return valor;
  }
  const resultado = expressao();
  if (pos !== tokens.length) throw new Error("#FÓRMULA!");
  cache.set(id, resultado);
  return resultado;
}
export type ExibicaoCelula = { texto: string; erro: boolean; numerico: boolean; valor?: Decimal; data?: boolean };
function formatarDecimal({ n, d }: Decimal, moeda = false) {
  const negativo = n < 0n, absoluto = negativo ? -n : n;
  const centavos = (absoluto * 100n * 2n + d) / (d * 2n);
  const inteiro = (centavos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fracao = (centavos % 100n).toString().padStart(2, "0");
  return `${negativo && centavos ? "-" : ""}${moeda ? "R$ " : ""}${inteiro}${moeda || fracao !== "00" ? `,${fracao}` : ""}`;
}
export function apresentarCelula(celulas: Celulas, id: string, moeda: boolean, cache = new Map<string, Decimal>(), limite: LimiteCalculo = { restante: 200000 }, tipos: TiposData = new Map()): ExibicaoCelula {
  const original = celulas[id] || "";
  if (!original.trim()) return { texto: "", erro: false, numerico: false };
  const data = ehData(celulas, id, tipos);
  if (!original.startsWith("=") && !data && !numeroLiteral(original)) return { texto: original, erro: false, numerico: false };
  try {
    const valor = avaliarCelula(celulas, id, new Set(), cache, limite, tipos);
    if (data) {
      const texto = formatarData(valor);
      return texto.startsWith("#") ? { texto, erro: true, numerico: false } : { texto, erro: false, numerico: true, valor, data: true };
    }
    const texto = !original.startsWith("=") && original.trim().endsWith("%") ? original.trim() : formatarDecimal(valor, moeda);
    return { texto, erro: false, numerico: true, valor };
  } catch (e) { return { texto: (e as Error).message, erro: true, numerico: false }; }
}

export function calcularPlanilha(celulas: Celulas, moedas: string[]) {
  const cache = new Map<string, Decimal>();
  const formatos = new Set(moedas);
  const limite = { restante: 200000 };
  const tipos: TiposData = new Map();
  return Object.fromEntries(Object.keys(celulas).map(id => [id, apresentarCelula(celulas, id, formatos.has(id), cache, limite, tipos)]));
}

export function limitesSelecao(inicio: string, fim: string) {
  const l1 = Number(inicio.slice(1)) - 1, l2 = Number(fim.slice(1)) - 1;
  const c1 = inicio.charCodeAt(0) - 65, c2 = fim.charCodeAt(0) - 65;
  return { primeiraLinha: Math.min(l1,l2), ultimaLinha: Math.max(l1,l2), primeiraColuna: Math.min(c1,c2), ultimaColuna: Math.max(c1,c2) };
}
export type ResumoSelecao = { quantidade: number; soma: string; media: string; minimo: string; maximo: string; erro: boolean; datas?: number };
export function resumirSelecao(exibicao: Record<string, ExibicaoCelula>, inicio: string, fim: string): ResumoSelecao {
  const limites = limitesSelecao(inicio, fim);
  let quantidade = 0, soma = numero(0n), minimo: Decimal | undefined, maximo: Decimal | undefined;
  let datas = 0, somaDatas = numero(0n), primeiraData: Decimal | undefined, ultimaData: Decimal | undefined;
  const menor = (a: Decimal, b: Decimal) => a.n * b.d < b.n * a.d;
  try {
    for (let l = limites.primeiraLinha; l <= limites.ultimaLinha; l++) for (let c = limites.primeiraColuna; c <= limites.ultimaColuna; c++) {
      const celula = exibicao[endereco(l,c)], valor = celula?.valor;
      if (!valor) continue;
      if (celula.data) {
        datas++; somaDatas = somar(somaDatas, valor);
        if (!primeiraData || menor(valor, primeiraData)) primeiraData = valor;
        if (!ultimaData || menor(ultimaData, valor)) ultimaData = valor;
        continue;
      }
      quantidade++; soma = somar(soma, valor);
      if (!minimo || menor(valor, minimo)) minimo = valor;
      if (!maximo || menor(maximo, valor)) maximo = valor;
    }
    // Seleção só de datas: mostra a data média, a primeira e a última.
    if (!quantidade && datas) return { quantidade: 0, datas, soma: '—', media: formatarData(numero(somaDatas.n, somaDatas.d * BigInt(datas))), minimo: formatarData(primeiraData!), maximo: formatarData(ultimaData!), erro: false };
    return { quantidade, soma: quantidade ? formatarDecimal(soma) : '—', media: quantidade ? formatarDecimal(numero(soma.n, soma.d * BigInt(quantidade))) : '—', minimo: minimo ? formatarDecimal(minimo) : '—', maximo: maximo ? formatarDecimal(maximo) : '—', erro: false };
  } catch {
    return { quantidade, soma: '—', media: '—', minimo: '—', maximo: '—', erro: true };
  }
}
