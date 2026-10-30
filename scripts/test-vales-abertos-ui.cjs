const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const financeiro=(restante)=>({negociado:100,recebido:100-restante,presumido:100-restante,restante,restantePresumido:restante,aguardando:0,bonus:0,creditoUtilizado:0});
 const vales=[['v1',101,'2000-01-01','pendente',100],['v2',102,'2000-01-01','pendente',50],['v3',103,'2099-01-01','pendente',100],['v4',104,'2000-01-01','paga',0],['v5',105,'2000-01-01','cancelada',100]].map(([id,numeroSequencial,vencimento,status,saldoRestante])=>({id,numeroSequencial,vencimento,status,saldoRestante,totalLiquido:100,clienteId:'c',clienteNome:'Cliente teste',data:'2026-01-01',financeiro:financeiro(saldoRestante)}));
 const ordem={id:'o',numeroSequencial:1,clienteId:'c',clienteNome:'Cliente teste',dataEmissao:'2026-01-01',status:'aberta',totalOriginal:100,saldo:100,pagamentos:[],parcelas:[],vales:[{vendaId:'v1',numeroSequencial:101,saldo:100,saldoAtualVale:100,vencimento:'2000-01-01'}]};
 const code=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ValesView}from'./src/components/ValesView';createRoot(document.getElementById('root')).render(<ValesView/>);`},bundle:true,write:false,loader:{'.png':'dataurl','.css':'empty'}}).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.route('**/*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().includes('/ordens-cobranca')?[ordem]:r.request().url().includes('/clientes')?[{id:'c',nome:'Cliente teste'}]:vales)}));
  await page.goto('http://localhost');await page.setContent('<div id="root"></div>');await page.addScriptTag({content:code});
  const rows=page.locator('table tbody tr');
  await page.waitForFunction(()=>document.querySelectorAll('table tbody tr').length===3);
  assert.match(await rows.allTextContents().then(x=>x.join(' ')),/#101/);
  assert.match(await rows.allTextContents().then(x=>x.join(' ')),/#102/);
  assert.match(await rows.allTextContents().then(x=>x.join(' ')),/Vencido/);
  const filtro=page.locator('select').filter({has:page.locator('option[value="vencidos"]')});
  await filtro.selectOption('vencidos');assert.equal(await rows.count(),2);
  assert.match((await rows.allTextContents()).join(' '),/#101/);
  await filtro.selectOption('a_vencer');assert.equal(await rows.count(),1);assert.match(await rows.innerText(),/#103/);
  await filtro.selectOption('quitados');assert.equal(await rows.count(),1);assert.match(await rows.innerText(),/#104/);
  await filtro.selectOption('cancelados');assert.equal(await rows.count(),1);assert.match(await rows.innerText(),/#105/);
  await filtro.selectOption('todos');assert.equal(await rows.count(),5);
  await page.getByRole('button',{name: 'Ordens', exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('VENCIDA'));
  assert.match(await page.locator('table tbody').innerText(),/VENCIDA/);
  console.log('OK: vencidos em aberto, inclusive vinculados à ordem; filtros a vencer, quitados, cancelados e ordens.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

