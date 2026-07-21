# Sistema Comercial de Tecidos e Materiais (Central de Tecidos)

Este é um sistema de gestão comercial e operacional **local-first** de alta performance, projetado sob medida para lojas de tecidos, confecções e aviamentos. O sistema foca em eficiência, oferecendo um fluxo rápido de checkout, controle de custos, precificação inteligente, gestão de pagamentos por amortização automática e conformidade de dados com persistência em banco SQLite.

---

## 🎨 Identidade Visual e Experiência do Usuário (UX/UI)

O sistema conta com um design moderno, limpo e de alto contraste, otimizado para o uso diário em ambientes comerciais de ritmo acelerado:
- **Painel Lateral Inteligente (Sidebar Retrátil)**: Menu de navegação dinâmico com suporte a estados expandido e recolhido (mini). A preferência do usuário é persistida automaticamente no `localStorage` do navegador, garantindo que o layout permaneça consistente entre as sessões.
- **Micro-interações Fluidas**: Transições animadas suaves gerenciadas por `motion`, facilitando a navegação visual pelas diferentes áreas da aplicação.
- **Visualização de Dados Otimizada**: Tabelas limpas, cartões informativos bem delineados e paleta de cores voltada para legibilidade e cansaço visual reduzido.

---

## 📋 Arquitetura e Especificações Funcionais

### 1. Checkout Expresso (Venda Rápida)
*   **Velocidade Operacional**: Registro completo de vendas realizado em poucos segundos.
*   **Seleção de Clientes**: Vinculação instantânea de clientes ativos, com atalho para cadastro rápido direto no formulário de vendas.
*   **Localização de Itens**: Busca preditiva de materiais por código, nome ou referência de catálogo.
*   **Cálculo Automatizado**: Multiplicação inteligente de quantidade por preço, abatendo descontos percentuais ou fixos em tempo real.
*   **Fluxo de Contas**: Lida de forma integrada com vendas à vista ou a prazo (geração automática de saldo devedor na conta corrente do cliente).

### 2. Cadastro e Controle de Clientes
*   **Foco na Legibilidade**: Listagem simplificada otimizada para o dia a dia, omitindo informações densas como CPF/CNPJ e endereço da visualização principal, focando em Nome, Telefone, WhatsApp, Status e Ações.
*   **Integração WhatsApp Web (Click-to-Chat)**:
    *   Indicador visual dedicado (`isWhatsapp`) para identificar contatos ativos no WhatsApp.
    *   Botão de ação rápida para disparar uma conversa instantaneamente no WhatsApp Web/Desktop.
    *   Tratamento de strings do número para remover caracteres não numéricos e prefixar o código internacional do país (`55` para o Brasil) de forma transparente.

### 3. Gestão de Fornecedores e Compras
*   **Integração de Contatos**: Assim como os clientes, os fornecedores contam com cadastro de telefone completo e atalho direto para WhatsApp.
*   **Registro de Compras (Reposicionar Estoque)**: Fluxo para registrar a entrada de novos materiais.
*   **Custo Médio e Padrão**: Atualização retroativa do custo padrão de venda dos produtos com base nos registros de reposição de estoque, alimentando o cálculo preciso de rentabilidade líquida do sistema.

### 4. Inteligência de BI e Conversão de Materiais
O cadastro e edição de materiais (produtos) possuem um ecossistema avançado de inteligência financeira e logística:
*   **Conversão de Unidade de Compra e Venda**:
    *   Suporte para divergência de unidades operacionais (ex: comprar material em **Rolo** ou **Peça** e fracionar a venda para o consumidor final em **Metro** ou **Unidade**).
    *   Definição de um **Fator de Conversão** dinâmico (ex: 1 Rolo equivale a 50 metros).
*   **Preço de Custo Desmembrado**:
    *   O usuário insere o **Custo de Compra (R$)** da embalagem master (rolo/peça).
    *   O sistema calcula automaticamente o **Custo Unitário de Venda (R$)** aplicando a fórmula:  
        $$\text{Custo Unitário} = \frac{\text{Custo de Compra}}{\text{Fator de Conversão}}$$
*   **Painel de BI de Precificação (Tempo Real)**:
    *   **Margem de Lucro (%)**: Percentual de sobra sobre o preço final de venda.
    *   **Markup (%)**: Percentual aplicado de acréscimo sobre o custo de aquisição.
    *   **Termômetro Colorido de Rentabilidade**: Identificação visual e textual baseada no ganho:
        *   🔴 **Prejuízo**: Preço de venda abaixo do custo unitário.
        *   🔴 **Margem Perigosa**: Margens abaixo de 15%.
        *   🟡 **Margem Aceitável**: Margens saudáveis entre 15% e 35% (com indicação do limite máximo de desconto para manter o mínimo recomendado de 15%).
        *   🟢 **Excelente Rentabilidade**: Margens acima de 35%.
    *   **Sugestões Inteligentes de Venda**: Cálculo automático de preços ideais para o produto visando atingir margens de 30% (mínima sugerida), 50% (ideal sugerido), 70% (premium) ou Markup Duplo (100% de lucro sobre o custo unitário).

