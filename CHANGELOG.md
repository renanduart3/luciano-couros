# Histórico de versões

Todas as alterações relevantes do sistema serão registradas neste arquivo.

O projeto usa versionamento semântico: `MAJOR.MINOR.PATCH`.

## 1.33.0 — 2026-09-16

- Assistente Windows para migrar bancos e backups para uma pasta externa, com validação SQLite, apontamento persistente e preservação dos originais.
- Backups concluídos e validados antes da confirmação, nomes separados por ambiente e retenção de 30 dias corrigida para arquivos e diretórios de atualização.
- Restauração com validação de nomes, integridade, cópia preventiva e proteção contra mistura de produção e demonstração.
- Atualizador usa o mesmo apontamento; documentação para sincronizar somente backups pelo Google Drive.
- Testes de migração com WAL, retenção e restauração real em bancos isolados.

## 1.32.0 — 2026-09-16

- CPF/CNPJ em cheques e boletos agora consulta o cadastro e preenche automaticamente o nome do cliente, com aviso não bloqueante quando não houver correspondência.
- A consulta ocorre ao completar o documento ou sair do campo, evita requisições repetidas e mantém espaço fixo para o feedback sem deslocar o formulário.
- Pagamentos registrados apresentam a coluna simplesmente como Data.

## 1.31.1 — 2026-09-16

- Demonstrativo de cobrança usa a data prevista de cada boleto ou cheque; PIX, débito e crédito mantêm a data informada no pagamento, inclusive quando futura.
- Coluna renomeada para Data / prevista para refletir os dois tipos de data.
- Testes cobrem datas distintas de registro, vencimento e compensação, títulos de emitente e terceiro, diferentes situações e pagamentos futuros.

## 1.31.0 — 2026-09-16

- Pagamentos de vários vales exigem ordem de cobrança, com proteção na interface e nas rotas atuais e legadas da API.
- Vales vinculados a ordens abertas ficam somente para consulta; edição individual é liberada após encerramento.
- Links de navegação entre demonstrativo, ordens, vales e detalhes dos títulos e boletos.
- Demonstrativo com cabeçalho compacto, coluna de descrição VALE, botão Abrir ordem e ações de impressão e WhatsApp por ícones.
- Pagamentos registrados exibem a data do pagamento, inclusive para cheques e boletos, sem usar o vencimento do título.
- Removido o aviso que deslocava os botões ao selecionar vários vales.
- Testes de agrupamento, bloqueios, cancelamento, quitação, datas e regressões financeiras em bases isoladas.

## 1.30.2 — 2026-09-11

- Criação e edição de vendas usam os mesmos totais em centavos, com descontos por item e desconto geral; reabrir vendas e orçamentos preserva a precisão do percentual.
- Edição reconhece a troca de produto ou fornecedor mesmo quando o identificador do item é mantido, preservando as restrições de materiais já devolvidos.
- Créditos de devoluções continuam abatidos após editar a venda; divergências entre o total exibido e o calculado impedem o salvamento.
- Comprovantes das duas vias mostram os descontos e ajustes que explicam a diferença entre o subtotal dos itens e o total da venda.
- Testes cobrem troca, inclusão, remoção, preço, quantidade, reedição, descontos, devoluções, comprovantes e regressão financeira.

## 1.30.1 — 2026-09-11

- Relatórios distribuem o total líquido registrado entre os itens vendidos, considerando descontos e quantidades devolvidas, inclusive ao filtrar materiais.
- Corrigido o tratamento de valor líquido zero, evitando receita e lucro indevidos em itens gratuitos.
- Testes de regressão cobrem rateio, filtros, descontos e devoluções parciais e integrais.

## 1.30.0 — 2026-09-10

- Estorno e exclusão individual ou em lote dos pagamentos da ordem, com senha gerencial, auditoria e reversão integral em caso de falha.
- Estornos restauram previsões editáveis sem movimentação financeira, com proteção contra registro duplicado e edição desatualizada.
- Atualização dos saldos entre detalhes, listagem e vales; ordens canceladas deixam de indicar saldo em aberto na agenda.
- Compensação automática de cheques e boletos programados, com suspensão após intervenção manual e histórico financeiro.
- Vales vinculados a ordens abertas aparecem apenas no filtro Todos; novos pagamentos são inseridos no topo.
- Cartão de crédito simplificado para valor total e seleção de 1x a 12x, com distribuição automática dos centavos.
- Finalização com geração de novo vale residual não está incluída nesta versão.

## 1.29.1 — 2026-09-10

- Resumo de pagamentos das ordens com colunas alinhadas para descrição, valor e situação.
- Demonstrativo da ordem lista cada cheque/boleto individualmente, sem repetir o montante do recebimento agrupador.
- Rodapé concentra negociado, pago compensado e restante a pagar; títulos aguardando não são apresentados como pagos.
- Comprovantes de venda e de saldo devedor do cliente permanecem inalterados.

## 1.29.0 — 2026-09-10

- Ordens de cobrança por montante, com pagamentos independentes e formas distintas; parcelamento no crédito e cronogramas anteriores preservados para consulta.
- Vales individuais permitem adicionar pagamentos separados, com edição e estorno protegidos por senha gerencial, saldo devedor e bônus por excedente.
- Corrigida a atualização após estorno de recebimentos e removida a compensação automática de títulos apenas pela data de vencimento.
- Ficha do cliente com demonstrativo próprio de vales pendentes: total do vale, total pago e saldo devedor; mais de 15 vales são consolidados com os três totais.
- Comprovante de venda preservado sem alterações; demonstrativo de cobrança em componente separado.
- Testes de integração cobrem formas mistas, títulos, bônus, senha, estornos e edição do montante; testes do demonstrativo validam filtros e consolidação em centavos.

## 1.28.1 — 2026-09-08

- Boletos e cheques abrem Detalhes em janela própria; edição e comprovante ficam dentro dela, sem expandir o grid.
- Campos e botões de pagamento compactos em ordens, vales e títulos, com senha de largura limitada e fontes legíveis.

