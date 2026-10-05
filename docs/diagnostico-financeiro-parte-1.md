# Parte 1 — diagnóstico e cenários de conferência

Data: 04/10/2026. Branch: main. Código analisado: c49503a.
Escopo: leitura, caracterização em base temporária e planejamento. Nenhuma regra de negócio ou registro existente foi alterado.

## Regras acordadas com o cliente

- Devolução usa o último preço vendido daquele produto para aquele cliente.
- É necessário pagamento registrado para finalizar uma ordem. Cheques/boletos aguardando compensação permitem finalizar; a programação continua independente.
- Ordens e vales finalizados continuam corrigíveis com senha gerencial e histórico.
- Cancelamento estorna integralmente os recebimentos envolvidos, inclusive suas alocações compartilhadas com outros vales/ordens.
- Quantidades são agregadas por unidade: 5,52 m e 2 un. Contagem de linhas é informação diferente.

## Mapa dos vínculos

| Entidades | Papel e dependências |
|---|---|
| vendas → itens_venda / vale_parcelas | Mercadoria, quantidades e dívida parcelada. Vale residual também é uma venda, porém sem nova receita e sem itens. |
| ordens_cobranca → ordem_cobranca_vales | Negociação de vários vales, com valor vinculado, pago, saldo e estado do vínculo. |
| ordens_cobranca → ordem_cobranca_parcelas | Programação da cobrança e saldos por parcela. |
| recebimentos_cliente → recebimento_alocacoes | Um recebimento pode abater vários vales. |
| ordem_cobranca_recebimentos / ordem_cobranca_parcela_recebimentos | Relacionam o recebimento às ordens e parcelas; há também ordemCobrancaId no recebimento. |
| recebimento_titulos / recebimento_instrumentos / instrumentos_recebimento | Cheques e duplicatas; coexistem estruturas atuais e legadas. |
| pagamentos | Lançamentos financeiros, vinculados ao recebimento ou legados diretamente na venda. |
| cliente_bonus_movimentos | Créditos e débitos da carteira, com vínculos ao recebimento e/ou venda. |
| devolucoes_venda → itens_devolucao | Quantidade devolvida, item original, valor do crédito e modalidade de abatimento/bônus. |
| valeResidualId / valeOrigemIds | A ordem guarda o ID do residual; valeOrigemIds atualmente contém números sequenciais, apesar do nome. |
| auditoria / movimentacoes_financeiras | Rastreabilidade das alterações e efeitos financeiros. |

Arquivos centrais: server.ts; server/reabertura.ts; server/acoesPagamentosOrdem.ts; server/programacaoPagamentos.ts; server/posicaoFinanceira.ts; src/lib/financeiro.ts; src/lib/totaisVenda.ts; componentes VendaRapidaView, ValeDetalhesModal, OrdensCobrancaView, PagamentoValesModal, VendaComprovante, ComprovanteRecebimentoModal e OrdemCobrancaDemonstrativoModal.

## Achados e grau de confirmação

