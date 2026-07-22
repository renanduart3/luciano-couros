# Plano do redesenho comercial

## 1. Objetivo

Preservar a experiência de planilha usada pelo cliente há aproximadamente dez anos, acrescentando segurança, histórico, contas a receber e pagar, devoluções, impressão familiar e consistência entre todas as telas.

As planilhas de referência recebidas foram:

- `analise-durante-a-venda.jpeg`: histórico analítico por item vendido, com preço, custo, lucro, fornecedor e percentual.
- `tipos-pagamento-que-ele-recebe.jpeg`: formas de recebimento e visão de vales.
- `venda.jpeg`: modelo visual do comprovante entregue ao cliente.

## 2. Diagnóstico do sistema atual

### O que já existe

- Clientes, fornecedores, produtos, vendas e itens de venda.
- Compras e itens de compra.
- Pagamento inicial e pagamentos posteriores.
- Amortização FIFO das vendas pendentes mais antigas.
- Snapshot de custo, total e lucro no item vendido.
- Cancelamento lógico de vendas e pagamentos.
- Histórico do cliente, relatórios e comprovante básico.
- Atalhos parciais de teclado na venda rápida.

### O que ainda não existe

- Usuários, login, PIN, papéis e permissões.
- Auditoria de alterações e aprovações.
- Estoque físico persistido, apesar de a documentação mencionar estoque.
- Edição transacional/versionada de vendas.
- Lista de produtos habituais por cliente.
- Venda avulsa sem produto cadastrado.
- Múltiplas formas de recebimento na mesma venda.
- Cadastro e acompanhamento de cheques e duplicatas.
- Livro de vales/créditos/devoluções.
- Contas a pagar e baixas de fornecedor.
- Referência própria do produto.
- Calculadora global.

## 3. Requisitos estruturados

### 3.1 Produtos habituais do cliente

Ao selecionar um cliente, carregar automaticamente na grade todos os produtos do padrão incremental de compra desse cliente. A mesma lista também fica disponível em uma seleção suspensa para adicionar novamente ou localizar itens.

A lista cresce automaticamente: todo produto cadastrado vendido ao cliente passa a fazer parte do padrão dele. Retirar o produto da venda do mês não o remove do padrão das próximas vendas. Para cada produto, guardar ou calcular:

- quantidade de compras;
- última compra;
- quantidade e unidade usadas por último;
- último preço praticado especificamente para esse cliente;
- preço padrão atual;
- frequência e recência.

Ao iniciar a venda, preencher cada linha com o último preço praticado para aquele cliente e a última unidade usada. Quantidade deve começar vazia ou com a última quantidade conforme validação de uso com o cliente. O operador pode remover linhas apenas da venda atual e alterar o preço. Deve existir uma ação administrativa separada para ocultar definitivamente um item do padrão, evitando que produtos excepcionais tornem a lista inutilizável ao longo dos anos.

O sistema precisa distinguir:

- preço padrão global do produto;
- último preço usado com o cliente, que será a sugestão da próxima venda;
- preço mínimo/autorizado do cliente, caso seja adotada autorização persistente;
- preço efetivamente aplicado na venda.

### 3.2 Venda em formato de planilha

Grade principal:

| Referência | Material | Quantidade | Unidade | Preço unitário | Desconto | Total |
|---|---|---:|---|---:|---:|---:|

Comportamentos:

- última linha vazia para o próximo lançamento;
- busca/autocomplete dentro da célula de material;
- edição direta de quantidade, unidade, preço e desconto;
- `Tab`, `Shift+Tab`, `Enter`, setas, `F2`, `Esc` e `Delete`;
- criação automática da linha seguinte;
- totais e análise recalculados em tempo real;
- rascunho salvo automaticamente;
- ações completas pelo teclado;
- sem paginação de cinco itens durante a edição.

No smartphone, usar apresentação compacta em linhas/cartões, sem tentar reproduzir todas as colunas da planilha.

### 3.3 Análise durante a venda

Substituir o painel atual de rentabilidade por uma visão semelhante à planilha recebida:

- data;
- cliente;
- metragem/quantidade;
- artigo/material;
- preço unitário vendido;
- valor total da linha;
- custo unitário congelado na data da venda;
- lucro unitário e total;
- fornecedor de origem ou fornecedor associado;
- margem percentual.