- Renegociação com campos alinhados, tabela compacta de vencimentos/valores e ações organizadas em layout responsivo.
- Forma de pagamento escolhida na renegociação fica salva nas novas parcelas e pré-selecionada ao receber, permitindo alteração sem modificar pagamentos anteriores.
- Datas mensais da renegociação usam cálculo seguro de calendário, incluindo fim de mês e anos bissextos.

## 1.28.0 — 2026-09-08

- Novas linhas de boleto/cheque sugerem o mês seguinte à última data preenchida, ajustando o dia ao calendário (inclusive anos bissextos), sem alterar datas já informadas.
- Saldo de parcela pode ser renegociado na mesma ordem, com novas datas/valores, pagamentos preservados e registro da transferência no histórico, sem criar outro vale.
- Pagamento acima do saldo da parcela gera bônus; pagamento parcial mantém saldo para receber ou renegociar. Títulos preservam o valor original.
- Cheques, boletos e crédito aceitam até 12 linhas, com sugestões em centavos que preservam valores manuais. Total dos títulos é exibido em texto, sem instrução repetitiva.
- Cheques e boletos usam edição junto à linha, sem modal de gerenciamento ou botão separado de reabertura; status do recebimento e dos títulos são alterados por dropdown.
- Pagamentos nas ordens e nos vales são editados na própria linha, com data, valor, forma e status por dropdown; ao salvar, os campos voltam a texto.
- Histórico da ordem compacto e somente leitura, incluindo alterações de pagamentos e do parcelamento a partir dos registros de auditoria.
- Vales e parcelas de ordens permitem voltar para em aberto com conferência do impacto, senha do gerente e estorno dos recebimentos, lançamentos financeiros e movimentos de bônus em uma única transação.
- Recebimentos compartilhados identificam todos os vales e parcelas afetados antes da confirmação. Alterações concorrentes, bônus já consumido e negociações conflitantes bloqueiam estornos inconsistentes.
- A edição gerencial passa a trabalhar com o montante do pagamento, distribuindo automaticamente os valores entre os vales sem exibir campos de alocação.
- Recusa integral e reconfirmação de cheques ou boletos recalculam os saldos e preservam a parcela de origem.
- Arquivar materiais exige senha do gerente validada no servidor e mantém registro na auditoria.
- A atualização dos saldos preserva os detalhes abertos na tela de vales.

## 1.27.1 — 2026-09-08

- Produtos inativos deixam de aparecer nas seleções operacionais de orçamento e venda, permanecendo disponíveis apenas na gestão cadastral.
- Orçamentos antigos passam a remover da edição e da conversão em venda os produtos ou fornecedores que ficaram inativos ou indisponíveis, informando o usuário antes do fechamento.
- O fechamento da venda valida a disponibilidade dos produtos antecipadamente e retorna diagnóstico estruturado com código, produto, motivo e identificador da requisição.
- Erros de venda passam a registrar o mesmo identificador no navegador e no servidor, facilitando a investigação pela aba Rede e pelos logs da aplicação.

## 1.27.0 — 2026-09-04

- Ordens de cobrança abertas passam a permitir alterar vencimentos e valores, adicionar parcelas e remover parcelas ainda sem recebimento.
- O editor oferece redistribuição automática dos valores e exige que a soma permaneça igual ao total negociado.
- Parcelas que já receberam pagamentos ficam bloqueadas contra remoção ou alteração, preservando referências, comprovantes e histórico financeiro.
- Alterações concorrentes são detectadas antes de salvar e cada mudança do parcelamento fica registrada na auditoria.

## 1.26.0 — 2026-09-04

- Ordens de cobrança passam a manter um demonstrativo reabrível com CPF/CNPJ, telefone, vales vinculados e situação atual de cada parcela.
- O demonstrativo fica dimensionado dentro da tela de Ordens e concentra no cabeçalho as ações de WhatsApp, fechamento e impressão ou salvamento em PDF.
- Os detalhes das ordens e dos vales ganham acesso direto ao WhatsApp Web do cliente quando houver telefone válido cadastrado, mantendo a listagem de ordens limpa.
- O resumo de parcelas da ordem fica mais compacto, destacando valor, total pago e saldo restante por vencimento.
- Relatórios de vendas ganham análises consolidadas de materiais e clientes, com filtros e ordenações adequados, preservando o cálculo existente de custos em Itens por cliente.

## 1.25.0 — 2026-09-04

- Pagamentos registrados em ordens de cobrança passam a identificar claramente a parcela correspondente, inclusive nos cheques e boletos vinculados.
- Cada recebimento de ordem fica restrito à parcela selecionada e aceita no máximo cinco cheques ou duplicatas, preservando compatibilidade na edição de registros antigos.
- Detalhes da ordem ganham um cabeçalho compacto para compartilhamento, com cliente, CPF/CNPJ, vales vinculados e resumo de parcelas e pagamentos organizado para captura de tela.
- Relatório de vendas ganha a dimensão `Materiais por cliente`, com código, produto, fornecedor, quantidade líquida por unidade, número de vendas, última compra e valor adquirido.
- Todos os relatórios passam a oferecer ordenações adequadas por nomes, datas, quantidades e valores, mantendo a mesma ordem na tela, paginação e exportação CSV.
- Indicadores comerciais deixam de contabilizar vendas canceladas, descontam devoluções e evitam atribuir fornecedores históricos ambíguos aos materiais.

## 1.24.0 — 2026-09-03

- Ordens de cobrança abertas passam a permitir adicionar e remover vales do mesmo cliente sem exigir o cancelamento da negociação.
- Alterações nos vales vinculados recalculam automaticamente o total da ordem e distribuem o saldo entre as parcelas ainda pendentes, preservando pagamentos e histórico.
- Vales que já receberam pagamentos na ordem ficam protegidos contra remoção acidental; o sistema orienta editar ou cancelar o recebimento antes da alteração.
- Projeção de vencimentos passa a tratar datas vazias ou inválidas sem interromper a interface, com validação complementar no servidor.
- Falhas inesperadas da interface exibem uma página amigável com opções para recarregar ou voltar ao início, substituindo a tela branca.
- Listagem de vales ganha opções de 10, 20 ou 50 itens por página, usando 20 como padrão, e ordenação por número ou valor.
- Listagem de ordens ganha ordenação por número da ordem ou valor negociado.

## 1.23.1 — 2026-08-28

