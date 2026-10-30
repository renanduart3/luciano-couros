const {buildSync}=require('esbuild');
const fs=require('fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
for (const ordem of [false,true]) for (const diferenca of [50,-200]) {
const code=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PagamentoValesModal}from'./src/components/PagamentoValesModal';createRoot(document.getElementById('root')).render(<PagamentoValesModal clienteId="c" clienteNome="Cliente de teste" clienteDocumento="12345678901" vales={[{id:'v',numeroSequencial:17,saldoRestante:100,data:'2026-10-28'} as any]} ordem={${ordem ? "{id:'o',numeroSequencial:3,saldo:100,vales:[{vendaId:'v',numeroSequencial:17,saldo:60,saldoAtualVale:60},{vendaId:'v2',numeroSequencial:18,saldo:40,saldoAtualVale:40}]} as any" : 'undefined'}} onClose={()=>{}} onSaved={()=>{}}/>);`},bundle:true,write:false,loader:{'.png':'dataurl','.css':'empty'}}).outputFiles[0].text;
const page=await browser.newPage({viewport:{width:1366,height:768}});let payload;
await page.route('**/*',async r=>{if(r.request().method()==='POST'){payload=r.request().postDataJSON();return r.fulfill({contentType:'application/json',body:JSON.stringify({recebimentos:[{id:'x'}]})});}return r.fulfill({contentType:'application/json',body:JSON.stringify({saldoBonus:300})});});
page.on('pageerror',e=>{throw e;});await page.goto('http://localhost');await page.setContent('<div id="root"></div>');await page.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(x=>x.endsWith('.css')),'utf8')});await page.addScriptTag({content:code});
for(const forma of ['cheque_emitente','duplicata_emitente']) {
await page.getByLabel('Forma de pagamento').selectOption(forma);
await page.getByLabel('Nome, linha 1',{exact:true}).waitFor();
await page.getByRole('button',{name:'Adicionar linha',exact:true}).click();
assert.equal(await page.getByLabel('Valor, linha 1',{exact:true}).inputValue(),'50');
assert.equal(await page.getByLabel('Valor, linha 2',{exact:true}).inputValue(),'50');
await page.getByRole('switch',{name:'Divisão automática'}).click();
await page.getByLabel('Valor, linha 1',{exact:true}).fill('60');
await page.getByLabel('Valor, linha 2',{exact:true}).fill('40');
for(let i=1;i<=2;i++) await page.getByLabel(`Vencimento, linha ${i}`,{exact:true}).fill('2026-12-27');
await page.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
assert.match(await page.getByRole('alert').innerText(),/número/i);
const tipo=forma.startsWith('cheque')?'cheque':'boleto';
for(let i=1;i<=2;i++) await page.getByLabel(`Número do ${tipo}, linha ${i}`,{exact:true}).fill(`123-${i}`);
fs.mkdirSync('output',{recursive:true});await page.screenshot({path:`output/receber-${ordem?'ordem':'vale'}-${tipo}.png`,fullPage:true});
await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('form').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
await page.setViewportSize({width:1366,height:768});
if(forma==='cheque_emitente') continue;
await page.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
}
assert.equal(await page.locator('[data-rascunho-id]').count(),2);
assert.equal(await page.getByText('Usar calculado',{exact:true}).count(),0);
assert.match(await page.locator('[data-rascunho-id]').first().innerText(),/123-1/);
assert.match(await page.locator('[data-rascunho-id]').last().innerText(),/123-2/);
await page.getByRole('button',{name:'Editar títulos',exact:true}).last().click();
assert.equal(await page.getByLabel('Valor, linha 1',{exact:true}).inputValue(),'60');
assert.equal(await page.getByLabel('Valor, linha 2',{exact:true}).inputValue(),'40');
await page.getByLabel('Valor, linha 1',{exact:true}).fill('55');
await page.getByLabel('Valor, linha 2',{exact:true}).fill('45');
await page.getByRole('button',{name:'Salvar',exact:true}).click();
assert.equal(await page.locator('[data-rascunho-id]').count(),2);
await page.getByRole('button',{name:'Remover',exact:true}).last().click();
assert.equal(await page.locator('[data-rascunho-id]').count(),1);
await page.getByRole('button',{name:'Editar títulos',exact:true}).click();
await page.getByRole('button',{name:'Adicionar linha',exact:true}).click();
await page.getByLabel('Valor, linha 2',{exact:true}).fill('45');
await page.getByLabel('Número do boleto, linha 2',{exact:true}).fill('123-2');
await page.getByRole('button',{name:'Salvar',exact:true}).click();
assert.equal(await page.locator('[data-rascunho-id]').count(),2);
await page.screenshot({path:`output/receber-lista-${ordem?'ordem':'vale'}.png`,fullPage:true});
await page.getByLabel('Bônus/Diferença recebimento').fill(String(diferenca));
await page.getByRole('button',{name:'Salvar pagamentos',exact:true}).click();
await page.getByRole('button',{name:'Sim',exact:true}).click();
await page.waitForFunction(()=>document.body.textContent.includes('Pagamentos salvos.'));
assert.equal(payload.pagamentos.length,1);assert.equal(payload.pagamentos[0].titulos.length,2);
assert.equal(payload.pagamentos[0].bonusDispensado,diferenca>0?-50:0);
assert.equal((payload.pagamentos[0].acrescimosDivida || []).reduce((s,a)=>s+a.valor,0),diferenca<0?200:0);
assert.equal(payload.pagamentos.flatMap(p=>p.alocacoes).reduce((s,a)=>s+a.valor,0),100);
if(ordem)assert.equal(payload.pagamentos[0].ordemCobrancaId,'o');
await page.close();
}
console.log('OK: vale e ordem, múltiplas linhas, automático/manual, números obrigatórios, bônus adicional e layout móvel.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
