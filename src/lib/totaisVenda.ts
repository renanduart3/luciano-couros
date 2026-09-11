const erroCalculo = (mensagem: string) => Object.assign(new Error(mensagem), { statusCode: 400 });

export const arredondarDinheiro = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

export function validarTotalEsperado(esperado: unknown, calculado: number) {
  if (esperado !== undefined && (typeof esperado !== 'number' || !Number.isFinite(esperado) || Math.abs(esperado - calculado) > 0.005)) {
    throw erroCalculo('O total calculado diverge do total exibido. Recarregue a venda e confira os materiais e descontos.');
  }
}

export function totalItemVenda(quantidade: number, preco: number, desconto = 0) {
  if (![quantidade, preco, desconto].every(Number.isFinite) || quantidade <= 0 || preco < 0 || desconto < 0 || desconto > quantidade * preco) {
    throw erroCalculo('Quantidade, preço ou desconto do item inválido.');
  }
  return arredondarDinheiro(quantidade * preco - desconto);
}

export function totaisVenda(itens: Array<{ total: number }>, desconto: number, creditoDevolucoes = 0) {
  const subtotal = arredondarDinheiro(itens.reduce((soma, item) => soma + item.total, 0));
  if (!Number.isFinite(desconto) || desconto < 0 || desconto > subtotal || !Number.isFinite(creditoDevolucoes) || creditoDevolucoes < 0) {
    throw erroCalculo('O desconto geral deve estar entre zero e o subtotal.');
  }
  desconto = arredondarDinheiro(desconto);
  if (creditoDevolucoes > subtotal - desconto + 0.005) {
    throw erroCalculo('O total da venda não pode ser inferior ao crédito das devoluções já registradas.');
  }
  return { subtotal, desconto, totalLiquido: arredondarDinheiro(Math.max(0, subtotal - desconto - creditoDevolucoes)) };
}
