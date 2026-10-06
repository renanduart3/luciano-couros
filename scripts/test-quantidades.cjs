const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const Module = require('node:module');
const m=new Module(__filename); m.filename=__filename; m.paths=module.paths;
m._compile(buildSync({entryPoints:['src/lib/quantidades.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,__filename);
const {formatarQuantidades,quantidadesPorUnidade}=m.exports;
assert.equal(formatarQuantidades([{quantidade:5.52,unidade:'metro'},{quantidade:2,unidade:'unidade'}]),'5,52 m e 2 un');
assert.equal(formatarQuantidades([{quantidade:0.1,unidade:'m'},{quantidade:0.2,unidade:'metros'},{quantidade:-0.1,unidade:'mt'},{quantidade:2,unidade:'UN'},{quantidade:1,unidade:'kg'}]),'0,2 m e 2 un e 1 kg');
assert.deepEqual(quantidadesPorUnidade([{quantidade:2,unidade:'m²'},{quantidade:3,unidade:'m'}]),[{quantidade:2,unidade:'m²'},{quantidade:3,unidade:'m'}]);
assert.equal(formatarQuantidades([{quantidade:-1,unidade:'metro'}]),'-1 m');
console.log('OK: unidades equivalentes, separação de medidas, centésimos e devoluções.');

const utils=new Module(__filename); utils.filename=__filename; utils.paths=module.paths;
utils._compile(buildSync({entryPoints:['src/lib/utils.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,__filename);
const {parseBrazilianNumber,formatDecimal}=utils.exports;
for (const [entrada,quantidade,total] of [['0,50',0.5,50],['0,20',0.2,20],['0,05',0.05,5],['0.50',0.5,50],['0.20',0.2,20]]) {
  assert.equal(parseBrazilianNumber(entrada),quantidade);
  assert.equal(parseBrazilianNumber(formatDecimal(quantidade)),quantidade);
  assert.equal(parseBrazilianNumber(entrada)*100,total);
}
assert.equal(formatarQuantidades([{quantidade:0.5,unidade:'metro'},{quantidade:0.2,unidade:'metro'},{quantidade:0.05,unidade:'metro'}]),'0,75 m');
console.log('OK: venda de meio metro, 20 cm e 5 cm, preço proporcional e formatação sem perda.');
