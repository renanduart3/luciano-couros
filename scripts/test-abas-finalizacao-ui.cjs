const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const script = buildSync({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {ValeDetalhesModal} from './src/components/ValeDetalhesModal';
    import {OrdemCobrancaDetalhesModal} from './src/components/OrdensCobrancaView';
    import {AuthProvider} from './src/auth/AuthContext';
    function App() { const [vale, setVale] = useState(window.__vales[0]); const [ordem, setOrdem] = useState(null); window.__trocarOrdem = setOrdem;
      window.__trocar = setVale;
      if(ordem) return <AuthProvider value={{id:'gerente', perfil:'administrador'}}><OrdemCobrancaDetalhesModal ordem={ordem} onClose={()=>{}} onChanged={setOrdem}/></AuthProvider>;
      return <AuthProvider value={{id:'gerente', perfil:'administrador'}}><ValeDetalhesModal vale={vale} onClose={()=>{}} onUpdated={v => {window.__vales[window.__vales.findIndex(a=>a.id===v.id)]=v; setVale(v)}}/></AuthProvider>;
    } createRoot(document.getElementById('root')).render(<App/>);` },
    bundle: true, platform: 'browser', loader: { '.png': 'dataurl' }, write: false }).outputFiles[0].text;
  const pagamento = (id, vendaId, valor) => ({ id, data: '2026-10-26', createdAt: '2026-10-26', status: 'ativo', statusPagamento: 'compensado', formaPagamento: 'pix', valorRecebido: valor, valorAplicado: valor, bonusUtilizado: 0, titulos: [], alocacoes: [{ vendaId, valor }] });
  const vale = { id: 'v121', numeroSequencial: 121, clienteId: 'c', clienteNome: 'Roberto Alencar Mendes', data: '2026-07-25', vencimento: '2026-11-22', status: 'pendente', subtotal: 109.9, desconto: 0, totalLiquido: 109.9, valorPago: 40, saldoRestante: 69.9, recebimentos: [pagamento('r121','v121',40)],
    items: [{ id:'fio', descricao:'Fio Costuratudo Cone Poliéster 5000j', quantidade:1, unidade:'peca', precoUnitario:14.9, total:14.9 }, { id:'tricoline', descricao:'Tricoline Poá Vermelho Clássico', quantidade:2.5, unidade:'metro', precoUnitario:38, total:95 }] };
  const residual = { ...vale, id:'v122', numeroSequencial:122, contabilizaReceita:0, totalLiquido:69.9, subtotal:0, valorPago:20, saldoRestante:49.9, items:[], recebimentos:[pagamento('r122','v122',20)], origemSaldo:{vales:[{id:'v121',numero:121,valor:69.9}], descricao:'Devedor do vale #121', valorTransferido:69.9} };
  const vales = [vale,residual];
  const ordem = { id:'o1', numeroSequencial:1, clienteId:'c', clienteNome:vale.clienteNome, dataEmissao:vale.data, totalOriginal:109.9, valorPago:40, saldo:69.9, status:'aberta', parcelas:[], eventos:[], vales:[{vendaId:'v121',numeroSequencial:121,data:vale.data,valorOriginalVale:109.9,valorVinculado:109.9,valorPago:40,saldo:69.9,saldoAtualVale:69.9}], pagamentos:[{...pagamento('ro','v121',40),ordemCobrancaId:'o1',valorAplicadoOrdem:40}] };
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      let data={};
      if(url.pathname === '/api/ordens-cobranca/o1/finalizar') {
        const dataFinal=new Date().toISOString();
        data={ordem:{...ordem,finalizadoAt:dataFinal,status:'quitada',saldo:0,comprovantesFinalizacao:[{id:'fo1',data:dataFinal,documento:{...structuredClone(ordem),finalizadoAt:dataFinal}}]},valeResidual:{id:'ro1',numeroSequencial:123,valor:69.9}};
      } else if(url.pathname.endsWith('/comprovante')) {
        const v=vales.find(v=>v.id===url.searchParams.get('vendaId'));
        assert.ok(v); assert.ok(url.pathname.includes(v.recebimentos[0].id), 'Recebimento deve pertencer ao vale solicitado.');
        data={ id:v.recebimentos[0].id, data:v.data, clienteNome:v.clienteNome, formaPagamento:'pix', valorRecebido:v.valorPago, valorAplicado:v.valorPago, valorDevidoAntes:v.totalLiquido, titulos:[], pagamentosVale:v.recebimentos.map(p=>({...p,valorNoVale:p.valorAplicado})), vales:[{vendaId:v.id,numeroSequencial:v.numeroSequencial,data:v.data,valorVale:v.totalLiquido,saldoAntes:v.totalLiquido,saldoDepois:v.saldoRestante,saldoAtual:v.saldoRestante}] };
      } else if(url.pathname.endsWith('/finalizar')) {
        const v=vales.find(v=>url.pathname.includes('/'+v.id+'/')); assert.ok(v);
        const dataFinal='2026-10-26T15:00:00.000Z';
        data={vale:{...v, finalizadoAt:dataFinal,status:'paga',saldoRestante:0,valorTransferido:v.saldoRestante,comprovantesFinalizacao:[{id:'final-'+v.id,data:dataFinal,documento:{...structuredClone(v),finalizadoAt:dataFinal}}]},valeResidual:{id:'res-'+v.id,numeroSequencial:v.numeroSequencial+1,valor:v.saldoRestante}};
      } else if(!url.pathname.startsWith('/api/')) return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto('http://teste.local'); await page.evaluate(v=>window.__vales=v,vales); await page.addScriptTag({content:script});
    for(const [index,v] of vales.entries()) {
      if(index) await page.evaluate(i=>window.__trocar(window.__vales[i]),index);
      const nav=page.getByRole('navigation',{name:'Navegação do vale'});
      assert.equal(await nav.getByRole('button',{name:'Vale finalizado',exact:true}).count(),0);
      await nav.getByRole('button',{name:'Vale',exact:true}).click();
      const original=await page.locator('.receipt-pages').innerHTML();
      assert.equal(await page.getByRole('cell',{name:'PAGO',exact:true}).count(),0);
      await page.getByRole('button',{name:'Finalizar vale',exact:true}).click();
      await page.getByRole('button',{name:'Demonstrativo',exact:true}).click();
      const preview=page.getByRole('dialog',{name:`Demonstrativo de vale #${v.numeroSequencial}`});
      assert.equal(await preview.getByRole('cell',{name:'PAGO',exact:true}).count(),2);
      const expected=await preview.locator('.receipt-pages').innerHTML();
      assert.match(await preview.locator('.receipt-total').first().innerText(),new RegExp(v.saldoRestante.toFixed(2).replace('.',',')));
      await page.getByRole('button',{name:'Voltar à finalização'}).click();
      await page.getByRole('button',{name:'Recebimento',exact:true}).click();
      const recibo=page.getByRole('dialog',{name:`Recebimento de vale #${v.numeroSequencial}`});
      await recibo.getByRole('cell',{name:'#'+v.numeroSequencial,exact:true}).waitFor();
      assert.equal(await recibo.getByRole('cell',{name:'#'+(index ? 121 : 122),exact:true}).count(),0);
      assert.match(await recibo.locator('.payment-receipt-balance').innerText(),new RegExp(v.valorPago.toFixed(2).replace('.',',')));
      await page.getByRole('button',{name:'Voltar à finalização'}).click();
      await page.locator('input[type="password"]').fill('1234');
      await page.getByRole('button',{name:'Finalizar',exact:true}).click();
      await nav.getByRole('button',{name:'Vale finalizado',exact:true}).waitFor();
      await page.getByRole('dialog',{name:`Finalizar vale #${v.numeroSequencial}`}).getByRole('button',{name:'Fechar',exact:true}).click();
      assert.equal((await nav.getByRole('button').last().innerText()).trim(),'Vale finalizado');
      assert.equal(await page.locator('.receipt-pages').innerHTML(),expected,'A aba final deve preservar exatamente o demonstrativo.');
      await nav.getByRole('button',{name:'Vale',exact:true}).click();
      assert.equal(await page.getByRole('cell',{name:'PAGO',exact:true}).count(),0);
      // O documento original mantém seus itens; informações de saldo atual podem mudar.
      assert.equal(await page.locator('.receipt-items-table').first().innerHTML(),original.match(/<table class="receipt-items-table">([\s\S]*?)<\/table>/)[1]);
    }
    await page.evaluate(()=>window.__trocar(window.__vales[0]));
    await page.getByRole('navigation').getByRole('button',{name:'Vale finalizado',exact:true}).click();
    assert.match(await page.locator('.receipt-total').first().innerText(),/69,90/);
    assert.match(await page.locator('.receipt-items-table').first().innerText(),/-R\$\s*40,00/);
    await page.evaluate(o=>window.__trocarOrdem(o),ordem);
    const navOrdem=page.getByRole('navigation',{name:'Navegação da ordem'});
    assert.equal(await navOrdem.getByRole('button',{name:'Ordem finalizada',exact:true}).count(),0);
    await page.getByRole('button',{name:'Finalizar ordem',exact:true}).click();
    await page.getByRole('dialog',{name:'Finalizar ordem #1'}).getByRole('button',{name:'Demonstrativo',exact:true}).click();
    const previaOrdem=page.getByRole('dialog',{name:'Demonstrativo de ordem #1'});
    const tabelaOrdem=await previaOrdem.locator('.receipt-items-table').first().innerHTML();
    assert.match(await previaOrdem.locator('.receipt-total').first().innerText(),/69,90/);
    await page.getByRole('button',{name:'Voltar à finalização'}).click();
    await page.locator('input[type="password"]').fill('1234');
    await page.getByRole('button',{name:'Finalizar',exact:true}).click();
    await navOrdem.getByRole('button',{name:'Ordem finalizada',exact:true}).waitFor();
    await page.getByRole('dialog',{name:'Finalizar ordem #1'}).getByRole('button',{name:'Fechar',exact:true}).click();
    assert.equal((await navOrdem.getByRole('button').last().innerText()).trim(),'Ordem finalizada');
    assert.equal(await page.locator('.receipt-items-table').first().innerHTML(),tabelaOrdem);
    assert.equal(await navOrdem.getByRole('button',{name:'Vale finalizado',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('OK: abas independentes, exemplo #121 (109,90 - 40 = 69,90), prévias do próprio vale e finalização do residual (69,90 - 20 = 49,90).');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
