// Copiar e enviar a seleção da planilha como imagem. Requer `npm run build` (CSS) e Playwright.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{buildSync}=require('esbuild');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PlanilhasView}from'./src/components/PlanilhasView';createRoot(document.getElementById('root')).render(<PlanilhasView/>);`},bundle:true,write:false,loader:{'.css':'empty'}}).outputFiles[0].text;
const doc={id:'p1',nome:'Estoque couro',versao:1,updatedAt:'2026-11-27',celulas:{A1:'Produto',B1:'Qtd',C1:'Valor',A2:'Bota',B2:'3',C2:'=B2*40',A3:'Cinto',B3:'5',C3:'=B3*15'},moedas:['C2','C3'],formatos:{A1:{negrito:true},C3:{cor:'vermelho'}},larguras:{}};
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const errors=[],enviados=[];let conectado=true;
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:1000},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{
   const req=r.request(),url=new URL(req.url()).pathname;let data={},status=200;
   if(url==='/api/planilhas')data=[{id:doc.id,nome:doc.nome,versao:1,updatedAt:doc.updatedAt}];
   else if(url==='/api/planilhas/p1')data=doc;
   else if(url==='/api/automacao/contatos-whatsapp')data={conectado,contatos:[{id:'u1',nome:'Luciano',numero:'5511999990000'},{id:'u2',nome:'Vendedor',numero:'5511988887777'}]};
   else if(url==='/api/automacao/enviar-imagem'){enviados.push(req.postDataJSON());data={ok:true};}
   return r.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto('http://localhost');await p.setContent('<main id="root" style="padding:20px"></main>');
  await p.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css')),'utf8')});await p.addScriptTag({content:script});
  await p.locator('[data-celula="A1"]').waitFor();
  // Seleciona A1:C3 com Shift + clique.
  await p.locator('[data-celula="A1"]').click();await p.locator('[data-celula="C3"]').click({modifiers:['Shift']});
  // Em http://localhost o contexto é seguro: a imagem vai para a área de transferência.
  await p.getByRole('button',{name:'Copiar como imagem',exact:true}).click();
  await p.getByText('Imagem copiada. Cole com Ctrl+V no WhatsApp ou no e-mail.').waitFor();
  const copiada=await p.evaluate(async()=>{const[item]=await navigator.clipboard.read();const blob=await item.getType('image/png');const bmp=await createImageBitmap(blob);return{tipos:item.types,w:bmp.width,h:bmp.height};});
  assert.deepEqual(copiada.tipos,['image/png']);
  // 3 colunas de 120px (+1 de borda) e 3 linhas de 26px, na escala 2x.
  assert.equal(copiada.h,(3*26+1)*2);assert.ok(copiada.w>300,'largura '+copiada.w);
  // Envio pelo WhatsApp: prévia, contato e legenda.
  await p.getByRole('button',{name:'Enviar imagem no WhatsApp',exact:true}).click();
  const dialogo=p.getByRole('dialog',{name:'Enviar imagem pelo WhatsApp'});await dialogo.waitFor();
  await dialogo.getByRole('img',{name:'Prévia da seleção'}).waitFor();
  const enviar=dialogo.getByRole('button',{name:'Enviar',exact:true});assert.equal(await enviar.isDisabled(),true);
  await dialogo.getByRole('combobox',{name:'Contato'}).selectOption('u2');
  assert.equal(await dialogo.getByRole('textbox',{name:'Legenda (opcional)'}).inputValue(),'Estoque couro · A1:C3');
  await enviar.click();await dialogo.getByText('Imagem enviada para Vendedor.').waitFor();
  assert.equal(enviados.length,1);assert.equal(enviados[0].id,'u2');assert.equal(enviados[0].nome,'estoque-couro-A1-C3.png');
  const png=Buffer.from(enviados[0].imagem,'base64');assert.equal(png.subarray(1,4).toString(),'PNG');
  const saida=path.join(require('node:os').tmpdir(),'planilha-selecao.png');fs.writeFileSync(saida,png);console.log('imagem: '+saida);
  await dialogo.getByRole('button',{name:'Fechar',exact:true}).first().click();await dialogo.waitFor({state:'detached'});
  // WhatsApp desconectado: aviso e envio bloqueado.
  conectado=false;await p.getByRole('button',{name:'Enviar imagem no WhatsApp',exact:true}).click();
  await p.getByText(/WhatsApp da Automação está desconectado/).waitFor();
  assert.equal(await p.getByRole('dialog').getByRole('button',{name:'Enviar',exact:true}).isDisabled(),true);
  await p.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('ok: copiar e enviar seleção como imagem');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exit(1);});
