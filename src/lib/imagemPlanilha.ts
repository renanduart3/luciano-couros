import type { Planilha } from '../types';
import { calcularPlanilha, CORES_CELULA, endereco, larguraColuna, limitesSelecao } from './planilhas';

export const MAX_LINHAS_IMAGEM = 500;
const ALTURA = 26, PADDING = 7, FONTE = '12px Arial, Helvetica, sans-serif';
// Limite conservador de canvas, aceito por Chrome, Edge e Firefox.
const MAX_PIXELS_LADO = 16000;

// Desenha o intervalo como o gerente vê na grade: valores calculados, negrito, cores e caixa alta.
export function desenharSelecaoPlanilha(planilha: Planilha, inicio: string, fim: string, escalaDesejada = 2) {
  const limites = limitesSelecao(inicio, fim);
  const quantidadeLinhas = limites.ultimaLinha - limites.primeiraLinha + 1;
  if (quantidadeLinhas > MAX_LINHAS_IMAGEM) throw new Error(`Selecione até ${MAX_LINHAS_IMAGEM} linhas para gerar a imagem.`);
  // Calcular antes do recorte preserva referências a células fora da seleção.
  const valores = calcularPlanilha(planilha.celulas, planilha.moedas);
  const colunas = Array.from({ length: limites.ultimaColuna - limites.primeiraColuna + 1 }, (_, i) => i + limites.primeiraColuna);
  const larguras = colunas.map(c => larguraColuna(c, planilha.larguras));
  const largura = larguras.reduce((a, b) => a + b, 0) + 1;
  const altura = quantidadeLinhas * ALTURA + 1;
  const escala = Math.min(escalaDesejada, MAX_PIXELS_LADO / largura, MAX_PIXELS_LADO / altura);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(largura * escala);
  canvas.height = Math.ceil(altura * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu gerar a imagem.');
  ctx.scale(escala, escala);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.textBaseline = 'middle';
  for (let i = 0; i < quantidadeLinhas; i++) {
    const linha = limites.primeiraLinha + i, y = i * ALTURA;
    let x = 0;
    colunas.forEach((coluna, j) => {
      const w = larguras[j], id = endereco(linha, coluna), valor = valores[id], formato = planilha.formatos?.[id];
      const texto = (valor?.texto || '').toUpperCase();
      if (texto) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, ALTURA - 2); ctx.clip();
        ctx.font = `${formato?.negrito ? 700 : 400} ${FONTE}`;
        ctx.fillStyle = formato?.cor ? CORES_CELULA[formato.cor] : valor?.erro ? '#dc2626' : '#000000';
        const direita = Boolean(valor?.numerico) && !valor?.erro;
        ctx.textAlign = direita ? 'right' : 'left';
        ctx.fillText(texto, direita ? x + w - PADDING : x + PADDING, y + ALTURA / 2 + 0.5);
        ctx.restore();
      }
      x += w;
    });
  }
  // Grade por cima do texto, com linhas nítidas em qualquer escala.
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1 / escala;
  ctx.beginPath();
  const alinhar = (v: number) => (Math.round(v * escala) + 0.5) / escala;
  for (let i = 0; i <= quantidadeLinhas; i++) { const y = alinhar(Math.min(i * ALTURA, altura - 1)); ctx.moveTo(0, y); ctx.lineTo(largura, y); }
  let x = 0;
  for (let j = 0; j <= larguras.length; j++) { const xv = alinhar(Math.min(x, largura - 1)); ctx.moveTo(xv, 0); ctx.lineTo(xv, altura); x += larguras[j] || 0; }
  ctx.stroke();
  return canvas;
}

export function pngDoCanvas(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('O navegador não conseguiu gerar a imagem.')), 'image/png'));
}

export function nomeArquivoImagem(planilha: Planilha, inicio: string, fim: string) {
  const base = planilha.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'planilha';
  return `${base}-${inicio}${inicio === fim ? '' : '-' + fim}.png`;
}

export async function copiarImagemParaAreaDeTransferencia(png: Promise<Blob>) {
  if (!window.isSecureContext || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  // Passar a Promise mantém o gesto do usuário válido enquanto o PNG é gerado.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  return true;
}

export function baixarImagem(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = nome;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
