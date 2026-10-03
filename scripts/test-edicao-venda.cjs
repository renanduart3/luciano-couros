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

    const produto2 = await request('POST', '/produtos', { nome: 'ESTF COROLA', unidade: 'metro', precoVendaPadrao: 94.9, custoPadrao: 10, ativo: 1 });
    const criar = async (descontoItem = 0, descontoGeral = 0) => {
      const criada = await request('POST', '/vendas', { clienteId: cliente.id, data: '2026-09-11', formaPagamento: 'vale', valorPago: 0, descontoGeral, autorizacaoPreco: { pin },
        vencimento: '2099-10-08', items: [{ produtoId: produto.id, quantidade: 300, unidade: 'metro', precoUnitario: 1, desconto: descontoItem }] });
      return request('GET', `/vendas/${criada.id}`);
    };
    const editar = (v, items, desconto = v.desconto, extras = {}, expected) => request('PUT', `/vendas/${v.id}`, { pin, data: v.data, desconto, items, ...extras }, expected);
    let venda = await criar();
    venda = await editar(venda, [{ id: venda.items[0].id, produtoId: produto2.id, quantidade: 2.49, precoUnitario: 94.9, desconto: 0 }], 0, { totalEsperado: 236.30 });
    assert.equal(venda.totalLiquido, 236.30);
    assert.equal(venda.items[0].total, 236.30);
    assert.equal(venda.items[0].produtoId, produto2.id);
    assert.equal(venda.saldoRestante, 236.30);
    venda = await editar(venda, venda.items, 0, { totalEsperado: 236.30 });
    assert.equal(venda.totalLiquido, 236.30);
    await editar(venda, venda.items, 236.06, { totalEsperado: 236.30 }, 400);
    assert.equal((await request('GET', `/vendas/${venda.id}`)).totalLiquido, 236.30);
    let descontada = await criar(20, 10);
    assert.equal(descontada.subtotal, 280);
    assert.equal(descontada.totalLiquido, 270);
    descontada = await editar(descontada, descontada.items);
    assert.equal(descontada.totalLiquido, 270);
    let devolvida = await criar();
    const devolucaoVale = await request('POST', `/vendas/${devolvida.id}/devolucoes`, { pin, data: '2026-09-11', items: [{ itemVendaId: devolvida.items[0].id, quantidade: 100 }] });
    assert.equal(devolucaoVale.bonusGerado, 100);
    assert.equal(devolucaoVale.abatimentoVale, 0);
    devolvida = await request('GET', `/vendas/${devolvida.id}`);
    assert.equal(devolvida.totalLiquido, 300);
    assert.equal(devolvida.saldoRestante, 300);
    assert.equal(devolvida.totalMercadoriasAposDevolucoes, 200);
    assert.equal(devolvida.bonusGeradoVenda, 100);
    assert.equal(devolvida.devolucoes[0].modalidade, 'bonus_integral');
    assert.equal(db.prepare("SELECT saldo FROM vale_parcelas WHERE vendaId = ? AND deletedAt IS NULL").get(devolvida.id).saldo, 300);
    await editar(devolvida, devolvida.items, 0, { totalEsperado: 300 }, 409);
    assert.equal(devolvida.items[0].quantidadeDisponivel, 200);
    await editar(devolvida, [{ ...devolvida.items[0], produtoId: produto2.id }], 0, {}, 409);
    assert.equal((await request('GET', `/vendas/${devolvida.id}`)).totalLiquido, 300);
    const valeExcedente = await criar();
    const pagamentoExcedente = await request('POST', `/clientes/${cliente.id}/carteira/recebimentos`, {
      data: '2026-09-11', formaPagamento: 'pix', valorRecebido: 350,
      alocacoes: [{ vendaId: valeExcedente.id, valor: 300 }]
    }, 201);
    assert.equal(pagamentoExcedente.bonusGerado, 50);
    const valeComBonus = await request('GET', `/vendas/${valeExcedente.id}`);
    assert.equal(valeComBonus.bonusGeradoVenda, 50);
    assert.equal(valeComBonus.saldoRestante, 0);
    assert.equal((await request('GET', `/vendas/${devolvida.id}`)).bonusGeradoVenda, 100);
    const usoBonus = await request('POST', `/clientes/${cliente.id}/carteira/recebimentos`, {
      data: '2026-09-11', formaPagamento: 'bonus', valorRecebido: 0, bonusUtilizado: 100,
      alocacoes: [{ vendaId: devolvida.id, valor: 100 }]
    }, 201);
    assert.equal(usoBonus.bonusUtilizado, 100);
    assert.equal((await request('GET', `/vendas/${devolvida.id}`)).saldoRestante, 200);
    assert.equal((await request('GET', `/vendas/${devolvida.id}`)).bonusGeradoVenda, 100);
    let multipla = await criar();
    multipla = await editar(multipla, [...multipla.items, { id: 'adicional', produtoId: produto2.id, quantidade: 2.49, precoUnitario: 94.9, desconto: 0 }]);
    assert.equal(multipla.totalLiquido, 536.30);
    multipla = await editar(multipla, multipla.items.filter(i => i.produtoId === produto2.id));
    assert.equal(multipla.totalLiquido, 236.30);
    multipla = await editar(multipla, multipla.items.map(i => ({ ...i, quantidade: 3, precoUnitario: 90 })));
    assert.equal(multipla.totalLiquido, 270);
    const relatorio = await request('GET', `/relatorios?clienteId=${cliente.id}`);
    assert.equal(relatorio.vendas.find(v => v.id === devolvida.id).totalLiquido, 200);
    assert.equal(relatorio.vendas.find(v => v.id === devolvida.id).totalFinanceiroVale, 300);
    const linhas = relatorio.itensVendidos.filter(i => i.vendaId === venda.id);
    assert.ok(Math.abs(linhas.reduce((s, i) => s + i.valorVendaLiquido, 0) - 236.30) < 0.005);
    const pagaCriada = await request('POST', '/vendas', { clienteId: cliente.id, data: '2026-09-11', formaPagamento: 'pix', valorPago: 100, descontoGeral: 0, autorizacaoPreco: { pin },
      items: [{ produtoId: produto.id, quantidade: 10, unidade: 'metro', precoUnitario: 10, desconto: 0 }] });
    let paga = await request('GET', `/vendas/${pagaCriada.id}`);
    assert.equal(paga.status, 'paga');
    const devolver = (items, senha = pin, expected) => request('POST', `/vendas/${paga.id}/devolucoes`, { pin: senha, data: '2026-09-11', items }, expected);
    const primeira = { itemVendaId: paga.items[0].id, quantidade: 2 };
    await devolver([primeira], 'senha-invalida', 403);
    await devolver([primeira, primeira], pin, 400);
    const primeiraDevolucao = await devolver([primeira]);
    assert.equal(primeiraDevolucao.valorCredito, 20);
    assert.equal(primeiraDevolucao.bonusGerado, 20);
    paga = primeiraDevolucao.venda;
    assert.equal(paga.totalLiquido, 80);
    assert.equal(paga.items[0].quantidadeDisponivel, 8);
    await devolver([{ itemVendaId: paga.items[0].id, quantidade: 9 }], pin, 400);
    paga = (await devolver([{ itemVendaId: paga.items[0].id, quantidade: 8 }])).venda;
    assert.equal(paga.totalLiquido, 0);
    assert.equal(paga.items[0].quantidadeDisponivel, 0);
    const relatorioDepois = await request('GET', `/relatorios?clienteId=${cliente.id}`);
    await request('GET', '/dashboard');
    assert.equal(relatorioDepois.itensVendidos.filter(i => i.vendaId === paga.id).length, 0);
    assert.equal(relatorioDepois.vendas.find(v => v.id === paga.id).totalLiquido, 0);
    const lista = await request('GET', '/vendas');
    assert.equal(lista.find(v => v.id === venda.id).totalLiquido, 236.30);
    console.log('OK: edição, devolução parcial e total de venda paga, PIN, duplicidade, limite de quantidade e relatórios.');
  } catch (error) {
    console.error(logs.slice(-4000));
    throw error;
  } finally {
    db?.close();
    child.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
