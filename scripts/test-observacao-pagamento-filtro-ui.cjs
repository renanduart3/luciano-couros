const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const css = fs.readFileSync('dist/assets/' + fs.readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8');
const bundle = contents => buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents},bundle:true,write:false,loader:{'.png':'dataurl'},define:{__APP_VERSION__:'"teste"',__APP_BUILD_DATE__:'"teste"'}}).outputFiles[0].text;
async function main() {
 const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const errors=[];
 try {
  for (const tipo of ['vale','ordem']) {
   const page = await browser.newPage({viewport:{width:1366,height:900}});
   page.on('pageerror',e=>errors.push(e.message));
   let note='Observação existente', saves=0, posts=0;
   await page.route('**/*',r=>{
    const req=r.request();
    if(req.method()==='POST') posts++;
    if(req.url().endsWith('/observacao-pagamento')) {
     if(req.method()==='GET') return r.fulfill({contentType:'application/json',body:JSON.stringify({observacaoPagamento:note})});
     assert.equal(req.method(),'PUT'); const body=req.postDataJSON(); assert.equal(body.anterior,note); note=body.texto.trim(); saves++;
     return r.fulfill({contentType:'application/json',body:JSON.stringify({observacaoPagamento:note})});
    }
    return r.fulfill({contentType:'application/json',body:JSON.stringify({saldoBonus:0})});
   });
   await page.goto('http://localhost');await page.setContent('<div id="root"></div>');await page.addStyleTag({content:css});
   await page.addScriptTag({content:bundle(`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{PagamentoValesModal}from'./src/components/PagamentoValesModal';
    function Test(){const [open,setOpen]=useState(true); const [note,setNote]=useState('Observação existente'); return open ? <PagamentoValesModal clienteId="c" clienteNome="Cliente teste" vales={[{id:'v',numeroSequencial:17,saldoRestante:100,observacaoPagamento:note} as any]} ordem={${tipo==='ordem' ? "{id:'o',numeroSequencial:3,saldo:100,vales:[],observacaoPagamento:note} as any" : 'undefined'}} onClose={()=>setOpen(false)} onSaved={()=>{throw new Error('Salvar observação não deve atualizar o fluxo financeiro');}}/> : <button onClick={()=>setOpen(true)}>Reabrir</button>;} createRoot(document.getElementById('root')).render(<Test/>);`)});
   await page.getByRole('button',{name:'+ Adicionar pagamento',exact:true}).click();
   await page.getByRole('tab',{name:'Observação de pagamento',exact:true}).click();
   const field=page.getByRole('textbox',{name:'Observação de pagamento',exact:true});
   await field.waitFor();await page.waitForFunction(()=>!document.querySelector('textarea').disabled);
   assert.equal(await field.inputValue(),note);
   await field.fill('Texto único para todos os pagamentos');
   await page.getByRole('tab',{name:'Pagamentos',exact:true}).click();
   await page.getByRole('tab',{name:'Observação de pagamento',exact:true}).click();
   assert.equal(await field.inputValue(),'Texto único para todos os pagamentos');
   await page.getByRole('button',{name:'Salvar observação',exact:true}).click();
   await page.getByText('Observação de pagamento salva.',{exact:true}).waitFor();
   assert.equal(saves,1);assert.equal(posts,0);
   await page.getByRole('tab',{name:'Pagamentos',exact:true}).click();assert.equal(await page.locator('[data-rascunho-id]').count(),1);
   await page.getByRole('tab',{name:'Observação de pagamento',exact:true}).click();
   await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Reabrir',exact:true}).click();
   await page.getByRole('tab',{name:'Observação de pagamento',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('textarea').disabled);assert.equal(await field.inputValue(),note);
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.locator('.receber-painel').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   fs.mkdirSync('output',{recursive:true});await page.screenshot({path:`output/observacao-pagamento-${tipo}.png`,fullPage:true});
   await page.close();
  }
  const p=await browser.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errors.push(e.message));
  let reports=0;
  const items=[{id:'i1',descricao:'FLY VERMELHO',unidade:'metro'},{id:'i2',descricao:'METALIZADO CHAMPÁGNER',unidade:'metro'},{id:'i3',descricao:'BOTÃO AZUL',unidade:'unidade'}].map(i=>({...i,data:'2026-11-14',numeroSequencial:1083,quantidade:2,precoUnitario:10,valorVendaLiquido:20,custoTotal:10}));
  await p.route('**/*',r=>{
   const path=new URL(r.request().url()).pathname;let data={};
   if(path==='/api/clientes')data=[{id:'c',nome:'Cliente teste'}];
   else if(path==='/api/produtos'||path==='/api/fornecedores')data=[];
   else if(path==='/api/relatorios'){reports++;data={vendas:[],itensVendidos:items,pagamentos:[],vales:[],compras:[]};}
   return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto('http://localhost');await p.setContent('<div id="root"></div>');await p.addStyleTag({content:css});
  await p.addScriptTag({content:bundle(`import React from 'react';import{createRoot}from'react-dom/client';import{RelatoriosView}from'./src/components/RelatoriosView';createRoot(document.getElementById('root')).render(<RelatoriosView/>);`)});
  await p.getByRole('button',{name:'Vendas',exact:true}).click();await p.getByRole('button',{name:'Histórico do cliente',exact:true}).click();
  await p.getByTestId('relatorio-filtro-cliente').selectOption('c');
  await p.getByRole('cell',{name:'FLY VERMELHO',exact:true}).waitFor();
  const filter=p.getByRole('searchbox',{name:'Filtrar produtos do histórico'});
  const before=reports;
  await filter.fill('champagner');await p.getByRole('cell',{name:'METALIZADO CHAMPÁGNER',exact:true}).waitFor();assert.equal(await p.getByRole('cell',{name:'FLY VERMELHO',exact:true}).count(),0);
  await filter.fill('inexistente');await p.getByText('Nenhum item encontrado para os filtros selecionados.',{exact:true}).waitFor();
  await filter.fill('botao');await p.getByRole('button',{name:'Unidades / outros (1)',exact:true}).click();await p.getByRole('cell',{name:'BOTÃO AZUL',exact:true}).waitFor();
  await filter.fill('');await p.getByRole('button',{name:'Vendidos em metros (2)',exact:true}).click();await p.getByRole('cell',{name:'FLY VERMELHO',exact:true}).waitFor();
  assert.equal(reports,before,'Digitação deve filtrar sem novas requisições');
  await p.screenshot({path:'output/historico-filtro-produto.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('OK: observação salva e reaberta em vale/ordem; rascunho preservado entre abas; layout móvel; filtro instantâneo sem acentos, categorias e limpeza.');
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
