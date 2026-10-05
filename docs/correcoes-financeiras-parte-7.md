# Parte 7 — impressão, demonstrativos e quantidades

Implementação em main, 04/10/2026.

## Comprovantes

O recibo de recebimento passa a ser renderizado diretamente no body por portal. Antes, podia ficar dentro de um ancestral oculto na impressão: `visibility: visible` não recuperava um conteúdo cujo ancestral estava com `display: none`. A impressão agora seleciona somente o recibo, mesmo quando a ordem ou o demonstrativo continua aberto atrás dele.

- Margens de impressão próprias para recibos e demonstrativos, repetidas nas páginas seguintes. Linhas e assinaturas não são partidas; tabelas extensas podem continuar em outras folhas.
- Teste no Chromium com o componente React real, incluindo abertura sob ancestrais ocultos de ordem, vale e relatório. São conferidas visibilidade, ausência de cortes e geração dos PDFs.
- No recibo, cheques/boletos aparecem uma vez como linhas de pagamento; não é adicionada outra linha com o valor integral do recebimento. Bônus aparece em linha própria. O total soma dinheiro/títulos válidos e bônus, excluindo títulos recusados. O vínculo com a ordem não repete o valor.
- Totais das tabelas não se repetem automaticamente em cada página. No comprovante de venda, quantidades e valor total aparecem somente na última folha de cada via. Identificação da folha permanece nas anteriores.
- A quantidade de linhas por folha se adapta às faixas extras de bônus/devolução/transferência, impedindo cortes no rodapé. Devoluções preservam sinal negativo, texto vermelho e fundo destacado.
- Larguras das colunas e números sem quebra impedem dividir um valor monetário entre linhas.

## Ordens e demonstrativos

A tela de detalhes mostra uma lista de vales e uma lista de pagamentos. Foram retiradas a segunda lista resumida de pagamentos e a repetição de valores no cabeçalho. Os totais ficam abaixo das listas.

O demonstrativo apresenta o total dos vales, a soma de cheques/boletos válidos e o total dos pagamentos com bônus. Distingue dinheiro/títulos compensados, títulos aguardando e crédito utilizado. O saldo exibido considera os pagamentos registrados; essa cobertura não é apresentada como prova de compensação. A transferência histórica para outro vale continua identificada quando existir.

Recebimentos compartilhados são apresentados pela parcela atribuída à ordem, com conservação dos centavos entre títulos e bônus. Um título recusado permanece visível no histórico, mas fica fora dos totais válidos.

## Quantidades e consulta de vales

- Venda e análise da venda mostram, por exemplo, **5,52 m e 2 un**. Não somam metros e unidades em um único número nem calculam preço médio entre medidas diferentes.
- Vales e comprovantes também agrupam por unidade. As abreviações equivalentes de metro e unidade são normalizadas; outras medidas permanecem separadas.
- A linha negativa e a devolução avulsa reduzem a quantidade uma vez. No comprovante, o cálculo usa todas as linhas efetivamente impressas, sem descontar novamente a quantidade disponível.
- Relatórios reconhecem as abreviações de metros. A ação dos vales foi identificada como **Detalhes / comprovantes**. Uma falha ao buscar os detalhes é exibida como erro, em vez de abrir dados incompletos sem recebimentos.
- Quando o pagamento cobre um vale e ele sai do filtro de abertos, a tela informa a mudança e oferece **Mostrar todos**. O documento e seus comprovantes continuam consultáveis.
- Comprovantes de recebimentos já estavam acessíveis nos detalhes de vales, inclusive pela consulta de relatórios, e nos pagamentos da ordem. Pagamentos legados sem recebimento próprio continuam com o comprovante da venda/vale; não foi fabricado histórico de recibos antigos.

## Validação

- TypeScript, build e `git diff --check`.
- `test-quantidades.cjs`: soma decimal, unidades equivalentes, medidas distintas e devoluções.
- `test-comprovante-venda.cjs`: duas vias, devoluções, bônus, residual, quantidades e totais somente na última folha.
- `test-demonstrativo-ordem.cjs`: títulos em linhas únicas, recusa, bônus, compartilhamento e conservação de centavos.
- `test-linha-pagamento.cjs` e `test-vales-cliente.cjs`: ações de comprovante, cálculos e consulta de vales.
- `test-impressao-comprovantes.cjs`: oito cenários React/Chromium com dados sintéticos, sem acesso à base operacional.
- `test-impressao-pdfs.py`: extração do conteúdo, ausência de páginas vazias, quantidade de folhas e totais, com renderização para inspeção visual. PDFs e PNGs locais em `output/parte-7`.

Para repetir a impressão, executar o build e disponibilizar Playwright em `PLAYWRIGHT_MODULE` (ou instalado no ambiente), Chrome em `CHROME_BIN` se necessário e diretório em `PRINT_TEST_OUTPUT`. O script de PDFs recebe esse diretório e opcionalmente `--render`; requer pypdf e, para renderização, pypdfium2.

Não houve alteração na base operacional ou publicação. A impressão foi validada em PDF no Chromium; não foi executada em impressora física. O build mantém o aviso de tamanho do bundle.
