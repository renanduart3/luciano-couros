# Histórico de versões

Todas as alterações relevantes do sistema serão registradas neste arquivo.

O projeto usa versionamento semântico: `MAJOR.MINOR.PATCH`.

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
