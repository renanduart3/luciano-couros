# Impressão de intervalos das planilhas

Avaliação de 17/11/2026. Demonstração funcional implementada posteriormente a pedido do usuário, ainda sem publicação.

## Demonstração e reversão

Selecionar células na aba ativa e clicar em “Imprimir seleção · prévia”. A janela permite escolher A4 retrato/paisagem e abrir a impressão do navegador, incluindo salvar PDF. A seleção usa os valores locais atuais; não salva nem altera o banco. A visualização é contínua; as quebras finais aparecem na janela de impressão do navegador. Desativar cabeçalhos/rodapés do navegador para imprimir apenas as células.

Para retirar a demonstração, mudar `IMPRESSAO_PLANILHAS_PREVIEW` para `false` em `src/lib/recursosPreview.ts` e executar `npm run build`. Distribuir esse build pelo processo habitual. Isso remove o acesso ao recurso sem afetar o ajuste de colunas, as seleções ou os dados. Não há migração de banco associada à impressão.

A implementação fica em `src/components/PlanilhaImpressaoPreview.tsx` e `src/lib/impressaoPlanilha.ts`, com integração pequena em `PlanilhasView.tsx`. O documento da impressão usa um iframe próprio para não herdar estilos dos comprovantes. Textos são escapados antes de entrar no HTML. Os testes usam dados sintéticos.

## Viabilidade e experiência proposta

É viável e combina com a seleção de células já disponível. O fluxo recomendado é selecionar um intervalo retangular na aba ativa, clicar em “Imprimir seleção”, conferir a prévia e imprimir ou salvar PDF pelo navegador. Mostrar o endereço do intervalo na prévia evita imprimir a área errada.

O escopo básico contempla uma seleção contínua de uma planilha por vez, valores calculados, moeda, cores, negrito e proporção das larguras das colunas. A prévia deve conter apenas a região escolhida, sem menus, botões ou a cor de seleção. Textos longos devem quebrar na impressão, com altura de linha livre. A4 em retrato/paisagem e ajuste à largura da página, permitindo várias páginas na vertical, evitam tentar comprimir centenas de linhas em uma única folha.

## Implementação necessária

- Reutilizar os limites da seleção e calcular a planilha inteira antes de recortar o intervalo. Fórmulas podem depender de células fora da área impressa.
- Renderizar uma tabela própria de impressão a partir dos dados. A grade atual é virtualizada e só mantém as linhas próximas da tela; imprimir seu HTML diretamente perderia linhas.
- Isolar a prévia em um portal e revisar o CSS global de impressão, que hoje atende comprovantes e outros documentos.
- Validar PDFs com intervalos pequenos, várias páginas, linhas distantes da tela, moeda, fórmulas e textos longos. Conferir uma impressão física com o cliente antes de considerar o resultado homologado na impressora dele.

## Estimativa comercial

Fonte: `tabela-preco.xlsx`, aba “Tabela de Preços”, A3:F4 e A23:F23.

| Escopo | Enquadramento sugerido | Preço inicial | Preço padrão futuro |
| --- | --- | --- | --- |
| Imprimir uma seleção contínua da aba ativa com prévia simples e paginação A4 | Pequena funcionalidade | Faixa da tabela: R$ 200–400; proposta: R$ 350 | Faixa da tabela: R$ 300–600; proposta: R$ 450 |
| Salvar áreas por aba, juntar várias abas na mesma impressão, intervalos separados ou controles avançados de quebra/escala | Funcionalidade intermediária, a detalhar | R$ 400–800 | R$ 600–1.200 |

O enquadramento e os valores propostos são uma avaliação técnica/comercial, não itens específicos já precificados no arquivo. O preço inicial depende da condição contratual de cliente pioneiro; a tabela informa congelamento por 6 ou 12 meses, sem comprovar aqui a vigência do contrato atual.

Para o escopo básico, reservar aproximadamente 3–5 horas de implementação e validação, sujeito à paginação e ao comportamento da impressora. O valor de R$ 350 é um pacote fechado pela categoria da tabela, não multiplicação de horas. A reprodução completa da área de impressão do Excel exigiria orçamento separado.

## Ajuste de colunas entregue separadamente

Redimensionamento de 60 a 800 px, dois cliques para medir o conteúdo inclusive fora da tela e teclado (setas para ajustar, Enter para adequar ao conteúdo, Home para restaurar o padrão). As larguras integram o salvamento e a proteção contra edição concorrente. A migração adiciona metadados sem alterar células existentes; clientes antigos que não enviem larguras preservam o valor salvo. Limpar células mantém as larguras.
