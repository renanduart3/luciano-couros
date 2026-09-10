# Pagamentos programados

- A rotina roda no servidor a cada minuto e na inicialização, no calendário de São Paulo.
- Somente títulos registrados (cheques/boletos) aguardando e com programação ativa são compensados. Não há confirmação junto ao banco.
- Títulos novos com vencimento atual/futuro são programados. Datas passadas sem programação não são baixadas.
- A migração reconhece títulos existentes com vencimento posterior ao registro, preservando intervenções manuais identificadas na auditoria.
- Atrasos durante desligamento do servidor são processados na próxima inicialização. O agendamento não exige manter a tela aberta.
- Alteração manual de pago para aguardando suspende a automação. Editar outros dados não a reativa. Um novo vencimento futuro reativa a programação.
- Cada compensação e estorno registra movimentação financeira e auditoria. A rotina não reaplica alocações nem créditos de bônus.
- A ordem permanece aberta enquanto houver título aguardando; a compensação final recalcula sua situação.
- No filtro de vales, documentos vinculados a uma ordem aberta aparecem apenas em Todos.

## Escopo ainda pendente da especificação de ciclo de vida

A finalização explícita com transferência do saldo para um novo vale de dívida ainda não faz parte desta alteração. Não foi criada dívida residual sintética nem alterada a contabilização de faturamento para essa finalidade.

## Ajustes de pagamentos na ordem

- Estornar individualmente ou em lote restaura previsões pendentes sem cancelar a ordem. Previsões não movimentam saldo nem são compensadas pela rotina.
- Excluir estorna o efeito financeiro e retira a linha do controle, preservando histórico e movimentações. Excluir uma previsão não movimenta saldo.
- A confirmação exige senha gerencial e revisão atual dos dados. O lote inteiro é transacional: falhas revertem todos os itens.
- Previsões podem ser editadas ou registradas novamente; uma mesma previsão não pode gerar dois recebimentos. O vencimento mantido após estorno permanece com automação suspensa.
- As respostas de gravação incluem a ordem recalculada; a interface substitui os dados e descarta carregamentos antigos. Ordens canceladas não exibem próximo título ou saldo em aberto na listagem.

## Testes

- `node scripts/test-programacao-pagamentos.cjs`: agenda, datas, reinicialização da estrutura, idempotência, exceções, rollback e filtros.
- `node scripts/test-reabertura-pagamentos.cjs`: integração financeira, edição/reagendamento e estornos com senha.
