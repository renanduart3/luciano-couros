const { buildSync }=require('esbuild');const fs=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const cliente={id:'c',nome:'Cliente teste',ativo:1};
 const products=[{id:'p',nome:'Material novo',precoVendaPadrao:1200},{id:'a',nome:'FLY amarelo',precoVendaPadrao:79.9},{id:'b',nome:'FLY laranja',precoVendaPadrao:79.9}].map(p=>({...p,ativo:1,unidade:'metro',custoPadrao:10}));
 const venda={id:'v',clienteId:'c',clienteNome:cliente.nome,numeroSequencial:1102,data:'2026-11-14',subtotal:894.78,totalLiquido:894.78,desconto:0,valorPago:0,saldoRestante:894.78,formaPagamento:'vale',vencimento:'2099-12-31',items:products.map((p,i)=>({id:'i'+i,produtoId:p.id,descricao:p.nome,unidade:'metro',precoUnitario:p.precoVendaPadrao,quantidade:[1,-2.17,-1.65][i],total:[1200,-173.38,-131.84][i],itemOrigemId:i?'origem'+i:undefined,desconto:0}))};
 const js=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{VendaRapidaView}from'./src/components/VendaRapidaView';createRoot(document.getElementById('root')).render(<VendaRapidaView compact ocultarSeletorCliente clienteExterno={${JSON.stringify(cliente)}} vendaEmEdicao={${JSON.stringify(venda)}} onSaleSaved={()=>{}} onNavigateToView={()=>{}}/>);`},bundle:true,write:false,loader:{'.png':'dataurl'}}).outputFiles[0].text;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const p=await browser.newPage({viewport:{width:1366,height:1000}});const errors=[];const payloads=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{const req=r.request(),path=new URL(req.url()).pathname;let data=[];
   if(req.method()==='PUT'){payloads.push(req.postDataJSON());data=venda;}
   else if(path==='/api/produtos')data=products;else if(path==='/api/clientes')data=[cliente];else if(path.endsWith('/proximo-numero'))data={proximoNumero:1103};else if(path.endsWith('/historico'))data={vendas:[],pagamentos:[]};else if(path.endsWith('/orcamento-vigente'))data=null;else if(path.endsWith('/resumo'))data={saldoBonus:0};else if(path.includes('seguranca'))data={pinConfigurado:true};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto('http://localhost');await p.setContent('<div id="root" style="padding:24px"></div>');await p.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css')),'utf8')});await p.addScriptTag({content:js});
  await p.getByRole('textbox',{name:'Quantidade de FLY laranja',exact:true}).waitFor();
  await p.getByPlaceholder('Senha do gerente para salvar').fill('Teste123');await p.getByRole('button',{name:/salvar alterações/i}).click();await p.getByText('Venda #1102 atualizada com sucesso.',{exact:true}).waitFor();
  assert.equal(payloads[0].totalEsperado,894.78);
  await p.getByRole('textbox',{name:'Quantidade de FLY laranja',exact:true}).fill('-1,25');
  const desconto=p.getByText('Desconto Geral (%):',{exact:true}).locator('..').getByRole('textbox');await desconto.fill('10');
  await p.getByPlaceholder('Senha do gerente para salvar').fill('Teste123');await p.getByRole('button',{name:/salvar alterações/i}).click();await p.waitForFunction(()=>document.body.textContent.includes('atualizada com sucesso'));
  assert.equal(payloads.length,2);assert.equal(payloads[1].totalEsperado,806.74);assert.equal(payloads[1].desconto,120);
  assert.deepEqual(errors,[]);fs.mkdirSync('output',{recursive:true});await p.screenshot({path:'output/devolucao-arredondamento.png',fullPage:true});
  console.log('OK: tela e payload coincidem com devoluções fracionadas e após ajustar quantidade e desconto.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
