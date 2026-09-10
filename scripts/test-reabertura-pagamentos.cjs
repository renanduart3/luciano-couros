// Integração HTTP em base temporária vazia. Execute após npm run build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const Database = require('better-sqlite3');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-reabertura-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [path.resolve('dist/server.cjs')], {
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
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await request('GET', '/health'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, logs);
    const pin = 'TesteReabertura123';
    await request('POST', '/auth/configurar-gerente', { nome: 'Gerente teste', senha: pin });
    await request('POST', '/auth/login', { login: 'gerente', senha: pin });
    db = new Database(path.join(temp, 'database.db'));
    const cliente = await request('POST', '/clientes', { nome: 'Cliente teste', documento: '12345678901', ativo: 1 });
    const produto = await request('POST', '/produtos', { nome: 'Material teste', unidade: 'metro', precoVendaPadrao: 1, custoPadrao: 0.5, ativo: 1 });
    const criarVale = (valor) => request('POST', '/vendas', { clienteId: cliente.id, data: '2026-09-08', formaPagamento: 'vale', valorPago: 0, descontoGeral: 0,
      vencimento: '2099-10-08', parcelas: [{ vencimento: '2099-10-08', valor }], items: [{ produtoId: produto.id, quantidade: valor, unidade: 'metro', precoUnitario: 1, desconto: 0 }] });
    const pagar = (alocacoes, extras = {}) => request('POST', `/clientes/${cliente.id}/carteira/recebimentos`, { data: '2026-09-08', formaPagamento: 'pix', valorRecebido: alocacoes.reduce((s, a) => s + a.valor, 0), bonusUtilizado: 0, alocacoes, ...extras });
    const previa = (tipo, id) => request('GET', `/reabertura-pagamentos/${tipo}/${id}`);
    const reabrir = async (tipo, id) => {
      const plano = await previa(tipo, id);
      await request('POST', `/reabertura-pagamentos/${tipo}/${id}`, { pin, revisao: plano.revisao, motivo: 'Teste de consistência' });
      return plano;
    };
    const conferirVale = async (id, pago, saldo) => {
      const vale = await request('GET', `/vendas/${id}`);
      assert.equal(vale.valorPago, pago);
      assert.equal(vale.saldoRestante, saldo);
      assert.equal(vale.status, saldo > 0 ? 'pendente' : 'paga');
    };
    const conferirEstorno = (id) => {
      assert.equal(db.prepare('SELECT status FROM recebimentos_cliente WHERE id = ?').get(id).status, 'cancelado');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pagamentos WHERE recebimentoId = ? AND deletedAt IS NULL').get(id).n, 0);
      for (const table of ['recebimento_alocacoes', 'recebimento_titulos', 'ordem_cobranca_recebimentos', 'ordem_cobranca_parcela_recebimentos', 'cliente_bonus_movimentos']) {
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE recebimentoId = ? AND deletedAt IS NULL`).get(id).n, 0, table);
      }
      assert.ok(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidadeId = ? AND acao = 'estornar_recebimento'").get(id).n > 0);
    };
    const criarOrdem = (vales, parcelas) => request('POST', '/ordens-cobranca', { clienteId: cliente.id, dataEmissao: '2026-09-08', vendaIds: vales.map(v => v.id), parcelas: parcelas.map((valor, i) => ({ valor, vencimento: new Date(Date.UTC(2099, 9 + i, 8)).toISOString().slice(0, 10) })) });
    const getOrdem = async (id) => (await request('GET', '/ordens-cobranca')).find(o => o.id === id);

    const v1 = await criarVale(100);
    const r1 = await pagar([{ vendaId: v1.id, valor: 100 }]);
    const p1 = await previa('vale', v1.id);
    assert.equal(p1.totalFinanceiro, 100);
    await request('POST', `/reabertura-pagamentos/vale/${v1.id}`, { pin: 'errada', revisao: p1.revisao }, 403);
    await conferirVale(v1.id, 100, 0);
    await reabrir('vale', v1.id);
    await conferirVale(v1.id, 0, 100);
    conferirEstorno(r1.id);
    await request('POST', `/reabertura-pagamentos/vale/${v1.id}`, { pin, revisao: p1.revisao }, 409);
    console.log('OK: vale pago -> em aberto, senha, estorno financeiro e repetição bloqueada');

    const va = await criarVale(100), vb = await criarVale(100);
    const ordem = await criarOrdem([va, vb], [100, 100]);
    const ra = await pagar([{ vendaId: va.id, valor: 100 }], { parcelaOrdemId: ordem.parcelas[0].id });
    await pagar([{ vendaId: vb.id, valor: 100 }], { parcelaOrdemId: ordem.parcelas[1].id });
    assert.equal((await getOrdem(ordem.id)).status, 'quitada');
    await reabrir('parcela', ordem.parcelas[0].id);
    const atual = await getOrdem(ordem.id);
    assert.equal(atual.status, 'aberta');
    assert.equal(atual.parcelas[0].saldo, 100);
    assert.equal(atual.parcelas[1].saldo, 0);
    await conferirVale(va.id, 0, 100);
    await conferirVale(vb.id, 100, 0);
    conferirEstorno(ra.id);
    console.log('OK: reabrir uma parcela de ordem quitada preserva outra parcela paga');

    const vc = await criarVale(50), vd = await criarVale(50);
    const compartilhada = await criarOrdem([vc, vd], [50, 50]);
    await pagar([{ vendaId: vc.id, valor: 50 }, { vendaId: vd.id, valor: 50 }]);
    const impacto = await previa('parcela', compartilhada.parcelas[0].id);
    assert.equal(impacto.compartilhado, true);
    assert.equal(impacto.vales.length, 2);
    assert.equal(impacto.parcelas.length, 2);
    await reabrir('parcela', compartilhada.parcelas[0].id);
    assert.equal((await getOrdem(compartilhada.id)).valorPago, 0);
    console.log('OK: recebimento compartilhado informa todos os impactos e estorna atomicamente');

    const ve = await criarVale(100);
    await pagar([{ vendaId: ve.id, valor: 40 }]);
    const antiga = await previa('vale', ve.id);
    await pagar([{ vendaId: ve.id, valor: 60 }]);
    await request('POST', `/reabertura-pagamentos/vale/${ve.id}`, { pin, revisao: antiga.revisao }, 409);
    await conferirVale(ve.id, 100, 0);
    assert.equal((await reabrir('vale', ve.id)).quantidadePagamentos, 2);
    await conferirVale(ve.id, 0, 100);
    console.log('OK: alteração concorrente bloqueada e múltiplos recebimentos estornados');

    const vf = await criarVale(100), vg = await criarVale(20);
    const excedente = await pagar([{ vendaId: vf.id, valor: 100 }], { valorRecebido: 120 });
    const usoBonus = await pagar([{ vendaId: vg.id, valor: 20 }], { formaPagamento: 'bonus', valorRecebido: 0, bonusUtilizado: 20 });
    await request('GET', `/reabertura-pagamentos/vale/${vf.id}`, undefined, 409);
    await request('PUT', `/recebimentos-cliente/${excedente.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'pix', valorRecebido: 100, alocacoes: [], distribuicaoAutomatica: true }, 409);
    await conferirVale(vf.id, 100, 0);
    await reabrir('recebimento', usoBonus.id);
    assert.equal((await reabrir('vale', vf.id)).variacaoBonus, -20);
    conferirEstorno(excedente.id);
    assert.equal(db.prepare("SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo FROM cliente_bonus_movimentos WHERE clienteId = ? AND deletedAt IS NULL").get(cliente.id).saldo, 0);
    console.log('OK: bônus utilizado bloqueia estorno; desfazer uso restaura consistência da carteira');

    const vh = await criarVale(50), vi = await criarVale(150);
    const editavel = await criarOrdem([vh, vi], [100, 100]);
    const edit = await pagar([{ vendaId: vh.id, valor: 40 }], { parcelaOrdemId: editavel.parcelas[0].id });
    const historicoAntes = (await getOrdem(editavel.id)).eventos;
    await request('PUT', `/recebimentos-cliente/${edit.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'pix', valorRecebido: 60, alocacoes: [], distribuicaoAutomatica: true });
    await conferirVale(vh.id, 50, 0);
    await conferirVale(vi.id, 10, 140);
    assert.equal((await getOrdem(editavel.id)).parcelas[0].valorPago, 60);
    const aMais = await request('PUT', `/recebimentos-cliente/${edit.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'pix', valorRecebido: 110, alocacoes: [], distribuicaoAutomatica: true });
    assert.equal(aMais.bonusGerado, 10);
    assert.equal((await getOrdem(editavel.id)).parcelas[1].valorPago, 0);
    await request('PUT', `/recebimentos-cliente/${edit.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'pix', valorRecebido: 60, alocacoes: [], distribuicaoAutomatica: true });
    await conferirVale(vh.id, 50, 0);
    console.log('OK: edição somente por montante redistribui nos vales e respeita a parcela');
    const ordemEditada = await getOrdem(editavel.id);
    assert.ok(ordemEditada.eventos[0].texto.startsWith('Ordem criada'));
    assert.ok(ordemEditada.eventos.findIndex(e => e.texto.startsWith('Pagamento registrado')) < ordemEditada.eventos.findIndex(e => e.texto.startsWith('Pagamento alterado')));
    for (const evento of historicoAntes) assert.deepEqual(ordemEditada.eventos.find(e => e.id === evento.id), evento);
    assert.ok(ordemEditada.eventos.some(e => e.texto.includes('Pagamento alterado:') && e.texto.includes('60,00')));
    assert.equal(ordemEditada.parcelas[0].pagamentos[0].id, edit.id);
    assert.equal(ordemEditada.parcelas[0].pagamentos[0].valorRecebido, 60);
    const replanejada = await request('PUT', `/ordens-cobranca/${editavel.id}/parcelas`, { updatedAt: ordemEditada.updatedAt, parcelas: ordemEditada.parcelas.map(p => ({ id: p.id, valor: p.valor, vencimento: p.valorPago > 0 ? p.vencimento : '2099-12-08' })) });
    assert.ok(replanejada.eventos.some(e => e.texto.includes('Parcelamento alterado:') && e.texto.includes('08/12/2099')));
    console.log('OK: histórico preserva o registro original e acrescenta alterações; linhas retornam pagamentos atualizados');

    const vj = await criarVale(80);
    const titulo = { nomeTitular: cliente.nome, documentoTitular: cliente.documento, numeroDocumento: 'T001', valor: 80, vencimento: '2099-10-08', status: 'compensado', dataCompensacao: '2026-09-08' };
    const cheque = await pagar([{ vendaId: vj.id, valor: 80 }], { formaPagamento: 'cheque_emitente', titulos: [titulo] });
    await reabrir('vale', vj.id);
    await conferirVale(vj.id, 0, 80);
    conferirEstorno(cheque.id);
    console.log('OK: reabertura estorna cheque compensado e seus vínculos');

    const vk = await criarVale(30);
    const recusa = await pagar([{ vendaId: vk.id, valor: 30 }], { formaPagamento: 'cheque_emitente', titulos: [{ ...titulo, valor: 30 }] });
    await request('PUT', `/recebimentos-cliente/${recusa.id}`, { pin, status: 'recusado', data: '2026-09-08', formaPagamento: 'cheque_emitente', valorRecebido: 0, alocacoes: [], distribuicaoAutomatica: true, titulos: [{ ...titulo, valor: 30, status: 'recusado' }] });
    await conferirVale(vk.id, 0, 30);
    await request('PUT', `/recebimentos-cliente/${recusa.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'cheque_emitente', valorRecebido: 30, alocacoes: [], distribuicaoAutomatica: true, titulos: [{ ...titulo, valor: 30 }] });
    await conferirVale(vk.id, 30, 0);
    console.log('OK: recusar e reconfirmar títulos recalcula os valores');

    const valeBoletos = await criarVale(100);
    const boletos = await pagar([{ vendaId: valeBoletos.id, valor: 100 }], { formaPagamento: 'duplicata_emitente', titulos: [{ ...titulo, numeroDocumento: 'B001', valor: 40 }, { ...titulo, numeroDocumento: 'B002', valor: 60 }] });
    const editarBoletos = (titulos, valorRecebido) => request('PUT', `/recebimentos-cliente/${boletos.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'duplicata_emitente', valorRecebido, alocacoes: [], distribuicaoAutomatica: true, titulos });
    const dadosBoletos = await request('GET', `/recebimentos-cliente/${boletos.id}/gerenciar`);
    const recusaParcial = await editarBoletos(dadosBoletos.titulos.map((t, i) => ({ ...t, status: i === 0 ? 'recusado' : 'compensado' })), 60);
    await conferirVale(valeBoletos.id, 60, 40);
    assert.equal(recusaParcial.titulos.find(t => t.numeroDocumento === 'B002').status, 'compensado');
    await editarBoletos(recusaParcial.titulos.map(t => ({ ...t, status: 'compensado', dataCompensacao: '2026-09-08' })), 100);
    await conferirVale(valeBoletos.id, 100, 0);
    await reabrir('recebimento', boletos.id);
    await conferirVale(valeBoletos.id, 0, 100);
    conferirEstorno(boletos.id);
    console.log('OK: edição inline de boletos preserva outros títulos, reconfirma e estorna o recebimento');

    const vl = await criarVale(100);
    const ordemTitulos = await criarOrdem([vl], [50, 50]);
    const tituloOrdem = await pagar([{ vendaId: vl.id, valor: 50 }], { formaPagamento: 'cheque_emitente', titulos: [{ ...titulo, valor: 50 }], parcelaOrdemId: ordemTitulos.parcelas[1].id });
    let gerencial = await request('GET', `/recebimentos-cliente/${tituloOrdem.id}/gerenciar`);
    await request('PUT', `/recebimento-titulos/${gerencial.titulos[0].id}/status`, { pin, status: 'recusado', motivo: 'Teste recusa' });
    await conferirVale(vl.id, 0, 100);
    await request('PUT', `/recebimento-titulos/${gerencial.titulos[0].id}/status`, { pin, status: 'compensado', dataCompensacao: '2026-09-08' });
    await conferirVale(vl.id, 50, 50);
    const ordemReconfirmada = await getOrdem(ordemTitulos.id);
    assert.equal(ordemReconfirmada.parcelas[0].valorPago, 0);
    assert.equal(ordemReconfirmada.parcelas[1].valorPago, 50);
    console.log('OK: reconfirmação individual de cheque restaura o financeiro e a parcela original');

    const vm = await criarVale(25);
    await request('POST', '/pagamentos', { clienteId: cliente.id, vendaId: vm.id, data: '2026-09-08', valor: 25, formaPagamento: 'pix' });
    await reabrir('vale', vm.id);
    await conferirVale(vm.id, 0, 25);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pagamentos WHERE vendaId = ? AND deletedAt IS NULL').get(vm.id).n, 0);
    console.log('OK: pagamento legado com vínculo individual também pode ser estornado');

    const renegVale = await criarVale(43363.30);
    const renegOrdem = await criarOrdem([renegVale], Array(5).fill(8672.66));
    for (const i of [0, 1, 2, 4]) await pagar([{ vendaId: renegVale.id, valor: 8672.66 }], { parcelaOrdemId: renegOrdem.parcelas[i].id });
    const parcial = await pagar([{ vendaId: renegVale.id, valor: 4000 }], { parcelaOrdemId: renegOrdem.parcelas[3].id });
    const antesReneg = await getOrdem(renegOrdem.id);
    const pedidoReneg = { formaPagamento: 'duplicata_emitente', pin, updatedAt: antesReneg.updatedAt, parcelaId: renegOrdem.parcelas[3].id, saldoEsperado: 4672.66, parcelas: [{ vencimento: '2100-01-08', valor: 2336.33 }, { vencimento: '2100-02-08', valor: 2336.33 }] };
    await request('POST', `/ordens-cobranca/${renegOrdem.id}/renegociar-saldo`, { ...pedidoReneg, pin: 'errado' }, 403);
    await request('POST', `/ordens-cobranca/${renegOrdem.id}/renegociar-saldo`, { ...pedidoReneg, formaPagamento: 'invalida' }, 400);
    const reneg = await request('POST', `/ordens-cobranca/${renegOrdem.id}/renegociar-saldo`, pedidoReneg);
    assert.equal(reneg.totalOriginal, 43363.30); assert.equal(reneg.saldo, 4672.66); assert.equal(reneg.valorPago, 38690.64);
    assert.equal(reneg.parcelas.find(p => p.numero === 6).formaPagamentoPrevista, 'duplicata_emitente');
    assert.equal(reneg.parcelas.find(p => p.numero === 7).formaPagamentoPrevista, 'duplicata_emitente');
    const origemReneg = reneg.parcelas.find(p => p.id === pedidoReneg.parcelaId);
    assert.equal(origemReneg.valorPago, 4000); assert.equal(origemReneg.valorRenegociado, 4672.66); assert.equal(origemReneg.saldo, 0);
    assert.equal(Math.round(reneg.parcelas.reduce((s, p) => s + p.saldo, 0) * 100), 467266);
    await request('POST', `/ordens-cobranca/${renegOrdem.id}/renegociar-saldo`, pedidoReneg, 409);
    await reabrir('recebimento', parcial.id);
    const aposEstornoReneg = await getOrdem(renegOrdem.id);
    assert.equal(aposEstornoReneg.saldo, 8672.66);
    assert.equal(Math.round(aposEstornoReneg.parcelas.reduce((s, p) => s + p.saldo, 0) * 100), 867266);
    console.log('OK: renegociar saldo preserva total, pagamentos e histórico, evita repetição e suporta estorno posterior');
    const novaReneg = aposEstornoReneg.parcelas.find(p => p.numero === 6);
    const sobraReneg = await pagar([{ vendaId: renegVale.id, valor: novaReneg.saldo }], { parcelaOrdemId: novaReneg.id, valorRecebido: 2500 });
    assert.equal(sobraReneg.bonusGerado, 163.67);
    const recebidoReneg = (await getOrdem(renegOrdem.id)).parcelas.find(p => p.numero === 6);
    assert.equal(recebidoReneg.formaPagamentoPrevista, 'duplicata_emitente');
    assert.equal(recebidoReneg.pagamentos[0].formaPagamento, 'pix');
    assert.equal((await getOrdem(renegOrdem.id)).parcelas.find(p => p.numero === 7).valorPago, 0);
    await reabrir('recebimento', sobraReneg.id);

    const valeCredito = await criarVale(1000);
    const recCredito = await pagar([{ vendaId: valeCredito.id, valor: 1000 }], { formaPagamento: 'cartao_credito', parcelasCartao: 3, valoresParcelasCartao: [200, 200, 600] });
    assert.deepEqual((await request('GET', `/recebimentos-cliente/${recCredito.id}/gerenciar`)).valoresParcelasCartao, [200, 200, 600]);
    await request('PUT', `/recebimentos-cliente/${recCredito.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'cartao_credito', parcelasCartao: 2, valoresParcelasCartao: [200, 200], valorRecebido: 1000, distribuicaoAutomatica: true, alocacoes: [] }, 400);
    await conferirVale(valeCredito.id, 1000, 0);
    console.log('OK: crédito mantém valores editados e rejeita soma divergente sem alterar saldo');

    const vale12 = await criarVale(1200);
    const lista12 = Array.from({ length: 12 }, (_, i) => ({ ...titulo, numeroDocumento: `DOZE-${i}`, valor: 100 }));
    await pagar([{ vendaId: vale12.id, valor: 1200 }], { formaPagamento: 'duplicata_emitente', titulos: [...lista12, { ...titulo, numeroDocumento: 'EXTRA', valor: 100 }], valorRecebido: 1300 }).then(() => assert.fail('13 títulos não devem passar'), e => assert.ok(e.message.includes('12')));
    const recibo12 = await pagar([{ vendaId: vale12.id, valor: 1200 }], { formaPagamento: 'duplicata_emitente', titulos: lista12 });
    const dados12 = await request('GET', `/recebimentos-cliente/${recibo12.id}/gerenciar`);
    assert.equal(dados12.titulos.length, 12);
    const parcial12 = await request('PUT', `/recebimentos-cliente/${recibo12.id}`, { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'duplicata_emitente', valorRecebido: 1140, distribuicaoAutomatica: true, alocacoes: [], titulos: dados12.titulos.map((t, i) => i === 0 ? { ...t, valor: 40 } : t) });
    assert.equal(parcial12.titulos[0].valorOriginal, 100); assert.equal(parcial12.titulos[0].valor, 40);
    await conferirVale(vale12.id, 1140, 60);
    console.log('OK: 12 títulos aceitos, 13 bloqueados e valor original preservado no pagamento parcial');

    const flexA = await criarVale(600), flexB = await criarVale(400);
    const flex = await request('POST', '/ordens-cobranca', { clienteId: cliente.id, dataEmissao: '2026-09-08', vendaIds: [flexA.id, flexB.id] });
    assert.equal(flex.parcelas.length, 0);
    assert.equal(flex.saldo, 1000);
    const flexPix = await pagar([{ vendaId: flexA.id, valor: 200 }], { ordemCobrancaId: flex.id });
    const flexCheque = await pagar([{ vendaId: flexA.id, valor: 300 }], { ordemCobrancaId: flex.id, formaPagamento: 'cheque_emitente',
      titulos: [{ ...titulo, tipo: 'cheque_emitente', valor: 300, vencimento: '2000-01-31', status: 'compensado', dataCompensacao: '2026-09-08' }] });
    const chequeAntes = await request('GET', `/recebimentos-cliente/${flexCheque.id}/gerenciar`);
    const chequeAberto = await request('PUT', `/recebimentos-cliente/${flexCheque.id}`, { pin, status: 'aguardando', data: '2026-09-08',
      formaPagamento: 'cheque_emitente', valorRecebido: 300, distribuicaoAutomatica: true, alocacoes: [],
      titulos: chequeAntes.titulos.map(t => ({ ...t, status: 'aguardando', dataCompensacao: null })) });
    assert.equal(chequeAberto.statusPagamento, 'aguardando');
    await request('GET', '/cheques');
    assert.equal((await request('GET', `/recebimentos-cliente/${flexCheque.id}/gerenciar`)).statusPagamento, 'aguardando');
    assert.equal((await getOrdem(flex.id)).pagamentos.find(p => p.id === flexCheque.id).statusPagamento, 'aguardando');
    const flexCredito = await pagar([{ vendaId: flexA.id, valor: 100 }, { vendaId: flexB.id, valor: 400 }], {
      ordemCobrancaId: flex.id, formaPagamento: 'cartao_credito', valorRecebido: 600, parcelasCartao: 3, valoresParcelasCartao: [200, 200, 200] });
    assert.equal(flexCredito.bonusGerado, 100);
    const flexQuitada = await getOrdem(flex.id);
    assert.equal(flexQuitada.status, 'aberta'); assert.equal(flexQuitada.pagamentos.length, 3); // Cheque ainda aguardando.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ordem_cobranca_parcela_recebimentos WHERE ordemId = ?').get(flex.id).n, 0);
    await request('PUT', `/recebimentos-cliente/${flexPix.id}`, { pin, status: 'compensado', data: '2026-09-08',
      formaPagamento: 'pix', valorRecebido: 100, distribuicaoAutomatica: true, alocacoes: [] });
    assert.equal((await getOrdem(flex.id)).saldo, 100);
    await reabrir('recebimento', flexCheque.id);
    conferirEstorno(flexCheque.id);
    assert.equal((await getOrdem(flex.id)).saldo, 400);
    assert.ok(!(await getOrdem(flex.id)).pagamentos.some(p => p.id === flexCheque.id));
    await reabrir('recebimento', flexCredito.id); await reabrir('recebimento', flexPix.id);
    assert.equal((await getOrdem(flex.id)).saldo, 1000);
    const flexC = await criarVale(50);
    const comNovoVale = await request('PUT', `/ordens-cobranca/${flex.id}/vales`, { vendaIds: [flexA.id, flexB.id, flexC.id] });
    assert.equal(comNovoVale.totalOriginal, 1050);
    const semVale = await request('PUT', `/ordens-cobranca/${flex.id}/vales`, { vendaIds: [flexA.id, flexB.id] });
    assert.equal(semVale.totalOriginal, 1000);
    await pagar([{ vendaId: flexC.id, valor: 50 }], { ordemCobrancaId: flex.id }).then(() => assert.fail('Vale fora da ordem'), e => assert.ok(e.message.includes('não pertence')));
    console.log('OK: ordem sem parcelas, formas mistas, crédito, bônus, edição, estorno, vales e título vencido respeitando status manual');

    const individual = await criarVale(1000);
    const individualPix = await pagar([{ vendaId: individual.id, valor: 200 }]);
    const individualCheque = await pagar([{ vendaId: individual.id, valor: 300 }], {
      formaPagamento: 'cheque_emitente', titulos: [{ ...titulo, tipo: 'cheque_emitente', valor: 300, numeroDocumento: 'IND-CHEQUE' }]
    });
    const individualBoleto = await pagar([{ vendaId: individual.id, valor: 500 }], {
      formaPagamento: 'duplicata_emitente', valorRecebido: 600,
      titulos: [{ ...titulo, tipo: 'duplicata_emitente', valor: 600, numeroDocumento: 'IND-BOLETO' }]
    });
    assert.equal(individualBoleto.bonusGerado, 100);
    await conferirVale(individual.id, 1000, 0);
    assert.equal((await request('GET', `/vendas/${individual.id}`)).recebimentos.length, 3);
    const boletoGerencial = await request('GET', `/recebimentos-cliente/${individualBoleto.id}/gerenciar`);
    const editarBoleto = { pin, status: 'compensado', data: '2026-09-08', formaPagamento: 'duplicata_emitente',
      valorRecebido: 400, distribuicaoAutomatica: true, alocacoes: [],
      titulos: boletoGerencial.titulos.map(t => ({ ...t, valor: 400, status: 'compensado', dataCompensacao: '2026-09-08' })) };
    await request('PUT', `/recebimentos-cliente/${individualBoleto.id}`, { ...editarBoleto, pin: 'errada' }, 403);
    await conferirVale(individual.id, 1000, 0);
    await request('PUT', `/recebimentos-cliente/${individualBoleto.id}`, editarBoleto);
    await conferirVale(individual.id, 900, 100);
    const boletoAtualizado = await request('GET', `/recebimentos-cliente/${individualBoleto.id}/gerenciar`);
    assert.equal(boletoAtualizado.bonusGerado, 0);
    assert.equal(boletoAtualizado.statusPagamento, 'compensado');
    await request('GET', '/cheques');
    await reabrir('recebimento', individualCheque.id);
    conferirEstorno(individualCheque.id);
    await conferirVale(individual.id, 600, 400);
    await reabrir('recebimento', individualBoleto.id);
    conferirEstorno(individualBoleto.id);
    await conferirVale(individual.id, 200, 800);
    await reabrir('recebimento', individualPix.id);
    await conferirVale(individual.id, 0, 1000);
    console.log('OK: vale individual com PIX, cheque e boleto, bônus, edição com senha e estornos independentes');

    const valeProgramado = await criarVale(100);
    const programado = await pagar([{ vendaId: valeProgramado.id, valor: 100 }], {
      formaPagamento: 'cheque_emitente',
      titulos: [{ ...titulo, valor: 100, status: 'aguardando', dataCompensacao: undefined, vencimento: '2099-12-10' }]
    });
    let ag = await request('GET', `/recebimentos-cliente/${programado.id}/gerenciar`);
    assert.equal(ag.titulos[0].compensacaoAutomatica, 1);
    await request('PUT', `/recebimento-titulos/${ag.titulos[0].id}/status`, { pin, status: 'compensado', dataCompensacao: '2026-09-10' });
    await request('PUT', `/recebimento-titulos/${ag.titulos[0].id}/status`, { pin, status: 'aguardando' });
    ag = await request('GET', `/recebimentos-cliente/${programado.id}/gerenciar`);
    assert.equal(ag.titulos[0].compensacaoAutomatica, 0);
    const reprogramar = async titulos => request('PUT', `/recebimentos-cliente/${programado.id}`, {
      pin, status: 'aguardando', data: '2026-09-10', formaPagamento: 'cheque_emitente', valorRecebido: 100,
      titulos, alocacoes: [], distribuicaoAutomatica: true
    });
    ag = await reprogramar(ag.titulos);
    assert.equal(ag.titulos[0].compensacaoAutomatica, 0);
    ag = await reprogramar(ag.titulos.map(t => ({ ...t, vencimento: '2099-12-11' })));
    assert.equal(ag.titulos[0].compensacaoAutomatica, 1);
    await reabrir('recebimento', programado.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimentacoes_financeiras WHERE recebimentoId = ? AND tipo = 'estorno'").get(programado.id).n, 1);
    console.log('OK: programação futura, suspensão manual, edição preservando suspensão, reagendamento e estorno auditável');

    const loteVale = await criarVale(1000);
    const loteOrdem = await criarOrdem([loteVale], []);
    const lotePix = await pagar([{ vendaId: loteVale.id, valor: 200 }], { ordemCobrancaId: loteOrdem.id });
    const loteCheque = await pagar([{ vendaId: loteVale.id, valor: 300 }], { ordemCobrancaId: loteOrdem.id,
      formaPagamento: 'cheque_emitente', titulos: [{ ...titulo, valor: 300, vencimento: '2099-12-10' }] });
    const loteItens = [lotePix, loteCheque].map(p => ({ tipo: 'recebimento', id: p.id }));
    const prepararLote = (acao, itens) => request('POST', `/ordens-cobranca/${loteOrdem.id}/pagamentos/previa`, { acao, itens });
    const executarLote = (acao, itens, revisao, senha = pin, expected) => request('POST', `/ordens-cobranca/${loteOrdem.id}/pagamentos/acoes`, { acao, itens, revisao, pin: senha }, expected);
    const lp = await prepararLote('estornar', loteItens);
    await executarLote('estornar', loteItens, lp.revisao, 'errada', 403);
    await conferirVale(loteVale.id, 500, 500);
    await request('POST', `/ordens-cobranca/${loteOrdem.id}/pagamentos/previa`, { acao: 'estornar', itens: [loteItens[0], loteItens[0]] }, 400);
    let lo = await executarLote('estornar', loteItens, lp.revisao);
    assert.equal(lo.status, 'aberta'); assert.equal(lo.valorPago, 0); assert.equal(lo.saldo, 1000);
    assert.equal(lo.pagamentos.length, 0); assert.equal(lo.projecoes.length, 2);
    await conferirVale(loteVale.id, 0, 1000);
    await executarLote('estornar', loteItens, lp.revisao, pin, 409);
    const pp = lo.projecoes.find(p => p.dados.formaPagamento === 'pix');
    const edicaoProjecao = { pin, revisao: pp.revisao, data: '2026-09-10', formaPagamento: 'pix', valorRecebido: 250 };
    lo = await request('PUT', `/ordens-cobranca/${lo.id}/projecoes/${pp.id}`, edicaoProjecao);
    assert.equal(lo.saldo, 1000); assert.equal(lo.projecoes.find(p => p.id === pp.id).dados.valorRecebido, 250);
    await request('PUT', `/ordens-cobranca/${lo.id}/projecoes/${pp.id}`, edicaoProjecao, 409);
    const ppAtual = lo.projecoes.find(p => p.id === pp.id);
    const registrarProjecao = { ordemCobrancaId: lo.id, projecaoId: pp.id, projecaoRevisao: ppAtual.revisao, pin };
    const pRegistrado = await pagar([{ vendaId: loteVale.id, valor: 250 }], registrarProjecao);
    assert.equal(pRegistrado.ordemAtualizada.saldo, 750);
    assert.equal(pRegistrado.ordemAtualizada.projecoes.length, 1);
    await request('POST', `/clientes/${cliente.id}/carteira/recebimentos`, { ...registrarProjecao,
      data: '2026-09-10', formaPagamento: 'pix', valorRecebido: 250, alocacoes: [{ vendaId: loteVale.id, valor: 250 }] }, 409);
    await conferirVale(loteVale.id, 250, 750);
    const pEditavel = await request('GET', `/recebimentos-cliente/${pRegistrado.id}/gerenciar`);
    const editarAtual = { pin, revisao: pEditavel.revisao, data: '2026-09-10', status: 'compensado', formaPagamento: 'pix', valorRecebido: 100, alocacoes: [], distribuicaoAutomatica: true };
    const depoisEdicao = await request('PUT', `/recebimentos-cliente/${pRegistrado.id}`, editarAtual);
    assert.equal(depoisEdicao.ordemAtualizada.saldo, 900);
    await request('PUT', `/recebimentos-cliente/${pRegistrado.id}`, editarAtual, 409);
    const excluirItens = [{ tipo: 'recebimento', id: pRegistrado.id }, { tipo: 'projecao', id: lo.projecoes.find(p => p.id !== pp.id).id }];
    const px = await prepararLote('excluir', excluirItens);
    lo = await executarLote('excluir', excluirItens, px.revisao);
    assert.equal(lo.projecoes.length, 0); assert.equal(lo.pagamentos.length, 0); assert.equal(lo.saldo, 1000);
    await conferirVale(loteVale.id, 0, 1000);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidadeId = ? AND acao = 'pagamentos_ordem_estornar'").get(lo.id).n);
    console.log('OK: lote atômico, senha, revisões, previsões sem movimentação, registro único, edição e exclusão com saldos atualizados');

    const rollbackVale = await criarVale(50), rollbackVale2 = await criarVale(50);
    const rollbackOrdem = await criarOrdem([rollbackVale, rollbackVale2], []);
    const rb1 = await pagar([{ vendaId: rollbackVale.id, valor: 50 }], { valorRecebido: 70 });
    const rb2 = await pagar([{ vendaId: rollbackVale2.id, valor: 50 }], { valorRecebido: 70 });
    const gastoVale = await criarVale(20);
    const gasto = await pagar([{ vendaId: gastoVale.id, valor: 20 }], { formaPagamento: 'bonus', valorRecebido: 0, bonusUtilizado: 20 });
    const rbItens = [rb1, rb2].map(p => ({ tipo: 'recebimento', id: p.id }));
    const rbPrevia = await request('POST', `/ordens-cobranca/${rollbackOrdem.id}/pagamentos/previa`, { acao: 'estornar', itens: rbItens });
    // Cada crédito cabe sozinho na carteira, mas o segundo falha após o primeiro: tudo deve voltar.
    await request('POST', `/ordens-cobranca/${rollbackOrdem.id}/pagamentos/acoes`, { acao: 'estornar', itens: rbItens, revisao: rbPrevia.revisao, pin }, 409);
    await conferirVale(rollbackVale.id, 50, 0);
    await conferirVale(rollbackVale2.id, 50, 0);
    const aposFalha = await getOrdem(rollbackOrdem.id);
    assert.equal(aposFalha.pagamentos.length, 2); assert.equal(aposFalha.projecoes.length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimentacoes_financeiras WHERE recebimentoId IN (?, ?) AND tipo = 'estorno'").get(rb1.id, rb2.id).n, 0);
    await reabrir('recebimento', gasto.id);
    console.log('OK: falha no segundo item reverte estorno, carteira, histórico e projeção do primeiro');

    await request('DELETE', `/produtos/${produto.id}`, {}, 403);
    await request('DELETE', `/produtos/${produto.id}`, { pin: 'errada' }, 403);
    assert.equal(db.prepare('SELECT ativo FROM produtos WHERE id = ?').get(produto.id).ativo, 1);
    await request('DELETE', `/produtos/${produto.id}`, { pin });
    assert.equal(db.prepare('SELECT ativo FROM produtos WHERE id = ?').get(produto.id).ativo, 0);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidadeId = ? AND acao = 'produto_arquivado'").get(produto.id).n > 0);
    console.log('OK: arquivamento exige senha do gerente e registra auditoria');
    console.log(`Todos os cenários passaram. Base isolada: ${temp}`);
  } catch (error) {
    console.error(logs.slice(-4000));
    throw error;
  } finally {
    db?.close();
    child.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