- Relatório de vendas passa a exibir o resumo compacto abaixo da listagem e da paginação, com valores financeiros primeiro, quantidades depois e os valores correspondentes a metros e unidades por último.
- A antiga área `Clientes` passa a se chamar `Itens por cliente` e fica organizada como uma subaba de `Vendas`, mantendo seus filtros, divisões por metros e unidades e dados administrativos protegidos.
- Resumos do período e do histórico geral do cliente ficam abaixo dos itens vendidos, em cartões menores e ordenados para facilitar a conferência.
- Edição de pagamentos com múltiplos cheques ou duplicatas volta a aceitar recebimentos parciais, integrais ou acima da dívida, limitando o abatimento ao saldo dos vales e transformando o excedente em bônus.
- Alterações nos valores dos títulos recalculam a distribuição automaticamente e mostram pagamento, abatimento, saldo restante e bônus previsto antes da confirmação.

## 1.23.0 — 2026-08-28

- Comprovantes de recebimento de cheques e duplicatas passam a seguir o padrão visual do sistema, com cliente, títulos pagos, formas de pagamento, vencimentos, situação, bônus, observação e assinaturas.
- Comprovantes ficam disponíveis para consulta e reimpressão na gestão de cheques e boletos, no histórico da carteira, nos pagamentos do vale e nos eventos da ordem de cobrança.
- Dados do comprovante são carregados novamente ao abrir, refletindo edições, compensações e recusas feitas depois do lançamento.
- Recebimentos antigos permanecem compatíveis mesmo quando não possuem os novos dados de ordens, bônus, operador, endereço ou telefone.
- Comprovantes de venda mantêm forma, valor recebido e observação na mesma linha, sem quebra que prejudique a leitura.

## 1.19.1 — 2026-08-26

- Pagamentos com cartão de crédito passam a mostrar, antes da confirmação, a quantidade e o valor das parcelas junto ao valor total.
- Forma de pagamento e parcelamento ficam visíveis posteriormente nas vendas, comprovantes, caixa, histórico do cliente, carteira, vales e ordens de cobrança.
- Divisões com diferença de centavos apresentam a composição exata das parcelas; lançamentos anteriores sem quantidade registrada permanecem compatíveis como 1x.
- Validação do servidor mantém o limite de 1x a 12x e agora devolve erro de entrada adequado no fluxo legado quando o limite é ultrapassado.

## 1.19.0 — 2026-08-21

- Vales ganham uma Central de Cheques enxuta, reunindo em uma linha cada cheque recebido e seus vínculos com vales e ordens de cobrança.
- A central oferece indicadores, busca e filtros por situação, vencimento e origem, além de atalhos para abrir a origem, compensar ou recusar o cheque sem perder o contexto da tela.
- Compensação passa a registrar sua data efetiva; recusas continuam restaurando os saldos e todas as ações gerenciais permanecem protegidas e auditadas.
- Pagamentos por cartão de crédito passam a solicitar o número de parcelas, de 1x a 12x, em vendas, vales, carteira do cliente, ordens de cobrança, edição gerencial e fluxo legado.
- O parcelamento é persistido, validado no servidor e apresentado no histórico das ordens, com 1x como padrão para compatibilidade com lançamentos anteriores.
- A nova experiência de cheques foi ajustada para desktop e celular, preservando filtros e a aba selecionada após cada ação.

## 1.18.4 — 2026-08-18

- Dados completos do cheque passam a aparecer no histórico da ordem, nos pagamentos de cada vale e no histórico da carteira do cliente.
- Pagamentos individuais, múltiplos e vinculados a ordens identificam tipo, número, banco, vencimento, CPF do titular, CPF do terceiro quando aplicável e situação do cheque.
- Fluxo legado da carteira passa a solicitar e persistir os mesmos campos obrigatórios ao selecionar cheque.
- Listagem principal de vales troca vencimento por emissão, remove a coluna saldo e adiciona a data do último pagamento ativo de cada vale.
- Layouts de impressão permanecem inalterados.

## 1.18.3 — 2026-08-18

- Registrar um pagamento na ordem de cobrança atualiza ordem, parcelas e vales de forma assíncrona sem fechar a modal.
- Removida a remontagem global redundante após o lançamento, preservando a posição e o contexto para registros sucessivos.

## 1.18.2 — 2026-08-18

- Forma de pagamento da ordem é movida para o canto direito da faixa de navegação entre parcelas e histórico, ficando fora do cabeçalho capturado junto à tabela.
- Ao selecionar cheque, seus campos são exibidos em uma linha própria logo abaixo da navegação e antes da tabela de parcelamento.
- O cabeçalho de parcelamento preserva somente a identificação do cliente e CPF/CNPJ; tabela, regras de pagamento e layouts de impressão permanecem inalterados.

## 1.18.1 — 2026-08-18

- Removida a área separada de Compensação; pagamentos e cheques voltam a ser gerenciados nos detalhes do próprio vale e da ordem de cobrança.
- Cada recebimento mantém sua própria forma de pagamento e pode ser alterado pelo gerente entre dinheiro, cartões, cheques, duplicatas, bônus e PIX.
- Detalhes do vale passam a listar inclusive pagamentos já quitados ou recusados, com acesso direto à edição de valor, data, forma, situação, cheque, observação e rateio.
- Parcelas e histórico da ordem passam a abrir o mesmo editor gerencial, preservando uma única regra para pagamentos individuais, múltiplos e negociados.
- Trocas sucessivas entre cheque e outras formas reutilizam o instrumento existente, recalculam vales, parcelas, ordens e bônus e registram cada alteração na auditoria.
- Cheque recusado restaura os valores aplicados e não gera nem consome bônus do cliente; o registro continua disponível para correção posterior.
- Os layouts de impressão permanecem inalterados.

## 1.18.0 — 2026-08-18

