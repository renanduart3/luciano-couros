# Parte 6 — bônus em vendas e pagamentos

Implementação em main, 04/10/2026.

## Uso e cálculo

A venda, o pagamento individual de vale e as linhas de pagamentos de ordens permitem informar **Bônus a utilizar** junto à forma de pagamento. O saldo disponível é exibido. Em pagamentos sem títulos, alterar o bônus ajusta o valor em dinheiro para manter o abatimento total. Em cheques/duplicatas, os valores dos títulos continuam explícitos e são somados ao bônus.

Exemplo: venda/dívida de R$ 100, bônus de R$ 20 e Pix de R$ 80. São abatidos R$ 100, entram R$ 80 no financeiro e saem R$ 20 da carteira. A opção Bônus continua disponível para pagamento somente com crédito. Na criação de um vale, o bônus pode abater parte do total e o restante fica em aberto.

O resumo de valores identifica quanto do total pago é bônus. O comprovante de venda separa valor recebido em dinheiro e bônus utilizado. O crédito não reduz novamente o total das mercadorias como desconto.

## Edição e reversão

- Pagamentos iniciais com bônus passam a ter recebimento, alocação e movimento de carteira vinculados. Isso permite editar, finalizar e estornar pelos fluxos existentes.
- A edição preserva o bônus quando o campo é omitido por um fluxo interno e aceita alteração explícita. Alterar somente a composição dinheiro/bônus também recalcula a carteira, mesmo que o total permaneça igual.
- Cheques e duplicatas usam apenas a parte em dinheiro para validar seus valores. Recusar um título preserva o bônus aplicado; reconfirmar restaura a parte financeira sem consumir o crédito novamente.
- Cartão parcela somente a parte financeira. Previsões de pagamentos preservam o bônus e não o reservam: a disponibilidade é verificada ao efetivar o recebimento.
- Cancelar venda/vale com recebimentos ativos executa o estorno transacional antes do cancelamento, incluindo alocações compartilhadas. Não gera um segundo crédito equivalente ao pagamento inteiro.
- Débitos antigos identificados como crédito aplicado diretamente na venda continuam reconhecidos na posição financeira, finalização e estorno, sem migração em massa.
- Reduzir mercadorias abaixo de pagamentos já alocados exige corrigir ou estornar esses pagamentos primeiro, evitando divergência entre o valor pago e as alocações.

## Bônus já consumido

O saldo é conferido dentro da transação. Quando a retirada de um crédito deixaria a carteira negativa, a operação inteira é rejeitada e informa que o uso do bônus deve ser estornado primeiro. Depois de devolver o bônus à carteira, é possível corrigir a origem. Não se escolhem automaticamente outros pagamentos para cancelar: a carteira histórica guarda um saldo fungível e não atribui cada consumo a um crédito específico. O estorno de um recebimento compartilhado continua integral para todas as suas alocações.

## Validação

- `npm run lint`, `npm run build` e `git diff --check`.
- `test-bonus-pagamentos.cjs`: integração HTTP isolada com Pix+bônus, edição da composição, saldo insuficiente, estorno repetido, venda com Pix/cheque+bônus, recusa/reconfirmação, cancelamento de venda/vale, finalização e reabertura, rateio entre vales, previsão sem débito, falha SQLite simulada e registros legados.
- `test-reabertura-pagamentos.cjs`: regressão de estorno, compartilhamento, bônus consumido, títulos, cancelamento e rollback.
- `test-reabertura-finalizacao.cjs`: finalização, senha, títulos pendentes, residuais independentes e reabertura.
- `test-devolucoes-na-venda.cjs` e `test-edicao-venda.cjs`: devoluções, crédito e edição.
- `test-financeiro-fluxo.cjs`: cálculos, relatórios e compensação.
- `test-comprovante-venda.cjs`: renderização de comprovantes com dinheiro e bônus discriminados, além das regressões anteriores.

Todos os testes usam bases temporárias. Sem escrita na base operacional ou publicação. O build mantém o aviso de tamanho do bundle. A impressão física e a conferência interativa das telas não foram executadas; a revisão geral de impressão e totais por unidade permanece na parte 7.
