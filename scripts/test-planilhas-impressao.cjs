// Apenas dados sintéticos; não acessa o servidor nem o banco operacional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const modulo = { exports: {} };
new Function('module', 'exports', buildSync({ entryPoints: ['src/lib/impressaoPlanilha.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text)(modulo, modulo.exports);
const { documentoImpressaoPlanilha } = modulo.exports;
async function main() {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const p = await browser.newPage();
    const planilha = { nome: '<script>invalido</script>', celulas: { A1: 'EXCLUIDO', B900: '=A1', A2:'12,50', B901:'=A2*2', C900:'<img src=x onerror=alert(1)>', C901:'Texto longo '.repeat(20) }, moedas:['B901'], formatos:{B901:{negrito:true,cor:'verde'}}, larguras:{B:200,C:400} };
    planilha.celulas.B900='Último trecho';
    await p.setContent(documentoImpressaoPlanilha(planilha,'C901','B900'));
    assert.equal(await p.locator('td').count(),4);
    assert.equal(await p.locator('img,script').count(),0);
    assert.doesNotMatch(await p.locator('body').innerText(),/EXCLUIDO/);
    assert.match(await p.locator('body').innerText(),/R\$ 25,00/);
    assert.equal(await p.locator('td').nth(2).evaluate(e=>getComputedStyle(e).fontWeight),'700');
    assert.ok(await p.locator('td').last().evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    fs.mkdirSync('output/planilhas-impressao',{recursive:true});
    await p.pdf({path:'output/planilhas-impressao/selecao.pdf',preferCSSPageSize:true,printBackground:true});
    await p.screenshot({path:'output/planilhas-impressao/selecao.png',fullPage:true});
    for(let i=1;i<=150;i++)planilha.celulas['B'+i]='Linha '+i;
    await p.setContent(documentoImpressaoPlanilha(planilha,'B1','C150',true));
    assert.equal(await p.locator('tr').count(),150);
    assert.match(await p.locator('tr').last().innerText(),/LINHA 150/);
    await p.pdf({path:'output/planilhas-impressao/multipaginas.pdf',preferCSSPageSize:true,printBackground:true});
    console.log('OK: recorte reverso, conteúdo escapado, fórmulas externas, moeda, formatação, quebra de texto e 150 linhas em A4 paisagem.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
