# Histórico de versões

Todas as alterações relevantes do sistema serão registradas neste arquivo.

O projeto usa versionamento semântico: `MAJOR.MINOR.PATCH`.

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