| ID | Evidência | Situação / consequência |
|---|---|---|
| D01 | POST /api/ordens-cobranca/:id/finalizar não verifica pagamentos. | Reproduzido em base temporária: zero recebimentos, zero pago, dívida 100; a ordem finaliza e cria residual 100. |
| D02 | POST /api/ordens-cobranca/:id/encerrar apenas atualiza status, vínculos e parcelas. | Confirmado por leitura: não chama o estorno dos recebimentos. Incompatível com a nova regra de cancelamento. |
| D03 | reabertura.ts altera saldos, mas não limpa finalizadoAt nem reconcilia valeResidualId. financeiro.ts e o recálculo da ordem zeram saldos quando há finalizadoAt. | Risco confirmado na composição do código; falta reproduzir a sequência completa de edição/estorno após finalização e após pagamento do residual. Não basta habilitar um botão de edição. |
| D04 | criarValeResidual grava totalLiquido, saldoRestante, observacoes, parcela e origem, mas subtotal=0 e sem itens. | Teste existente confirma persistência de valor/origem. VendaComprovante calcula subtotal pelos itens e limita observação a 100 caracteres: inadequação potencial para residual e origem extensa. Ausência visual relatada ainda precisa reprodução. |
| D05 | Devolução calcula crédito usando item da compra original e descontos proporcionais. totalItemVenda rejeita quantidade <=0. | Confirmado por leitura: difere do último preço vendido ao cliente e não suporta devolução como linha na criação. Preservar vínculo com compra original para controlar quantidade, separando a origem do preço. |
| D06 | VendaRapidaView soma analiseLinhas.quantidade sem agrupar unidade. VendaComprovante usa todosItens.length e totaliza apenas metros. | Confirmado por leitura: soma heterogênea e ausência de total de unidades no comprovante. |
| D07 | programacaoPagamentos seleciona títulos ativos aguardando com vencimento <= hoje; não exige ordem aberta. | Comportamento existente compatível com compensação após finalização. Teste de fluxo confirma programação/idempotência; falta caso explícito com ordem finalizada. |
| D08 | Existem opção bônus, movimentos de carteira e validação de saldo em pagamentos. | Não é recurso inexistente. Falta conferir cobertura de combinações, edição e estorno. |
| D09 | Recibo de pagamento usa window.print, regras globais de visibility e outros seletores de display:none para modais. | Hipótese de conflito de ancestrais/estilos. Impressão vazia não foi reproduzida em navegador; testes de HTML não validam impressão. |
| D10 | Relatório de vales abre detalhes; detalhes conseguem abrir recibo de recebimento. | Caminho existente; validar disponibilidade em quitados, compartilhados, cheques e duplicatas. |
| D11 | Vales mudam estado/saldo e as listagens têm filtros. | Relato de desaparecimento não reproduzido. Investigar mudança legítima de filtro, vínculo removido, carregamento e falha parcial antes de afirmar perda de dados. |

## Bases locais: inspeção somente leitura

Foi usado better-sqlite3 com readonly, fileMustExist e query_only; sem importar server/db.ts (sua inicialização pode criar/migrar dados).

- data/database.db: zero vendas; faltam tabelas modernas de ordens/títulos. Não serve para reproduzir o relato.
- data/database_mock.db: 69 vendas, 19 ordens e 64 recebimentos, contando também registros históricos.
- Nessa base mock: 5 ordens canceladas possuem recebimentos ativos vinculados. É um indício compatível com D02 e a nova regra, não prova de corrupção histórica.
- Nessa base mock: zero ocorrências nas consultas de residual ausente, residual sem descrição, alocações/títulos ativos sem recebimento ativo e ordens finalizadas sem recebimento ativo vinculado.
- installation-paths.json aponta C:/ProgramData/LucianoCouros/data; os arquivos database.db e database_mock.db ali não possuem as tabelas esperadas consultadas. Não foi estabelecido que qualquer base local corresponda à instalação do cliente.
- Nenhum dado pessoal foi exportado. Os indicadores não cobrem todas as formas legadas e não substituem conciliação financeira completa. Zero ocorrências não certifica integridade.

Ainda pendente para diagnosticar os registros reais: cópia identificada da base afetada e referência de uma ordem/vale que apresentou o erro. Reparação de dados permanece na parte 8, após diagnóstico e validação das regras.

## Verificação executada

Passaram os scripts existentes:

1. test-finalizacao-financeira.cjs — residual e persistência de origem/valor.
2. test-financeiro-fluxo.cjs — financeiro, relatórios, programação, recusa e idempotência.
3. test-comprovante-venda.cjs — HTML de duas vias, devoluções e paginação; não testa impressão do recibo de pagamento.
4. test-demonstrativo-ordem.cjs — títulos, compensação parcial, recusados, bônus e compartilhamento.
5. test-resumo-recebimentos.cjs — composição de valores e centavos.

diagnostico-finalizacao-sem-pagamento.cjs reproduziu D01. É caracterização do defeito, não teste de aceite: deve ser substituído por teste que exige rejeição na parte 3. Reutiliza fixture existente em diretório temporário e chama o handler diretamente; não valida middleware HTTP.

Não foram executados todos os testes de integração HTTP, build ou teste visual nesta etapa. Existem scripts de reabertura, programação, edição e distribuição a incorporar na validação das respectivas partes. Os testes executados não escreveram em bases existentes.

## Matriz de aceite para a execução

