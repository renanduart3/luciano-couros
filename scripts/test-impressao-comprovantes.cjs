const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Run after npm run build. Uses synthetic data and never connects to the application database.
async function main() {
  const out = process.env.PRINT_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'couros-print-'));
  fs.mkdirSync(out, {recursive:true});
  const css = fs.readFileSync(path.join('dist/assets',fs.readdirSync('dist/assets').find(f=>f.endsWith('.css'))),'utf8');
  const script = buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ComprovanteRecebimentoModal} from './src/components/ComprovanteRecebimentoModal';
    import {OrdemCobrancaDemonstrativoModal} from './src/components/OrdemCobrancaDemonstrativoModal';
    import {VendaComprovante} from './src/components/VendaComprovante';
    const f=window.__fixture;
    createRoot(document.getElementById('root')).render(f.tipo==='venda' ? <div id="print-receipt"><VendaComprovante venda={f.venda}/></div> : <>
      <div id={f.origem} className="print:hidden" style={{height:1800}}>CONTEUDO ATRAS DO MODAL
        {f.tipo==='recibo' && <ComprovanteRecebimentoModal comprovante={f.recibo} onClose={()=>{}}/>}
      </div>
      <OrdemCobrancaDemonstrativoModal ordem={f.ordem} onClose={()=>{}} onOpenOrdem={()=>{}}/>
    </>);
  `},bundle:true,platform:'browser',format:'iife',loader:{'.png':'dataurl'},write:false}).outputFiles[0].text;
  const title=(i)=>({id:'t'+i,tipo:'cheque_emitente',nomeTitular:'Cliente impressão',documentoTitular:'12345678901',numeroDocumento:'DOC-'+i,valor:10,vencimento:'2099-12-01',status:i===0?'compensado':'aguardando'});
  const recibo={id:'rec_teste',clienteId:'c',clienteNome:'Cliente impressão',data:'2026-10-04',createdAt:'2026-10-04',status:'ativo',formaPagamento:'pix',valorRecebido:80,valorAplicado:100,valorDevidoAntes:100,bonusUtilizado:20,bonusGerado:0,observacao:'TESTE RECIBO FINAL',titulos:[],vales:[{numeroSequencial:42,saldoAntes:100,valorAplicado:100,saldoDepois:0}],ordens:[{numeroSequencial:12,valor:100}]};
  const ordem={id:'o',numeroSequencial:12,clienteNome:'Cliente impressão',dataEmissao:'2026-10-04',updatedAt:'2026-10-04',totalOriginal:100,status:'aberta',parcelas:[],vales:[{id:'v',vendaId:'v',numeroSequencial:42,valorVinculado:100,data:'2026-10-04'}],pagamentos:[{id:'p',data:'2026-10-04',formaPagamento:'pix',status:'ativo',statusPagamento:'compensado',valorRecebido:80,bonusUtilizado:20,valorAplicado:100,valorAplicadoOrdem:100,titulos:[]}]};
  const item=(i)=>({id:'i'+i,descricao:'PRODUTO '+i,quantidade:1,unidade:'metro',precoUnitario:10,total:10});
  const venda={id:'v',numeroSequencial:42,clienteNome:'Cliente impressão',data:'2026-10-04',subtotal:160,totalLiquido:160,valorPago:0,items:Array.from({length:16},(_,i)=>item(i))};
  const fixtures=[
    {nome:'recibo-ordem',tipo:'recibo',origem:'ordens-view',recibo,ordem},
    {nome:'recibo-vale',tipo:'recibo',origem:'print-vale-detail-overlay',recibo:{...recibo,formaPagamento:'cheque_emitente',valorRecebido:120,valorAplicado:140,valorDevidoAntes:140,titulos:Array.from({length:12},(_,i)=>title(i)),vales:[{numeroSequencial:42,saldoAntes:140,valorAplicado:140,saldoDepois:0}]},ordem},
    {nome:'recibo-relatorio',tipo:'recibo',origem:'relatorios-view',recibo:{...recibo,valorDevidoAntes:2500,valorAplicado:2500,valorRecebido:2480,vales:Array.from({length:50},(_,i)=>({numeroSequencial:i+1,saldoAntes:50,valorAplicado:50,saldoDepois:0}))},ordem},
    {nome:'demonstrativo',tipo:'ordem',origem:'ordens-view',ordem:{...ordem,totalOriginal:420,vales:[{...ordem.vales[0],valorVinculado:420}],pagamentos:[{...ordem.pagamentos[0],formaPagamento:'cheque_emitente',valorRecebido:400,valorAplicado:420,valorAplicadoOrdem:420,titulos:Array.from({length:40},(_,i)=>title(i))}]}},
    {nome:'venda-duas-paginas',tipo:'venda',venda},
    {nome:'venda-bonus',tipo:'venda',venda:{...venda,subtotal:100,totalLiquido:100,valorPago:100,bonusLegado:20,items:[{...item(0),quantidade:10,total:100}]}},
    {nome:'devolucao-credito',tipo:'venda',venda:{...venda,subtotal:-24,totalLiquido:0,creditoLinhaDevolucao:24,items:[{...item(0),quantidade:-2.4,total:-24,itemOrigemId:'origem'}]}},
    {nome:'venda-mista',tipo:'venda',venda:{...venda,subtotal:70,totalLiquido:70,items:[{...item(0),quantidade:5.52,total:55.2},{...item(1),quantidade:2,unidade:'un',total:20}, {...item(2),quantidade:-0.52,total:-5.2,itemOrigemId:'origem'}]}}
  ];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for(const f of fixtures) {
      const page=await browser.newPage({viewport:{width:1000,height:1000}});
      await page.route('**/*',route=>route.fulfill({contentType:'application/json',body:'{}'}));
      await page.setContent('<html><head><meta charset="utf-8"><style>'+css+'</style></head><body><div id="root"></div></body></html>');
      await page.evaluate(f=>window.__fixture=f,f);
      await page.addScriptTag({content:script});
      const target=f.tipo==='recibo'?'#print-payment-receipt':f.tipo==='venda'?'.receipt-pages':'#print-cobranca-vales';
      await page.waitForSelector(target);
      await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
      await page.emulateMedia({media:'print'});
      assert.ok(await page.locator(target).isVisible(),f.nome);
      if(f.tipo==='recibo') {
        assert.equal(await page.locator('#print-payment-receipt').evaluate(e=>e.parentElement===document.body),true);
        assert.equal(await page.locator('#print-cobranca-vales').isVisible(),false);
        assert.equal(await page.locator('#root').isVisible(),false);
      }
      if(f.tipo==='recibo') for(const cell of await page.locator('.payment-receipt-section .number').all()) assert.ok(await cell.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Valor cortado em '+f.nome);
      if(f.tipo==='venda') {
        assert.equal(await page.locator('.receipt-total').count(),2);
        for(const copy of await page.locator('.receipt-copy').all()) assert.ok(await copy.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Conteúdo cortado em '+f.nome);
      }
      await page.pdf({path:path.join(out,f.nome+'.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
      await page.close();
      console.log('OK: impressão '+f.nome);
    }
  } finally {await browser.close();}
  console.log('PDFs de teste: '+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
