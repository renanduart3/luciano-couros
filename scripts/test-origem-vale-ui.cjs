// Navegação da origem no navegador, com respostas locais e sem acesso a dados pessoais.
const assert=require('node:assert/strict');const {buildSync}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function main(){
 const script=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {HistoricoOrigemVale} from './src/components/HistoricoOrigemVale';createRoot(document.getElementById('root')).render(<HistoricoOrigemVale vale={window.__vale}/>);`},bundle:true,platform:'browser',write:false}).outputFiles[0].text;
 const original={id:'v206',clienteId:'c',numeroSequencial:206,totalLiquido:608.31,items:[{id:'i',descricao:'Tecido histórico',quantidade:2,unidade:'metro',total:608.31}]};
 const residual={id:'v621',clienteId:'c',numeroSequencial:621,totalLiquido:2029.86,items:[],origemSaldo:{descricao:'Devedor da ordem #29',ordem:{id:'o29',numero:29},vales:[{id:'v206',numero:206}]}};
 const novo={id:'v700',clienteId:'c',numeroSequencial:700,totalLiquido:2019.86,origemSaldo:{descricao:'Devedor da ordem #36',vales:[{id:'v621',numero:621}]}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {const page=await browser.newPage();await page.route('**/*',route=>{const id=route.request().url().split('/').pop();return route.fulfill(id==='v621'||id==='v206'?{contentType:'application/json',body:JSON.stringify(id==='v621'?residual:original)}:{contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto('http://auditoria.local');await page.evaluate(v=>window.__vale=v,novo);await page.addScriptTag({content:script});
 await page.getByRole('button',{name:'Vale #621',exact:true}).click();await page.getByRole('button',{name:'Vale #206',exact:true}).click();
 await page.getByText(/Tecido histórico/).waitFor();assert.ok((await page.locator('body').innerText()).includes('Vale #700 → Vale #621 → Vale #206'));
 await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:'Vale #206',exact:true}).waitFor();
 await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:'Vale #621',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Voltar',exact:true}).count(),0);
 console.log('OK: cadeia de duas ordens até os materiais originais, ida e volta sem somar a dívida.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
