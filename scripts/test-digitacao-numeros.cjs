const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');const Module=require('node:module');
const result=buildSync({entryPoints:['src/lib/utils.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
const mod=new Module(__filename);mod.filename=__filename;mod.paths=module.paths;mod._compile(result.outputFiles[0].text,__filename);
const parse=mod.exports.parseBrazilianNumber;
for(const [entrada,esperado] of [['12.50',12.5],['12,50',12.5],['2.49',2.49],['2,49',2.49],['1.250,50',1250.5],['1.250',1250],['1.250.000',1250000],['0,125',0.125],['-12,50',-12.5],['12,',12],['',0]])assert.equal(parse(entrada),esperado,entrada);
for(const entrada of ['12,50abc','1,2,3','1.2.3','12 50','1e3','Infinity','NaN','R$ 12','1.25,00'])assert.ok(Number.isNaN(parse(entrada)),entrada);
assert.equal(Math.round(parse('2.49')*parse('94,90')*100)/100,236.30);
console.log('OK: ponto decimal, vírgula, milhares e rejeição de digitação inválida sem aceitar prefixos.');
