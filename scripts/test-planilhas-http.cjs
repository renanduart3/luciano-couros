// Integração HTTP em base temporária vazia. Execute após npm run build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const Database = require('better-sqlite3');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-planilhas-http-'));
  const legado = new Database(path.join(temp,'database.db'));legado.exec("CREATE TABLE planilhas (id TEXT PRIMARY KEY,nome TEXT NOT NULL,celulas TEXT NOT NULL DEFAULT '{}',moedas TEXT NOT NULL DEFAULT '[]',versao INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");legado.close();
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let child = spawn(process.execPath, [path.resolve('dist/server.cjs')], {
    cwd: temp, env: { ...process.env, DATA_DIR: temp, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  let cookie = '';
  const base = `http://127.0.0.1:${port}/api`;
  async function request(method, url, body, expected) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const data = await response.json();
    if (expected) assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(data)}`);
    else assert.ok(response.ok, `${method} ${url}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  let db;
  try {
    let ready = false, readinessError;
    for (let i = 0; i < 100; i++) {
      try { await request('GET', '/health'); ready = true; break; } catch (error) { readinessError = error; await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, logs + '\n' + String(readinessError) + '\n' + String(readinessError?.cause));
    const pin = 'TesteReabertura123';
    await request('POST', '/auth/configurar-gerente', { nome: 'Gerente teste', senha: pin });
    await request('POST', '/auth/login', { login: 'gerente', senha: pin });
    db = new Database(path.join(temp, 'database.db'));
    const listaInicial = await request('GET','/planilhas');
    assert.deepEqual(listaInicial,[]);
    await request('POST','/planilhas',{nome:'   '},400);
    let primeira = await request('POST','/planilhas',{nome:'Contas'});
    assert.deepEqual(primeira.larguras,{});
    const segunda = await request('POST','/planilhas',{nome:'Materiais'});
    const terceira = await request('POST','/planilhas',{nome:'Controle'});
    await request('POST','/planilhas',{nome:'Quarta'});await request('POST','/planilhas',{nome:'Quinta'});
    await request('POST','/planilhas',{nome:'Sexta'},409);
    const lista = await request('GET','/planilhas');assert.equal(lista.length,5);assert.equal(lista[0].celulas,undefined);
    const celulas = {};
    for(let l=1;l<=500;l++)for(let c=0;c<15;c++)celulas[String.fromCharCode(65+c)+l]=c===14?`=SOMA(A${l}:N${l})`:String(l);
    const salvar = (documento, extras={})=>request('PUT','/planilhas/'+documento.id,{...documento,...extras});
    primeira=await salvar(primeira,{celulas,moedas:['O500'],larguras:{A:360,B:60,O:800},formatos:{A1:{negrito:true,cor:'vermelho'},B1:{negrito:false,cor:'preto'},C1:{cor:'verde'},D1:{cor:'amarelo'}}});
    assert.equal(Object.keys(primeira.celulas).length,7500);assert.equal(primeira.versao,2);
    assert.deepEqual((await request('GET','/planilhas/'+primeira.id)).formatos,primeira.formatos);
    const {formatos: formatosAntes,larguras: largurasAntes,...clienteAntigo}=primeira;primeira=await salvar(clienteAntigo);assert.deepEqual(primeira.formatos,formatosAntes);assert.deepEqual(primeira.larguras,largurasAntes);
    assert.deepEqual((await request('GET','/planilhas/'+primeira.id)).larguras,{A:360,B:60,O:800});
    for(const larguras of [null,[],{P:140},{A:59},{A:801},{A:140.5},{A:'140'}]) await request('PUT','/planilhas/'+primeira.id,{...primeira,larguras},400);
    assert.equal((await request('GET','/planilhas/'+primeira.id)).celulas.O500,'=SOMA(A500:N500)');
    assert.equal(JSON.parse(db.prepare('SELECT celulas FROM planilhas WHERE id=?').get(primeira.id).celulas).A500,'500');
    await request('PUT','/planilhas/'+primeira.id,{...primeira,versao:1},409);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,celulas:{P1:'x'}},400);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,celulas:{A501:'x'}},400);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,celulas:{A1:'x'.repeat(301)}},400);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,moedas:['A501']},400);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,formatos:{A1:{cor:'azul'}}},400);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,formatos:{A501:{negrito:true}}},400);
    await request('PUT','/planilhas/'+primeira.id,{...primeira,formatos:{A1:{negrito:'sim'}}},400);
    // Payload acima dos 100 KB padrão do Express, sem truncar valores.
    const grande={};for(const id of Object.keys(celulas))grande[id]='a'.repeat(300);
    const densa=await salvar(segunda,{celulas:grande,larguras:{C:333},formatos:{A500:{negrito:true,cor:'verde'}}});assert.equal(Object.keys(densa.celulas).length,7500);
    const acao=(doc,tipo,senha=pin,versao=doc.versao)=>request('POST','/planilhas/'+doc.id+'/'+tipo,{senha,versao});
    for(const tipo of ['limpar','excluir']){
      await request('POST','/planilhas/'+primeira.id+'/'+tipo,{versao:primeira.versao,senha:'errada'},403);
      await request('POST','/planilhas/'+primeira.id+'/'+tipo,{versao:1,senha:pin},409);
      assert.equal(Object.keys((await request('GET','/planilhas/'+primeira.id)).celulas).length,7500);
    }
    primeira=await acao(primeira,'limpar');assert.deepEqual(primeira.celulas,{});assert.deepEqual(primeira.moedas,[]);assert.deepEqual(primeira.formatos,{});assert.equal(primeira.nome,'Contas');assert.deepEqual(primeira.larguras,{A:360,B:60,O:800});
    await acao(terceira,'excluir');await request('GET','/planilhas/'+terceira.id,undefined,404);
    await request('POST','/planilhas',{nome:'Nova após exclusão'});
    const usuarios = await request('POST','/usuarios',{nome:'Vendedor teste',login:'vendedor.teste',senha:'Teste123'});
    db.prepare('UPDATE usuarios SET deveTrocarSenha=0 WHERE id=?').run(usuarios.id);
    const cookieGerente=cookie;
    await request('POST','/auth/login',{login:'vendedor.teste',senha:'Teste123'});
    await request('GET','/planilhas',undefined,403);await request('GET','/planilhas/'+primeira.id,undefined,403);
    await request('POST','/planilhas/'+primeira.id+'/limpar',{senha:pin,versao:primeira.versao},403);
    cookie='';await request('GET','/planilhas',undefined,401);cookie=cookieGerente;
    assert.equal(db.prepare("SELECT COUNT(*) total FROM auditoria WHERE entidade='planilha'").get().total,2);
    // Simula dados salvos na grade antiga (1000 linhas): devem ser apagados ao reiniciar.
    const antiga=db.prepare('SELECT * FROM planilhas WHERE id=?').get(segunda.id);
    db.prepare('UPDATE planilhas SET celulas=?,moedas=?,formatos=?,larguras=? WHERE id=?').run(JSON.stringify({...JSON.parse(antiga.celulas),A501:'x',J1000:'=SOMA(A1000:I1000)',P1:'y'}),JSON.stringify(['A1','A999']),JSON.stringify({...JSON.parse(antiga.formatos),B700:{negrito:true}}),JSON.stringify({C:333,P:200}),segunda.id);
    const versaoAntiga=antiga.versao;
    db.close();db=null;
    const terminou=new Promise(resolve=>child.once('exit',resolve));child.kill();await terminou;
    child=spawn(process.execPath,[path.resolve('dist/server.cjs')],{cwd:temp,env:{...process.env,DATA_DIR:temp,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});
    for(let i=0;i<100;i++){try{await request('GET','/health');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
    await request('POST','/auth/login',{login:'gerente',senha:pin});
    assert.equal((await request('GET','/planilhas')).length,5);
    const ajustada=await request('GET','/planilhas/'+segunda.id);
    assert.equal(ajustada.celulas.A500,'a'.repeat(300));assert.equal(Object.keys(ajustada.celulas).length,7500);
    assert.deepEqual(ajustada.moedas,['A1']);assert.equal(ajustada.versao,versaoAntiga+1);
    await request('PUT','/planilhas/'+segunda.id,ajustada);
    assert.deepEqual((await request('GET','/planilhas/'+segunda.id)).formatos,{A500:{negrito:true,cor:'verde'}});
    assert.deepEqual((await request('GET','/planilhas/'+segunda.id)).larguras,{C:333});
    {const d=new Database(path.join(temp,'database.db'),{readonly:true});const reg=d.prepare("SELECT detalhes FROM auditoria WHERE acao='planilha_ajustada_ao_limite'").all();d.close();assert.equal(reg.length,1);assert.equal(JSON.parse(reg[0].detalhes).celulasRemovidas,3);}
    console.log('OK: dados preservados após reiniciar o servidor; células além de 500 linhas × 15 colunas apagadas e auditadas.');
    console.log('OK: cinco planilhas, 7.500 células persistidas, payload de 3 MB, versões concorrentes, senha no servidor, limpeza, exclusão, auditoria e acesso exclusivo do gerente.');
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { db?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
