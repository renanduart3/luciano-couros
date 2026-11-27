// AutoSoma e Média no topo da planilha, como no Excel: o resultado vai para a célula logo abaixo da seleção.
const assert=require('node:assert/strict'),fs=require('node:fs');const{buildSync}=require('esbuild');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PlanilhasView}from'./src/components/PlanilhasView';createRoot(document.getElementById('root')).render(<PlanilhasView/>);`},bundle:true,write:false,loader:{'.css':'empty'}}).outputFiles[0].text;
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const errors=[];
 try{
  const p=await browser.newPage({viewport:{width:1366,height:768}});p.on('pageerror',e=>errors.push(e.message));
  let doc={id:'p1',nome:'Cheques',versao:1,updatedAt:'2026-11-27',celulas:{},moedas:[],formatos:{}};
  await p.route('**/*',r=>{
   const req=r.request(),parts=new URL(req.url()).pathname.split('/').filter(Boolean);let data={};
   if(parts[1]==='planilhas'){
    if(!parts[2])data=[{id:doc.id,nome:doc.nome,versao:doc.versao,updatedAt:doc.updatedAt}];
    else if(req.method()==='GET')data=doc;
    else{doc={...req.postDataJSON(),versao:doc.versao+1};data=doc;}
   }
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto('http://localhost');await p.setContent('<main id="root" style="padding:20px"></main>');
  await p.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css')),'utf8')});
  await p.addScriptTag({content:script});
  const celula=id=>p.locator(`[data-celula="${id}"]`);
  const digitar=async(id,valor)=>{await celula(id).click();await p.keyboard.type(valor);await p.keyboard.press('Enter');};
  await celula('A1').waitFor();
  for(const [id,v] of [['A1','12'],['A2','12'],['A3','-12'],['A4','100']])await digitar(id,v);
  // 1) Seleciona os valores e clica AutoSoma: resultado logo abaixo.
  await celula('A1').click();await celula('A4').click({modifiers:['Shift']});
  await p.getByRole('button',{name:'AutoSoma',exact:true}).click();
  await p.getByRole('button',{name:'A5: 112',exact:true}).waitFor();
  assert.equal(await p.getByLabel('Conteúdo de A5',{exact:true}).inputValue(),'=SOMA(A1:A4)');
  // 2) Célula vazia abaixo dos números: AutoSoma encontra os valores acima.
  for(const [id,v] of [['B1','10'],['B2','5,5']])await digitar(id,v);
  await celula('B3').click();
  await p.getByRole('button',{name:'AutoSoma',exact:true}).click();
  await p.getByRole('button',{name:'B3: 15,50',exact:true}).waitFor();
  // 3) Média de datas: seleciona as datas e clica Média.
  for(const [id,v] of [['C1','10/11/2026'],['C2','20/11/2026'],['C3','30/11/2026']])await digitar(id,v);
  await celula('C1').click();await celula('C3').click({modifiers:['Shift']});
  const resumo=p.getByRole('status',{name:'Resumo da seleção',exact:true});
  assert.match(await resumo.textContent(),/Data média: 20\/11\/2026/);
  await p.getByRole('button',{name:'Média',exact:true}).click();
  await p.getByRole('button',{name:'C4: 20/11/2026',exact:true}).waitFor();
  // 4) Várias colunas: um total por coluna, na linha abaixo.
  for(const [id,v] of [['E1','1'],['E2','2'],['F1','3'],['F2','4']])await digitar(id,v);
  await celula('E1').click();await celula('F2').click({modifiers:['Shift']});
  await p.getByRole('button',{name:'AutoSoma',exact:true}).click();
  await p.getByRole('button',{name:'E3: 3',exact:true}).waitFor();await p.getByRole('button',{name:'F3: 7',exact:true}).waitFor();
  // 5) Uma linha selecionada: resultado à direita.
  for(const [id,v] of [['H1','2'],['I1','3']])await digitar(id,v);
  await celula('H1').click();await celula('I1').click({modifiers:['Shift']});
  await p.getByRole('button',{name:'AutoSoma',exact:true}).click();
  await p.getByRole('button',{name:'J1: 5',exact:true}).waitFor();
  await p.getByRole('button',{name:'Salvar',exact:true}).click();await p.getByText('Planilha salva.',{exact:true}).waitFor();
  assert.equal(doc.celulas.A5,'=SOMA(A1:A4)');assert.equal(doc.celulas.C4,'=MÉDIA(C1:C3)');assert.equal(doc.celulas.F3,'=SOMA(F1:F2)');assert.equal(doc.celulas.J1,'=SOMA(H1:I1)');
  // Barra superior compacta: a grade ocupa a maior parte da tela.
  const grade=await p.locator('.planilhas-grade').boundingBox(),barra=await p.getByRole('toolbar',{name:'Ferramentas da planilha'}).boundingBox();
  assert.ok(barra.height<=60,'barra de ferramentas em uma linha: '+barra.height);
  assert.ok(grade.height>=450,'grade com altura útil: '+grade.height);
  fs.mkdirSync('output',{recursive:true});await p.screenshot({path:'output/planilhas-autosoma.png'});
  assert.deepEqual(errors,[]);
  console.log('OK: AutoSoma abaixo da seleção, AutoSoma em célula vazia, média de datas, várias colunas, linha e barra compacta (grade '+Math.round(grade.height)+' px).');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
