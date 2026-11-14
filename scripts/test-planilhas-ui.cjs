const assert=require('node:assert/strict'),fs=require('node:fs');const{buildSync}=require('esbuild');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PlanilhasView}from'./src/components/PlanilhasView';createRoot(document.getElementById('root')).render(<PlanilhasView/>);`},bundle:true,write:false,loader:{'.css':'empty'}}).outputFiles[0].text;
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const docs=new Map();let seq=0;const errors=[];
 try{
  const p=await browser.newPage({viewport:{width:1366,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{
   const req=r.request(),parts=new URL(req.url()).pathname.split('/').filter(Boolean);let data={},status=200;
   if(parts[1]==='planilhas'){
    const id=parts[2],action=parts[3];const body=req.method()==='GET'?{}:req.postDataJSON();
    if(!id&&req.method()==='GET')data=[...docs.values()].map(({id,nome,versao,updatedAt})=>({id,nome,versao,updatedAt}));
    else if(!id&&req.method()==='POST'){
     if(docs.size>=3){status=409;data={error:'Limite de três planilhas.'};}
     else{data={id:'p'+(++seq),nome:body.nome,versao:1,updatedAt:'2026-11-14',celulas:{},moedas:[]};docs.set(data.id,data);}
    }else if(req.method()==='GET')data=docs.get(id);
    else if(action){
     if(body.senha!=='Teste123'){status=403;data={error:'Senha do gerente inválida.'};}
     else if(body.versao!==docs.get(id).versao){status=409;data={error:'Planilha alterada em outra sessão.'};}
     else if(action==='excluir'){docs.delete(id);data={success:true};}
     else{data={...docs.get(id),celulas:{},moedas:[],formatos:{},versao:body.versao+1};docs.set(id,data);}
    }else{
     if(body.versao!==docs.get(id).versao){status=409;data={error:'Planilha alterada em outra sessão.'};}
     else{data={...body,versao:body.versao+1};docs.set(id,data);}
    }
   }
   return r.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  async function mount(){await p.goto('http://localhost');await p.setContent('<main id="root" style="padding:20px"></main>');await p.addStyleTag({content:fs.readFileSync('dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css')),'utf8')});await p.addScriptTag({content:script});}
  await mount();await p.getByText('Crie uma planilha para começar.',{exact:true}).waitFor();
  assert.doesNotMatch(await p.locator('body').innerText(),/protótipo|simulação|demonstração|exemplo/i);
  await p.getByRole('button',{name:'Nova planilha',exact:true}).click();await p.getByRole('textbox',{name:'Nome da planilha',exact:true}).fill('Controle de materiais');
  let bar=p.getByRole('textbox',{name:'Conteúdo de A1',exact:true});await bar.fill('12,5');await bar.press('Enter');
  await p.locator('[data-celula="B1"]').dblclick();await p.getByRole('textbox',{name:'Editar B1',exact:true}).fill('=A1*2');await p.getByRole('textbox',{name:'Editar B1',exact:true}).press('Enter');
  const estilo=seletor=>p.locator(seletor).evaluate(e=>({cor:getComputedStyle(e).color,peso:getComputedStyle(e).fontWeight}));
  await p.locator('[data-celula="A1"]').click();
  await p.getByRole('button',{name:'Negrito',exact:true}).click();assert.equal((await estilo('[data-celula="A1"]')).peso,'700');
  await p.getByRole('button',{name:'Sem negrito',exact:true}).click();assert.equal((await estilo('[data-celula="A1"]')).peso,'400');
  await p.getByRole('button',{name:'Negrito',exact:true}).click();
  for(const [cor,rgb] of [['preto','rgb(0, 0, 0)'],['vermelho','rgb(220, 38, 38)'],['verde','rgb(21, 128, 61)'],['amarelo','rgb(202, 138, 4)']]){
    await p.getByRole('button',{name:'Cor do texto: '+cor,exact:true}).click();assert.equal((await estilo('[data-celula="A1"]')).cor,rgb);
  }
  await p.getByRole('button',{name:'Cor do texto: vermelho',exact:true}).click();
  await p.locator('[data-celula="B1"]').click();await p.getByRole('button',{name:'Sem negrito',exact:true}).click();await p.getByRole('button',{name:'Cor do texto: verde',exact:true}).click();
  await p.getByRole('button',{name:'Salvar',exact:true}).click();await p.getByText('Planilha salva.',{exact:true}).waitFor();
  assert.equal(docs.get('p1').celulas.B1,'=A1*2');
  assert.deepEqual(docs.get('p1').formatos,{A1:{negrito:true,cor:'vermelho'},B1:{negrito:false,cor:'verde'}});
  await mount();await p.getByRole('button',{name:'B1: 25',exact:true}).waitFor();assert.equal(await p.getByRole('textbox',{name:'Nome da planilha',exact:true}).inputValue(),'Controle de materiais');
  assert.deepEqual(await estilo('[data-celula="A1"]'),{cor:'rgb(220, 38, 38)',peso:'700'});
  assert.deepEqual(await estilo('[data-celula="B1"]'),{cor:'rgb(21, 128, 61)',peso:'400'});
  const resumo=p.getByRole('status',{name:'Resumo da seleção',exact:true});
  await p.locator('[data-celula="A1"]').click();await p.locator('[data-celula="B1"]').click({modifiers:['Shift']});
  assert.match(await resumo.textContent(),/A1:B1/);assert.match(await resumo.textContent(),/Média: 18,75/);assert.match(await resumo.textContent(),/Soma: 37,50/);
  assert.ok(await p.getByRole('button',{name:'Salvar',exact:true}).isDisabled(),'Selecionar não modifica os dados');
  await p.getByRole('button',{name:'SOMA',exact:true}).click();
  await p.getByRole('button',{name:'C1: 37,50',exact:true}).waitFor();
  await p.locator('[data-celula="A1"]').dragTo(p.locator('[data-celula="B1"]'));
  await p.getByRole('button',{name:'MEDIANA',exact:true}).click();
  await p.getByRole('button',{name:'D1: 18,75',exact:true}).waitFor();
  await p.locator('[data-celula="C1"]').click();
  await p.keyboard.type('=');
  await p.locator('[data-celula="A1"]').click();
  await p.keyboard.type('+');
  await p.locator('[data-celula="B1"]').click();
  await p.keyboard.press('Enter');
  await p.getByRole('button',{name:'C1: 37,50',exact:true}).waitFor();
  await p.locator('[data-celula="C1"]').click();
  const formulaBar = p.getByLabel('Conteúdo de C1',{exact:true});
  await formulaBar.fill('=MEDIANA(');
  await p.locator('[data-celula="A1"]').dragTo(p.locator('[data-celula="B1"]'));
  await p.getByRole('button',{name:'C1: 18,75',exact:true}).waitFor();
  await formulaBar.fill('=');
  await p.locator('[data-celula="B1"]').dragTo(p.locator('[data-celula="A1"]'));
  assert.equal(await formulaBar.inputValue(),'=A1:B1');
  await p.getByRole('button',{name:'SOMA',exact:true}).click();
  await p.getByRole('button',{name:'C1: 37,50',exact:true}).waitFor();
  await formulaBar.fill('=');
  await p.locator('[data-celula="B1"]').dragTo(p.locator('[data-celula="B5"]'));
  assert.equal(await formulaBar.inputValue(),'=B1:B5');
  await p.keyboard.type('MEDIANA');
  await formulaBar.press('Enter');
  await p.getByRole('button',{name:'C1: 25',exact:true}).waitFor();
  await formulaBar.fill('=');
  await p.locator('[data-celula="A1"]').dragTo(p.locator('[data-celula="B2"]'));
  assert.equal(await formulaBar.inputValue(),'=');
  await formulaBar.fill('=MÉDIA');
  await p.locator('[data-celula="A1"]').dragTo(p.locator('[data-celula="B1"]'));
  await p.getByRole('button',{name:'C1: 18,75',exact:true}).waitFor();
  await p.getByRole('button',{name:'Salvar',exact:true}).click();
  await p.getByText('Planilha salva.',{exact:true}).waitFor();
  await p.locator('[data-celula="A10"]').click();
  await p.keyboard.press('=');
  await p.locator('[data-celula="B1"]').dragTo(p.locator('[data-celula="B5"]'));
  assert.equal(await p.getByLabel('Conteúdo de A10',{exact:true}).inputValue(),'=B1:B5');
  await p.keyboard.press('Enter');
  await p.getByRole('button',{name:'A10: 25',exact:true}).waitFor();
  await p.getByRole('button',{name:'Salvar',exact:true}).click();
  await p.getByText('Planilha salva.',{exact:true}).waitFor();
  assert.equal(docs.get('p1').celulas.A10,'=SOMA(B1:B5)');
  await mount();
  await p.getByRole('button',{name:'A10: 25',exact:true}).waitFor();
  // Escape não deve gravar o texto descartado pela barra de fórmulas.
  await p.locator('[data-celula="A1"]').click();bar=p.getByRole('textbox',{name:'Conteúdo de A1',exact:true});await bar.fill('999');await bar.press('Escape');await p.locator('[data-celula="B1"]').click();assert.equal(await p.locator('[data-celula="A1"]').innerText(),'12,50');
  await p.getByRole('button',{name:'Nova planilha',exact:true}).click();await p.getByRole('textbox',{name:'Nome da planilha',exact:true}).waitFor();
  await p.getByRole('button',{name:'Nova planilha',exact:true}).click();await p.getByRole('navigation',{name:'Planilhas',exact:true}).getByRole('button',{name:'Planilha 3',exact:true}).waitFor();assert.ok(await p.getByRole('button',{name:'Nova planilha',exact:true}).isDisabled());
  await p.getByRole('navigation',{name:'Planilhas',exact:true}).getByRole('button',{name:'Controle de materiais',exact:true}).click();await p.getByRole('button',{name:'B1: 25',exact:true}).waitFor();
  // Colagem cheia, fórmulas até J1000 e virtualização: somente linhas visíveis no DOM.
  const rows=Array.from({length:1000},(_,i)=>Array.from({length:10},(_,c)=>c===9?`=SOMA(A${i+1}:I${i+1})`:String(i+1)).join('\t')).join('\n');
  const inicio=performance.now();
  await p.locator('[data-celula="A1"]').evaluate((e,text)=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);e.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));},rows);
  await p.getByRole('button',{name:'J1: 9',exact:true}).waitFor();console.log('Colagem/recálculo/atualização de 10.000 células no navegador: '+(performance.now()-inicio).toFixed(0)+' ms.');
  assert.ok(await p.locator('tr[data-linha]').count()<50);
  await p.locator('[data-celula="A1"]').click();await p.locator('[data-celula="B2"]').click({modifiers:['Shift']});
  assert.match(await resumo.textContent(),/A1:B2/);assert.match(await resumo.textContent(),/Números: 4/);assert.match(await resumo.textContent(),/Média: 1,50/);assert.match(await resumo.textContent(),/Soma: 6/);assert.match(await resumo.textContent(),/Mín.: 1/);assert.match(await resumo.textContent(),/Máx.: 2/);
  const inicioDrag=await p.locator('[data-celula="C3"]').boundingBox(),fimDrag=await p.locator('[data-celula="A1"]').boundingBox();
  await p.mouse.move(inicioDrag.x+20,inicioDrag.y+18);await p.mouse.down();await p.mouse.move(fimDrag.x+20,fimDrag.y+18,{steps:6});await p.mouse.up();
  assert.match(await resumo.textContent(),/A1:C3/);assert.match(await resumo.textContent(),/Números: 9/);assert.match(await resumo.textContent(),/Média: 2/);assert.match(await resumo.textContent(),/Soma: 18/);
  await p.locator('[data-celula="A1"]').click();await p.keyboard.press('Shift+ArrowDown');await p.keyboard.press('Shift+ArrowRight');
  assert.match(await resumo.textContent(),/A1:B2/);assert.match(await resumo.textContent(),/Soma: 6/);
  await p.keyboard.press('ArrowRight');assert.match(await resumo.textContent(),/Números: 1/);

  await p.getByRole('button',{name:'Salvar',exact:true}).click();await p.getByText('Planilha salva.',{exact:true}).waitFor();
  fs.mkdirSync('output',{recursive:true});await p.screenshot({path:'output/planilhas-producao-desktop.png',fullPage:true});
  await p.locator('.planilhas-grade').evaluate(e=>e.scrollTop=e.scrollHeight);
  await p.getByRole('button',{name:'J1000: 9.000',exact:true}).waitFor();assert.ok(await p.locator('tr[data-linha]').count()<50);
  await p.locator('[data-celula="J1000"]').click({modifiers:['Shift']});assert.match(await resumo.textContent(),/C2:J1000/);
  await p.locator('[data-celula="J1000"]').click();await p.keyboard.press('ArrowUp');await p.waitForFunction(()=>document.activeElement?.getAttribute('data-celula')==='J999');
  await p.getByRole('button',{name:'Limpar planilha',exact:true}).click();let dialog=p.getByRole('alertdialog');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(Object.keys(docs.get('p1').celulas).length,10000);
  await p.getByRole('button',{name:'Limpar planilha',exact:true}).click();dialog=p.getByRole('alertdialog');await dialog.getByLabel('Senha do gerente',{exact:true}).fill('errada');await dialog.getByRole('button',{name:'Confirmar limpeza',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(Object.keys(docs.get('p1').celulas).length,10000);
  await dialog.getByLabel('Senha do gerente',{exact:true}).fill('Teste123');await dialog.getByRole('button',{name:'Confirmar limpeza',exact:true}).click();await p.getByRole('button',{name:'A1: vazia',exact:true}).waitFor();assert.equal(Object.keys(docs.get('p1').celulas).length,0);assert.deepEqual(docs.get('p1').formatos,{});
  await p.getByRole('button',{name:'Excluir planilha',exact:true}).click();dialog=p.getByRole('alertdialog');await dialog.getByLabel('Senha do gerente',{exact:true}).fill('Teste123');await dialog.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();await p.getByRole('navigation',{name:'Planilhas',exact:true}).getByRole('button',{name:'Planilha 2',exact:true}).waitFor();assert.equal(docs.size,2);assert.ok(await p.getByRole('button',{name:'Nova planilha',exact:true}).isEnabled());
  // Alterações locais permanecem na tela se outra sessão salvou antes.
  const input=p.getByRole('textbox',{name:'Conteúdo de A1',exact:true});await input.fill('Meu ajuste');await input.press('Enter');docs.get('p2').versao++;
  await p.getByRole('button',{name:'Salvar',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(await p.locator('[data-celula="A1"]').textContent(),'Meu ajuste');
  await p.getByRole('navigation',{name:'Planilhas',exact:true}).getByRole('button',{name:'Planilha 3',exact:true}).click();await p.getByRole('alertdialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Nome da planilha',exact:true}).inputValue(),'Planilha 2');
  const terceira = p.getByRole('navigation',{name:'Planilhas'}).getByRole('button',{name:'Planilha 3'});
  await terceira.click();
  await p.getByRole('alertdialog').getByRole('button',{name:'Salvar',exact:true}).click();
  assert.equal(await input.inputValue(),'Meu ajuste');
  await terceira.click();
  await p.getByRole('alertdialog').getByRole('button',{name:'Descartar'}).click();
  await p.waitForFunction(() => document.querySelector('[aria-label="Nome da planilha"]').value === 'Planilha 3');
  await input.fill('Salvar antes de sair');
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('planilhas-before-leave',{cancelable:true,detail:valor=>{window.saidaPermitida=valor;}})));
  await p.getByRole('alertdialog').getByRole('button',{name:'Salvar',exact:true}).click();
  await p.waitForFunction(()=>window.saidaPermitida === true);
  assert.equal(docs.get('p3').celulas.A1,'Salvar antes de sair');
  await p.setViewportSize({width:390,height:844});assert.ok(await p.locator('body').evaluate(e=>e.scrollWidth<=innerWidth+1));
  fs.mkdirSync('output',{recursive:true});await p.screenshot({path:'output/planilhas-producao-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('OK: criação, edição, fórmulas, gravação/reabertura, três abas, colagem cheia, navegação na linha 1000, senha/cancelamento, conflitos, proteção de alterações e layout móvel.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
