const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { buildSync } = require('esbuild');
const compiled = buildSync({ entryPoints: ['src/lib/planilhas.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = new Module(path.resolve('scripts/planilha-runtime.cjs'));
mod._compile(compiled.outputFiles[0].text, mod.id);
const { avaliarCelula, apresentarCelula, calcularPlanilha, resumirSelecao, limitesSelecao, LINHAS, COLUNAS } = mod.exports;
const mostrar = (formula) => apresentarCelula({ A1: formula }, 'A1', true).texto;
for (const texto of ['25/10/2026', '25-10-2026', '2+3', '12/4', '123 produto']) {
  assert.deepEqual(apresentarCelula({A1:texto},'A1',true),{texto,erro:false,numerico:false});
}
assert.equal(mostrar('=12/4'),'R$ 3,00');
assert.equal(apresentarCelula({A1:'25/10/2026',A2:'10',A3:'=SOMA(A1:A2)'},'A3',false).texto,'10');
assert.deepEqual(avaliarCelula({ A1: '=0,1+0,2' }, 'A1'), { n: 3n, d: 10n });
assert.equal(mostrar('=1/3*3'), 'R$ 1,00');
assert.equal(mostrar('=1,005'), 'R$ 1,01');
assert.equal(mostrar('=-1,005'), '-R$ 1,01');
assert.equal(mostrar('=(100+50)*5%'), 'R$ 7,50');
assert.equal(mostrar('=1/0'), '#DIV/0!');
assert.equal(mostrar('=A1'), '#CICLO!');
assert.equal(mostrar('=P1'), '#REF!');
assert.equal(mostrar('=alert(1)'), '#FÓRMULA!');
assert.deepEqual(avaliarCelula({ A1: '5%', B1: '=200*A1' }, 'B1'), { n: 10n, d: 1n });
assert.equal(apresentarCelula({ A1: '=SOMA(B1:B3)', B1: 'Título', B2: '1.234,56', B3: '0,44' }, 'A1', true).texto, 'R$ 1.235,00');
const amostra = { B1: '0', B2: 'texto', B4: '8', B5: '1' };
for (const [formula, esperado] of [['=MÉDIA(B1:B5)', '3'], ['=MEDIANA(B1:B5)', '1'], ['=MEDIANA(B1:B4)', '4']]) {
  assert.equal(apresentarCelula({ ...amostra, A1: formula }, 'A1', false).texto, esperado);
}
const cadeia = { A40: '1' };
for (let l = 39; l > 0; l--) cadeia[`A${l}`] = `=A${l + 1}+A${l + 1}`;
assert.equal(avaliarCelula(cadeia, 'A1').n, 2n ** 39n);
assert.equal(LINHAS,500);assert.equal(COLUNAS,15);
assert.deepEqual(avaliarCelula({ A500:'2',O500:'=SOMA(A500:N500)' },'O500'),{n:2n,d:1n});
assert.throws(()=>avaliarCelula({},'A501'),/#REF!/);
assert.throws(()=>avaliarCelula({},'P1'),/#REF!/);
const cheia={};for(let l=1;l<=500;l++){for(let c=0;c<14;c++)cheia[String.fromCharCode(65+c)+l]=String(l);cheia['O'+l]=`=SOMA(A${l}:N${l})`;}
const tempos=[];for(let i=0;i<15;i++){const inicio=performance.now();const exibicao=calcularPlanilha(cheia,[]);tempos.push(performance.now()-inicio);assert.equal(exibicao.O500.texto,'7.000');}
const repeticoes={A1:'2'};for(let l=2;l<=100;l++)repeticoes['A'+l]=`=A${l-1}*A${l-1}`;
assert.equal(calcularPlanilha(repeticoes,[]).A100.texto,'#LIMITE!');
console.log('OK: decimais exatos, arredondamento, referências, fórmulas até a linha 500 e limites de complexidade.');
console.log('Grade cheia: 7.500 células, 500 fórmulas; recálculo mediano '+tempos.sort((a,b)=>a-b)[7].toFixed(1)+' ms, máximo '+Math.max(...tempos).toFixed(1)+' ms.');

const intervalo=calcularPlanilha({A1:'0,1',A2:'0,2',A3:'0',A4:'Texto',B1:'=A1+A2',B2:'-1,5',B3:'=1/0'},[]);
assert.deepEqual(resumirSelecao(intervalo,'A1','B4'),{quantidade:5,soma:'-0,90',media:'-0,18',minimo:'-1,50',maximo:'0,30',erro:false});
assert.deepEqual(resumirSelecao(intervalo,'B4','A1'),resumirSelecao(intervalo,'A1','B4'));
assert.deepEqual(limitesSelecao('O500','A1'),{primeiraLinha:0,ultimaLinha:499,primeiraColuna:0,ultimaColuna:14});
assert.deepEqual(resumirSelecao(intervalo,'A4','B4'),{quantidade:0,soma:'—',media:'—',minimo:'—',maximo:'—',erro:false});
assert.equal(resumirSelecao(calcularPlanilha({A1:'1,005',A2:'1,005'},[]),'A1','A2').soma,'2,01');
const resumoCheia=resumirSelecao(calcularPlanilha(cheia,[]),'A1','O500');
assert.equal(resumoCheia.quantidade,7500);assert.equal(resumoCheia.soma,'3.507.000');assert.equal(resumoCheia.media,'467,60');assert.equal(resumoCheia.minimo,'1');assert.equal(resumoCheia.maximo,'7.000');
console.log('OK: seleção retangular/reversa, zero, negativos, fórmulas, textos/erros ignorados, casas decimais exatas e resumo de 7.500 células.');