- Vales recebem uma área de Compensação com filtros para cheques aguardando, compensados, recusados ou todos, incluindo busca por cliente, cheque e número do vale.
- Gerente pode editar situação, data, valor recebido, distribuição entre vales, tipo, vencimento, documentos, banco, número, observação e motivo do cheque mediante senha.
- Cheque recusado restaura automaticamente os saldos dos vales e das ordens, remove bônus originado pelo recebimento e nunca utiliza bônus do cliente como parte do cheque.
- Títulos recusados permanecem acessíveis e podem ser corrigidos ou reativados, preservando a liberdade operacional sem apagar o histórico.
- Cada alteração gerencial registra situação e valores anteriores e novos na auditoria, com histórico visível dentro da própria edição do título.
- Modais de cobrança, ordem, pagamento múltiplo e edição de títulos passam a reservar 5% de respiro vertical e 10% lateral na tela.
- O respiro é exclusivamente visual; os layouts de impressão permanecem inalterados.

## 1.17.0 — 2026-08-18

- Vales selecionados do mesmo cliente passam a aceitar um pagamento múltiplo direto, distribuído automaticamente dos saldos mais antigos para os mais novos, sem exigir uma ordem de cobrança.
- Pagamentos acima da dívida geram bônus para o cliente; pagamentos parciais mantêm o restante identificado no próprio vale para cobranças futuras.
- Formas de pagamento são unificadas entre vendas, vales individuais, baixas múltiplas e ordens: dinheiro, débito, crédito, cheque do emitente ou de terceiro, duplicata do emitente ou de terceiro, bônus e PIX.
- Cheques recebem vencimento, CPF do titular, CPF do terceiro quando aplicável, banco e número, com validação e persistência dos dados no recebimento.
- Modal da ordem ganha mais espaço útil, identifica cliente e CPF/CNPJ no parcelamento e simplifica os vales vinculados para vale, emissão, valor e totalizador final.
- Ações das parcelas ficam alinhadas e reduzidas a `Registrar` e `Editar`; a edição preserva o histórico por meio de estorno controlado antes do novo lançamento.
- Registro de pagamentos mantém a modal aberta e atualiza saldos e ordens de forma assíncrona, permitindo lançamentos sucessivos sem interromper o atendimento.
- O botão redundante de renegociação é removido; `Cancelar ordem` preserva pagamentos já realizados e libera o saldo restante dos vales para uma nova estratégia.
- Filtros e tabelas de ordens são compactados para priorizar número do vale, cliente, período e situação, sem alterações nos layouts de impressão.

## 1.16.0 — 2026-08-18

- Vales ganham ordens de cobrança próprias, com seleção por cliente, planejamento flexível de até 36 parcelas, demonstrativo e histórico completo da negociação.
- Pagamentos das ordens podem ser baixados por parcela e continuam vinculados aos vales de origem, com suporte a pagamentos parciais, estornos e saldo de bônus do cliente.
- Renegociação encerra somente a estratégia atual, preserva tudo o que já foi pago e libera o restante de cada vale para uma nova ordem e outro parcelamento.
- Confirmação de renegociação e cancelamento passa a usar o modal visual do sistema, incluindo senha do gerente e motivo opcional, sem diálogos nativos do navegador.
- Detalhes do vale exibem um botão destacado para abrir a ordem ativa vinculada, e saldos parcialmente pagos são identificados como “restante do vale” ao preparar a próxima cobrança.
- Ordens de vales recebem filtros independentes por número do vale, cliente, data inicial, data final e situação.
- Hierarquia tipográfica de tela volta a respeitar os tamanhos menores de subtítulos, rótulos e textos auxiliares, reduzindo a densidade visual sem alterar os layouts de impressão.
- Tela de vales remove a descrição redundante do cabeçalho e mantém a operação concentrada nos filtros, saldos e ações úteis.

## 1.15.2 — 2026-08-11

- Na variante de 15 itens, dados do cliente ganham 5 mm de altura e tipografia mais legível, enquanto as colunas `QTD.` e `UNITÁRIO` ficam mais compactas para ampliar a discriminação; o retorno para 18 itens restaura automaticamente o layout anterior.
- Versão de avaliação do comprovante reduz o limite de 18 para 15 itens por folha e usa o espaço liberado para ampliar o respiro do cabeçalho, da observação e do rodapé, mantendo o retorno ao layout compacto em uma única configuração.
- Comprovante reserva 5 mm entre cada via e a linha de corte, com rodapé de altura fixa para evitar sobreposição em diferentes níveis de zoom.
- Impressão do comprovante recebe folga física dentro da folha A4 e remove a altura fixa do shell da aplicação, impedindo a geração de uma página adicional em branco.

## 1.15.1 — 2026-08-10

- Enviar itens do orçamento para a venda mantém o orçamento expandido, permitindo incluir vários materiais em sequência.
- Inclusões bem-sucedidas exibem um toast confirmando quantos itens foram adicionados à venda.
- Colunas de quantidade e preço ficam mais compactas, liberando espaço para o material e para o indicador reduzido “NA VENDA”.

## 1.15.0 — 2026-08-08

- Usuários com perfil vendedor passam a visualizar somente o menu de Vendas no desktop e no celular.
- Navegações internas ou estados antigos que apontem para outros módulos são bloqueados e retornam o vendedor para Vendas.
- O perfil gerente preserva acesso integral a todos os módulos do sistema.

## 1.14.0 — 2026-08-08

- Nova compra passa a carregar automaticamente a lista consolidada e sem duplicidades dos produtos presentes nas cinco compras mais recentes do fornecedor selecionado.
- Cada produto recente mantém o custo da ocorrência mais nova, enquanto o catálogo completo continua disponível pela busca manual.
- Produtos associados ao fornecedor recebem edição de custo, preço-base e observação com PIN administrativo obrigatório.
- Proteção da edição é validada também na API, registrada em auditoria e impede que o cadastro comum sobrescreva uma associação ativa.

## 1.13.1 — 2026-08-08

- Comprovante de venda remove a faixa de forma de pagamento e saldo do Vale abaixo dos itens.
- O mesmo espaço passa a exibir sempre uma linha fixa de observação, vazia quando não preenchida e limitada a 100 caracteres sem expansão vertical.
- Devoluções recebem observação opcional de até 100 caracteres, exibida prioritariamente no comprovante atualizado quando informada.

## 1.13.0 — 2026-08-08