Visibilidade:

- vendedor: informações operacionais e preços;
- usuário autorizado por PIN: custo, lucro, fornecedor e margem;
- exportação/impressão somente conforme permissão.

O custo histórico deve continuar congelado no item da venda. Alterar o custo atual do produto não pode reescrever lucros antigos.

### 3.4 Usuários, PIN e autorização de preço

Criar usuários individuais com papel e PIN armazenado apenas como hash.

Papéis iniciais:

- administrador;
- vendedor;
- financeiro.

Permissões separadas:

- visualizar custos/lucro;
- cadastrar ou alterar produtos;
- vender abaixo do preço padrão;
- editar/cancelar vendas;
- baixar ou cancelar pagamentos;
- restaurar backup;
- acessar configurações.

Preço abaixo do cadastrado:

1. detectar no servidor, nunca somente na interface;
2. abrir solicitação de PIN;
3. validar se o dono do PIN possui a permissão;
4. registrar usuário operador, usuário autorizador, preço padrão, preço aplicado, diferença, data e venda;
5. exigir novamente em cada operação sensível ou em uma autorização de curta duração claramente identificada.

O administrador também informa seu próprio PIN para ações sensíveis. Um vendedor sem permissão deve informar o PIN de um autorizador, não o próprio.

### 3.5 Formas de recebimento

Catálogo inicial baseado na planilha:

- à vista — dinheiro;
- à vista — débito;
- cartão de crédito;
- cheque do emitente;
- cheque de terceiro;
- duplicata do emitente;
- duplicata de terceiro;
- bônus/crédito;
- vale;
- PIX, se continuar sendo utilizado.

Uma venda deve aceitar composição de pagamentos, por exemplo parte em dinheiro, parte em cartão e parte em vale.

Cheque/duplicata deve ser um título, não apenas um texto no pagamento:

- tipo;
- emitente;
- terceiro, quando existir;
- número do cheque/documento;
- banco/agência/conta, se necessário;
- valor;
- emissão;
- vencimento;
- cliente e venda de origem;
- status: em carteira, compensado/recebido, devolvido ou cancelado;
- observação e histórico de alterações.

Vencimento não deve marcar automaticamente um cheque como compensado sem confirmação explícita. O sistema pode alertar que venceu.

### 3.6 Vales e contas a receber

Vale é a parte da venda que ficou fiada. Criar uma tela específica com:

- cliente;
- venda/documento de origem;
- emissão e vencimento;
- valor original;
- pagamentos e créditos aplicados;
- saldo atual;
- dias em atraso;
- status;
- ações de receber, renegociar, consultar e imprimir.

Substituir cálculos espalhados por um livro do cliente:

- débito por venda/vale;
- crédito por pagamento;
- crédito por devolução;
- ajuste autorizado;
- estorno/cancelamento;
- alocação de cada crédito contra um ou mais débitos.

Isso mantém o saldo reativo mesmo depois de alterações ou cancelamentos.

### 3.7 Devolução e crédito do cliente

A devolução deve sempre apontar para a venda e o item original quando possível.

Registrar:

- item e quantidade devolvida;
- data;
- motivo;
- condição do material;
- usuário responsável;
- valor de crédito calculado;
- retorno ou não ao estoque;
- saldo do crédito;
- aplicações futuras do crédito.

O crédito não deve ser confundido com pagamento em dinheiro. Ele entra no livro do cliente e pode ser consumido em vendas futuras ou usado para abater um vale.

Todo material devolvido entra em um controle restrito de “materiais devolvidos/agarrados”, mesmo sem existir estoque geral. Esse controle deve mostrar quantidade, valor de custo, valor potencial de venda, tempo parado e destino. A saída desse controle precisa ser registrada quando o material for reaproveitado, revendido ou descartado.

Impedir devolução acumulada maior que a quantidade originalmente vendida.

### 3.8 Venda avulsa

Permitir uma linha sem produto cadastrado, contendo:

- descrição do material;
- quantidade/metragem;
- unidade;
- preço unitário ou valor total;
- custo opcional, somente para usuário autorizado;
- observação.

