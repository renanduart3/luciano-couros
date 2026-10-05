// Suíte explícita: cada integração usa base temporária; não inclui scripts de diagnóstico de dados reais.
const {spawnSync}=require('node:child_process');const fs=require('node:fs');
const suites=['conciliacao-financeira','agrupamento-ordens','bonus-pagamentos','comprovante-venda','demonstrativo-ordem','devolucoes-na-venda','distribuicao-pagamentos','edicao-venda','finalizacao-financeira','financeiro-fluxo','linha-pagamento','ordens-recebimento','programacao-pagamentos','quantidades','reabertura-finalizacao','reabertura-pagamentos','resumo-recebimentos','saldo-cliente','vales-cliente','valor-item-relatorio'];
const resultados=[];
for(const nome of suites){
  const inicio=Date.now();const r=spawnSync(process.execPath,['scripts/test-'+nome+'.cjs'],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
  const sucesso=r.status===0&&!r.error;resultados.push({nome,sucesso,duracaoMs:Date.now()-inicio,saida:r.stdout,erro:r.stderr||r.error?.message});
  console.log((sucesso?'OK':'FALHOU')+': '+nome);
  if(!sucesso) console.error(r.stdout,r.stderr,r.error?.message||'');
}
const relatorio={data:new Date().toISOString(),resultados,aprovados:resultados.filter(r=>r.sucesso).length,total:suites.length};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(relatorio,null,2)+'\n',{flag:'wx'});
console.log(`${relatorio.aprovados}/${relatorio.total} suítes aprovadas. Impressão é validada separadamente com Chromium.`);
if(relatorio.aprovados!==relatorio.total)process.exitCode=1;