- Fornecedor dos itens vendidos no relatório de clientes passa a priorizar o fornecedor registrado na própria venda, com recuperações seguras para dados antigos.
- Relatórios recebem carregamento progressivo durante a rolagem, reduzindo a quantidade de linhas renderizadas simultaneamente.
- Relatório individual do cliente separa o total geral histórico, no topo, dos totalizadores exclusivos do período filtrado, posicionados ao final da listagem.
- Quantidades vendidas em metros deixam de ser somadas com unidades e outras medidas; abas próprias permitem analisar e comparar cada grupo.
- Totais históricos do cliente passam a ser calculados diretamente pelo SQLite em uma única consulta agregada, sem carregar vendas antigas no navegador.

## 1.12.0 — 2026-08-08

- Produtos habituais do cliente passam a ser ordenados pela quantidade líquida acumulada, desconsiderando vendas canceladas e quantidades devolvidas.
- Botão de expandir ou recolher o orçamento reposicionado ao lado direito do título, com espaçamento próprio.
- Referências de produto e fornecedor limitadas a quatro caracteres no cadastro e na API.
- Comprovante de venda recebe colunas compactas e equivalentes para referência do produto e do fornecedor, ambas com até quatro caracteres.
- Cancelamento de venda no histórico passa a exigir a senha do gerente, com validação obrigatória no servidor e registro na auditoria.
- Relatório individual do cliente recebe a coluna administrativa “Lucro / qtd.”, protegida pela mesma senha dos dados de custo e incluída na exportação liberada.

## 1.11.3 — 2026-08-06

- Corrigida a prévia aberta imediatamente após finalizar uma venda, que reconstruía os itens no navegador e descartava a referência do fornecedor retornada pelo servidor.
- Criação da venda passa a devolver o documento completo com itens e referências já resolvidos, mantendo fallback compatível com servidores anteriores.

## 1.11.2 — 2026-08-06

- Comprovantes antigos passam a recuperar a referência do fornecedor pelo vínculo atual do produto quando o item não possui fornecedor gravado e existe uma única associação ativa.
- Resolução da referência deixa de depender de colunas SQL duplicadas, garantindo o preenchimento consistente na venda e no orçamento.

## 1.11.1 — 2026-08-06

- Tela de login redesenhada com área da marca clara, painel vinho e fechadura interativa para revelar ou recolher os campos de acesso.
- Opção de dados de demonstração e suas rotas administrativas removidas do sistema.
- Comprovantes de venda passam a exibir a referência completa do fornecedor e recuperam o cadastro vinculado quando o item histórico não a possui.
- Comprovantes de orçamento recebem a coluna de referência do fornecedor com a mesma recuperação dos registros já existentes.

## 1.11.0 — 2026-08-05

- Acesso ao sistema passa a exigir usuário e senha, com sessão local de até 16 horas e opção de bloquear/trocar usuário sem fechar o servidor.
- Gerente recebe acesso exclusivo às Configurações, ao cadastro de vendedores, aos backups e ao modo de demonstração.
- Vendedores deixam de visualizar ações destrutivas e o servidor bloqueia exclusões, cancelamentos, estornos e devoluções fora do perfil gerente.
- Cadastro de vendedores usa senha provisória com troca obrigatória no primeiro acesso, ativação, desativação e redefinição controladas pelo gerente.
- Recuperação local do gerente passa a ser feita pelo comando `RESETAR SENHA DO GERENTE.cmd`, com senha temporária `Altinopolis` e troca obrigatória no próximo login.
- Tentativas de login inválidas recebem bloqueio temporário após cinco falhas consecutivas.
- Vendas passam a registrar o vendedor responsável para identificação futura e auditoria.
- Ranking de materiais mais vendidos passa a exibir a quantidade total e sua unidade de medida.
- Comprovante de venda passa a mostrar os quatro primeiros caracteres da referência do fornecedor sem ampliar o layout atual.
- Referências de fornecedor passam a aceitar no máximo quatro caracteres no cadastro e nos vínculos de produtos.

## 1.10.0 — 2026-08-04

- Interface geral compactada para aproveitar melhor a largura, reduzir rolagem e preservar áreas de toque no celular.
- Ícones da navegação lateral ampliados e cabeçalhos, cartões, filtros e tabelas reorganizados com maior densidade visual.
- Orçamento da venda passa a iniciar recolhido, mantendo a operação principal visível e a abertura em um clique.
- Relatórios recebem área exclusiva de Vendas, visão agregada por cliente e destaque para os materiais mais vendidos.
- Filtros de período e forma de pagamento da visão geral passam a ocupar a mesma linha no desktop.
- Custos, lucro e valor de venda sensível dos relatórios de clientes ficam protegidos pelo botão compacto de custo com PIN.
- Vales recebem seleção de cobranças para apresentação ao cliente, incluindo devoluções abatidas e resumo preparado para captura de tela.
- Filtro de clientes dos Vales passa a usar toda a base cadastrada e a ação redundante “Registrar recebimento” é removida da listagem.
- Recebimentos de Vales deixam de consultar bônus já abatidos e tratam o valor aplicado exclusivamente como pagamento recebido.
- Distribuição de recebimentos passa a mostrar valor original, total já pago e saldo restante de cada dívida.
- Compras recebem uma aba própria de Vales para acompanhar contas assumidas com fornecedores.
- Selecionar “Vale — pagar depois” ao finalizar uma compra registra valor original, entrada, saldo e vencimento em um único documento financeiro.
- Vales de compras aceitam pagamentos parciais, histórico detalhado, filtros por fornecedor e situação, paginação e quitação controlada.
- Pagamentos de compras impedem valores acima do saldo e preservam a atualização transacional do total pago e do saldo restante.
- Itens da conferência de compras passam a ser ordenados da maior para a menor quantidade.
- Comprovantes recebem tipografia ligeiramente maior sem alterar o encaixe de impressão.
- Consultas financeiras e de itens foram agrupadas para evitar carregamentos N+1 nos fluxos de compras, vendas e relatórios.

## 1.9.0 — 2026-08-03

