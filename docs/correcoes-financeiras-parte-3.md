# Parte 3 — finalização e reabertura para edição

> Atualização: a parte 4 substitui as regras de cancelamento e bloqueio do residual abaixo. Consulte [Parte 4](correcoes-financeiras-parte-4.md).

Implementação em main, 04/10/2026. Sem migração de esquema, reparo de registros existentes ou publicação.

## Comportamento entregue

- Ordens só finalizam com recebimento ativo e valor aplicado positivo. Previsões, recebimentos cancelados/recusados e totais preenchidos sem recebimento não liberam a finalização.
- Cheques e duplicatas aguardando compensação permitem finalizar. A programação continua compensando os títulos na data prevista, uma única vez, sem novo abatimento.
- Vales individuais também exigem um pagamento registrado para finalizar, incluindo pagamentos legados vinculados.
- A ordem é recalculada no servidor antes de transferir o restante para outro vale.
- Ordens e vales finalizados oferecem **Reabrir para editar** com senha gerencial, prévia do impacto, verificação de revisão e auditoria.
- Reabrir preserva recebimentos e títulos, restaura os saldos e libera os fluxos existentes de edição. O documento pode ser finalizado novamente depois das correções.
- Um residual sem movimentação é cancelado logicamente na mesma transação em que a dívida retorna à origem. Sua identificação permanece no histórico.
- O bônus zerado em novas finalizações tem seus movimentos identificados na auditoria. Ao reabrir, apenas esses débitos são revertidos, uma única vez.
- O saldo perdoado pela opção “zerar restante” volta à origem na reabertura.
- Mutações financeiras manuais em documentos finalizados exigem reabertura. A compensação automática e mudanças manuais de situação que não alteram a alocação financeira continuam independentes; recusa/reconfirmação com efeito no saldo exige reabertura.
- O histórico da ordem exibe a reabertura, a preservação dos pagamentos e o cancelamento do residual quando aplicável.

## Limites previstos para a parte 4

- Residual com pagamentos, finalização, devolução, bônus vinculado, valor alterado ou vínculo com outra negociação exige conciliação antes de reabrir a origem.
- Finalizações antigas sem auditoria suficiente, ou com excedente zerado sem identificação dos débitos, também exigem conciliação. Não se tenta adivinhar quais movimentos desfazer.
- Um vale finalizado por uma ordem deve ser reaberto pela própria ordem.
- Negociação conflitante impede reabertura parcial. As operações rejeitadas não escrevem dados.
- A edição de uma ordem quitada começa pelos pagamentos existentes; alterar seu valor recalcula a dívida e pode recolocar a ordem em aberto. Reabrir finalização não transforma pagamento válido em dívida.

## Validação

- npm run lint e npm run build.
- test-finalizacao-financeira.cjs: rejeição sem recebimento, ausência de residual indevido e residual válido após pagamento.
- test-reabertura-finalizacao.cjs: integração HTTP em base temporária cobrindo pagamento obrigatório, título futuro, compensação automática após finalização, repetição, senha incorreta, revisão ausente/desatualizada, reabertura, edição de pagamento, nova finalização, edição de mercadorias do vale, residual movimentado, saldo perdoado, bônus restituído e rollback com falha SQLite simulada.
- test-reabertura-pagamentos.cjs: regressão dos cancelamentos, exclusões e estornos da parte 2.
- test-financeiro-fluxo.cjs: regressão de cálculos, programação e relatórios.
- Build conserva aviso de tamanho do bundle. Não houve validação visual em navegador nesta etapa.

## API

- GET /api/finalizacoes/:tipo/:id/reabertura: retorna revisão, vales afetados, residual a cancelar e bônus a restituir.
- POST no mesmo caminho: exige senha gerencial e a revisão da prévia; aceita motivo para auditoria.
- Tipos permitidos: ordem e vale.
- A reabertura e todos os efeitos ocorrem em uma única transação; repetir a mesma operação não produz efeito adicional.
