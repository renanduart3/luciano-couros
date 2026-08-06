# Histórico de versões

Todas as alterações relevantes do sistema serão registradas neste arquivo.

O projeto usa versionamento semântico: `MAJOR.MINOR.PATCH`.

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