- Módulo de Compras separado em três áreas coesas: Compra, Histórico e Orçamentos abertos.
- Compra passa a carregar qualquer orçamento aberto do fornecedor para conferência de quantidades, metragem e custos recebidos.
- Vários orçamentos de compra podem permanecer abertos simultaneamente para o mesmo fornecedor.
- Produtos habituais do fornecedor são sugeridos sem impedir a inclusão flexível de outros produtos ativos.
- Produtos novos confirmados em uma compra passam a integrar automaticamente a associação do fornecedor, com remoção manual disponível na aba Produtos associados.
- Histórico de compras recebe busca, filtro por fornecedor, paginação, baixa de pagamentos e edição segura da compra.
- Histórico de compras recebe visualização rápida com produtos, quantidades, custos, pagamentos e observações.
- Edição de compra preserva pagamentos registrados, recalcula custos e impede sobrescrita concorrente ou total inferior ao valor já pago.
- Orçamentos de compra recebem filtro por fornecedor, paginação e ações para visualizar, editar e excluir.
- Prévia do pedido ao fornecedor oculta custos internos e mantém Imprimir e Salvar PDF no topo, inclusive no celular.
- Orçamentos de clientes recebem filtro específico por cliente e ação direta de visualização, mantendo edição, exclusão e paginação.
- Consultas de compras, itens e pagamentos passam a usar carregamento em lote para evitar consultas N+1.

## 1.8.7 — 2026-07-30

- Ficha do cliente recebe indicadores compactos, objetivos e com melhor aproveitamento de espaço.
- Visão geral dos relatórios passa a ordenar e paginar os materiais mais vendidos de dez em dez.
- Análise consolidada de clientes movida para a visão geral, com ranking por total comprado, filtro de situação e paginação.
- Relatório por cliente fica dedicado exclusivamente ao detalhamento individual de itens, valores, custos e lucro.
- Vales recebem busca direta pelo número identificador do documento.
- Comprovante de venda deixa de exibir vencimento e estabiliza o alinhamento da observação entre navegadores e impressoras.
- Devoluções passam a persistir separadamente o valor abatido da dívida e o bônus gerado.
- Histórico de devoluções adicionado ao detalhe do Vale e à ficha do cliente, com data, itens e impacto financeiro.
- Ficha do cliente passa a carregar as devoluções vinculadas às vendas, evitando movimentações invisíveis.
- Relatórios de materiais, custos e lucro deixam de contabilizar quantidades já devolvidas.
- Migração automática recupera o impacto financeiro das devoluções existentes sem alterar os bancos do cliente.

## 1.8.6 — 2026-07-28

- Produtos passam a centralizar configurações comerciais independentes para vários fornecedores, sem permitir o mesmo fornecedor repetido no material.
- Referência global do fornecedor passa a identificar suas variantes de produto nas buscas, vendas, orçamentos e preços dos clientes.
- Listagens de materiais da venda e do orçamento exibem uma opção por fornecedor, com referência, unidade e respectivo preço de venda.
- Preço do cliente passa a ser controlado pela combinação cliente, produto e fornecedor, preservando separadamente a última autorização gerencial de cada variante.
- Venda, orçamento, histórico e importações preservam fornecedor, referência, custo e preço usados em cada item.
- Mesmo produto pode coexistir em uma venda ou orçamento quando associado a fornecedores diferentes.
- Validação indevida de preço corrigida: o preço configurado no fornecedor deixa de solicitar autorização quando não foi alterado.
- Tabela de preços do cliente passa a exibir separadamente cada fornecedor e mantém exclusão protegida por PIN.
- Seletores e listagens operacionais recebem navegação e seleção por teclado.
- Seleção principal de cliente na venda e no orçamento passa a usar lista alfabética, sem filtragem durante a digitação.
- Venda e orçamento permanecem ocultos até a seleção de um cliente, evitando a exibição confusa de telas bloqueadas.
- Área útil das tabelas de venda e orçamento ampliada, inclusive quando ainda não existem itens.
- Mensagens operacionais passam a desaparecer automaticamente após dez segundos.
- Parcelamento de Vale limitado a parcelas mínimas de R$ 100,00, com validação no formulário e no servidor.
- Campo de observação da venda ampliado e limitado a 100 caracteres no formulário, servidor, edição do Vale e comprovante.
- Impressão da venda inclui a observação sem quebrar o layout e deixa de gerar folha adicional em branco.
- Confirmações nativas do Windows substituídas por diálogos padronizados com o visual do sistema.
- Tratamentos defensivos adicionados para clientes e associações nulas, evitando telas brancas durante venda e orçamento.
- Controle do ícone da bandeja aprimorado e adicionado atalho para reabrir o painel quando o serviço continua ativo.

## 1.8.5 — 2026-07-26

- Prazos rápidos de 30, 60, 90, 120 e 150 dias passam a indicar visualmente quando já foram aplicados.
- Botões de prazo aplicados ficam desabilitados até a parcela correspondente ser removida ou ter sua data alterada.
- Checkboxes e seleção em lote removidos da listagem de Vales no computador e no celular.
- Paginação da grade de Vales integrada ao cartão e mantida visível em todos os filtros.
- Venda parcelada passa a verificar a compatibilidade do servidor antes do registro, evitando perda silenciosa das parcelas quando o serviço estiver desatualizado.

## 1.8.4 — 2026-07-26

- Tabela de períodos garantida diretamente em Vale → Detalhes, abaixo dos cards financeiros e antes dos materiais.
- Vales antigos sem parcelas detalhadas passam a exibir uma parcela inicial baseada no vencimento e saldo existentes.
- Planejamento de Vales antigos pode ser refeito no próprio detalhe com prazos de 30, 60, 90, 120 e 150 dias.
- Datas e valores são editáveis na tabela e o salvamento continua protegido por PIN.

## 1.8.3 — 2026-07-26

- Parcelamento do Vale exibido como tabela real dentro do detalhe.
- Tabela apresenta parcela, data prevista, valor previsto, valor pago, saldo e situação.
- Prazos de 30, 60, 90, 120 e 150 dias continuam gerando datas futuras a partir da data atual.
- Edição do planejamento passa a ocorrer em uma tabela com datas e valores editáveis, protegida por PIN.
- Fluxo completo validado pela interface, desde a venda com Vale até a reabertura das parcelas editadas.

## 1.8.2 — 2026-07-26

