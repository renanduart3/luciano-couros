const {buildSync}=require('esbuild'),fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const js=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ComprasView}from'./src/components/ComprasView';import{AuthProvider}from'./src/auth/AuthContext';createRoot(document.getElementById('root')).render(<AuthProvider value={{id:'g',perfil:'administrador'} as any}><ComprasView/></AuthProvider>);`},bundle:true,write:false,loader:{'.png':'dataurl'}}).outputFiles[0].text;
 const fornecedor={id:'f1',nome:'Fornecedor teste',ativo:1};const produto={id:'p1',nome:'Couro teste',ativo:1,unidade:'metro',custoPadrao:10};
 const orcamento={id:'o1',numeroSequencial:15,fornecedorId:'f1',fornecedorNome:fornecedor.nome,status:'aberto',data:'2026-10-29',validade:'2026-11-05',desconto:0,total:20,items:[{produtoId:'p1',produtoNome:produto.nome,quantidade:2,unidade:'metro',custoEstimado:10}]};
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const path=new URL(r.request().url()).pathname;let data=[];if(path==='/api/fornecedores')data=[fornecedor];if(path==='/api/produtos')data=[produto];if(path==='/api/orcamentos-compra')data=[orcamento];return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await p.goto('http://localhost');await p.setContent('<div id="root" style="padding:24px"></div>');await p.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css')),'utf8')});await p.addScriptTag({content:js});
 const nav=p.getByRole('navigation',{name:'Áreas de compras'});assert.deepEqual(await nav.getByRole('button').allTextContents(),['Orçamento','Compra','Histórico','Vales']);
 await p.getByRole('navigation',{name:'Abas de orçamento'}).waitFor();await p.locator('#compras-view select').selectOption('f1');await p.getByText('Novo orçamento ao fornecedor',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Finalizar compra',exact:true}).count(),0);
 await nav.getByRole('button',{name:'Compra',exact:true}).click();await p.getByRole('button',{name:'Finalizar compra',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Salvar orçamento',exact:true}).count(),0);assert.equal(await p.getByRole('navigation',{name:'Abas de orçamento'}).count(),0);
 await p.screenshot({path:'output/compras-aba-compra.png'});
 await nav.getByRole('button',{name:'Orçamento',exact:true}).click();await p.getByRole('button',{name:'Orçamentos abertos',exact:true}).click();await p.getByRole('button',{name:'Editar',exact:true}).click();await p.getByText('Editar orçamento #15',{exact:true}).waitFor();
 assert.equal(await p.getByLabel('Quantidade de Couro teste').first().inputValue(),'2');await p.getByRole('button',{name:'Levar para conferência'}).click();await p.getByRole('button',{name:'Finalizar compra',exact:true}).waitFor();assert.equal(await p.getByLabel('Quantidade de Couro teste').first().inputValue(),'2');
 await nav.getByRole('button',{name:'Orçamento',exact:true}).click();await p.getByText('Editar orçamento #15',{exact:true}).waitFor();await p.screenshot({path:'output/compras-aba-orcamento.png'});
 await nav.getByRole('button',{name:'Histórico',exact:true}).click();await p.getByText('Histórico de compras',{exact:true}).waitFor();await nav.getByRole('button',{name:'Vales',exact:true}).click();await p.getByRole('heading',{name:'Vales de compras'}).waitFor();
 await p.setViewportSize({width:390,height:844});await nav.getByRole('button',{name:'Orçamento',exact:true}).click();await p.getByRole('button',{name:'Orçamentos abertos',exact:true}).click();assert.equal(await nav.getByRole('button').count(),4);assert.deepEqual(errors,[]);
 console.log('OK: quatro abas na ordem solicitada, subabas, edição, transferência para compra, preservação do orçamento e navegação móvel.');
 }finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
