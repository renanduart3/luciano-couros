import type { Planilha } from '../types';
import { calcularPlanilha, CORES_CELULA, endereco, larguraColuna, limitesSelecao } from './planilhas';

const escapar = (texto: string) => texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function documentoImpressaoPlanilha(planilha: Planilha, inicio: string, fim: string, paisagem = false) {
  const limites = limitesSelecao(inicio, fim);
  // Calcular antes do recorte preserva referências a células fora da seleção.
  const valores = calcularPlanilha(planilha.celulas, planilha.moedas);
  const intervalo = `${endereco(limites.primeiraLinha, limites.primeiraColuna)}:${endereco(limites.ultimaLinha, limites.ultimaColuna)}`;
  const colunas = Array.from({ length: limites.ultimaColuna - limites.primeiraColuna + 1 }, (_, i) => i + limites.primeiraColuna);
  const total = colunas.reduce((soma, coluna) => soma + larguraColuna(coluna, planilha.larguras), 0);
  const linhas = Array.from({ length: limites.ultimaLinha - limites.primeiraLinha + 1 }, (_, i) => {
    const linha = limites.primeiraLinha + i;
    return '<tr>' + colunas.map(coluna => {
      const id = endereco(linha, coluna), valor = valores[id], formato = planilha.formatos?.[id];
      const cor = formato?.cor ? CORES_CELULA[formato.cor] : valor?.erro ? '#dc2626' : '#000000';
      return `<td style="color:${cor};font-weight:${formato?.negrito ? 700 : 400};text-align:${valor?.numerico ? 'right' : 'left'}">${escapar(valor?.texto || '')}</td>`;
    }).join('') + '</tr>';
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(planilha.nome)} — ${intervalo}</title>
<style>
@page { size: A4 ${paisagem ? 'landscape' : 'portrait'}; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; background: #e2e8f0; color: #000; font: 12px Arial, sans-serif; }
article { width: ${paisagem ? 273 : 186}mm; min-height: ${paisagem ? 186 : 273}mm; margin: 16px auto; padding: 0; background: white; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td { border: 1px solid #64748b; padding: 5px 7px; height: 26px; white-space: pre-wrap; overflow-wrap: anywhere; vertical-align: top; text-transform: uppercase; }
tr { break-inside: avoid; }
@media print { body { background: white; } article { width: 100%; min-height: 0; margin: 0; } td { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body><article aria-label="Células selecionadas"><table><colgroup>${colunas.map(c => `<col style="width:${larguraColuna(c, planilha.larguras) / total * 100}%">`).join('')}</colgroup><tbody>${linhas}</tbody></table></article></body></html>`;
}
