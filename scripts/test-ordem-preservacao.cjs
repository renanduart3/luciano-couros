const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const {buildSync} = require('esbuild');
const raiz = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'luciano-fluxo-'));
process.env.DATA_DIR = temp;
let source = fs.readFileSync('server.ts','utf8').replace('startServer();','export { app, db, carregarRecebimentoGerenciavel, carregarDetalhesVenda, listarOrdensCobranca, compensarPagamentosProgramados };');
source = source.replace('void runAutoBackup();','').replace('setInterval(() => void runAutoBackup(), 60 * 1000);','').replace('setInterval(executarProgramacaoFinanceira, 60_000).unref();','').replace('setTimeout(executarProgramacaoFinanceira, 0).unref();','');
source += '\nexport { financeiroOrdem } from "./src/lib/financeiro";';
const build = buildSync({stdin:{contents:source,resolveDir:raiz,loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
process.chdir(temp);
const mod = new Module(path.join(raiz,'scripts/fluxo-runtime.cjs')); mod.filename=mod.id;mod.paths=module.paths;mod._compile(build.outputFiles[0].text,mod.filename);
const {db,app,carregarDetalhesVenda:detalhar,carregarRecebimentoGerenciavel:recebimento,financeiroOrdem,compensarPagamentosProgramados:compensar}=mod.exports;

function criar(dados) {
 const route=app._router.stack.find(s=>s.route?.path==='/api/ordens-cobranca' && s.route.methods.post).route.stack[0].handle;
 let resultado, status=200;
 route({body:dados},{status(n){status=n;return this},json(r){resultado=r}});
 assert.equal(status,201,JSON.stringify(resultado));return resultado;
}
try {
 db.prepare("INSERT INTO clientes(id,nome) VALUES ('c','Teste preservação')").run();
 const inserir=db.prepare("INSERT INTO vendas(id,numeroSequencial,clienteId,data,subtotal,desconto,totalLiquido,valorPago,saldoRestante,status,vencimento,observacoes) VALUES (?,?,'c',?,100,0,100,0,100,'pendente',?,'Observação original')");
 inserir.run('v1',1,'2026-08-10','2026-09-10');
 inserir.run('v2',2,'2026-09-15','2026-10-15');
 const antes=db.prepare('SELECT * FROM vendas ORDER BY id').all();
 const ordem=criar({clienteId:'c',dataEmissao:'2000-01-01',vendaIds:['v1','v2'],observacao:'Agrupamento'});
 const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const parte=t=>partes.find(p=>p.type===t).value;
 assert.equal(ordem.dataEmissao,`${parte('year')}-${parte('month')}-${parte('day')}`);
 assert.equal(ordem.totalOriginal,200);
 assert.deepEqual(ordem.vales.map(v=>v.data),['2026-08-10','2026-09-15']);
 assert.deepEqual(ordem.vales.map(v=>v.vencimento),['2026-09-10','2026-10-15']);
 assert.deepEqual(db.prepare('SELECT * FROM vendas ORDER BY id').all(),antes,'Criar ordem não pode alterar nenhum campo dos vales');
 const atualizada=mod.exports.listarOrdensCobranca('AND oc.id = ?',[ordem.id])[0];
 assert.equal(atualizada.dataEmissao,ordem.dataEmissao);
 assert.deepEqual(atualizada.vales.map(v=>v.data),ordem.vales.map(v=>v.data));
 console.log('OK: ordem com data da criação em São Paulo, dois vales com emissões distintas e todos os campos originais preservados.');
} finally {db.close();}
