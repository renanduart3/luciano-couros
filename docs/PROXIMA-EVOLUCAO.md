# Próxima evolução do Luciano Couros

## Infraestrutura e distribuição

1. Instalar o backend como serviço automático do Windows, com reinício em caso de falha.
2. Fazer o atualizador parar o serviço, criar backup, aplicar a versão, iniciar o serviço e validar `/api/health`.
3. Evoluir a distribuição para pacotes compilados no GitHub Releases, com validação e rollback.
4. Manter banco, configurações, backups e logs fora da pasta substituída pelas atualizações.
5. Criar backup SQLite consistente e copiar o arquivo concluído para uma pasta configurável do OneDrive.
6. Manifesto, ícone, modo standalone e service worker de rede adicionados. Para instalação PWA completa pelo IP do computador ainda será necessário HTTPS confiável; em HTTP o celular pode oferecer somente “Adicionar à tela inicial”.
7. Reservar um IP fixo para o computador no DHCP do roteador.
8. Adicionar autenticação antes de ampliar o acesso pela rede local.
9. Manter o cliente em build de produção; nunca executar `pnpm dev` na loja.

### Estado mobile atual

- navegação por cabeçalho e menu lateral próprios para smartphone;
- formulários sem zoom automático no iPhone;
- catálogo em cartões e modais adaptados à tela pequena;
- venda e compras empilham os blocos; grades preservam rolagem horizontal onde o comportamento de planilha exige;
- PWA não mantém dados offline: o computador servidor precisa continuar ligado, como definido na arquitetura.

## Experiência de venda em formato de planilha

Objetivo: preservar os hábitos de teclado adquiridos pelo cliente em aproximadamente dez anos de uso do Excel, sem usar uma planilha como banco de dados.

### Grade de lançamento proposta

- Colunas: código, material, quantidade, unidade, preço unitário, desconto e total.
- Última linha sempre vazia para inclusão do próximo material.
- Busca e autocomplete de material dentro da célula.
- Quantidade, unidade, preço e desconto editáveis diretamente na linha.
- Total calculado e protegido contra edição.
- `Tab` e `Shift+Tab` navegam horizontalmente.
- `Enter` confirma e avança conforme o fluxo configurado.
- Setas navegam entre células; `F2` ou duplo clique inicia a edição; `Esc` cancela.
- `Delete` remove ou limpa a linha mediante regra segura.
- Nova linha criada automaticamente ao concluir a última linha.
- Recalcular totais, margem e saldo a cada alteração.
- Atalhos para finalizar venda, incluir linha e desfazer a última alteração.
- Rascunho salvo automaticamente para proteção contra fechamento acidental.
- Validação de produto, quantidade, preço, estoque e margem continua sendo feita pelo sistema.

### Decisão técnica inicial

Priorizar uma grade editável própria em React, porque o lançamento possui poucas colunas e regras comerciais específicas. Avaliar AG Grid Community se os testes mostrarem necessidade de virtualização, filtros ou navegação mais sofisticada. Não usar arquivo Excel como fonte de dados e não adotar componente que exija licença comercial sem aprovação prévia.

### Antes da implementação

1. Obter uma cópia ou captura da planilha atualmente usada pelo cliente.
2. Registrar a ordem real das colunas e os atalhos que ele utiliza.
3. Observar pelo menos uma venda completa feita por ele.
4. Montar um protótipo somente da grade.
5. Validar o protótipo com o cliente antes de substituir a tela atual.
