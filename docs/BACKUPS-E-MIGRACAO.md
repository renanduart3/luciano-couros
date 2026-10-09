# Backups locais e cópia para o Google Drive

## Funcionamento

- O banco ativo fica fora da instalação. O caminho é definido em `installation-paths.json`; o padrão da instalação é `C:\ProgramData\LucianoCouros\data`.
- O backup diário e o manual são gerados **sempre na pasta local de backups** (`data\backups`, ou `backupDir` do apontamento). A configuração do Drive não muda esse destino.
- O SQLite gera um arquivo temporário na pasta irmã `.backup-staging`. O sistema verifica a integridade e só então publica o `.db` local.
- Se uma pasta do Drive estiver configurada, o sistema copia os arquivos locais válidos dos últimos 7 dias para ela. A cópia também passa por verificação de integridade e comparação SHA-256 antes de ser publicada. Não gera outro backup do banco.
- Arquivos iguais não são duplicados. Uma réplica danificada pode ser substituída pela cópia local válida.
- O Drive para computador faz o upload. A indicação “Última cópia para a pasta do Drive” confirma apenas a cópia no disco; confira o upload no próprio Drive.
- Se a pasta do Drive estiver indisponível, o backup local continua. A falha é mostrada separadamente. As cópias pendentes ainda dentro dos 7 dias são tentadas novamente após 5, 15, 30 e depois 60 minutos. Um backup manual ou salvar a configuração permite uma nova tentativa imediata.
- A agenda usa a hora local do servidor e é verificada na inicialização e a cada minuto. Horários perdidos geram uma única cópia atual, sem reconstruir os dias anteriores. O estado da agenda persiste após reinícios.
- Na primeira execução desta versão, a agenda antiga é reinicializada para garantir uma cópia no destino local, mesmo que o backup anterior tenha sido salvo somente na pasta do Drive.

## Retenção de 7 dias

O sistema exclui backups com mais de 7 × 24 horas nos dois destinos. O limite é por idade, não por quantidade: backups manuais podem aumentar o número de arquivos nesse período.

A limpeza local ocorre na inicialização, a cada minuto enquanto o sistema está em execução e depois de criar um backup. A limpeza do Drive ocorre nas tentativas de cópia; uma pasta indisponível só pode ser limpa quando voltar a ficar acessível. Se o computador estiver desligado, a limpeza acontece quando o sistema voltar a executar.

São excluídos somente arquivos com nomes reconhecidos de backup e diretórios `antes-da-atualizacao_*` vencidos. A última cópia válida vencida e os antigos marcadores `.protected` não são exceções à retenção. Links, arquivos desconhecidos e cópias parciais não são apagados automaticamente. Diretórios vencidos com links precisam de revisão técnica; o sistema alerta em vez de seguir esses links.

Uma falha ao excluir não impede a tentativa de limpar os demais arquivos nem a geração/cópia de um backup novo. O sistema mostra o problema de permissão; enquanto ele persistir, não consegue garantir o limite de 7 dias.

O backup anterior à atualização permanece **local**, mesmo com o Drive indisponível. Esse diretório é uma cópia técnica; os `.db` individuais diários/manuais são os arquivos restauráveis pela interface.

## Configuração no cliente

1. Atualize a aplicação pelo procedimento habitual e reinicie o serviço. Não distribua bancos, `installation-paths.json`, `.runtime`, `.git`, `node_modules` ou dados desta máquina no pacote.
2. Em **Configurações e Backups > Sistema**, confira o caminho local e defina o horário diário.
3. Crie uma pasta local dedicada, por exemplo `C:\ProgramData\LucianoCouros\copia-drive\backups`. No Google Drive para computador, configure a sincronização **somente dessa pasta `backups`**.
4. Selecione essa pasta na plataforma e salve. A pasta do Drive é opcional; desativá-la mantém o backup local.
5. Use **Criar Backup Agora**. Confira o mesmo nome de arquivo no destino local e na pasta do Drive, sem avisos de cópia ou limpeza. Confira também o arquivo no site do Drive.

