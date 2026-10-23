const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const script = buildSync({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ValesView} from './src/components/ValesView';
    createRoot(document.getElementById('root')).render(<ValesView/>);
  ` }, bundle: true, platform: 'browser', loader: { '.png': 'dataurl' }, write: false }).outputFiles[0].text;
  const vale = { clienteId: 'c', clienteNome: 'Cliente teste', data: '2026-10-22',
    totalLiquido: 435.54, valorPago: 173.69, saldoRestante: 261.85, status: 'pendente' };
  const vales = [
    { ...vale, id: 'aberto', numeroSequencial: 895, vencimento: '2099-01-01' },
    { ...vale, id: 'vencido', numeroSequencial: 896, vencimento: '2000-01-01' },
    { ...vale, id: 'quitado', numeroSequencial: 894, vencimento: '2026-10-22',
      status: 'paga', valorPago: 435.54, saldoRestante: 0 },
    { ...vale, id: 'transferido', numeroSequencial: 893, vencimento: '2026-10-22',
      status: 'paga', valorTransferido: 261.85, saldoRestante: 0, finalizadoAt: '2026-10-22' },
  ];
  const ordem = { id: 'oc1', numeroSequencial: 1, clienteId: 'c', clienteNome: 'Cliente teste',
    dataEmissao: '2026-10-23', totalOriginal: 100, status: 'aberta', parcelas: [],
    vales: [{ id: 'ov1', vendaId: 'outro', numeroSequencial: 900, saldo: 100, vencimento: '2000-01-01' }],
    pagamentos: [] };
  const pagamento = { id: 'p', status: 'ativo', statusPagamento: 'compensado',
    valorRecebido: 100, bonusUtilizado: 0, titulos: [] };
  const ordens = [ordem, { ...ordem, id: 'oc2', numeroSequencial: 2, pagamentos: [pagamento] }];
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => {
      const url = route.request().url();
      const data = url.endsWith('/vendas') ? vales : url.endsWith('/ordens-cobranca') ? ordens
        : url.endsWith('/clientes') ? [{ id: 'c', nome: 'Cliente teste' }] : {};
      return route.fulfill(url.includes('/api/') ? { contentType: 'application/json', body: JSON.stringify(data) }
        : { contentType: 'text/html', body: '<div id="root"></div>' });
    });
    await page.goto('http://situacao.test');
    await page.addScriptTag({ content: script });
    const filtro = page.locator('select').filter({ has: page.locator('option[value="quitados"]') });
    await page.getByText('#895', { exact: true }).waitFor();
    assert.equal(await filtro.inputValue(), 'abertos');
    assert.equal(await page.getByText('#894', { exact: true }).count(), 0);
    await filtro.selectOption('quitados');
    await page.getByText('#894', { exact: true }).waitFor();
    assert.equal(await page.getByText('#895', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Quitado', { exact: true }).count(), 4);
    await filtro.selectOption('vencidos');
    await page.getByText('#896', { exact: true }).waitFor();
    assert.equal(await page.getByText('#895', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Vencido', { exact: true }).count(), 2);
    assert.equal(await page.getByText('Coberto', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Ordens', exact: true }).click();
    const filtroOrdem = page.locator('select').filter({ has: page.locator('option[value="quitada"]') });
    await page.getByText('#1', { exact: true }).waitFor();
    assert.equal(await filtroOrdem.inputValue(), 'aberta');
    assert.equal(await page.getByText('#2', { exact: true }).count(), 0);
    await filtroOrdem.selectOption('quitada');
    await page.getByText('#2', { exact: true }).waitFor();
    assert.equal(await page.getByText('#1', { exact: true }).count(), 0);
    console.log('OK: filtros iniciais em aberto, quitados/transferidos excluídos, vencidos e ordens classificadas pelo saldo.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