- Menu lateral do desktop mantido permanentemente no formato compacto.
- Vínculo de materiais corrigido para aceitar e preservar um ou vários fornecedores.
- Ação redundante de fornecedores removida da listagem de materiais.
- Detalhe do Vale passa a buscar o parcelamento atualizado e mantém compatibilidade com servidores ainda não reiniciados.
- Tabela de parcelas do Vale garantida com datas, valores, saldos e edição protegida por PIN.
- Cancelamento da edição das parcelas restaura corretamente o planejamento salvo.
- Histórico de vendas simplificado, com comprovante no detalhe e edição retornando corretamente ao histórico ao cancelar.
- Rotas desconhecidas da API passam a responder JSON e não são mais encaminhadas ao HTML da aplicação.
- Tratamento de respostas inválidas impede a mensagem técnica `Unexpected token '<'`.

## 1.8.1 — 2026-07-25

- Tela de finalização restaurada com somente as ações Imprimir e Fechar.
- Parcelamento previsto mantido exclusivamente no detalhe do vale, com datas, valores, saldos e edição protegida por PIN.
- Ação de alteração da venda removida do detalhe do vale.
- Histórico de vendas passa a oferecer as ações diretas Detalhe, Editar e Excluir.
- Edição reutiliza a própria tela de venda e funciona independentemente da forma de pagamento original.
- Pagamentos já registrados são preservados durante a edição da venda.
- Aumento do total de uma venda paga gera corretamente saldo e vencimento para acompanhamento em Vales.

## 1.8.0 — 2026-07-25

- Cadastro de materiais passa a aceitar custo manual e vínculo pesquisável com vários fornecedores.
- Campos numéricos da venda e do orçamento iniciam vazios, mantendo apenas o placeholder.
- Produtos repetidos são bloqueados na venda, no orçamento e também pela API.
- Preços da venda e do orçamento ficam bloqueados por padrão.
- Alteração de preço exige validação real do PIN no servidor, libera uma única edição e bloqueia novamente após salvar.
- Último preço autorizado passa a ser a referência atual do produto para cada cliente.
- Vales recebem planejamento flexível em parcelas com prazos rápidos de 30 a 150 dias.
- Períodos de pagamento aparecem no detalhe do vale com valor, vencimento, situação e edição inline protegida por PIN.
- Listagem de vales ordenada da venda mais recente para a mais antiga e paginada.
- Exclusão de vale preserva o histórico e retira o documento da contabilidade ativa.
- Devoluções parciais abatem primeiro o vale e convertem eventual excedente pago em bônus.
- Carteira de bônus adicionada à ficha do cliente.
- Venda vinculada pode ser alterada diretamente pelo vale com PIN e preservação das devoluções existentes.
- Impressão isolada da tela e limitada ao comprovante atual com duas vias.

## 1.7.8 — 2026-07-24

- Módulo Vales definido como área operacional de cobrança e recebimento.
- Filtros adicionados por cliente, situação e período de vencimento.
- Consulta ampliada para débitos em aberto, vencidos, a vencer, quitados ou todos.
- Seleção conjunta de todos os débitos em aberto de um cliente.
- Envio pelo WhatsApp com itens, vencimentos, saldos individuais e total consolidado.
- Telefone do WhatsApp preenchido automaticamente pelo cadastro do cliente.
- Paginação e tabela compacta adicionadas à listagem de vales.

## 1.7.7 — 2026-07-24

- Vales passam a exibir os produtos, quantidades, unidades, preços e totais da venda original.
- Detalhe financeiro mostra valor original, valor pago, saldo atual e vencimento.
- Mesmo comprovante de venda em duas vias disponível para visualização e impressão no vale.
- Relatório de vales recebe a mesma visão de detalhes e comprovante.
- Exportação CSV de vales complementada com os itens de cada documento.
- Consulta de vendas e relatório unificada para impedir divergências de itens e valores.

## 1.7.6 — 2026-07-24

- Seletor de produtos da venda removido do limite vertical da grade.
- Lista de resultados passa a ocupar dinamicamente o espaço disponível na tela.
- Dropdown reposicionado automaticamente para cima quando não houver espaço abaixo.
- Rolagem mantida somente quando a quantidade de produtos exceder a área visível.

## 1.7.5 — 2026-07-24

- Logo reposicionada e ampliada nos comprovantes de venda e orçamento.
- Data e número do documento reorganizados em linhas alinhadas no cabeçalho.
- Rodapé dos comprovantes corrigido com número de itens, total de metros e valor total.
- Texto da ação após finalizar a venda simplificado para “Imprimir”.
- Contêineres de venda e orçamento redesenhados com menos bordas e melhor hierarquia visual.

## 1.7.4 — 2026-07-24

- Orçamento vigente carregado somente por escolha explícita no dropdown.
- Seleção múltipla corrigida com ação contextual junto à grade.
- Itens transferidos são acrescentados à venda atual sem substituir os anteriores.
- Produtos já inseridos na venda ficam bloqueados no orçamento e identificados visualmente.
- Disponibilidade restaurada ao remover o item da venda atual.
- Ação coletiva removida do rodapé; mantido somente “Salvar orçamento”.
- Orçamento pode ser recolhido ou expandido.
- Grades, resumo e checkout redesenhados com maior densidade, contraste e títulos em caixa alta.
- Espaçamentos, cabeçalhos e campos reduzidos para diminuir a rolagem.

## 1.7.3 — 2026-07-24

- Orçamento vigente persistido e carregado automaticamente por cliente.
- Garantia de apenas um orçamento aberto por cliente.
- Orçamento mantido após sua utilização em uma venda.
- Orçamento vigente exibido na ficha do cliente, com opção de exclusão.
- Lista acumulada do cliente complementada pelos itens do orçamento vigente.
- Inclusão individual ou por seleção dos itens do orçamento na venda atual.
- Ação direta para carregar o orçamento vigente na grade da venda.
- Orçamento e venda reorganizados em blocos horizontais, um abaixo do outro.
- Seção “Produtos por fornecedor” removida do módulo de fornecedores.

## 1.7.2 — 2026-07-24

