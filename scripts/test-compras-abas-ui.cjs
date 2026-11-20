const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fornecedores = [
  { id: 'f1', nome: 'Primeiro fornecedor', ativo: 1 },
  { id: 'f2', nome: 'Segundo fornecedor', ativo: 1 },
];
const produtos = [
  { id: 'p1', nome: 'Couro do primeiro', ativo: 1, unidade: 'metro', custoPadrao: 10 },
  { id: 'p2', nome: 'Couro do segundo', ativo: 1, unidade: 'metro', custoPadrao: 20 },
  { id: 'p3', nome: 'Camurça do primeiro', ativo: 1, unidade: 'metro', custoPadrao: 10 },
];
const orcamento = {
  id: 'o1', numeroSequencial: 15, fornecedorId: 'f1', status: 'aberto', data: '2026-10-29',
  validade: '2026-11-05', desconto: 0, total: 20,
  items: [{ produtoId: 'p1', produtoNome: produtos[0].nome, quantidade: 2, unidade: 'metro', custoEstimado: 10 }],
};
const compras = fornecedores.map((fornecedor, indice) => ({
  id: `c${indice + 1}`, numeroSequencial: 81 + indice, fornecedorId: fornecedor.id, fornecedorNome: fornecedor.nome,
  data: '2026-10-29', total: 50, valorPago: 0, saldoRestante: 50, status: 'pendente', formaPagamento: 'vale', items: [],
}));

async function main() {
  const js = buildSync({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ComprasView } from './src/components/ComprasView';
      import { AuthProvider } from './src/auth/AuthContext';
      createRoot(document.getElementById('root')).render(
        <AuthProvider value={{ id: 'g', perfil: 'administrador' } as any}><ComprasView /></AuthProvider>
      );
    ` }, bundle: true, write: false, loader: { '.png': 'dataurl' },
  }).outputFiles[0].text;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const id = url.searchParams.get('fornecedorId');
      const path = url.pathname;
      requests.push(url.pathname + url.search);
      let data = [];
      if (path === '/api/fornecedores') data = fornecedores;
      if (path === '/api/fornecedores/f1/produtos') data = [produtos[0], produtos[2]].map(produto => ({ ...produto, produtoId: produto.id, produtoNome: produto.nome }));
      if (path === '/api/fornecedores/f2/produtos') data = [{ ...produtos[1], produtoId: 'p2', produtoNome: produtos[1].nome }];
      if (path === '/api/produtos') data = produtos;
      if (path === '/api/orcamentos-compra') data = [orcamento].filter(item => item.fornecedorId === id);
      if (path === '/api/compras') data = compras.filter(item => item.fornecedorId === id);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('http://compras.test');
    await page.setContent('<div id="root"></div>');
    const css = fs.readdirSync('dist/assets').find(file => file.endsWith('.css'));
    await page.addStyleTag({ content: fs.readFileSync(`dist/assets/${css}`, 'utf8') });
    await page.addScriptTag({ content: js });

    const nav = page.getByRole('navigation', { name: 'Áreas de compras' });
    const fornecedor = page.getByLabel('1. Selecione o fornecedor');
    await fornecedor.locator('option[value="f1"]').waitFor({ state: 'attached' });
    assert.equal(await nav.count(), 0);
    assert.equal(requests.filter(url => url.startsWith('/api/')).length, 1);
    await fornecedor.selectOption('f1');
    await page.getByText('Editar orçamento #15', { exact: true }).waitFor();
    assert.deepEqual(await nav.getByRole('button').allTextContents(), ['Orçamento', 'Compra', 'Histórico', 'Vales']);
    assert.equal(await page.getByLabel('Quantidade de Couro do primeiro').first().inputValue(), '2');
    assert.equal(await page.getByLabel('Quantidade de Camurça do primeiro').count(), 0);
    const busca = page.getByRole('searchbox', { name: 'Buscar produtos do fornecedor' });
    await busca.fill('segundo');
    await page.getByText('Nenhum produto disponível.', { exact: true }).waitFor();
    await busca.fill('Camurça');
    await page.getByRole('button', { name: /Camurça do primeiro/ }).waitFor();
    assert.ok(!requests.includes('/api/produtos'));

    await page.getByRole('button', { name: 'Levar para conferência' }).click();
    await page.getByRole('button', { name: 'Finalizar compra', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Quantidade de Couro do primeiro').first().inputValue(), '2');
    assert.equal(await fornecedor.inputValue(), 'f1');
    await nav.getByRole('button', { name: 'Orçamento', exact: true }).click();
    await page.getByText('Editar orçamento #15', { exact: true }).waitFor();

    await nav.getByRole('button', { name: 'Histórico', exact: true }).click();
    await page.getByText('#81', { exact: true }).waitFor();
    assert.equal(await page.getByText('#82', { exact: true }).count(), 0);
    await nav.getByRole('button', { name: 'Vales', exact: true }).click();
    await page.getByRole('heading', { name: 'Vales de compras' }).waitFor();
    await page.getByText('#81', { exact: true }).waitFor();
    assert.equal(await page.getByText('#82', { exact: true }).count(), 0);

    await fornecedor.selectOption('f2');
    await page.getByText('Novo orçamento ao fornecedor', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Quantidade de Couro do primeiro').count(), 0);
    await busca.fill('segundo');
    await page.getByRole('button', { name: /Couro do segundo/ }).click();
    await page.getByLabel('Quantidade de Couro do segundo').first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole('button', { name: 'Vales', exact: true }).click();
    await page.getByText('Vale #82', { exact: true }).waitFor();
    assert.equal(await page.getByText('Vale #81', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('OK: seleção obrigatória, orçamento vigente, catálogo do fornecedor, transferência, histórico e vales isolados.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
