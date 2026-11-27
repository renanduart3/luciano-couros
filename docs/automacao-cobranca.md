# Teste da central de cobrança

Abra Configurações → Automação com o usuário gerente. Mantenha o envio automático desligado enquanto testa os canais. O botão de teste envia apenas ao vendedor escolhido e usa um PDF fictício ou a imagem da loja.

## WhatsApp

O WhatsApp roda dentro do próprio sistema, num processo separado. Não precisa de Docker, programa extra nem mensalidade.

1. Use um chip só para os avisos, instalado num celular com WhatsApp. Assim o número principal da loja não corre risco.
2. Em Configurações → Automação → Conexão do WhatsApp, clique em Conectar. No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho e leia o QR.
3. A sessão fica salva na pasta de dados do sistema. Após reinícios do computador ou quedas de rede, o sistema reconecta sozinho.
4. Cadastre o telefone de cada vendedor com DDI e DDD, salve e envie o teste.

Se algo travar:

- **Reconectar** reinicia só a conexão, sem perder o pareamento.
- **Desconectar e limpar sessão** apaga o pareamento. Use quando o celular foi trocado ou a conexão não volta; depois leia o QR de novo.
- Se o processo do WhatsApp parar, ele é reiniciado automaticamente. As vendas e o restante do sistema não são afetados.
- Com o envio automático pelo WhatsApp ligado, se a conexão ficar fora por mais de 30 minutos, os administradores com Telegram cadastrado recebem um aviso.

A integração não é oficial do WhatsApp. Atualizações do WhatsApp podem exigir uma nova versão do sistema.

## Telegram

1. Crie o bot da empresa pelo BotFather. Defina `TELEGRAM_BOT_TOKEN` no `.env` da pasta do sistema e reinicie o sistema. A atualização do sistema preserva o `.env`.
2. Peça ao vendedor para abrir a conversa privada com o bot e enviar uma mensagem de identificação. O administrador pode consultar `getUpdates` pela Bot API a partir do servidor para obter o campo `message.chat.id`. Confira que o chat é privado e confirme a identidade com o vendedor antes de salvar o destino.
3. Na aba Automação, selecione Telegram no teste. Confirme o recebimento no celular. O canal do teste é independente do canal de envio automático.

## Regras e retomada

Em Configurações → Automação → Contatos para envio, selecione uma pessoa, clique em Adicionar contato e salve. A ficha de cada cliente permite escolher entre os contatos habilitados. Ao remover um contato e salvar, a pessoa também sai das seleções individuais. Adicioná-la novamente permite uma nova seleção nas fichas.

O gerente escolhe um canal para os envios automáticos. Com a opção de reserva marcada, quando o canal principal estiver fora do ar o relatório sai pelo outro canal cadastrado do contato. Sem canal disponível, o relatório espera a conexão voltar. A periodicidade conta dias corridos desde o último relatório enviado daquele cliente a cada destinatário selecionado. O horário segue o relógio do servidor. Ao voltar a funcionar, o serviço verifica os saldos atuais. Cada destinatário recebe no máximo um relatório por cliente no dia. O administrador vem selecionado por padrão. Na ficha do cliente, marque ou desmarque administradores e vendedores. Uma lista vazia suspende os avisos desse cliente.

O relatório considera parcelas de vales em aberto, fora de ordem de cobrança ativa. “Mais de 40 dias” inclui o 41º dia. O valor mínimo é aplicado à soma das parcelas elegíveis do cliente. Na ficha, marcar Personalizar grava apenas aquele campo. Uma orientação personalizada vazia suprime a orientação geral. Desmarcar Personalizar restaura a herança.

Veja a prévia antes de ativar. A prévia indica os destinatários sem contato cadastrado para o canal. Se o serviço perder a confirmação do envio, confira o celular do vendedor e marque o recebimento ou libere uma nova tentativa pelo histórico.
