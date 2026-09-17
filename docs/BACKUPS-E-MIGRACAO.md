# Dados externos e backups de 30 dias

## Preparacao no computador do cliente

1. Entregue o pacote de atualizacao sem bancos, `installation-paths.json`, `.runtime`, `node_modules`, `.git` ou dados desta maquina de desenvolvimento. Aplique a nova versao pelo atualizador habitual.
2. Feche o sistema nos navegadores para evitar lancamentos durante a manutencao.
3. Execute **MIGRAR DADOS PARA FORA DO SISTEMA.cmd** e aceite a elevacao do Windows. O assistente pergunta o destino; Enter usa `C:\ProgramData\LucianoCouros\data`. Escolha uma pasta nova, local, fora do projeto e fora de uma pasta sincronizada.
4. O assistente para o servico, compila, copia os bancos pela API do SQLite (incluindo transacoes no WAL), verifica a integridade e copia os backups existentes. Define a retencao em 30 dias e grava o apontamento em `installation-paths.json` na instalacao.
5. O sistema reinicia usando os dados externos. Confira clientes, vendas e saldos. A migracao preserva o modo real/demonstracao: no cliente deve estar selecionado o banco real.
6. Crie um backup manual pela interface. Confirme sua presenca na pasta externa. Teste a restauracao numa instalacao separada antes de descartar os originais.

O comando nao sobrescreve um destino existente. Em caso de falha, conserva os originais e os arquivos copiados para diagnostico. Se a inicializacao apos trocar o apontamento falhar, o assistente remove o novo apontamento e deixa o sistema parado para revisao. Nao apague o destino de uma migracao incompleta sem conferir seu conteudo.

Os bancos originais dentro do projeto sao conservados como seguranca desta migracao. Apos validar os dados e a recuperacao, com o sistema parado, o tecnico pode remover os bancos e backups da antiga pasta `data`. Bancos antigos da raiz podem ser diferentes: nao os trate como duplicados sem comparacao. Nunca exclua os arquivos da pasta externa ativa.

## Google Drive

No **Google Drive para computador > Preferencias > Meu computador > Adicionar pasta**, selecione **somente** `C:\ProgramData\LucianoCouros\data\backups` (ou o caminho escolhido) e habilite a sincronizacao com o Google Drive.

Nao selecione a pasta `data` inteira. Os bancos ativos, WAL/SHM, configuracoes e `.backup-staging` ficam fora da sincronizacao. Nao use uma unidade virtual do Drive como destino do banco.

O servico cria arquivos localmente mesmo sem internet. O envio depende do Drive aberto, conectado na conta do cliente e com espaco disponivel; confirme a inicializacao automatica do Drive no usuario que utiliza o computador. Confira pelo site do Drive e baixe uma copia para testar. O sistema nao confirma upload nem monitora a conta do Google.

As exclusoes locais sincronizam para a nuvem. A lixeira e o armazenamento compartilhado com Gmail/Fotos podem retardar a liberacao de espaco. Esta configuracao nao oferece imutabilidade ou protecao independente contra exclusoes/ransomware.

## Funcionamento

- Verificacao na inicializacao e a cada hora; no maximo um automatico valido por dia e por ambiente, usando a data local do computador.
- Copia temporaria na pasta irma `.backup-staging`, verificacao `integrity_check` e renomeacao para o destino definitivo. A interface aguarda a conclusao.
- Retencao de 30 dias para automaticos, manuais e diretorios `antes-da-atualizacao_*`, usando a data do nome. A configuracao existente continua disponivel para uso tecnico; a migracao aplica 30 dias aos bancos existentes.
- Limpeza somente de nomes reconhecidos; desconhecidos, links e arquivos incompletos nao sao apagados automaticamente. Uma falha de remocao nao interrompe a limpeza dos demais.
- A ultima copia valida de cada ambiente, dos arquivos legados e dos snapshots de atualizacao e preservada mesmo vencida. Marcadores `arquivo.db.protected` ou `.protected` dentro do diretorio de atualizacao impedem a limpeza. Essas excecoes podem permanecer mais de 30 dias.
- Novos arquivos usam `auto_live_*`, `manual_live_*`, `auto_mock_*` e `manual_mock_*`. A interface mostra o ambiente atual. Arquivos antigos sem identificacao ficam no disco para revisao tecnica, sujeitos a retencao; a restauracao automatica deles e bloqueada para nao confundir demonstracao com producao.
- Restauracao valida o arquivo, cria uma copia de seguranca do estado atual, bloqueia novas requisicoes durante a troca e solicita reinicio do servico. Sem servico instalado, reinicie manualmente.
- Arquivos temporarios de uma interrupcao permanecem em `.backup-staging` para revisao com o servico parado. Nao sao apresentados como backups validos.

## Atualizacoes e recuperacao

Servidor e atualizador leem `installation-paths.json`. O atualizador preserva esse arquivo e os dados externos. Nao envie esse arquivo de uma maquina para outra. `DATA_DIR` e `BACKUP_DIR` no ambiente tem prioridade para testes; nao os configure no cliente sem necessidade.

Se o banco externo configurado estiver ausente, a inicializacao falha explicitamente, em vez de criar um banco vazio. Para recuperar numa nova maquina, restaure uma copia valida com o servico parado em uma pasta local, configure o apontamento e confira o modo de producao. Nao copie WAL/SHM de outro banco por cima da copia restaurada.

Para testes: `npm run lint`, `npm run build` e `node scripts/test-backups.cjs`. O teste usa bancos temporarios, simula WAL, retencao, caminho ausente, falha de copia e restauracao HTTP real, sem tocar no banco do cliente.
