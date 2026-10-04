import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from './db.js';
const erro = (s: string): never => { throw Object.assign(new Error(s), { statusCode: 409 }); };
const dinheiro = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const devolvidoEmOutraVendaSql = (alias: string) => `COALESCE((SELECT SUM(-r.quantidade) FROM itens_venda r JOIN vendas vr ON vr.id=r.vendaId WHERE r.itemOrigemId=${alias}.id AND r.quantidade<0 AND vr.deletedAt IS NULL AND vr.status<>'cancelada'),0)`;
export function ultimoPrecoDevolucao(clienteId: string, produtoId: string, unidade: string, excluirVenda = '') {
  const item = queryOne<any>(`SELECT i.*, v.desconto descontoGeral,
    (SELECT COALESCE(SUM(p.total),0) FROM itens_venda p WHERE p.vendaId=v.id AND p.quantidade>0) baseDesconto
    FROM itens_venda i JOIN vendas v ON v.id=i.vendaId
    WHERE v.clienteId=? AND i.produtoId=? AND i.unidade=? AND i.quantidade>0
      AND v.deletedAt IS NULL AND v.status<>'cancelada' AND v.id<>?
    ORDER BY v.data DESC,v.createdAt DESC,v.numeroSequencial DESC,i.rowid DESC LIMIT 1`, [clienteId,produtoId,unidade,excluirVenda]);
  if (!item) erro('Não há compra anterior deste produto para este cliente e unidade.');
  const fator = item.baseDesconto > 0 ? 1 - Number(item.descontoGeral || 0)/item.baseDesconto : 1;
  return { itemId: item.id, preco: dinheiro(Number(item.total)/Number(item.quantidade)*fator) };
}
export function itensElegiveisDevolucao(clienteId: string, excluirVenda = '') {
  const precos = new Map<string, ReturnType<typeof ultimoPrecoDevolucao>>();
  return queryAll<any>(`SELECT i.*, v.numeroSequencial numeroVenda,
    i.quantidade - COALESCE((SELECT SUM(d.quantidade) FROM itens_devolucao d WHERE d.itemVendaId=i.id),0)
      - COALESCE((SELECT SUM(-r.quantidade) FROM itens_venda r JOIN vendas vr ON vr.id=r.vendaId
        WHERE r.itemOrigemId=i.id AND vr.deletedAt IS NULL AND vr.status<>'cancelada' AND vr.id<>?),0) disponivel
    FROM itens_venda i JOIN vendas v ON v.id=i.vendaId
    WHERE v.clienteId=? AND v.deletedAt IS NULL AND v.status<>'cancelada' AND i.quantidade>0 AND v.id<>?
    ORDER BY v.data DESC,v.numeroSequencial DESC,i.rowid DESC`, [excluirVenda,clienteId,excluirVenda])
    .filter(i => i.disponivel > 0.000001).map(i => {
      const chave = JSON.stringify([i.produtoId,i.unidade]);
      if (!precos.has(chave)) precos.set(chave,ultimoPrecoDevolucao(clienteId,i.produtoId,i.unidade,excluirVenda));
      return {...i,...precos.get(chave)};
    });
}
export function resolverLinhaDevolucao(entrada: any, clienteId: string, vendaId: string, usadas: Set<string>, atual?: any) {
  const origemId = String(entrada.itemOrigemId || '');
  if (usadas.has(origemId)) erro('Agrupe a devolução da mesma compra em uma única linha.');
  usadas.add(origemId);
  const origem = itensElegiveisDevolucao(clienteId,vendaId).find(i => i.id === origemId);
  const qtd = Number(entrada.quantidade);
  if (!origem || origem.produtoId !== entrada.produtoId || !Number.isFinite(qtd) || qtd >= 0 || -qtd > origem.disponivel + 0.000001) erro('Devolução inválida: confira o cliente, a compra e a quantidade disponível.');
  if (entrada.unidade && entrada.unidade !== origem.unidade) erro('A unidade da devolução deve ser a mesma da compra.');
  if (Number(entrada.desconto || 0) !== 0) erro('Devolução não aceita desconto adicional.');
  const preservar = atual?.itemOrigemId === origemId && Number(atual.quantidade)<0;
  const preco = preservar ? Number(atual.precoUnitario) : origem.preco;
  if (Math.abs(Number(entrada.precoUnitario)-preco)>0.005 || !Number.isFinite(Number(entrada.precoUnitario))) erro('O último preço do cliente mudou. Carregue novamente os itens de devolução.');
  const total = -dinheiro(-qtd*preco), custoTotal = -dinheiro(-qtd*Number(origem.custoUnitario));
  return { ...origem, id: atual?.id || 'itv_'+crypto.randomUUID().replaceAll('-',''), vendaId,
    itemNovo: !atual, itemOrigemId: origem.id, itemPrecoOrigemId: preservar ? atual.itemPrecoOrigemId : origem.itemId,
    quantidade: qtd, quantidadeDevolvida: 0, precoUnitario: preco, desconto: 0, total, custoTotal,
    lucroBruto: dinheiro(total-custoTotal), precoMinimoSemPin: preco };
}
export function ajustarCreditoLinhas(vendaId: string, clienteId: string, valor: number) {
  const id = 'credito_devolucao_'+vendaId;
  const anterior = Number(queryOne<any>('SELECT valor FROM cliente_bonus_movimentos WHERE id=? AND deletedAt IS NULL',[id])?.valor || 0);
  const saldo = Number(queryOne<any>("SELECT COALESCE(SUM(CASE WHEN tipo='credito' THEN valor ELSE -valor END),0) saldo FROM cliente_bonus_movimentos WHERE clienteId=? AND deletedAt IS NULL",[clienteId])?.saldo || 0);
  if (anterior - valor > saldo + 0.005) erro('O crédito desta devolução já foi utilizado. Estorne seu uso antes de alterar ou cancelar a devolução.');
  if (valor>0 || anterior>0) execute(`INSERT INTO cliente_bonus_movimentos (id,clienteId,vendaId,data,tipo,valor,observacao)
    VALUES (?,?,?,date('now','localtime'),'credito',?,'Excedente de devolução na venda')
    ON CONFLICT(id) DO UPDATE SET valor=excluded.valor,deletedAt=NULL`,[id,clienteId,vendaId,valor]);
  execute('UPDATE vendas SET creditoLinhaDevolucao=? WHERE id=?',[valor,vendaId]);
}
export function protegerCompraDevolvida(id: string) {
  if (queryOne(`SELECT i.id FROM itens_venda i WHERE i.vendaId=? AND ${devolvidoEmOutraVendaSql('i')}>0 LIMIT 1`,[id])) erro('Esta compra possui devolução em outra venda. Corrija a devolução antes de cancelar sua origem.');
}
