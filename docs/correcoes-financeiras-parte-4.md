# Parte 4 — saldo residual e referência de origem

Implementação em main, 04/10/2026. Esta regra substitui o cancelamento do residual na reabertura descrito na parte 3.

## Regra acordada

O residual é um vale independente. Pode receber pagamentos, ser incluído em outra ordem e gerar outro residual. Guarda apenas a referência histórica da ordem e dos vales dos quais veio. Corrigir a origem não cancela o residual, não move seus pagamentos e não reabre ordens posteriores.

A transferência conserva seu valor original. Exemplo: origem de R$ 100 com R$ 40 pagos gera residual de R$ 60. Reabrir a origem mantém seu saldo em zero e preserva os R$ 60 no residual. Corrigir o pagamento original para R$ 30 deixa R$ 10 na origem; o residual continua independente. Transferência não é dinheiro recebido, bônus ou nova receita.

## Entrega

- Tabela `vale_residual_origens` registra identificadores, números e valores transferidos em centavos, dentro da transação da finalização. Índices por origem permitem consultar os totais sem percorrer negociações posteriores.
- Lista e detalhes do vale exibem a origem. Comprovante de saldo devedor mostra referências paginadas, valor do vale, recebido e saldo atual, sem mercadorias fictícias ou desconto negativo.
- Reabertura com senha preserva residuais, inclusive pagos, finalizados e negociados em outras ordens. A confirmação e a auditoria explicitam essa preservação.
- Cálculos de vale, ordem, parcelas, alterações de recebimentos e estornos descontam o valor já transferido. Resumos mostram transferência separada dos pagamentos.
- Finalizações sucessivas transferem somente o novo restante.
- Residual antigo pode exibir origem pela auditoria e referências existentes, sem escrita na consulta. Na reabertura autorizada, o registro histórico da transferência é criado na mesma transação, quando os dados são suficientes.

## Limites

- Sem reparação em massa dos dados antigos. Histórico ausente ou inconsistente continua exigindo conciliação, prevista para a parte 8.
- A transferência histórica não muda ao editar ou cancelar o residual independente. Essas ações são decisões sobre esse vale.
- Reduzir o total de mercadorias da origem abaixo da soma já paga e transferida é bloqueado para não perder valor. O fluxo de devolução gera crédito, ou o recebimento deve ser corrigido quando estiver errado.
- Um vale original ainda comprometido em outra negociação conserva a proteção contra duas ordens ativas. A referência de um residual não cria esse impedimento.
- Cronogramas antigos de parcelas continuam históricos quando a ordem usa pagamentos por montante; não foram convertidos nesta etapa.

## Validação

- `npm run lint` e `npm run build` concluídos; permanece o aviso de tamanho do bundle.
- `test-reabertura-finalizacao.cjs`: residual pago em ordem posterior finalizada; registros posteriores idênticos após reabrir origem; finalizações repetidas; edição; origem legada; estorno; parcelas legadas; rollback transacional.
- `test-finalizacao-financeira.cjs`: pagamento obrigatório, geração residual e receita sem duplicação.
- `test-reabertura-pagamentos.cjs`: regressão de estornos, recebimentos compartilhados, títulos e cancelamentos.
- `test-financeiro-fluxo.cjs`: cálculos, programação e relatórios.
- `test-comprovante-venda.cjs`: HTML de duas vias, valores, paginação e todas as referências de residual, inclusive mais de uma página.

Testes executados somente em bases temporárias. Sem publicação ou alteração da base operacional. Impressão física e conferência visual no navegador ainda não foram executadas.
