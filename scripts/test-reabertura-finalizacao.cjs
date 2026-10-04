// Integração HTTP em base temporária vazia. Execute após npm run build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const Database = require('better-sqlite3');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luciano-finalizacao-http-'));
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

    const finalizar = (tipo, id, extras = {}, expected) => request('POST', `/${tipo === 'ordem' ? 'ordens-cobranca' : 'vendas'}/${id}/finalizar`, { pin, destinoRestante: 'novo_vale', zerarExcedente: false, ...extras }, expected);
    const previaFinal = (tipo, id, expected) => request('GET', `/finalizacoes/${tipo}/${id}/reabertura`, undefined, expected);
    const executarFinal = (tipo, id, revisao, senha = pin, expected) => request('POST', `/finalizacoes/${tipo}/${id}/reabertura`, { pin: senha, revisao, motivo: 'Correção autorizada' }, expected);
    const reabrirFinal = async (tipo, id) => executarFinal(tipo, id, (await previaFinal(tipo, id)).revisao);

    const v = await criarVale(100), o = await criarOrdem([v], []);
    const numeroVendas = db.prepare('SELECT COUNT(*) n FROM vendas').get().n;
    await finalizar('ordem', o.id, {}, 409);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vendas').get().n, numeroVendas);
    assert.equal((await getOrdem(o.id)).finalizadoAt, null);
    const titulo = { tipo: 'duplicata_emitente', nomeTitular: 'Cliente teste', documentoTitular: '12345678901', numeroDocumento: 'FINAL-1', valor: 40, vencimento: '2099-12-01', status: 'aguardando' };
    const r = await pagar([{ vendaId: v.id, valor: 40 }], { ordemCobrancaId: o.id, formaPagamento: 'duplicata_emitente', titulos: [titulo] });
    const f = await finalizar('ordem', o.id);
    assert.ok(f.ordem.finalizadoAt); assert.equal(f.valeResidual.valor, 60);
    await finalizar('ordem', o.id, {}, 409);
    await request('PUT', `/recebimentos-cliente/${r.id}`, { pin, formaPagamento: 'pix', data: '2026-09-08', valorRecebido: 30, distribuicaoAutomatica: true, alocacoes: [] }, 409);
    await request('PUT', `/vendas/${v.id}`, { pin }, 409);
    await previaFinal('vale', v.id, 409);
    const pr = await previaFinal('ordem', o.id);
    await executarFinal('ordem', o.id, pr.revisao, 'errada', 403);
    await executarFinal('ordem', o.id, '', pin, 409);
    // O processamento por data segue funcionando com a ordem finalizada.
    db.prepare("UPDATE recebimento_titulos SET vencimento='2000-01-01' WHERE recebimentoId=?").run(r.id);
    await request('GET', '/cheques'); await request('GET', '/cheques');
    assert.equal(db.prepare('SELECT status FROM recebimento_titulos WHERE recebimentoId=?').get(r.id).status, 'compensado');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM movimentacoes_financeiras WHERE recebimentoId=? AND tipo='compensacao_automatica'").get(r.id).n, 1);
    assert.ok((await getOrdem(o.id)).finalizadoAt);
    // O residual já negociado não bloqueia nem é alterado pela reabertura da origem.
    const posterior = await criarOrdem([{ id: f.valeResidual.id }], []);
    await pagar([{ vendaId: f.valeResidual.id, valor: 20 }], { ordemCobrancaId: posterior.id });
    const posteriorFinal = await finalizar('ordem', posterior.id);
    assert.equal(posteriorFinal.valeResidual.valor, 40);
    const residualAntes = db.prepare('SELECT * FROM vendas WHERE id=?').get(f.valeResidual.id);
    const posteriorAntes = db.prepare('SELECT * FROM ordens_cobranca WHERE id=?').get(posterior.id);
    await reabrirFinal('ordem', o.id);
    assert.deepEqual(db.prepare('SELECT * FROM vendas WHERE id=?').get(f.valeResidual.id), residualAntes);
    assert.deepEqual(db.prepare('SELECT * FROM ordens_cobranca WHERE id=?').get(posterior.id), posteriorAntes);
    const origem = (await request('GET', `/vendas/${f.valeResidual.id}`)).origemSaldo;
    assert.equal(origem.ordem.id, o.id); assert.equal(origem.vales[0].id, v.id); assert.equal(origem.vales[0].valor, 60);
    const aberta = await getOrdem(o.id);
    assert.equal(aberta.finalizadoAt, null); assert.equal(aberta.saldo, 0); assert.equal(aberta.valorPago, 40);
    assert.ok(aberta.eventos.some(e => e.texto.includes('reaberta para edição')));
    assert.equal(db.prepare('SELECT deletedAt FROM vendas WHERE id=?').get(f.valeResidual.id).deletedAt, null);
    assert.equal(db.prepare('SELECT status FROM recebimentos_cliente WHERE id=?').get(r.id).status, 'ativo');
    await executarFinal('ordem', o.id, pr.revisao, pin, 409);
    await request('PUT', `/recebimentos-cliente/${r.id}`, { pin, status: 'compensado', formaPagamento: 'pix', data: '2026-09-08', valorRecebido: 30, distribuicaoAutomatica: true, alocacoes: [] });
    assert.equal((await getOrdem(o.id)).saldo, 10);
    const f2 = await finalizar('ordem', o.id);
    assert.equal(f2.valeResidual.valor, 10);
    assert.notEqual(f2.valeResidual.id, f.valeResidual.id);
    console.log('OK: sem pagamento rejeitado; título futuro finaliza, compensa uma vez; reabertura com senha e revisão, edição e nova finalização');

    await pagar([{ vendaId: f2.valeResidual.id, valor: 5 }]);
    await reabrirFinal('ordem', o.id);
    assert.equal((await getOrdem(o.id)).saldo, 0);
    assert.equal((await request('GET', `/vendas/${f2.valeResidual.id}`)).saldoRestante, 5);
    assert.equal((await request('GET', `/vendas/${v.id}`)).financeiro.restantePresumido, 0);
    assert.equal((await request('GET', `/vendas/${v.id}`)).valorTransferido, 70);
    console.log('OK: residual independente em outra ordem; reabertura e repetição sem duplicar dívida');

    const vc = await criarVale(100), oc = await criarOrdem([vc], []);
    const rc = await pagar([{ vendaId: vc.id, valor: 100 }], { ordemCobrancaId: oc.id, formaPagamento: 'cheque_emitente',
      titulos: [{ ...titulo, tipo: 'cheque_emitente', valor: 100, numeroDocumento: 'FINAL-CHEQUE' }] });
    const fc = await finalizar('ordem', oc.id);
    assert.equal(fc.valeResidual, null);
    assert.equal(fc.ordem.saldo, 0);
    const tc = db.prepare('SELECT id,status FROM recebimento_titulos WHERE recebimentoId=?').get(rc.id);
    assert.equal(tc.status, 'aguardando');
    await request('PUT', `/recebimento-titulos/${tc.id}/status`, { pin, status: 'recusado', motivo: 'Conferência' }, 409);
    await reabrirFinal('ordem', oc.id);
    await request('PUT', `/recebimento-titulos/${tc.id}/status`, { pin, status: 'recusado', motivo: 'Conferência' });
    assert.equal((await getOrdem(oc.id)).saldo, 100);
    await finalizar('ordem', oc.id, {}, 409);
    console.log('OK: cheque pendente integral não gera residual; recusa após reabertura restaura dívida e não libera nova finalização');

    // Vale individual também pode ser reaberto sem estornar seu pagamento.
    const vi = await criarVale(100);
    await finalizar('vale', vi.id, {}, 409);
    const ri = await pagar([{ vendaId: vi.id, valor: 30 }]);
    const fi = await finalizar('vale', vi.id);
    await reabrirFinal('vale', vi.id);
    await conferirVale(vi.id, 30, 0);
    assert.equal(db.prepare('SELECT deletedAt FROM vendas WHERE id=?').get(fi.valeResidual.id).deletedAt, null);
    const iv = (await request('GET', `/vendas/${vi.id}`)).items[0];
    await request('PUT', `/vendas/${vi.id}`, { pin, observacoes: 'Vale corrigido', descontoGeral: 0, items: [{ id: iv.id, produtoId: produto.id, quantidade: 120, unidade: 'metro', precoUnitario: 1, desconto: 0 }] });
    await conferirVale(vi.id, 30, 20);
    assert.equal(db.prepare('SELECT status FROM recebimentos_cliente WHERE id=?').get(ri.id).status, 'ativo');
    console.log('OK: vale finalizado reabre, preserva recebimento e permite editar mercadorias');

    // Zerar restante não impede que uma correção restaure a dívida.
    const vz = await criarVale(100), oz = await criarOrdem([vz], []);
    await pagar([{ vendaId: vz.id, valor: 40 }], { ordemCobrancaId: oz.id });
    await finalizar('ordem', oz.id, { destinoRestante: 'zerar' });
    await reabrirFinal('ordem', oz.id);
    assert.equal((await getOrdem(oz.id)).saldo, 60);

    // Ajuste de bônus da finalização tem vínculo exato e é revertido uma única vez.
    const vb = await criarVale(100), ob = await criarOrdem([vb], []);
    await pagar([{ vendaId: vb.id, valor: 100 }], { ordemCobrancaId: ob.id, valorRecebido: 120 });
    const saldoBonus = () => db.prepare("SELECT SUM(CASE WHEN tipo='credito' THEN valor ELSE -valor END) n FROM cliente_bonus_movimentos WHERE clienteId=? AND deletedAt IS NULL").get(cliente.id).n;
    assert.equal(saldoBonus(), 20);
    await finalizar('ordem', ob.id, { zerarExcedente: true }); assert.equal(saldoBonus(), 0);
    await reabrirFinal('ordem', ob.id); assert.equal(saldoBonus(), 20);
    assert.equal((await getOrdem(ob.id)).valorPago, 100);
    console.log('OK: reabertura restaura saldo perdoado e bônus zerado, mantendo pagamentos');

    // Falha durante reabertura reverte a origem e preserva o residual.
    const vr = await criarVale(100), or = await criarOrdem([vr], []);
    await pagar([{ vendaId: vr.id, valor: 40 }], { ordemCobrancaId: or.id });
    const rf = await finalizar('ordem', or.id);
    const rp = await previaFinal('ordem', or.id);
    db.exec(`CREATE TRIGGER falha_reabertura BEFORE UPDATE OF finalizadoAt ON ordens_cobranca
      WHEN NEW.id='${or.id}' AND NEW.finalizadoAt IS NULL BEGIN SELECT RAISE(ABORT,'Falha simulada'); END`);
    await executarFinal('ordem', or.id, rp.revisao, pin, 500);
    assert.ok((await getOrdem(or.id)).finalizadoAt);
    assert.equal(db.prepare('SELECT deletedAt FROM vendas WHERE id=?').get(rf.valeResidual.id).deletedAt, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM auditoria WHERE entidadeId=? AND acao='finalizacao_reaberta'").get(or.id).n, 0);
    db.exec('DROP TRIGGER falha_reabertura');
    await reabrirFinal('ordem', or.id);
    console.log('OK: rollback atômico de reabertura, residual e auditoria');
    // Compatibilidade: referência antiga lida sem escrita, adotada apenas ao reabrir.
    const legado = await criarVale(100), ol = await criarOrdem([legado], [100]);
    const rl = await pagar([{ vendaId: legado.id, valor: 25 }], { parcelaOrdemId: ol.parcelas[0].id });
    const fl = await finalizar('ordem', ol.id);
    db.prepare('DELETE FROM vale_residual_origens WHERE valeResidualId=?').run(fl.valeResidual.id);
    await pagar([{ vendaId: fl.valeResidual.id, valor: 5 }]);
    const detalhesLegado = await request('GET', `/vendas/${fl.valeResidual.id}`);
    assert.equal(detalhesLegado.origemSaldo.ordem.id, ol.id);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM vale_residual_origens WHERE valeResidualId=?').get(fl.valeResidual.id).n, 0);
    await reabrirFinal('ordem', ol.id);
    assert.equal((await getOrdem(ol.id)).saldo, 0);
    assert.equal((await getOrdem(ol.id)).parcelas[0].saldo, 0);
    await reabrir('recebimento', rl.id);
    await conferirVale(legado.id, 0, 25);
    assert.equal((await getOrdem(ol.id)).saldo, 25);
    assert.equal((await request('GET', `/vendas/${fl.valeResidual.id}`)).saldoRestante, 70);
    assert.equal((await getOrdem(ol.id)).parcelas[0].saldo, 25);
    console.log('OK: referência legada, adoção transacional e estorno sem ressuscitar saldo transferido');
    console.log(`Todos os cenários de finalização passaram. Base isolada: ${temp}`);
  } catch (error) { console.error(logs.slice(-4000)); throw error; }
  finally { db?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
