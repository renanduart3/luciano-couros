# Parte 5 — devoluções durante a venda e o vale

Implementação em main, 04/10/2026.

## Uso

Na criação ou edição da venda, selecione o cliente e use **Adicionar devolução de compra anterior**. A lista mostra as compras elegíveis, a quantidade disponível e o último preço efetivo vendido ao cliente. A linha é incluída com quantidade negativa; ajuste essa quantidade antes de salvar. O mesmo editor atende vendas e vales, pela opção Editar no histórico de vendas.

A compra e a devolução podem ser do mesmo produto na mesma operação. Linhas de devolução têm fundo destacado, identificação e valores negativos. O comprovante usa texto vermelho e fundo claro; eventual crédito excedente é identificado separadamente.

## Regras implementadas

- A quantidade é vinculada a uma compra anterior do mesmo cliente, produto e unidade. Quantidades já devolvidas, inclusive pelo fluxo anterior, são descontadas da disponibilidade.
- O preço vem da última venda válida do cliente/produto/unidade, ordenada por data, criação, número da venda e registro do item. Vendas canceladas e linhas negativas não definem o preço. A própria operação em edição é excluída da busca.
- O preço efetivo inclui desconto do item e rateio do desconto geral entre os itens positivos; é arredondado em centavos. Origem da quantidade e origem do preço são registradas separadamente.
- Uma devolução nova rejeita preço divergente do histórico consultado no momento da gravação. Linhas já gravadas preservam a cotação registrada quando editadas, sem reavaliar seu histórico silenciosamente.
- A devolução abate a operação atual. Se o resultado for negativo, o valor cobrável fica em zero e o excedente vira crédito na carteira. A dívida da compra de origem não é abatida outra vez.
- O crédito excedente tem um registro por venda, ajustado na edição sem duplicação. Redução ou cancelamento é impedido quando faltar saldo para devolver crédito já utilizado.
- A criação com devolução exige senha gerencial; a edição mantém a senha já exigida pelo sistema. Auditoria registra itens, referências e crédito.
- Uma compra com devolução ativa em outra operação não pode ser cancelada ou ter seus itens removidos/reduzidos abaixo do devolvido. Cancelar a operação de devolução libera a quantidade novamente, dentro da mesma transação.
- Relatórios conservam linhas negativas, seus custos e valores. Descontos gerais não reduzem novamente o crédito devolvido. Devoluções não atualizam o preço habitual como se fossem compras.

## Compatibilidade

O botão de devolução avulsa já existente continua com sua destinação anterior: devolução de vale gera bônus integral; devolução de venda sem vencimento abate dívida e credita o excedente. Esse fluxo também passou a usar o último preço do cliente e compartilha a conferência da quantidade. Para abater uma compra nova ou uma operação em edição, use a linha negativa do editor.

Documentos finalizados continuam exigindo reabertura. Valem as proteções existentes para itens comprometidos em ordens abertas e devoluções avulsas históricas. Não houve alteração em massa de registros antigos.

## Validação

- `npm run lint` e `npm run build`.
- `test-devolucoes-na-venda.cjs`: integração HTTP em base temporária, preço por cliente, canceladas excluídas, cotação desatualizada, descontos, criação e edição, mesmo produto com sinais opostos, limite de quantidade, crédito excedente, crédito utilizado, remoção/cancelamento e rollback com falha SQLite simulada. Também verifica valores negativos nos relatórios.
- `test-edicao-venda.cjs`: regressão de edição, devoluções existentes e relatórios.
- `test-comprovante-venda.cjs`: duas vias, paginação, linhas negativas e crédito excedente sem desconto fictício.
- `test-valor-item-relatorio.cjs`: rateio legado e compra com devolução, incluindo desconto apenas na compra e devolução pura.
- `test-financeiro-fluxo.cjs`: regressão dos cálculos, programação e relatórios.

Testes em bases temporárias. Sem publicação ou escrita na base operacional. Build mantém o aviso de tamanho do bundle. Impressão física e conferência visual em navegador não foram executadas.