| Caso | Preparação / ação | Resultado exigido | Parte |
|---|---|---|---|
| C01 | Ordem 100 sem pagamento → finalizar | Rejeitar; não criar residual nem modificar saldos. | 3 |
| C02 | Ordem 100 com boleto futuro 100 → finalizar → processar vencimento duas vezes | Finaliza; título compensa uma vez, sem novo abatimento/bônus. | 3 |
| C03 | Ordem 100 com pagamento 40 → finalizar | Residual 60 com origem consultável e sem nova receita. | 4 |
| C04 | Editar ordem finalizada, com senha válida/inválida | Autorizar somente senha válida; preservar histórico e recalcular dependências. | 3–4 |
| C05 | Residual 60 recebe 20 → corrigir ordem original | Reconciliar dívida remanescente e pagamento 20, sem duplicação ou perda. | 4 |
| C06 | Recebimento 100 distribuído 60/40 em dois vales → cancelar ordem de um deles | Estornar integralmente ambos, títulos, lançamentos e bônus; recalcular todas as ordens afetadas. | 2 |
| C07 | Repetir estorno ou falhar no meio da transação | Nenhum segundo efeito; falha restaura estado anterior por completo. | 2 |
| C08 | Estornar dinheiro, Pix, cartão parcelado, cheque e duplicata, incluindo compensados/recusados | Nenhum saldo, instrumento ou parcela ativa sem origem; histórico permanece. | 2 |
| C09 | Bônus gerado por recebimento já utilizado em outra operação → cancelar origem | Rastrear consumo dependente e resolver reversão sem saldo incorreto. Definir alcance da cascata antes de implementar. | 2–6 |
| C10 | Cliente comprou produto a 10 e depois a 12 → devolver uma unidade | Crédito 12; quantidade vinculada à compra elegível, preço ao último histórico do cliente. | 5 |
| C11 | Produto nunca comprado / devolver acima do disponível / devolver novamente | Rejeitar sem alterar estoque, dívida ou bônus. | 5 |
| C12 | Venda e vale, criação e edição, com venda+devolução | Linha negativa, fundo destacado, impressão vermelha e efeito financeiro único. | 5 |
| C13 | Dívida 100, bônus 20 e Pix 80 → estornar | Quita com consumo 20; estorno devolve bônus e reabre a dívida correta. | 6 |
| C14 | 5,52 metros de tecido + 2 colas | Quantidade: 5,52 m e 2 un; duas linhas como informação separada. | 7 |
| C15 | Várias linhas da mesma unidade, devolução parcial, várias páginas | Somar por unidade e subtrair devolução uma vez, sem repetir totais por página. | 7 |
| C16 | Imprimir recibo pela ordem, vale e relatório; um e vários títulos | PDF/preview com conteúdo, sem páginas vazias e sem duplicar pagamento+títulos. | 7 |
| C17 | Pagamento parcial/integral em lista filtrada → atualizar/reabrir | Registro permanece consultável; saída do filtro explicada por estado. | 2–7 |
| C18 | Demonstrativo com vales, Pix, bônus e títulos parcialmente compensados | Total dos vales e pagamentos abaixo das listas; distinguir recebido, aguardando e crédito. | 7 |
| C19 | Operação concorrente altera saldo após abrir edição/estorno | Rejeitar estado desatualizado e permitir nova conferência. | 2–4 |

## Decisões técnicas a detalhar nas partes seguintes

- Cancelar ordem é diferente de encerrar para renegociar: não aplicar a nova cascata indiscriminadamente aos dois caminhos do endpoint encerrar.
- Edição de dados descritivos e edição com efeito financeiro devem preservar o mesmo histórico, mas têm impactos diferentes; não estornar automaticamente tudo apenas para alterar observação.
- Último preço: usar histórico do próprio cliente/produto, descartar vendas canceladas e definir desempate por data/registro. Falta decidir tratamento de descontos no preço histórico; registrar o preço efetivamente escolhido na devolução.
- Uma devolução precificada acima da compra original pode superar a dívida. Definir o destino do excedente aproveitando a carteira, sem limitar silenciosamente o crédito.
- Estorno compartilhado deve informar os documentos afetados. Para bônus consumido e residuais renegociados, será preciso mapear dependências transitivas antes de escolher a ordem de reversão.
- Manter contabilidade de dinheiro, crédito utilizado e títulos aguardando separadas; a finalização administrativa não prova compensação.

## Próxima entrega

Parte 2: reproduções isoladas de cancelamento compartilhado e estorno após finalização, unificação da reversão transacional e testes C06–C09/C17/C19 pertinentes. Não iniciar alteração de dados antigos como efeito colateral.
