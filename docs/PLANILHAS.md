# Planilhas

- Até cinco planilhas compartilhadas entre os gerentes.
- Cada planilha tem 500 linhas e 15 colunas (A a O): 7.500 células. Na versão 1.47.0 a grade passou de 1.000 × 10 para 500 × 15; ao iniciar, o servidor apaga o que ficou fora da grade (linhas acima de 500), aumenta a versão da planilha e registra `planilha_ajustada_ao_limite` na auditoria. As constantes ficam em `src/lib/planilhas.ts` e o código assume colunas de uma letra (no máximo 26).
- Cada célula aceita até 300 caracteres. A colagem que ultrapassa a grade é recusada por inteiro, sem descartar dados silenciosamente.
- O botão Salvar grava nome, conteúdo e formatação no banco SQLite ativo. Os backups do banco incluem as planilhas.
- Limpar apaga células e formatações, mantendo o nome. Excluir remove o documento. As duas ações pedem confirmação e senha do gerente, conferidas no servidor, com auditoria.
- O número de versão impede que uma sessão sobrescreva alterações salvas por outra. Em caso de conflito, o rascunho permanece na tela.
- A interface avisa antes de trocar de planilha ou sair com alterações pendentes.
- Arraste o mouse ou use Shift + clique/setas para selecionar um intervalo. A barra inferior mostra contagem numérica, média, soma, mínimo e máximo, incluindo resultados de fórmulas e ignorando textos, vazios e erros. A seleção não altera os dados nem precisa ser salva.
- **Copiar como imagem** gera um PNG da seleção (valores calculados, negrito, cores e larguras das colunas), como o "Copiar como imagem" do Excel, para colar com Ctrl+V no WhatsApp ou no e-mail. O navegador só permite copiar imagem em `localhost` ou HTTPS; fora disso o PNG é baixado como arquivo. Limite de 500 linhas por imagem.
- **Enviar imagem no WhatsApp** mostra a prévia e envia o PNG, com legenda, para um contato com número salvo na Automação, usando o WhatsApp conectado ali (`GET /api/automacao/contatos-whatsapp`, `POST /api/automacao/enviar-imagem`). Teste: `node scripts/test-planilhas-imagem.cjs` (após build, com Playwright).

## Cálculos e desempenho

São aceitos números, textos, percentuais, referências entre células da mesma planilha, operações aritméticas e SOMA/SUM. Os cálculos usam frações com inteiros de precisão arbitrária e arredondam apenas a apresentação. Referências circulares e fórmulas inválidas aparecem como erros na própria célula.

A grade renderiza apenas as linhas visíveis e uma margem de rolagem. O recálculo usa um cache compartilhado por planilha. A avaliação tem limites de profundidade (100 referências), trabalho (200.000 etapas por recálculo) e tamanho dos números intermediários (1.000 dígitos), sinalizados por `#LIMITE!`, para conter fórmulas excessivamente complexas.

Teste local em 14/11/2026, Node.js 22 e Chrome: 10.000 células preenchidas, incluindo 1.000 fórmulas SOMA de nove células. Em 15 recálculos, a mediana foi aproximadamente 23 ms; no teste de interface, colagem, recálculo e atualização visível levaram aproximadamente 65 ms. Os resultados variam com o computador, conteúdo e complexidade das fórmulas; não constituem garantia de desempenho constante.

Validação: `node scripts/test-planilhas.cjs`, `node scripts/test-planilhas-http.cjs` (após build) e `node scripts/test-planilhas-ui.cjs` (com Playwright disponível). Os testes HTTP usam banco temporário e verificam a preservação dos dados após reiniciar o servidor.
