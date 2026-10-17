const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const script = buildSync({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {VendaComprovante} from './src/components/VendaComprovante';
    import {ComprovanteRecebimentoModal} from './src/components/ComprovanteRecebimentoModal';
    const root = createRoot(document.getElementById('root'));
    window.renderStatement = venda => root.render(<VendaComprovante venda={venda} demonstrativoPagamento/>);
    window.renderReceipt = comprovante => root.render(<ComprovanteRecebimentoModal embedded comprovante={comprovante} onClose={() => {}}/>);
  ` }, bundle: true, platform: 'browser', loader: { '.png': 'dataurl' }, write: false }).outputFiles[0].text;
  const assets = 'dist/assets';
  const css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(file => file.endsWith('.css'))), 'utf8');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.route('**/*', route => route.fulfill(route.request().url().includes('/api/')
      ? { contentType: 'application/json', body: '{}' }
      : { contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('http://teste.local');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
    const pagamento = { id: 'p174', data: '2026-10-17', status: 'ativo', statusPagamento: 'compensado',
      formaPagamento: 'pix', valorRecebido: 9000, valorAplicado: 8170.2, valorNoVale: 8170.2,
      bonusUtilizado: 0, bonusGerado: 829.8, titulos: [], alocacoes: [{ vendaId: 'v174', valor: 8170.2 }] };
    const venda = { id: 'v174', numeroSequencial: 174, data: '2026-10-17', vencimento: '2026-10-17',
      clienteNome: 'Juliana Mendes Neves', clienteDocumento: '888.999.000-11', totalLiquido: 8170.2,
      valorPago: 8170.2, contabilizaReceita: 0, items: [], recebimentos: [pagamento],
      origemSaldo: { ordem: { numero: 15 }, vales: [] } };
    await page.evaluate(v => window.renderStatement(v), venda);
    await page.getByText('PAGO', { exact: true }).first().waitFor();
    const copy = page.locator('.receipt-copy').first();
    const paymentRow = copy.locator('tr').filter({ hasText: 'PAGO' });
    assert.equal((await paymentRow.innerText()).match(/-R\$\s*9\.000,00/g).length, 2);
    assert.match(await copy.locator('.receipt-total').innerText(), /BÔNUS GERADO\s*-R\$\s*829,80/);
    assert.match(await copy.innerText(), /Devedor da ordem #15/i);
    const preview = process.env.PREVIEW_PATH || path.join(process.env.TEMP, 'vale174-acerto.png');
    await copy.screenshot({ path: preview });
    await page.emulateMedia({ media: 'print' });
    assert.match(await copy.locator('.receipt-total').innerText(), /829,80/);
    assert.equal(await page.locator('.receipt-copy').count(), 2);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(c => window.renderReceipt(c), { id: 'rec174', data: venda.data, clienteNome: venda.clienteNome,
      formaPagamento: 'pix', valorRecebido: 9000, valorAplicado: 8170.2, titulos: [], bonusGeradoVale: 829.8,
      vales: [{ vendaId: venda.id, numeroSequencial: 174, valorVale: 8170.2, saldoAntes: 8170.2, saldoDepois: 0 }],
      pagamentosVale: [pagamento] });
    await page.getByText('TOTAL VALES', { exact: true }).waitFor();
    assert.match(await page.locator('.payment-receipt-methods tbody').innerText(), /9\.000,00/);
    assert.match(await page.locator('.payment-receipt-methods tfoot').innerText(), /TOTAL\s*R\$\s*9\.000,00/);
    assert.match(await page.locator('.payment-receipt-bonus-summary tbody').innerText(), /8\.170,20\s*R\$\s*9\.000,00\s*R\$\s*829,80/);
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.locator('.payment-receipt-paper').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    }
    console.log('OK: vale #174, pagamento integral, acerto negativo, bônus e impressão em duas vias. Prévia: ' + preview);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