Não sincronize o banco ativo, a pasta `data` inteira ou `.backup-staging`. Não coloque o banco numa unidade virtual do Drive. Use uma pasta local sincronizada: uma unidade mapeada na sessão do usuário pode não estar disponível para a conta do serviço. [Referência Microsoft sobre serviços e unidades mapeadas](https://learn.microsoft.com/en-us/windows/win32/services/services-and-redirected-drives).

A pasta selecionada deve ficar fora da instalação, não pode conter o banco ativo e não pode coincidir, conter ou ficar dentro da pasta local de backups. Pastas antigas que deixaram de ser configuradas não continuam sob limpeza automática: confira o conteúdo antes de remover arquivos remanescentes nelas.

## Permissões de criação e exclusão no Windows

**Não é necessário pedir confirmação a cada exclusão.** A conta que executa o servidor precisa ter permissão **Modificar** sobre os backups, seus arquivos e subpastas. Essa permissão inclui a exclusão. A referência do Windows identifica `M` como acesso Modify: [documentação do icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls).

Para conferir a conta do serviço, abra PowerShell e execute apenas esta consulta:

```powershell
Get-CimInstance Win32_Service -Filter "Name='CentralDeTecidos'" |
    Select-Object Name, StartName, State
```

Se o serviço não estiver instalado, use a conta do usuário que inicia o servidor pelo terminal. Se `StartName` for `LocalSystem`, a conta a configurar na segurança das pastas é **SYSTEM / SISTEMA**. Se for outra conta, configure exatamente a indicada pela consulta.

Para corrigir uma falha de acesso:

1. Entre com uma conta administradora do Windows.
2. No Explorador, abra **Propriedades > Segurança > Editar** das pastas de backups e conceda **Modificar** à conta identificada acima, incluindo arquivos e subpastas existentes.
3. Faça o mesmo nas pastas irmãs `.backup-staging`. Exemplos: `C:\ProgramData\LucianoCouros\data\.backup-staging` e `C:\ProgramData\LucianoCouros\copia-drive\.backup-staging`. Se não existirem, crie-as e conceda a permissão. O servidor precisa conseguir criar e excluir os arquivos temporários nelas.
4. A conta que executa o Google Drive também precisa de acesso à pasta sincronizada para ler os backups e acompanhar as exclusões. Configure essa conta específica, sem liberar acesso a Todos.
5. Salve novamente a configuração na plataforma e crie um backup manual.

Ao salvar, o próprio servidor testa a criação/exclusão de um arquivo e de uma subpasta, tanto no destino quanto em `.backup-staging`. Isso testa **a conta real do processo**, não apenas o acesso do usuário conectado no navegador. Arquivos antigos podem ter permissões diferentes ou estar bloqueados por outro processo; falhas futuras aparecem no aviso de limpeza.

O sistema não altera permissões do Windows automaticamente. Não é necessário apagar a pasta dos dados ou a pasta dos backups para configurar o acesso: a retenção remove apenas cópias reconhecidas que venceram.

## Recuperação e reinstalação

A lista da plataforma prioriza o backup local e inclui arquivos existentes somente na pasta configurada do Drive, sem repetir nomes. Assim, é possível restaurar localmente com o Drive indisponível e também recuperar arquivos baixados em outro computador.

Para recuperar depois da perda total do PC:

1. Instale uma versão compatível. A instalação prepara novos dados locais externos.
2. Configure um gerente temporário e baixe do Drive um `.db` válido do ambiente real.
3. Coloque o arquivo numa pasta local dedicada, fora da instalação e dos bancos ativos. Selecione-a como pasta do Drive na plataforma. Alternativamente, com o sistema parado, copie o `.db` para a pasta local de backups definida no apontamento.
4. Escolha a cópia na lista, restaure e aguarde o reinício. A restauração valida o arquivo, cria uma cópia local do estado anterior e preserva o destino do Drive e o horário escolhidos no computador novo.
5. Entre com as credenciais existentes no backup. Confira clientes, vendas, saldos e um novo backup nos dois destinos.

O banco restaurado retorna ao momento da cópia. Os dados posteriores não estarão nela. A existência de um arquivo na pasta do Drive não confirma que o Google o enviou.

O apontamento externo é ignorado pelo Git e preservado pelo atualizador; não distribua o de uma máquina para outra. `DATA_DIR` e `BACKUP_DIR` no ambiente têm prioridade e são usados em testes. Se um banco externo configurado estiver ausente, a inicialização falha explicitamente para não criar um banco vazio.

## Migração de instalações antigas

Se os dados ainda estiverem dentro da instalação, feche o sistema e execute **MIGRAR DADOS PARA FORA DO SISTEMA.cmd**, aceitando a elevação do Windows. O padrão é `C:\ProgramData\LucianoCouros\data`; escolha uma pasta local nova, fora da instalação e da sincronização.

O assistente para o serviço, copia os bancos via SQLite incluindo o WAL, verifica a integridade, copia os backups existentes e grava `installation-paths.json`. O destino existente não é sobrescrito. Uma reinstalação pode reconectar dados externos existentes validados. Os originais são preservados para revisão e só devem ser removidos pelo técnico depois de validar os dados e a recuperação, com o sistema parado. Nunca exclua a pasta externa ativa.

## Verificação automatizada

`npm run lint`, `npm run build`, `node scripts/test-backups.cjs` e `node scripts/test-backup-scheduler.cjs`.

Os testes usam bancos temporários e cobrem WAL, migração, retenção nos dois destinos, falha de exclusão, cópias idênticas, réplica danificada, Drive indisponível, alertas independentes, retomada de cópias pendentes, restauração HTTP real e recuperação em computador novo. Não usam o banco do cliente. O upload real do Drive e as permissões efetivas do computador do cliente devem ser conferidos na instalação.