- Quantidades do orçamento iniciadas em zero.
- Orçamento pode carregar todos os produtos acumulados do cliente ou uma das últimas sete vendas.
- Itens com quantidade informada podem ser incluídos diretamente na venda atual.
- Coluna de falta removida do orçamento.
- Campos editáveis destacados com fundos diferentes da grade.
- Alterações e remoções no orçamento deixam de modificar produtos ou preços permanentes do cliente.
- Preço do cliente atualizado somente após a conclusão da venda com o último preço praticado.
- Textos e indicadores redundantes removidos da tela de venda.

## 1.7.1 — 2026-07-24

- Itens da venda e do orçamento reorganizados em grades compactas no estilo planilha.
- Inclusão de produtos feita pela primeira linha da grade, como uma nova linha da tabela.
- Orçamento operacional identificado como “Orçamento do cliente”.
- Seção duplicada “Lista habitual do orçamento” removida do perfil do cliente.
- Produtos e preços do cliente consolidados em “Preços praticados para este cliente”.
- Produto incluído no orçamento passa a integrar automaticamente os preços do cliente.
- Remoção individual disponível nos preços do cliente e sincronizada com o orçamento aberto.

## 1.7.0 — 2026-07-24

- Cliente selecionado antes da operação e compartilhado entre venda e lista de pedido.
- Orçamento operacional transformado em uma lista ativa por cliente, sem listagem genérica na tela de venda.
- Lista do pedido preservada no perfil do cliente após a conversão em venda.
- Preço especial do cliente aplicado automaticamente; na ausência dele, é usado o preço-padrão do produto.
- Devolução parcial de itens pelo histórico da venda, protegida por PIN e sem apagar a venda original.
- Crédito proporcional da devolução registrado automaticamente na carteira do cliente.
- Crédito da carteira disponível como forma de recebimento em vendas futuras, inclusive com saldo restante.
- Cancelamento protegido contra vendas que já possuem devoluções e estorno automático do crédito usado quando aplicável.

## 1.6.0 — 2026-07-24

- Venda e orçamento reunidos em uma operação dividida no desktop e alternável no celular.
- Tela de venda simplificada, com a análise detalhada transferida para Relatórios de Clientes.
- Relatório por cliente e período com todos os itens vendidos, quantidades, desconto, valores, custo, lucro, fornecedor e margem protegidos por PIN.
- Orçamento com lista habitual do cliente e marcação dos materiais faltantes no estoque.
- Lista habitual do orçamento disponível na ficha do cliente, com alterações protegidas por PIN.
- Orçamentos alterados protegidos por PIN e itens faltantes excluídos ao levar o orçamento para venda.
- Comprovantes com quantidade total e desconto concedido.
- Pré-visualizações de venda, histórico e orçamento contidas na largura do navegador.

## 1.5.1 — 2026-07-24

- Orçamentos organizados por cliente em uma lista própria, com criação, edição, conversão em venda e exclusão.
- Lista de orçamentos com paginação no desktop e cartões otimizados para celular.
- Formulário de criação e edição adaptado para conferência dos itens no celular.
- Removido o limite global de um único orçamento aberto.
- Seleção do cliente destacada no topo do formulário.
- Desconto do orçamento informado em porcentagem, com cálculo automático do valor.
- Histórico de vendas disponível durante o orçamento, com filtro por período e importação de itens.
- PIN administrativo obrigatório para salvar orçamento abaixo do preço atual do cliente.
- Comprovante do orçamento no padrão visual da venda, com uma via centralizada.
- Impressão A4 ajustada para margens de 2,5 cm no topo e laterais e 5 cm na parte inferior.
- Textos auxiliares reduzidos para deixar a operação mais direta.

## 1.5.0 — 2026-07-24

- Novo módulo de Orçamentos com somente um orçamento aberto por vez.
- Orçamento com cliente, validade, produtos, preços, desconto, observações e impressão/PDF.
- Conversão do orçamento em venda sem redigitar cliente, itens, quantidades, preços ou desconto.
- Preço atual do cliente atualizado automaticamente após cada venda, preservando os valores das vendas anteriores.
- Produtos habituais deixam de ser inseridos automaticamente na venda.
- Reaproveitamento de vendas anteriores passa a usar somente seleção em grupo, com aviso visual dos itens adicionados.

## 1.4.0 — 2026-07-24

- Cadastro de produtos simplificado como catálogo-base do sistema.
- Preço personalizado transferido para o perfil de cada cliente, com comparação ao preço-base e ao último preço praticado.
- Visão de custo, lucro unitário, margem e frequência de compra por cliente e produto.
- Consulta sobreposta de vendas anteriores durante a venda, com filtro por período e reaproveitamento de itens e preços.
- Paginação padronizada nas principais listagens operacionais.

## 1.3.0 — 2026-07-22

- Relatórios reorganizados em Visão geral, Clientes, Fornecedores e Vales.
- Filtros rápidos de período e filtros específicos para cada área.
- Relatório de clientes com compras, recebimentos, dívida atual e bônus.
- Relatório de fornecedores por fornecedor e material, sem duplicar compras com vários itens.
- Relatório de vales por cliente, emissão, vencimento e situação.
- Exportação CSV respeitando a área e os filtros selecionados.

## 1.2.0 — 2026-07-22

- Carteira financeira por cliente com dívidas selecionáveis.
- Pagamentos parciais e distribuição automática entre as vendas escolhidas.
- Bônus auditável: utilização em novas baixas e geração somente pelo valor excedente.
- Histórico detalhado das alocações de cada recebimento.
- Estorno protegido pelo PIN do administrador, restaurando dívidas e bônus em uma única transação.
- Interface responsiva da carteira dentro do módulo de Vales.

## 1.1.0 — 2026-07-22

- Seletor das últimas sete vendas do cliente dentro da Análise durante a venda.
- Importação seletiva de itens, quantidades e preços sem duplicar produtos habituais.
- Cadastro opcional de produtos por fornecedor.
- Histórico de último custo, última compra e quantidade de compras por fornecedor.
- Compras novas vinculam automaticamente produto e fornecedor.

## 1.0.0 — 2026-07-22

- Primeira versão formalmente versionada da Luciano Couros.
- Operação local de vendas, clientes, fornecedores, vales, produtos e relatórios.
- Comprovante A4 com duas vias para venda, vale e cheque.
- Atualizador local com preservação do banco de dados.
- Interface responsiva com PWA e acesso pela rede local.
