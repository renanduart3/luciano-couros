// Navegação compacta da origem, com dados locais e sem acesso ao cliente.
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const script = buildSync({
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx',
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {HistoricoOrigemVale} from './src/components/HistoricoOrigemVale'; createRoot(document.getElementById('root')).render(<HistoricoOrigemVale vale={window.__vale} onOpenOrdem={id => {window.__openedOrder = id}}/>);`,
    },
    bundle: true, platform: 'browser', loader: { '.png': 'dataurl' }, write: false,
  }).outputFiles[0].text;
  const vale = {
    id: 'v700', clienteId: 'c', numeroSequencial: 700, totalLiquido: 2019.86,
    origemSaldo: { descricao: 'Devedor da ordem #36', ordem: { id: 'o36', numero: 36 }, vales: [{ id: 'v621', numero: 621 }] },
  };
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('http://auditoria.local');
    await page.evaluate(v => { window.__vale = v; }, vale);
    await page.addScriptTag({ content: script });
    await page.getByRole('button', { name: 'Ordem #36', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__openedOrder), 'o36');
    assert.equal(await page.getByText('Consultar vales e materiais de origem').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Vale #621', exact: true }).count(), 0);
    console.log('OK: origem compacta com navegação pela ordem e sem bloco expandido.');
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
