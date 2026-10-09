const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildSync} = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function main() {
  const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {ValeDetalhesModal} from './src/components/ValeDetalhesModal';
    import {OrdemCobrancaDetalhesModal} from './src/components/OrdensCobrancaView';
    function Test(){ const [doc,setDoc]=useState(window.__doc);return window.__tipo==='vale'?<ValeDetalhesModal vale={doc} onClose={()=>{}} onUpdated={setDoc}/>:<OrdemCobrancaDetalhesModal ordem={doc} onClose={()=>{}} onChanged={setDoc}/>;}
    createRoot(document.getElementById('root')).render(<Test/>);
  `},bundle:true,platform:'browser',format:'iife',write:false,loader:{'.png':'dataurl'}}).outputFiles[0].text;
  const css=fs.readFileSync(path.join('dist/assets',fs.readdirSync('dist/assets').find(f=>f.endsWith('.css'))),'utf8');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const errors=[];
  const output=path.resolve('output/validacao-v1.39.0');fs.mkdirSync(output,{recursive:true});
  try {
    for(const tipo of ['vale','ordem']) {
      let doc=tipo==='vale'?{id:'v',clienteId:'c',clienteNome:'Cliente de teste',clienteDocumento:'123.456.789-01',numeroSequencial:138,data:'2026-10-09',vencimento:'2026-10-30',totalLiquido:100,valorPago:0,saldoRestante:100,status:'pendente',items:[],recebimentos:[],devolucoes:[],observacoes:'Nota anterior'}:{id:'o',clienteId:'c',clienteNome:'Cliente de teste',clienteDocumento:'123.456.789-01',numeroSequencial:29,dataEmissao:'2026-10-09',status:'aberta',totalOriginal:100,saldo:100,vales:[],parcelas:[],pagamentos:[],eventos:[],observacao:'Nota anterior'};
      const page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',error=>errors.push(error.message));
      let pagamento;
      await page.route('**/api/**',async route=>{
        const url=new URL(route.request().url());let result={};
        if(url.pathname.endsWith('/carteira/resumo'))result={saldoBonus:380};
        else if(url.pathname.endsWith('/anotacao')) {const body=route.request().postDataJSON();assert.equal(body.anterior,'Nota anterior');doc={...doc,[tipo==='vale'?'observacoes':'observacao']:body.texto};result=doc;}
        else if(url.pathname.endsWith('/carteira/recebimentos')) {
          pagamento=route.request().postDataJSON();doc={...doc,valorPago:100,saldoRestante:0,status:'paga',recebimentos:[{id:'r',recebimentoId:'r',data:pagamento.data,valorRecebido:80,valorAplicado:100,bonusUtilizado:20,bonusGerado:0,formaPagamento:'pix',status:'ativo',statusPagamento:'compensado',titulos:[],alocacoes:[{vendaId:'v',valor:100}],historico:[]}]};result={id:'r',valorAplicado:100,bonusGerado:0};
        } else if(url.pathname.endsWith('/vendas/v'))result=doc;
        await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
      });
      await page.route('http://notas.test/',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'}));
      await page.goto('http://notas.test/');await page.addStyleTag({content:css});await page.evaluate(({doc,tipo})=>{window.__doc=doc;window.__tipo=tipo;},{doc,tipo});await page.addScriptTag({content:script});
      await page.getByRole('button',{name:'Anotações',exact:true}).click();
      const nota=page.getByRole('textbox',{name:'Anotações',exact:true});assert.equal(await nota.inputValue(),'Nota anterior');
      await nota.fill('Combinar entrega sexta-feira.');await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();await page.getByText('Anotação salva.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.getByRole('button',{name:'Anotações',exact:true}).click();assert.equal(await nota.inputValue(),'Combinar entrega sexta-feira.');
      await page.screenshot({path:path.join(output,tipo+'-anotacoes.png')});
      if(tipo==='vale') {
        assert.ok((await page.locator('header').first().innerText()).includes('123.456.789-01'));
        await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.getByRole('button',{name:'Adicionar pagamento',exact:true}).click();
        const dialog=page.getByRole('dialog');await dialog.waitFor();
        assert.equal(await dialog.getByText('Distribuição automática',{exact:false}).count(),0);assert.equal(await dialog.getByRole('textbox',{name:'Observação',exact:false}).count(),0);
        const before=await dialog.boundingBox();const toggle=dialog.getByRole('switch');await toggle.click();
        const after=await dialog.boundingBox();assert.equal(after.height,before.height,'Bonus keeps the same dialog height');assert.equal(after.y,before.y,'Bonus does not shift the dialog');
        const bonus=dialog.getByRole('textbox',{name:'Bônus a utilizar',exact:true});await bonus.fill('20,00');assert.equal(await dialog.getByRole('textbox',{name:'Valor do pagamento',exact:true}).inputValue(),'80,00');
        const bonusBox=await bonus.boundingBox(),toggleBox=await toggle.boundingBox();assert.ok(Math.abs((bonusBox.y+bonusBox.height/2)-(toggleBox.y+toggleBox.height/2))<2,'Bonus controls stay on the same line');
        await page.screenshot({path:path.join(output,'pagamento.png')});
        await dialog.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await page.locator('[data-recebimento-id="r"]').waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(pagamento.valorRecebido,80);assert.equal(pagamento.bonusUtilizado,20);assert.equal(pagamento.alocacoes[0].valor,100);
      }
      await page.close();console.log('OK: '+tipo+' — anotações persistem ao trocar de aba; cabeçalho, bônus sem deslocamento e atualização do grid conferidos.');
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
