# Parte 8 — conciliação histórica e regressão final

Implementação em main, 04/10/2026. Ferramentas e regressão preparadas; a conciliação dos documentos reais do cliente permanece pendente da identificação da base afetada e de uma ordem/vale com problema. As bases locais disponíveis não foram identificadas como a base desse cliente.

## Diagnóstico offline

`scripts/conciliar-financeiro.cjs` exige um caminho explícito, abre a origem somente para leitura e não importa a inicialização do servidor, não executa migrações e não processa pagamentos agendados. O relatório contém IDs, números e valores para conferência; não exporta nomes, documentos pessoais ou texto livre da auditoria.

São 20 verificações: finalização sem recebimento, lançamentos e vínculos órfãos, alocações incompatíveis/duplicadas, distribuição e composição dos recebimentos, títulos, bônus, ordens canceladas, pagamentos legados, saldos e referências dos residuais. Também executa verificações de integridade SQLite e chaves estrangeiras. Os indicadores orientam investigação; não certificam a integridade completa nem provam, isoladamente, corrupção.

Esquemas antigos produzem verificações **indisponíveis** e situação `diagnostico_incompleto`. Registro legado não é automaticamente um erro. A contagem de ocorrências pode incluir várias referências ao mesmo documento.

```powershell
npm run conciliar:financeiro -- --db "C:/caminho/base.db" --saida "output/diagnostico-novo.json"
```

O diretório de saída deve existir. Arquivos existentes não são sobrescritos.

## Simulação em cópia

```powershell
npm run conciliar:financeiro -- --db "C:/caminho/base.db" --copia-corrigida "output/base-revisao.db" --saida "output/simulacao-nova.json"
```

A cópia usa o backup do SQLite, incluindo o estado confirmado em WAL. A única correção automática implementada é preencher uma descrição vazia de residual a partir de `vale_residual_origens`, com referências existentes, números e clientes correspondentes. Não deduz origem, dívida ou pagamento pelo saldo atual.

O relatório registra antes/depois e propostas aplicadas. A tabela `conciliacao_metadados`, criada apenas na cópia, guarda descrição anterior, nova descrição, revisão e data. A aplicação é transacional, rejeita análise desatualizada e compara a impressão digital das tabelas financeiras antes/depois, excluindo somente o campo de observações da venda. Alteração financeira inesperada provoca rollback. A ferramenta não substitui a base operacional.

O residual continua um vale comum e independente; sua origem é histórica. Nenhuma ordem posterior é reaberta automaticamente. Ausência de origem comprovada, alocações antigas e diferenças monetárias ficam para análise individual com comprovantes e auditoria.

## Evidências locais

- `data/database_mock.db`: 35 ocorrências, sendo 28 pagamentos legados e 7 vínculos ordem/recebimento em ordens canceladas; 3 verificações indisponíveis por esquema antigo, nenhuma descrição proposta. Esses vínculos exigem distinguir cancelamento antigo de renegociação antes de decidir qualquer estorno.
- `data/database.db`: sem ocorrências nas verificações executáveis, mas 9 verificações indisponíveis; resultado incompleto, não uma declaração de base íntegra.
- Nenhuma dessas bases foi corrigida. Relatórios locais estão em `output/parte-8` e não integram o commit.

## Regressão

`npm run test:financeiro` executa 20 suítes em processos separados, abrangendo distribuição, devolução, bônus, finalização, reabertura, saldo, ordens, comprovantes e quantidades. Um caminho opcional salva evidências sem sobrescrever arquivos:

```powershell
npm run test:financeiro -- output/regressao-nova.json
```

O teste específico da conciliação usa base temporária com o esquema atual e verifica: origem e WAL preservados, descrição comprovada, ausência de inferência para residual ambíguo, idempotência, auditoria, revisão desatualizada, rollback por falha de auditoria e por trigger que tenta alterar valor, cliente incompatível, destino existente e entrada ausente. Todas as verificações SQL estão disponíveis nesse esquema.

Validação: 20/20 suítes aprovadas, TypeScript e build aprovados. O build mantém o aviso existente de tamanho do bundle. Também passaram os 8 cenários de impressão em Chromium e a conferência de conteúdo, totais e ausência de páginas vazias nos PDFs, armazenados em `output/parte-8/impressao`. A impressão possui validação separada pelos scripts `test-impressao-comprovantes.cjs` e `test-impressao-pdfs.py`, descritos na parte 7; não é coberta pelo comando das 20 suítes. Não foi testada uma impressora física.

## Conclusão no ambiente do cliente

1. Identificar a base efetivamente usada e os números dos documentos afetados; preservar backup consistente e registrar a versão do sistema.
2. Executar o diagnóstico somente para leitura. Conferir cada ocorrência com recibos, títulos, auditoria e ordens relacionadas, especialmente recebimentos compartilhados.
3. Simular descrições comprovadas em cópia. Definir correções financeiras específicas somente quando os valores e vínculos históricos forem demonstráveis; a ferramenta não as aplica.
4. Conferir totais por cliente, bônus, títulos, saldos, referências e comprovantes após cada correção na cópia, preservando negociações posteriores de residuais.
5. Preparar a aplicação operacional com backup e restauração testada. Não substituir uma base em uso por uma cópia desatualizada, pois isso perderia movimentações posteriores.

Não houve publicação, substituição de base operacional ou correção de registros reais do cliente nesta etapa.
