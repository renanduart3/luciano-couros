// Aritmética racional: mantém casas decimais exatas até a apresentação em centavos.
export const LINHAS = 1000;
export const MAX_PLANILHAS = 3;
export const MAX_TEXTO_CELULA = 300;
export const CORES_CELULA = { preto: '#000000', vermelho: '#dc2626', verde: '#15803d', amarelo: '#ca8a04' } as const;
export type FormatoCelula = { negrito?: boolean; cor?: keyof typeof CORES_CELULA };
export const enderecoValido = (id: string) => /^[A-J][1-9]\d{0,3}$/.test(id) && Number(id.slice(1)) <= LINHAS;
export const COLUNAS = 10;
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
export function avaliarCelula(celulas: Celulas, id: string, caminho = new Set<string>(), cache = new Map<string, Decimal>(), limite: LimiteCalculo = { restante: 200000 }): Decimal {
  if (!enderecoValido(id)) throw new Error("#REF!");
  if (caminho.has(id)) throw new Error("#CICLO!");
  if (cache.has(id)) return cache.get(id)!;
  if (caminho.size > 100) throw new Error("#LIMITE!");
  const texto = (celulas[id] || "").trim();
  if (!texto) return numero(0n);
  if (!texto.startsWith("=")) return texto.endsWith("%") ? multiplicar(literal(texto.slice(0, -1)), numero(1n, 100n)) : literal(texto);
  if (--limite.restante < 0) throw new Error("#LIMITE!");
  const fonte = texto.slice(1).toUpperCase();
  if (fonte.length > 300) throw new Error("#LIMITE!");
  const tokens = fonte.match(/MEDIANA|M[ÉE]DIA|SOMA|SUM|[A-Z]+\d+|\d+(?:[.,]\d+)?|[+\-*/()%:;]/g) || [];
  if (tokens.join("") !== fonte.replace(/\s/g, "")) throw new Error("#FÓRMULA!");
  let pos = 0;
  const proximo = new Set(caminho).add(id);
  const referencia = (ref: string) => avaliarCelula(celulas, ref, proximo, cache, limite);
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
            if (!conteudo.startsWith("=") && !numeroLiteral(conteudo)) continue;
            incluir(referencia(ref));
          }
        } else incluir(expressao());
      } while (tokens[pos] === ";");
      exigir(")");
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
export type ExibicaoCelula = { texto: string; erro: boolean; numerico: boolean; valor?: Decimal };
function formatarDecimal({ n, d }: Decimal, moeda = false) {
  const negativo = n < 0n, absoluto = negativo ? -n : n;
  const centavos = (absoluto * 100n * 2n + d) / (d * 2n);
  const inteiro = (centavos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fracao = (centavos % 100n).toString().padStart(2, "0");
  return `${negativo && centavos ? "-" : ""}${moeda ? "R$ " : ""}${inteiro}${moeda || fracao !== "00" ? `,${fracao}` : ""}`;
}
export function apresentarCelula(celulas: Celulas, id: string, moeda: boolean, cache = new Map<string, Decimal>(), limite: LimiteCalculo = { restante: 200000 }): ExibicaoCelula {
  const original = celulas[id] || "";
  if (!original.trim()) return { texto: "", erro: false, numerico: false };
  if (!original.startsWith("=") && !numeroLiteral(original)) return { texto: original, erro: false, numerico: false };
  try {
    const valor = avaliarCelula(celulas, id, new Set(), cache, limite);
    const texto = !original.startsWith("=") && original.trim().endsWith("%") ? original.trim() : formatarDecimal(valor, moeda);
    return { texto, erro: false, numerico: true, valor };
  } catch (e) { return { texto: (e as Error).message, erro: true, numerico: false }; }
}

export function calcularPlanilha(celulas: Celulas, moedas: string[]) {
  const cache = new Map<string, Decimal>();
  const formatos = new Set(moedas);
  const limite = { restante: 200000 };
  return Object.fromEntries(Object.keys(celulas).map(id => [id, apresentarCelula(celulas, id, formatos.has(id), cache, limite)]));
}

export function limitesSelecao(inicio: string, fim: string) {
  const l1 = Number(inicio.slice(1)) - 1, l2 = Number(fim.slice(1)) - 1;
  const c1 = inicio.charCodeAt(0) - 65, c2 = fim.charCodeAt(0) - 65;
  return { primeiraLinha: Math.min(l1,l2), ultimaLinha: Math.max(l1,l2), primeiraColuna: Math.min(c1,c2), ultimaColuna: Math.max(c1,c2) };
}
export function resumirSelecao(exibicao: Record<string, ExibicaoCelula>, inicio: string, fim: string) {
  const limites = limitesSelecao(inicio, fim);
  let quantidade = 0, soma = numero(0n), minimo: Decimal | undefined, maximo: Decimal | undefined;
  try {
    for (let l = limites.primeiraLinha; l <= limites.ultimaLinha; l++) for (let c = limites.primeiraColuna; c <= limites.ultimaColuna; c++) {
      const valor = exibicao[endereco(l,c)]?.valor;
      if (!valor) continue;
      quantidade++; soma = somar(soma, valor);
      if (!minimo || valor.n * minimo.d < minimo.n * valor.d) minimo = valor;
      if (!maximo || valor.n * maximo.d > maximo.n * valor.d) maximo = valor;
    }
    return { quantidade, soma: quantidade ? formatarDecimal(soma) : '—', media: quantidade ? formatarDecimal(numero(soma.n, soma.d * BigInt(quantidade))) : '—', minimo: minimo ? formatarDecimal(minimo) : '—', maximo: maximo ? formatarDecimal(maximo) : '—', erro: false };
  } catch {
    return { quantidade, soma: '—', media: '—', minimo: '—', maximo: '—', erro: true };
  }
}
