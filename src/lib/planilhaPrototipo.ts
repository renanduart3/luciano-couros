// Aritmética racional: mantém casas decimais exatas até a apresentação em centavos.
export const LINHAS = 40;
export const COLUNAS = 10;
export type Celulas = Record<string, string>;
type Decimal = { n: bigint; d: bigint };
const numero = (n: bigint, d = 1n): Decimal => {
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
export function endereco(linha: number, coluna: number) { return `${String.fromCharCode(65 + coluna)}${linha + 1}`; }
export function avaliarCelula(celulas: Celulas, id: string, caminho = new Set<string>(), cache = new Map<string, Decimal>()): Decimal {
  if (!/^[A-J]([1-9]|[1-3]\d|40)$/.test(id)) throw new Error("#REF!");
  if (caminho.has(id)) throw new Error("#CICLO!");
  if (cache.has(id)) return cache.get(id)!;
  if (caminho.size > 100) throw new Error("#LIMITE!");
  const texto = (celulas[id] || "").trim();
  if (!texto) return numero(0n);
  if (!texto.startsWith("=")) return texto.endsWith("%") ? multiplicar(literal(texto.slice(0, -1)), numero(1n, 100n)) : literal(texto);
  const fonte = texto.slice(1).toUpperCase();
  if (fonte.length > 300) throw new Error("#LIMITE!");
  const tokens = fonte.match(/SOMA|SUM|[A-Z]+\d+|\d+(?:[.,]\d+)?|[+\-*/()%:;]/g) || [];
  if (tokens.join("") !== fonte.replace(/\s/g, "")) throw new Error("#FÓRMULA!");
  let pos = 0;
  const proximo = new Set(caminho).add(id);
  const referencia = (ref: string) => avaliarCelula(celulas, ref, proximo, cache);
  const exigir = (token: string) => { if (tokens[pos++] !== token) throw new Error("#FÓRMULA!"); };
  function primario(): Decimal {
    const token = tokens[pos++];
    let valor: Decimal;
    if (token === "+" || token === "-") { valor = primario(); return token === "-" ? numero(-valor.n, valor.d) : valor; }
    if (token === "(") { valor = expressao(); exigir(")"); }
    else if (token === "SOMA" || token === "SUM") {
      exigir("("); valor = numero(0n);
      do {
        if (tokens[pos] === ";") pos++;
        if (/^[A-Z]+\d+$/.test(tokens[pos] || "") && tokens[pos + 1] === ":") {
          const inicio = tokens[pos++]; pos++; const fim = tokens[pos++];
          if (!/^[A-J]([1-9]|[1-3]\d|40)$/.test(inicio) || !/^[A-J]([1-9]|[1-3]\d|40)$/.test(fim || "")) throw new Error("#REF!");
          const c1 = inicio.charCodeAt(0) - 65, c2 = fim.charCodeAt(0) - 65, l1 = Number(inicio.slice(1)) - 1, l2 = Number(fim.slice(1)) - 1;
          if (c1 > c2 || l1 > l2) throw new Error("#REF!");
          for (let l = l1; l <= l2; l++) for (let c = c1; c <= c2; c++) {
            const ref = endereco(l, c), conteudo = (celulas[ref] || "").trim();
            // Como em uma soma de planilha, rótulos em intervalos são ignorados.
            if (conteudo && !conteudo.startsWith("=") && !/^(R\$\s*)?[+-]?\d/.test(conteudo)) continue;
            valor = somar(valor, referencia(ref));
          }
        } else valor = somar(valor, expressao());
      } while (tokens[pos] === ";");
      exigir(")");
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
export function apresentarCelula(celulas: Celulas, id: string, moeda: boolean) {
  const original = celulas[id] || "";
  if (!original.trim()) return { texto: "", erro: false, numerico: false };
  if (!original.startsWith("=") && !/^(R\$\s*)?[+-]?\d/.test(original.trim())) return { texto: original, erro: false, numerico: false };
  try {
    const { n, d } = avaliarCelula(celulas, id);
    if (!original.startsWith("=") && original.trim().endsWith("%")) return { texto: original.trim(), erro: false, numerico: true };
    const negativo = n < 0n, absoluto = negativo ? -n : n;
    const centavos = (absoluto * 100n * 2n + d) / (d * 2n);
    const inteiro = (centavos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const fracao = (centavos % 100n).toString().padStart(2, "0");
    const texto = `${negativo && centavos ? "-" : ""}${moeda ? "R$ " : ""}${inteiro}${moeda || fracao !== "00" ? `,${fracao}` : ""}`;
    return { texto, erro: false, numerico: true };
  } catch (e) { return { texto: (e as Error).message, erro: true, numerico: false }; }
}
export const EXEMPLO: Celulas = {
  A1: "SIMULAÇÃO DE MATERIAIS", A3: "Descrição", B3: "Quantidade", C3: "Valor unitário", D3: "Total",
  A4: "Couro sintético · metros", B4: "12,5", C4: "38,90", D4: "=B4*C4",
  A5: "Espuma · unidades", B5: "3", C5: "85,50", D5: "=B5*C5",
  A6: "Linha · rolos", B6: "2", C6: "19,90", D6: "=B6*C6",
  A8: "Subtotal", D8: "=SOMA(D4:D6)", A9: "Desconto", C9: "5%", D9: "=D8*C9",
  A10: "TOTAL", D10: "=D8-D9", A13: "Experimente alterar uma quantidade ou um preço.",
};