Por padrão, item avulso não altera estoque e não entra automaticamente no catálogo de produtos habituais. Essa regra deve ficar visível.

### 3.9 Contas a pagar a fornecedor

Compras devem poder gerar títulos a pagar, com:

- fornecedor e compra de origem;
- parcela;
- emissão e vencimento;
- valor original;
- valor pago e saldo;
- forma e data da baixa;
- juros, desconto e observação;
- status: aberto, parcial, pago, vencido ou cancelado.

Criar pagamentos a fornecedor e uma tabela de alocação entre pagamento e títulos, seguindo a mesma ideia das contas a receber.

### 3.10 Produtos, referência e custo

- adicionar campo explícito `referencia`, separado do código interno;
- usar como custo atual o custo unitário da última compra registrada;
- congelar o custo usado em cada item vendido;
- registrar a origem do custo e, quando aplicável, o fornecedor;
- fazer compra e venda usarem a mesma unidade;
- descontinuar fator de conversão sem apagar os campos imediatamente;
- migrar os produtos existentes antes de remover a lógica antiga.

Não haverá controle geral de estoque. Compras atualizam custo e histórico; vendas não precisam baixar saldo físico. Apenas materiais devolvidos terão controle de quantidade “agarrada”.

### 3.11 Alteração reativa de venda

Não fazer um simples `UPDATE` destrutivo. Cada alteração deve ser uma revisão auditada.

Fluxo:

1. carregar venda e todos os efeitos vinculados;
2. validar permissão/PIN;
3. salvar snapshot anterior;
4. recalcular itens, custos, totais e margem;
5. ajustar livro do cliente, alocações e créditos;
6. ajustar estoque quando esse módulo existir;
7. revalidar títulos e pagamentos;
8. registrar motivo, operador, autorizador e diferenças;
9. atualizar relatórios e histórico na mesma transação.

Não haverá limite de tempo para alterar uma venda. Venda já paga, com cheque, bônus ou devolução deve exigir um fluxo de correção/estorno mais rigoroso do que uma venda ainda aberta, preservando todas as versões e efeitos financeiros. Recomenda-se restringir essa ação ao administrador, exigir PIN e motivo.

### 3.12 Comprovante de venda

Reproduzir a identidade do modelo recebido:

- logotipo e dados da Luciano Couros;
- data, cliente, telefone, endereço e número do documento;
- referência, quantidade, discriminação, preço unitário e preço total;
- número de itens e total de metros;
- total, vencimento e assinatura do cliente;
- linhas visuais semelhantes ao documento histórico;
- reimpressão sempre baseada na versão registrada da venda.

O papel é A4. O layout deve preservar a aparência da planilha histórica e aproveitar a folha para economizar papel. Ainda é necessário confirmar se serão duas vias idênticas na mesma folha, orientação da impressão, corte e modelo da impressora.

### 3.13 Calculadora global

- botão flutuante em todas as telas;
- atalho de teclado configurável, inicialmente `F4`;
- operações básicas e percentuais;
- histórico curto da sessão;
- ação para copiar o resultado;
- durante a venda, opção de aplicar o resultado à célula ativa.

### 3.14 Direção visual

- grade mais enxuta e densa no desktop;
- tipografia maior nos valores e campos essenciais;
- inputs com fundo contrastante em relação ao fundo da aplicação;
- foco de teclado muito evidente;
- totais fixos/visíveis durante a rolagem;
- menos cartões decorativos no fluxo de venda;
- custo/lucro visualmente separados e protegidos;
- feedback imediato de salvamento, autorização e erro.

## 4. Modelo de dados proposto

Novos grupos de tabelas, sujeitos a refinamento:

- `usuarios`, `papeis`, `permissoes`, `sessoes`;
- `autorizacoes`, `auditoria_eventos`;
- `cliente_produtos_habituais`, com último preço, unidade, frequência, última compra e estado visível/oculto;
- `venda_revisoes`, `venda_revisao_itens`;
- `movimentos_cliente`, `alocacoes_recebimento`;
- `titulos_receber`, `instrumentos_recebimento`;
- `devolucoes`, `itens_devolucao`;
- `movimentos_material_devolvido`, para a métrica de material agarrado;
- `creditos_cliente`, `aplicacoes_credito`;
- `titulos_pagar`, `pagamentos_fornecedor`, `alocacoes_pagamento_fornecedor`;
- `schema_migrations` para controlar versões do banco.

