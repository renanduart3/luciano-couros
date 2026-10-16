const assert = require('node:assert/strict');
const fs = require('node:fs');
const {buildSync} = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function main() {
 const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ValesView} from './src/components/ValesView';import {PagamentoValesModal} from './src/components/PagamentoValesModal';import {LinhaPagamento} from './src/components/LinhaPagamento';import {ComprovanteRecebimentoModal} from './src/components/ComprovanteRecebimentoModal';const root=createRoot(document.getElementById('root'));window.renderCase=(tipo)=>root.render(tipo==='filtros'?<ValesView/>:tipo==='novo'?<PagamentoValesModal clienteId="c" clienteNome="Cliente teste" vales={[{id:'v',numeroSequencial:165,saldoRestante:1000,data:'2026-10-14'}]} onClose={()=>{}} onSaved={()=>{}}/>:tipo==='excluir'?<table><tbody><LinhaPagamento pagamento={{id:'r',status:'ativo',statusPagamento:'compensado',data:'2026-10-14',formaPagamento:'pix',valorRecebido:100,bonusUtilizado:0,titulos:[],alocacoes:[]}} clienteId="c" clienteNome="Teste" saldo={0} alocar={()=>[]} referencia="vale" onSaved={()=>{}}/></tbody></table>:<ComprovanteRecebimentoModal comprovante={{id:'r',data:'2026-10-14',clienteNome:'Teste',formaPagamento:'pix',valorRecebido:100,valorAplicado:100,valorDevidoAntes:1000,titulos:[],vales:[{numeroSequencial:165,valorVale:1000,saldoAtual:800,saldoAntes:1000,saldoDepois:900}]}} onClose={()=>{}}/>);`},bundle:true,platform:'browser',loader:{'.png':'dataurl'},write:false}).outputFiles[0].text;
 const css=fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css')),'utf8');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror', e=>console.error(e));
 await page.route('**/*',route=>{
  const url=route.request().url();
  const data=url.endsWith('/clientes')?[{id:'c',nome:'Cliente teste'},{id:'b',nome:'Outro cliente'}]:['/vendas','/ordens-cobranca','/cheques'].some(p=>url.endsWith(p))?[]:url.includes('reabertura-pagamentos')?{revisao:'rev',totalFinanceiro:100,vales:[{numero:165,valor:100}],variacaoBonus:0}:url.includes('ultimo-titulo')?{nomeTitular:'Teste',documentoTitular:'12345678909'}:{};
  return route.fulfill(url.includes('/api/')?{contentType:'application/json',body:JSON.stringify(data)}:{contentType:'text/html',body:'<main><div id="root"></div></main>'});
 });
 await page.goto('http://teste.local');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await page.evaluate(()=>window.renderCase('novo'));
 await page.locator('[role=dialog] select').first().selectOption('cheque_emitente');
 await page.getByLabel('Valor, linha 1',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Valor, linha 1"]').value==='1000');
 await page.getByRole('button',{name:'Adicionar linha'}).click();await page.getByRole('button',{name:'Adicionar linha'}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Valor, linha 3"]').value==='333.33');
 assert.equal(await page.getByLabel('Valor, linha 1',{exact:true}).inputValue(),'333.34');
 await page.getByRole('switch',{name:'Divisão automática'}).click();await page.getByLabel('Valor, linha 1',{exact:true}).fill('200');
 await page.getByRole('button',{name:'Adicionar linha'}).click();assert.equal(await page.getByLabel('Valor, linha 1',{exact:true}).inputValue(),'200');
 await page.getByRole('switch',{name:'Divisão automática'}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Valor, linha 1"]').value==='250');
 for(const width of [1280,1024,768,390]) {
  await page.setViewportSize({width,height:900});
  const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('[role="dialog"]')).map(e=>({w:e.clientWidth,s:e.scrollWidth})).filter(e=>e.s>e.w+1));
  assert.deepEqual(overflow,[],`overflow horizontal em ${width}`);
 }
 await page.evaluate(()=>window.renderCase('excluir'));await page.getByRole('button',{name:'Excluir',exact:true}).click();
 await page.getByText(/O saldo será atualizado/).waitFor();assert.equal(await page.getByRole('checkbox').count(),0);
 await page.getByLabel('Senha do gerente').fill('1234');assert.equal(await page.getByRole('button',{name:'Confirmar exclusão'}).isEnabled(),true);
 await page.evaluate(()=>window.renderCase('recibo'));await page.getByText('ABATIDO ATÉ ESTE RECIBO',{exact:true}).waitFor();
 assert.equal(await page.getByText('Nº CHEQUE / BOLETO',{exact:true}).count(),0);
 assert.equal(await page.getByText('SALDO ANTES',{exact:true}).count(),0);
 assert.ok((await page.locator('.payment-receipt-vales').innerText()).includes('900,00'));
 assert.ok((await page.locator('.payment-receipt-current-balance').innerText()).includes('800,00'));
 assert.ok((await page.locator('.payment-receipt-vales').innerText()).includes('100,00'));
 assert.ok((await page.locator('tfoot').first().innerText()).includes('1.000,00'));
 await page.evaluate(()=>window.renderCase('filtros'));
 const filtroCliente=page.locator('select').filter({has:page.locator('option',{hasText:'Todos os clientes'})});
 assert.equal(await filtroCliente.inputValue(),'');
 assert.ok(await page.locator('#vales-cliente').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('nav[aria-label="Abas de vales"]')) & Node.DOCUMENT_POSITION_FOLLOWING)));
 await filtroCliente.selectOption('c');
 for(const aba of ['Ordens','Cheques e boletos','Cobranças']) {
  await page.getByRole('button',{name:aba,exact:true}).click();
  assert.equal(await filtroCliente.count(),1);
  assert.equal(await filtroCliente.inputValue(),'c');
 }
 await filtroCliente.selectOption('');
 for(const aba of ['Ordens','Cheques e boletos','Cobranças']) {
  await page.getByRole('button',{name:aba,exact:true}).click();
  assert.equal(await filtroCliente.inputValue(),'');
 }
 console.log('OK: divisão automática/manual, 4 larguras sem rolagem horizontal, exclusão sem caixa e recibo com saldo atual.');
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
