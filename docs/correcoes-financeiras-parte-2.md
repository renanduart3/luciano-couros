# Parte 2 — cancelamento, exclusão e estorno

Implementação em main, 04/10/2026. Nenhuma migração ou reparo em bases existentes.

## Entrega

- Cancelamento de ordem aberta ou quitada (ainda não finalizada administrativamente) estorna integralmente seus recebimentos, inclusive alocações compartilhadas com outros vales e ordens.
- A prévia identifica os documentos afetados, o valor financeiro, o saldo restaurado e a variação do bônus. A confirmação exige senha gerencial e a revisão daquela prévia.
- Cancelamento, estornos, parcelas, títulos, carteira, lançamentos, projeções e auditoria ficam na mesma transação. Falha em qualquer ponto reverte tudo. Repetição é rejeitada sem outro efeito.
- Títulos removidos deixam de participar da compensação automática. Pagamentos recusados usam a mesma limpeza, sem aplicar uma segunda reversão ao saldo já restaurado pela recusa.
- O recálculo alcança ordens ligadas diretamente ao recebimento, por vale ou por parcela. Ordens anteriormente canceladas/renegociadas mantêm seu estado após estorno; não prendem o pagamento quando não há negociação conflitante.
- Encerrar para renegociar preserva os pagamentos. Esse fluxo permanece distinto do cancelamento.
- Pagamentos legados com vínculo individual cancelam também os instrumentos correspondentes. Lançamentos avulsos sem alocações não redistribuem mais todo o financeiro do cliente; exigem conciliação antes de alterar dados.
- Estorno de vale com pagamentos legados também encerra seus instrumentos de recebimento.

## Dependências das próximas partes

- Estorno que envolve finalizadoAt é rejeitado antes de escrever. As partes 3 e 4 implementarão reabertura e reconciliação do residual; apenas limpar finalizadoAt agora duplicaria ou esconderia dívida.
- Bônus já consumido fora do conjunto selecionado continua exigindo estornar o consumo primeiro. A operação inteira falha sem alterações quando a carteira ficaria negativa. O tratamento de dependências de bônus permanece para a parte 6.
- Pagamentos históricos sem alocações, bônus legado diretamente na venda e vínculos incompatíveis precisam de conciliação. Não houve reparo automático desses registros (parte 8).
- O desaparecimento de vales e a impressão vazia não foram declarados corrigidos por esta entrega.

## Validação

- npm run lint e npm run build passaram. Build mantém o aviso de tamanho de bundle.
- test-reabertura-pagamentos.cjs: suite HTTP em base temporária, incluindo novos casos de cancelamento compartilhado entre duas ordens; senha inválida; revisão ausente/desatualizada; repetição; falha SQLite provocada após a reversão; exclusão de cheque recusado; renegociação; ordem vazia; dinheiro, débito, Pix, cartão parcelado, cheque, duplicata e bônus; instrumento legado; proteção do residual.
- test-agrupamento-ordens.cjs: integração de agrupamento, bloqueios, cancelamento e quitação.
- test-programacao-pagamentos.cjs e test-financeiro-fluxo.cjs: programação, idempotência, recusa, rollback, filtros e recálculo financeiro.
- A falha deliberada de transação confirmou que pagamento, saldo e movimentação de estorno voltam ao estado anterior e a operação pode ser tentada novamente.
- Testes executados exclusivamente em bases temporárias. A confirmação visual no navegador não foi executada nesta parte.

## Contrato da API

GET /api/ordens-cobranca/:id/cancelamento/previa retorna a revisão e o impacto.
POST /api/ordens-cobranca/:id/encerrar com status=cancelada exige revisao e pin; clientes antigos sem revisão recebem 409 sem alterações. Frontend atualizado no mesmo conjunto.
O endpoint genérico de reabertura não permite executar cancelamento de ordem, para não contornar seu encerramento transacional.
