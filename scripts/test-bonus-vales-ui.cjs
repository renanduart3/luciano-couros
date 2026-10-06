const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
// Synthetic browser fixtures: API calls are intercepted; no application database is used.
async function main() {
  const css=fs.readFileSync(path.join('dist/assets',fs.readdirSync('dist/assets').find(f=>f.endsWith('.css'))),'utf8');
  const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {LinhaPagamento} from './src/components/LinhaPagamento';
    import {PagamentoValesModal} from './src/components/PagamentoValesModal';
    const f=window.__fixture;
    createRoot(document.getElementById('root')).render(f.tipo==='modal' ? <PagamentoValesModal clienteId="c" clienteNome="Teste" vales={[{id:'v',numeroSequencial:1,data:'2026-10-06',saldoRestante:100}]} onClose={()=>{}} onSaved={async()=>{}}/> : <table><tbody><LinhaPagamento pagamento={f.pagamento} iniciarEditando={!f.pagamento} clienteId="c" clienteNome="Teste" saldo={100} referencia="vale #1" alocar={valor=>[{vendaId:'v',valor}]} onSaved={async()=>{}}/></tbody></table>);
  `},bundle:true,platform:'browser',format:'iife',write:false,loader:{'.png':'dataurl'}}).outputFiles[0].text;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for (const tipo of ['linha','modal','existente']) {
      const page=await browser.newPage({viewport:{width:1000,height:850}});
      let enviado;
      await page.route('**/api/**',async route=>{
        if(route.request().method()==='POST') {enviado=route.request().postDataJSON(); await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Fim da simulação'})});return;}
        await route.fulfill({contentType:'application/json',body:JSON.stringify({saldoBonus:50})});
      });
      await page.route('http://bonus.test/',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'}));
      await page.goto('http://bonus.test/'); await page.addStyleTag({content:css});
      await page.evaluate(tipo=>window.__fixture={tipo,pagamento:tipo==='existente'?{id:'r',data:'2026-10-06',formaPagamento:'pix',valorRecebido:80,bonusUtilizado:20,status:'ativo',statusPagamento:'compensado',titulos:[],alocacoes:[]}:undefined},tipo);
      await page.addScriptTag({content:script});
      if(tipo==='existente') await page.getByRole('button',{name:'Editar',exact:true}).click();
      const toggle=page.getByRole('switch'); await toggle.waitFor();
      const bonus=page.getByRole('textbox',{name:tipo==='modal'?'Bônus a utilizar':'Bônus vale #1',exact:true});
      const cash=tipo==='modal'?page.getByRole('textbox',{name:'Valor do pagamento',exact:true}):page.getByRole('textbox',{name:'Valor vale #1',exact:true});
      assert.equal(await toggle.getAttribute('aria-checked'),tipo==='existente'?'true':'false');
      if(tipo==='existente') {
        assert.equal(await bonus.inputValue(),'20');
        await toggle.click(); assert.equal(await cash.inputValue(),'100,00');
      }
      assert.equal(await bonus.count(),0);
      assert.equal(await page.getByText('Saldo da carteira:',{exact:false}).count(),0);
      await toggle.click(); await bonus.waitFor();
      assert.ok((await page.getByText('Saldo da carteira:',{exact:false}).textContent()).includes(tipo==='existente'?'70,00':'50,00'));
      await bonus.fill('20,00'); assert.equal(await cash.inputValue(),'80,00');
      await toggle.click(); assert.equal(await bonus.count(),0); assert.equal(await cash.inputValue(),'100,00');
      await toggle.click(); assert.equal(await bonus.inputValue(),'');
      await bonus.fill('20,00');
      if(tipo!=='existente') {
        await page.getByRole('button',{name:tipo==='modal'?'Registrar pagamento':'Registrar',exact:true}).click();
        await page.getByText('Fim da simulação',{exact:true}).waitFor();
        assert.equal(enviado.valorRecebido,80); assert.equal(enviado.bonusUtilizado,20);
        assert.equal(enviado.alocacoes[0].valor,100);
      }
      await page.close(); console.log('OK: toggle de bônus '+tipo+', saldo, valor proporcional, limpeza e envio.');
    }
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
