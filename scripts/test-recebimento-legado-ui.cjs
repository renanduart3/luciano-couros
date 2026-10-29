const {buildSync}=require('esbuild');
const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PagamentoValesModal}from'./src/components/PagamentoValesModal';import{AuthProvider}from'./src/auth/AuthContext';const vale={id:'v1',numeroSequencial:12,saldoRestante:520,recebimentos:[]};createRoot(document.getElementById('root')).render(<AuthProvider value={{id:'g',perfil:'administrador'} as any}><PagamentoValesModal clienteId="c" clienteNome="Rafael Luiz Fernandes Carteira" clienteDocumento="12345678901" vales={[vale as any]} onClose={()=>{}} onSaved={()=>{}}/></AuthProvider>);`},bundle:true,write:false}).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});let enviados=[],erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.route('**/*',r=>{const url=new URL(r.request().url());let data={saldoBonus:0};if(url.pathname.endsWith('/recebimentos-lote')){enviados.push(r.request().postDataJSON());data={recebimentos:[{id:'r'}]};}return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 const abrir=async()=>{await p.goto('http://localhost');await p.setContent('<div id="root"></div>');await p.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(x=>x.endsWith('.css')),'utf8')});await p.addScriptTag({content:script});};
 await abrir();await p.getByLabel('Valor do pagamento',{exact:true}).fill('400,00');await p.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
 assert.equal(await p.getByLabel('Bônus/Diferença recebimento',{exact:true}).inputValue(),'-120,00');
 await p.getByRole('button',{name:'Zerar bônus ou saldo devedor'}).click();await p.getByRole('button',{name:'Salvar pagamentos'}).click();
 await p.getByRole('alertdialog').waitFor();assert.equal(enviados.length,0);assert.match(await p.getByRole('alertdialog').innerText(),/CERTIFICAÇÃO DOS VALORES/);
 await p.screenshot({path:'output/recebimento-confirmacao.png'});await p.getByRole('button',{name:'Não',exact:true}).click();assert.equal(enviados.length,0);
 await p.getByRole('button',{name:'Salvar pagamentos'}).click();await p.getByRole('button',{name:'Sim',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('[role=alertdialog]'));
 assert.equal(enviados[0].pagamentos[0].descontoRecebimento,120);assert.equal(enviados[0].pagamentos[0].valorRecebido,400);
 await abrir();await p.locator('.receber-forma select').selectOption('cheque_terceiro');
 const inputs=await p.locator('.receber-titulo input').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label') || e.closest('label')?.textContent));assert.deepEqual(inputs,['Nome, linha 1','CPF/CNPJ, linha 1','Valor, linha 1','Vencimento, linha 1','Número do documento, linha 1']);
 assert.equal(await p.getByLabel('Valor do pagamento',{exact:true}).count(),0);
 await p.getByLabel('Nome, linha 1',{exact:true}).fill('Maria da Silva');await p.getByLabel('CPF/CNPJ, linha 1',{exact:true}).fill('12345678901');await p.getByLabel('Valor, linha 1',{exact:true}).fill('530');await p.getByLabel('Vencimento, linha 1',{exact:true}).fill('2026-12-10');await p.getByLabel('Número do documento, linha 1',{exact:true}).fill('CH-10');
 await p.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();await p.getByText('CHEQUE TERCEIRO · Maria da Silva',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Adicionar linha',exact:true}).count(),0);
 await p.getByRole('button',{name:'Zerar bônus ou saldo devedor'}).click();await p.screenshot({path:'output/recebimento-cheque.png'});await p.getByRole('button',{name:'Salvar pagamentos'}).click();await p.getByRole('button',{name:'Sim',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('[role=alertdialog]'));
 assert.equal(enviados[1].pagamentos[0].bonusDispensado,10);assert.equal(enviados[1].pagamentos[0].titulos.length,1);assert.deepEqual(erros,[]);
 console.log('OK: diferença negativa/positiva, confirmação Sim/Não, campos ordenados, uma linha e nome do terceiro.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
