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

- Verificacao na inicializacao e a cada minuto, usando a hora local do servidor. Horarios perdidos sao cobertos por uma unica copia atual; a agenda normal continua depois disso.
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

## Pasta e horario pela plataforma

Em Configuracoes & Backups > Sistema, PIN e backups, clique em Selecionar pasta para abrir o seletor nativo do Windows e escolha a pasta existente adicionada ao Google Drive para computador e o horario diario (padrao 18:00). Salve e use Criar Backup Agora para conferir o arquivo no destino e depois no site do Drive. Nao e necessario migrar o banco ativo para configurar esse destino.

Backups manuais, automaticos e a lista para restauracao usam a pasta escolhida. Copias anteriores permanecem na pasta antiga. O sistema verifica a agenda a cada minuto, sem varrer nem validar arquivos enquanto nao houver backup pendente. Ao iniciar depois de perder um ou mais horarios, cria uma unica copia atual, mesmo antes do horario de hoje, e retoma o agendamento normal. Uma copia de recuperacao pela manha e a copia de hoje no horario escolhido podem ocorrer no mesmo dia. O estado da agenda e persistido para evitar duplicacao apos reinicios. Nao recupera estados historicos dos dias em que esteve desligado.

A configuracao e armazenada no banco de cada ambiente. O destino deve ficar separado dos bancos ativos. Para recuperar apos reinstalacao, configure novamente a pasta existente e restaure a copia desejada; o GitHub nao contem os dados nem essa configuracao. A sincronizacao e as exclusoes continuam sob controle do Google Drive.

O seletor deve ser acionado no navegador do proprio servidor Windows. Na instalacao como servico, o controlador da bandeja abre a janela na sessao do usuario; se estiver fechado ou desatualizado, reabra com ABRIR CONTROLE DO SISTEMA.cmd. Quando o servidor roda num terminal na sessao do usuario, abre o seletor diretamente, mesmo usando a compilacao de producao. O comando de abertura substitui uma instancia antiga do controlador quando ela nao responde ao seletor. Cancelar preserva a pasta atual.

Falhas consecutivas sao persistidas. As novas tentativas aguardam 5, 15, 30 e depois 60 minutos, inclusive apos reiniciar. A terceira falha mostra um icone/aviso clicavel ao gerente e os detalhes nas configuracoes. Um backup local concluido limpa o aviso; isso nao confirma upload do Google Drive. O sistema evita copias concorrentes, valida SQLite antes de publicar e conserva a ultima copia valida. A limpeza de retencao ocorre apos concluir um backup; falha na limpeza nao transforma um backup concluido em falha.

Teste adicional: `node scripts/test-backup-scheduler.cjs` cobre horarios perdidos, retomada, reinicios, intervalos de repeticao e a comunicacao com o seletor sem abrir uma janela real.

## Arquitetura de protecao e recuperacao em outro computador

- A instalacao pelo comando de instalar servico prepara os dados em `C:\ProgramData\LucianoCouros\data`. Em instalacoes antigas, migra enquanto parado e preserva os originais; se o destino existir e houver dados locais, cancela para evitar escolher ou sobrescrever o banco errado. O tecnico deve revisar o conflito. Uma reinstalacao sem dados locais pode reconectar um banco externo existente validado.
- Executar apenas o servidor pelo terminal continua compativel com instalacoes antigas e testes; nao migra dados automaticamente. Nelas, use MIGRAR DADOS PARA FORA DO SISTEMA.cmd para efetivar o isolamento.
- O programa, os dados ativos e a pasta de copias sao separados. Selecione uma pasta externa dedicada aos backups no Google Drive. Nunca sincronize o banco ativo, WAL/SHM ou a pasta de dados inteira.
- A plataforma e o atualizador agora consultam o mesmo destino escolhido no ambiente ativo. O atualizador grava uma pasta antes-da-atualizacao com os bancos e a configuracao de demonstracao. Ela e uma copia tecnica, diferente dos arquivos individuais restauraveis pela interface.
- Dados do cliente e installation-paths.json nao fazem parte do Git nem do pacote entregue. A pasta escolhida para backups personalizados nao pode estar dentro da instalacao.

Para recuperar depois da perda total do PC:

1. Instale a mesma branch ou uma versao compativel em outro Windows. A instalacao cria dados locais externos novos.
2. Configure um gerente temporario para entrar. Instale o Google Drive, acesse a conta proprietaria dos backups e baixe a copia mais recente concluida. Pastas sincronizadas do computador antigo podem estar na secao Computadores do Drive; a instalacao nova nao as descobre automaticamente.
3. Coloque os arquivos baixados numa pasta local externa dedicada. Selecione-a na plataforma e salve. Confira o ambiente real/demonstracao e escolha o arquivo desejado na lista.
4. Restaure e aguarde o reinicio. Os dados comerciais, usuarios e configuracoes voltam ao momento do backup. Use as credenciais do gerente que existiam nesse backup.
5. Confira clientes, vendas, saldos e um novo backup manual. A restauracao preserva a pasta e o horario escolhidos no PC novo, em vez de reutilizar um caminho da maquina antiga. Configure a sincronizacao dessa nova pasta no Drive.

O teste automatizado simula uma instalacao limpa em outro diretorio, sem o banco original, com uma copia do arquivo de backup em outro caminho. Ele verifica a recuperacao dos dados e a preservacao do destino novo. O envio real e o download do Google Drive devem ser conferidos separadamente: backup local concluido nao garante que chegou a nuvem. A perda maxima de dados depende do ultimo backup efetivamente enviado; operacoes posteriores nao estao nessa copia.