Itens de venda devem aceitar `produtoId` nulo apenas quando forem explicitamente avulsos e devem preservar descrição, referência, unidade, preço e custo como snapshot.

## 5. Fases recomendadas

### Fase 0 — validação com o cliente

- observar uma venda real completa;
- obter a planilha original, não apenas capturas;
- confirmar atalhos, ordem das colunas e impressão;
- fechar as decisões pendentes listadas abaixo.

### Fase 1 — fundação de segurança e dados

- migrações versionadas;
- usuários, papéis, PIN e auditoria;
- livro financeiro de clientes e fornecedores;
- testes de consistência e backup antes de migrar.

### Fase 2 — produto e custo

- referência;
- compra e venda na mesma unidade;
- retirada progressiva do fator de conversão;
- último custo de compra e fornecedor de origem;
- nenhum estoque geral.

### Fase 3 — nova venda em grade

- grade estilo planilha;
- produtos habituais do cliente;
- venda avulsa;
- autorização de preço abaixo do padrão;
- análise durante a venda protegida por PIN;
- rascunho e atalhos.

### Fase 4 — recebimentos e vales

- pagamentos compostos;
- vales/contas a receber;
- cheques e duplicatas;
- bônus/créditos;
- baixa e cancelamento auditados.

### Fase 5 — devoluções e contas a pagar

- devolução vinculada à venda;
- crédito do cliente;
- controle restrito de materiais devolvidos/agarrados;
- títulos e pagamentos de fornecedor.

### Fase 6 — revisão de venda e comprovante

- revisão versionada e reativa;
- regras especiais para vendas pagas;
- novo comprovante fiel ao modelo histórico;
- reimpressão por versão.

### Fase 7 — experiência e infraestrutura

- calculadora global;
- refinamento visual e acessibilidade;
- serviço Windows, atualização transacional, PWA/atalhos e backup OneDrive conforme roadmap de infraestrutura.

## 6. Decisões confirmadas

1. Custo atual: custo unitário da última compra.
2. Compra e venda: mesma unidade; remover fator de conversão.
3. Estoque geral: não será controlado.
4. Pagamentos: uma venda pode ter várias formas.
5. Bônus: sobra de pagamento do cliente, não reembolsável, reutilizável em compras ou abatimento futuro.
6. Devolução: material retorna e entra na métrica de material agarrado, sem criar estoque geral.
7. Crédito: somente reutilizável, nunca devolvido em dinheiro.
8. Alteração de venda: sem limite de tempo, sempre versionada e auditada.
9. Impressão: papel A4, preservando o layout histórico e economizando papel.
10. Preço abaixo do autorizado: somente administrador pode liberar com PIN.
11. Produtos habituais: padrão incremental; carregar todos no início e usar o último preço daquele cliente.
12. Preço especial: o administrador pode autorizá-lo apenas para a venda ou persistir o piso por cliente/produto.
13. Quantidade habitual: aparece somente como referência; a quantidade da nova venda começa vazia.
14. Cheque vencido: gera alerta e facilidade de compartilhamento para cobrança, sem baixa automática.
15. Venda antiga: somente administrador autenticado com PIN pode editar.
16. Comprovante: duas meias páginas idênticas em uma folha A4.

## 7. Decisões ainda pendentes

1. O que retira um material da métrica “agarrado”: revenda vinculada, reaproveitamento manual, descarte ou todas essas opções?
2. Produtos inativos continuam aparecendo no padrão histórico ou ficam ocultos por padrão?

## 8. Navegação enxuta confirmada

O menu principal terá seis módulos, apesar de várias funções internas:

1. **Venda** — nova venda em grade, histórico, alterações, devoluções e comprovantes.
2. **Clientes** — cadastro, produtos habituais, histórico, saldo e bônus.
3. **Vales** — contas a receber, recebimentos, cheques, duplicatas e créditos.
4. **Fornecedores** — cadastro, compras, títulos a pagar e baixas.
5. **Produtos e materiais** — cadastro, referência, unidade, último custo e preço padrão.
6. **Relatórios** — análise por item, vendas, vales, pagamentos, fornecedores e materiais agarrados.