### 5. Algoritmo de Amortização de Pagamentos (Livro de Caixa)
*   **Amortização FIFO (First-In, First-Out)**: Quando um cliente realiza um pagamento de saldo devedor avulso, o motor financeiro distribui o montante de maneira automatizada, quitando as faturas pendentes mais antigas em aberto antes de seguir para as mais recentes.
*   **Transparência Contábil**: Evita duplicidade de cobrança e mantém o histórico financeiro do cliente atualizado automaticamente.

### 6. Relatórios de Desempenho e Backup Robusto
*   **Análise Gerencial**: Métricas essenciais como faturamento bruto, margem média do portfólio, ticket médio por cliente, volume de tecidos vendidos (em metros) e volume de inadimplência/pendências em aberto.
*   **Exportação para CSV**: Relatórios gerados podem ser baixados em formato de planilha para auditoria externa com um único clique.
*   **Segurança de Dados**: Módulo de geração de backups não bloqueantes do banco de dados SQLite e restauração ágil por meio de uma interface integrada.

---

## ⚙️ Tecnologias e Arquitetura do Sistema

O sistema é construído sobre pilaras tecnológicos modernos e robustos:

```
┌────────────────────────────────────────────────────────┐
│                      FRONT-END                         │
│   React 19 + Vite + TypeScript + Tailwind CSS v4       │
│   Recharts (Graficos) + Lucide (Iconografia)           │
└───────────────────────────┬────────────────────────────┘
                            │
                      Chamadas API (JSON)
                            │
┌───────────────────────────▼────────────────────────────┐
│                      BACK-END                          │
│   Express.js Server + tsx (TypeScript Engine)          │
└───────────────────────────┬────────────────────────────┘
                            │
                      Consultas Diretas
                            │
┌───────────────────────────▼────────────────────────────┐
│                    BANCO DE DADOS                      │
│   SQLite (better-sqlite3) - Persistência Segura        │
└────────────────────────────────────────────────────────┘
```

*   **Front-end (SPA)**: Organizado em componentes de visualização específicos que se alternam com transições visuais fluidas.
*   **Back-end (API REST)**: Servidor Node + Express unificado exposto na porta `3000` de forma segura.
*   **Banco de Dados**: SQLite embarcado local-first, gerando arquivos robustos que dispensam a instalação de servidores de bancos de dados pesados.
*   **Migração Automática**: O back-end possui um script de migração dinâmico executado durante a inicialização para atualizar o esquema de tabelas legadas para a versão mais recente, adicionando colunas de WhatsApp e campos logísticos de conversão de unidades sem impacto na integridade dos dados históricos existentes.

---

## 🛠️ Como Executar o Projeto

### Uso na máquina do cliente (Windows)

Depois de instalar o **Node.js 22 LTS**, o cliente pode operar o sistema por dois arquivos na pasta principal:

- `ATUALIZAR SISTEMA.cmd`: faz backup dos bancos locais, aplica um `atualizacao.zip` quando presente, instala dependências, compila e reinicia o sistema. Sem o ZIP, recompila a versão atual.
- `REINICIAR SISTEMA.cmd`: encerra somente a instância deste projeto, inicia o servidor oculto e abre `http://localhost:3000` no navegador.

Para entregar uma nova versão, compacte o projeto como `atualizacao.zip` e envie o arquivo ao cliente. Ele deve colocar o ZIP na mesma pasta do sistema e clicar em `ATUALIZAR SISTEMA.cmd`. Bancos SQLite, configurações locais, backups e dependências não são sobrescritos pelo pacote.

Logs de execução ficam em `.runtime` e backups anteriores à atualização ficam em `backups`.

### Pré-requisitos
*   Node.js (versão 18 ou superior)
*   npm (gerenciador de pacotes integrado)

### Passos para Instalação

1. Instale todas as dependências do projeto na pasta raiz:
   ```bash
   npm install
   ```

2. Execute o ambiente de desenvolvimento integrado (Frontend + Backend):
   ```bash
   npm run dev
   ```
   O sistema estará disponível localmente em: `http://localhost:3000`

### Compilação de Produção
Para gerar o build de produção compilado e encapsulado:
```bash
# Compila o front-end e empacota o servidor Express em dist/server.cjs via esbuild
npm run build

# Inicia o servidor otimizado em ambiente produtivo
npm run start
```

---

## 📂 Estrutura do Código-Fonte

```
├── /server           # Inicialização e persistência de dados
│   └── db.ts         # Conexão SQLite e migrações dinâmicas de tabelas
├── /src              # Código-fonte da aplicação React
│   ├── /components   # Telas modulares (VendaRápida, Clientes, BI de Materiais, etc.)
│   ├── /lib          # APIs e funções auxiliares do sistema
│   ├── App.tsx       # Componente mestre e controlador de navegação
│   ├── main.tsx      # Ponto de entrada do React
│   └── types.ts      # Contratos e tipos de dados estáticos do TypeScript
├── server.ts         # Servidor unificado Express com as rotas de API do sistema
├── package.json      # Controle de scripts e dependências do projeto
└── README.md         # Documentação de referência (este arquivo)
```

---

## 🔒 Segurança e Resiliência dos Dados
*   **Backups Isolados**: O banco de dados gera instantâneos estáveis sob demanda ou em tarefas programadas para a pasta `/backups` de modo a blindar a operação contra falhas de hardware ou exclusões acidentais.
*   **Soft Deletes**: Deleção lógica para vendas, garantindo que mesmo itens cancelados continuem no histórico operacional para fins de integridade de caixa e auditoria de faturamento.
