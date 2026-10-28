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
    {nome:'venda-referencia-layout',tipo:'venda',venda:{...venda,numeroSequencial:706,clienteNome:'FABIANO MOREIRA',clienteTelefone:'3192997575',data:'2026-10-06',vencimento:'2026-11-06',formaPagamento:'vale',subtotal:1641.99,totalLiquido:1641.99,items:[
      ['CACHAREU CAMEL','FA',5,15.90,79.50],['FLOTER NUDE','JG',2.43,74.90,182.01],['METALIZADO CHAMPGNER','JG',4.09,99.90,408.59],['FLOTER OFF WHITE','JG',3.05,74.90,228.45],['FLOTER CARAMELO','JG',2.62,74.90,196.24],['FLOTER PRETO','JG',2.10,74.90,157.29],['FLY RUBI','JG',2.66,79.90,212.53],['FLY MADEIRA','JG',2.22,79.90,177.38]
    ].map(([descricao,fornecedorReferencia,quantidade,precoUnitario,total],i)=>({...item(i),descricao,fornecedorReferencia,quantidade,precoUnitario,total}))}},
    {nome:'vale-621-referencia',tipo:'venda',venda:{...venda,numeroSequencial:621,contabilizaReceita:0,totalLiquido:2029.86,subtotal:0,items:[],origemSaldo:{ordem:{id:'o29',numero:29},descricao:'Devedor da ordem #29',vales:[206,227,228,229,313].map(numero=>({numero}))}}},
    {nome:'ordem-com-vale-residual',tipo:'ordem',origem:'ordens-view',ordem:{...ordem,vales:[{...ordem.vales[0],numeroSequencial:621,descricao:'Devedor da ordem #29'}]}},
    {nome:'recibo-ordem',tipo:'recibo',origem:'ordens-view',recibo,ordem},
    {nome:'recibo-ordem-acumulado',tipo:'recibo',origem:'ordens-view',recibo:{...recibo,resumoOrdem:{id:'o',numero:12,saldo:0},pagamentosVale:ordem.pagamentos.map(p=>({...p,valorNoVale:100})),vales:[{...recibo.vales[0],valorVale:100}]},ordem},
    {nome:'recibo-vale',tipo:'recibo',origem:'print-vale-detail-overlay',recibo:{...recibo,formaPagamento:'cheque_emitente',valorRecebido:120,valorAplicado:140,valorDevidoAntes:140,titulos:Array.from({length:12},(_,i)=>title(i)),vales:[{numeroSequencial:42,saldoAntes:140,valorAplicado:140,saldoDepois:0}]},ordem},
    {nome:'recibo-relatorio',tipo:'recibo',origem:'relatorios-view',recibo:{...recibo,valorDevidoAntes:2500,valorAplicado:2500,valorRecebido:2480,vales:Array.from({length:50},(_,i)=>({numeroSequencial:i+1,saldoAntes:50,valorAplicado:50,saldoDepois:0}))},ordem},
    {nome:'demonstrativo',tipo:'ordem',origem:'ordens-view',ordem:{...ordem,totalOriginal:420,vales:[{...ordem.vales[0],valorVinculado:420}],pagamentos:[{...ordem.pagamentos[0],formaPagamento:'cheque_emitente',valorRecebido:400,valorAplicado:420,valorAplicadoOrdem:420,titulos:Array.from({length:40},(_,i)=>title(i))}]}},
    {nome:'venda-duas-paginas',tipo:'venda',venda},
    {nome:'venda-layout-fixo',tipo:'venda',venda:{...venda,items:Array.from({length:15},(_,i)=>item(i)),subtotal:150,totalLiquido:140,desconto:10,valorPago:20,bonusLegado:20,valorTransferido:10,creditoLinhaDevolucao:5,observacoes:'OBSERVAÇÃO EXTENSA '.repeat(300)}},
    {nome:'venda-bonus',tipo:'venda',venda:{...venda,subtotal:100,totalLiquido:100,valorPago:100,bonusLegado:20,items:[{...item(0),quantidade:10,total:100}]}},
    {nome:'devolucao-credito',tipo:'venda',venda:{...venda,subtotal:-24,totalLiquido:0,creditoLinhaDevolucao:24,items:[{...item(0),quantidade:-2.4,total:-24,itemOrigemId:'origem'}]}},
    {nome:'venda-mista',tipo:'venda',venda:{...venda,subtotal:70,totalLiquido:70,items:[{...item(0),quantidade:5.52,total:55.2},{...item(1),quantidade:2,unidade:'un',total:20}, {...item(2),quantidade:-0.52,total:-5.2,itemOrigemId:'origem'}]}}
  ];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for(const f of fixtures) {
      const page=await browser.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:1.5});
      await page.route('**/*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({store_address:'R. SAO MATIAS, 114- B. SAO SALVADOR- CEP: 308815.30 - BH/MG'})}));
      await page.goto('http://teste.local/');
      await page.setContent('<html><head><base href="http://teste.local/"><meta charset="utf-8"><style>'+css+'</style></head><body><div id="root"></div></body></html>');
      await page.evaluate(f=>window.__fixture=f,f);
      await page.addScriptTag({content:script});
      const target=f.tipo==='recibo'?'#print-payment-receipt':f.tipo==='venda'?'.receipt-pages':'#print-cobranca-vales';
      await page.waitForSelector(target);
      if(f.tipo==='venda') await page.waitForFunction(()=>document.querySelector('.receipt-store').textContent.includes('SAO MATIAS'));
      await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
      await page.emulateMedia({media:'print'});
      assert.ok(await page.locator(target).isVisible(),f.nome);
      for (const media of ['screen', 'print']) {
        await page.emulateMedia({media});
        const fundos = await page.locator(`${target} :is(.receipt-copy, .payment-receipt-paper, .order-statement), ${target} :is(.receipt-copy, .payment-receipt-paper, .order-statement) *`).evaluateAll(es => es.filter(e => {
          if (!e.getClientRects().length) return false;
          const cor = getComputedStyle(e).backgroundColor;
          const valor = e.closest('.receipt-total') || e.matches('.payment-receipt-balance dd, tfoot td.number, .order-statement footer strong, .order-statement tfoot td:last-child');
          return !['rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'].includes(cor) && !(valor && cor === 'rgb(245, 245, 245)');
        }).map(e => ({tag:e.tagName,classe:e.className,cor:getComputedStyle(e).backgroundColor})));
        assert.deepEqual(fundos, [], `Fundo preenchido fora dos totais: ${f.nome} / ${media}`);
        if (f.tipo === 'ordem') assert.ok(await page.locator('.order-statement').evaluate(e => Math.abs(e.getBoundingClientRect().width - 200*96/25.4) < 1), `Largura da ordem deve ser 200 mm: ${media}`);
        if (f.nome === 'recibo-ordem-acumulado') assert.ok(await page.locator('.payment-receipt-order').evaluate(e => Math.abs(e.getBoundingClientRect().width - 160*96/25.4) < 1), `Largura do recibo da ordem: ${media}`);
      }
      await page.emulateMedia({media:'print'});
      if(f.tipo==='recibo') {
        assert.equal(await page.locator('#print-payment-receipt').evaluate(e=>e.parentElement===document.body),true);
        assert.equal(await page.locator('#print-cobranca-vales').isVisible(),false);
        assert.equal(await page.locator('#root').isVisible(),false);
      }
      if(f.tipo==='recibo') for(const cell of await page.locator('.payment-receipt-section .number').all()) assert.ok(await cell.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Valor cortado em '+f.nome);
      if(f.tipo==='venda') {
        assert.equal(await page.locator('.receipt-total').count(),2);
        for(const media of ['screen','print']) {
          await page.emulateMedia({media});
          for(const copy of await page.locator('.receipt-copy').all()) {
            assert.equal(await copy.locator('tbody tr').count(),15,'Exatamente 15 linhas em '+f.nome);
            assert.ok(await copy.locator('.receipt-items-table').evaluate(e=>Math.abs(e.getBoundingClientRect().height - 56.5*96/25.4)<1),'Altura da tabela de referência em '+f.nome);
            assert.ok(await copy.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Conteúdo cortado em '+f.nome);
            const footer=copy.locator('.receipt-footer');
            if(await footer.count()) assert.ok(await footer.evaluate(e=>e.getBoundingClientRect().bottom<=e.closest('.receipt-copy').getBoundingClientRect().bottom+1),'Rodapé fora da via em '+f.nome);
            for(const field of await copy.locator('.receipt-financial-area > *').all()) {
              assert.ok(await field.evaluate(e=>{const r=e.getBoundingClientRect(),area=e.parentElement.getBoundingClientRect();return r.height>=10 && r.bottom<=area.bottom+1;}),'Campo financeiro cortado em '+f.nome);
            }
            for(const field of await copy.locator('.receipt-payment-adjustments > span, .receipt-payment-extras > span, .receipt-payment-summary > .receipt-payment-value').all()) {
              assert.ok(await field.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Valor ou ajuste cortado em '+f.nome);
            }
          }
          if(f.nome==='venda-layout-fixo') {
            const positions=()=>page.locator('.receipt-copy').evaluateAll(copies=>copies.map(copy=>{
              const rect=selector=>{const r=copy.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
              return [rect('.receipt-items-table'),rect('.receipt-footer'),rect('.receipt-payment-summary'),rect('.receipt-payment-observation')];
            }));
            const before=await positions();
            for(const observation of await page.locator('.receipt-payment-observation > span').all()) {
              assert.ok(await observation.evaluate(e=>e.scrollWidth>e.clientWidth),'Observação excedente deve ser cortada.');
              assert.equal(await observation.evaluate(e=>getComputedStyle(e).textOverflow),'clip');
            }
            await page.locator('.receipt-payment-observation > span').evaluateAll(es=>es.forEach(e=>e.textContent='CURTA'));
            assert.deepEqual(await positions(),before,'Observação não pode deslocar tabela, pagamento ou rodapé.');
            await page.locator('.receipt-payment-observation > span').evaluateAll((es,text)=>es.forEach(e=>e.textContent=text),f.venda.observacoes);
            await page.locator('.receipt-copy').first().screenshot({path:path.join(out,'venda-layout-fixo-'+media+'.png')});
          }
          if(f.nome==='venda-referencia-layout') {
            assert.equal(await page.locator('.receipt-financial-area > *').count(),2,'A venda comum tem apenas uma faixa por via.');
            for(const summary of await page.locator('.receipt-payment-summary').all()) {
              const ys=await summary.locator(':scope > span').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));
              assert.ok(Math.max(...ys)-Math.min(...ys)<1,'Forma, recebido e observação na mesma linha.');
            }
            await page.locator('.receipt-copy').first().screenshot({path:path.join(out,'venda-referencia-'+media+'.png')});
          }
        }
        await page.emulateMedia({media:'print'});
      }
      if (f.nome==='vale-621-referencia') { assert.equal(await page.locator('.receipt-copy').filter({hasText:'Devedor da ordem #29'}).count(),2); await page.screenshot({path:path.join(out,'vale-621-referencia.png'),fullPage:true}); }
      await page.pdf({path:path.join(out,f.nome+'.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
      if (f.nome === 'ordem-com-vale-residual') await page.locator('.order-statement').screenshot({path:path.join(out,'ordem-largura.png')});
      await page.close();
      console.log('OK: impressão '+f.nome);
    }
  } finally {await browser.close();}
  console.log('PDFs de teste: '+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
