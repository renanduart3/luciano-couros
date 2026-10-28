const {buildSync}=require('esbuild');
const fs=require('fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
const code=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PagamentoValesModal}from'./src/components/PagamentoValesModal';createRoot(document.getElementById('root')).render(<PagamentoValesModal clienteId="c" clienteNome="Cliente de teste" vales={[{id:'v',numeroSequencial:17,saldoRestante:100,data:'2026-10-28'} as any]} onClose={()=>{}} onSaved={()=>{}}/>);`},bundle:true,write:false,loader:{'.png':'dataurl','.css':'empty'}}).outputFiles[0].text;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const page=await browser.newPage({viewport:{width:1366,height:768}});let payload;
await page.route('**/*',async r=>{if(r.request().method()==='POST'){payload=r.request().postDataJSON();return r.fulfill({contentType:'application/json',body:JSON.stringify({recebimentos:[{id:'x'}]})});}return r.fulfill({contentType:'application/json',body:JSON.stringify({saldoBonus:300})});});
page.on('pageerror',e=>console.error(e));await page.goto('http://localhost');await page.setContent('<div id="root"></div>');await page.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(x=>x.endsWith('.css')),'utf8')});await page.addScriptTag({content:code});
await page.getByLabel('Forma de pagamento').selectOption('cheque_terceiro');
await page.getByLabel('Titular, linha 1',{exact:true}).fill('Titular de teste');
await page.getByLabel('Vencimento, linha 1',{exact:true}).fill('2026-12-27');
await page.getByLabel('Número do documento, linha 1',{exact:true}).fill('12345');
require('assert').equal(await page.getByLabel('Banco',{exact:true}).count(),0);require('assert').equal(await page.getByLabel('Fone',{exact:true}).count(),0);
fs.mkdirSync('output',{recursive:true});await page.screenshot({path:'output/gerenciamento-cheque.png',fullPage:true});
await page.getByLabel('Forma de pagamento').selectOption('bonus');
await page.waitForFunction(()=>document.querySelector('[aria-label="Bônus a utilizar"]')?.value==='300,00');
require('assert').equal(await page.getByLabel('Banco',{exact:true}).count(),0);
await page.screenshot({path:'output/gerenciamento-bonus.png',fullPage:true});
await page.getByLabel('Forma de pagamento').selectOption('pix');
await page.getByLabel('Valor do pagamento').fill('50');await page.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
await page.getByLabel('Forma de pagamento').selectOption('bonus');await page.getByLabel('Bônus a utilizar').fill('30');await page.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
await page.getByLabel('Forma de pagamento').selectOption('pix');await page.getByLabel('Valor do pagamento').fill('40');await page.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
await page.getByRole('button',{name:'Editar',exact:true}).first().click();await page.getByLabel('Valor do pagamento').fill('60');await page.getByRole('button',{name:'Salvar',exact:true}).click();
fs.mkdirSync('output',{recursive:true});await page.screenshot({path:'output/gerenciamento-pagamentos.png',fullPage:true});await page.getByRole('button',{name:'Salvar pagamentos',exact:true}).click();await page.waitForTimeout(300);
require('assert').equal(payload.pagamentos.length,3);require('assert').equal(payload.pagamentos[0].bonusUtilizado,30);require('assert').equal(payload.pagamentos.flatMap(p=>p.alocacoes).reduce((s,a)=>s+a.valor,0),100);console.log('OK: lista, edição, bônus, rateio do excedente e envio único.');
await page.setViewportSize({width:390,height:844});require('assert').ok(await page.locator('form').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