**Configurações** permanece separado para usuários, PIN, permissões, empresa, impressão, backup e sistema.

Remover do menu principal Dashboard, Compras, Pagamentos e Backup como telas independentes. Suas funções serão incorporadas aos módulos correspondentes. Não excluir dados nem rotas até as novas telas e migrações estarem validadas.

## 9. Critérios de segurança

- nenhuma regra sensível deve existir somente no frontend;
- PIN nunca deve ser armazenado em texto puro;
- toda ação financeira sensível deve ter operador, data, motivo e antes/depois;
- atualizações e migrações criam backup verificável;
- uma transação incompleta não pode deixar venda, saldo e pagamento divergentes;
- relatórios devem ser projeções do mesmo livro financeiro, não cálculos paralelos incompatíveis.

## 10. Evolução implementada

### Etapa 1 — padrão incremental e grade base

- projeção persistente de produtos habituais por cliente;
- último preço e unidade carregados automaticamente;
- quantidade vazia e edição direta na grade;
- inclusão incremental após venda e reconstrução após cancelamento.

### Etapa 2 — PIN e preço especial

- usuário administrador local preparado para permissões futuras;
- PIN protegido por salt e hash, nunca salvo em texto puro;
- configuração inicial obrigatoriamente feita no computador servidor;
- preço abaixo do piso bloqueado pelo servidor sem PIN válido;
- preço autorizado pode valer uma vez ou permanecer para cliente/produto;
- desconto geral participa do preço efetivo e não contorna a autorização;
- autorizações sensíveis registradas em auditoria.

### Etapa 3 — unidade, último custo e mobile

- referência destacada no cadastro e pesquisa de materiais;
- uma única unidade obrigatória para compra e venda;
- fator de conversão retirado das interfaces e regras comerciais;
- custo não é mais digitado no produto: vem do item da última compra válida;
- cancelamento de compra restaura automaticamente o custo anterior;
- origem e data do último custo aparecem no catálogo;
- navegação e catálogo adaptados para smartphone;
- manifesto PWA, ícone e service worker sempre-online adicionados;
- instalação PWA completa pelo endereço IP permanece dependente de HTTPS confiável na rede local.

### Etapa 4A — navegação enxuta e primeira visão de vales

- tela inicial alterada para o módulo de Venda;
- menu reduzido a Venda, Fornecedores, Clientes, Vales, Produtos e materiais, Relatórios e Configurações;
- nova venda e histórico/comprovantes reunidos dentro de Venda;
- cadastro de fornecedor e compras/custos reunidos dentro de Fornecedores;
- pagamentos deixam de existir como módulo isolado e passam a ser Recebimentos dentro de Vales;
- visão de vales em aberto com saldo total, saldo vencido, dias de atraso e ordem por vencimento;
- apresentação em tabela no desktop e cartões legíveis no smartphone;
- cheques, duplicatas, bônus e pagamentos compostos continuam como próximas partes da etapa financeira.

### Etapa 4B — análise durante a venda e instrumentos

- venda reorganizada visualmente em: cliente/análise, grade de itens e checkout;
- análise em estilo planilha com uma linha por item da mesma venda;
- colunas operacionais para vendedor: data, cliente, quantidade, unidade, artigo, valor unitário e valor vendido;
- colunas administrativas protegidas por PIN: custo, lucro, fornecedor e margem;
- totais da venda com quantidade, preço médio, venda, custo, lucro e margem;
- desconto geral rateado proporcionalmente entre as linhas da análise;
- Vale incluído como fechamento que conclui a venda e deixa o valor integral em aberto;
- formas adicionadas: dinheiro, débito, crédito, PIX, cheque do emitente/terceiro, duplicata do emitente/terceiro, bônus e Vale;
- cheques e duplicatas agora exigem emitente, número e vencimento e são persistidos como instrumentos em carteira;
- vencimento do instrumento não efetua baixa automática;
- cancelamento da venda também cancela o instrumento relacionado;
- modo vendedor representa a visão operacional atual; login individual e permissões por funcionário continuam como a próxima fundação de acesso.
