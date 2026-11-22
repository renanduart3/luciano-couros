# Teste da central de cobrança

Abra Configurações → Automação com o usuário gerente. Mantenha o envio automático desligado enquanto testa os canais. O botão de teste envia apenas ao vendedor escolhido e usa um PDF fictício ou a imagem da loja.

## WhatsApp

1. No servidor com Docker, defina `WAHA_API_KEY` e `WAHA_DASHBOARD_PASSWORD` no arquivo local `.env`, usando valores próprios. As demais opções estão em `.env.example`.
2. Na pasta do sistema, execute `docker compose -f compose.waha.yaml up -d`. Abra `http://127.0.0.1:3001/dashboard` no servidor com o usuário admin e a senha configurada. Conecte a API com a chave definida, inicie a sessão `default` e vincule o celular pelo QR. O volume Docker conserva a sessão entre reinícios.
3. Reinicie o serviço do sistema após mudar o ambiente. Na aba Automação, cadastre o telefone do vendedor com DDI e DDD, salve e envie o teste.

## Telegram

1. Crie o bot da empresa pelo BotFather. Defina `TELEGRAM_BOT_TOKEN` no ambiente do serviço ou no `.env` local e reinicie o sistema.
2. Peça ao vendedor para abrir a conversa privada com o bot e enviar uma mensagem de identificação. O administrador pode consultar `getUpdates` pela Bot API a partir do servidor para obter o campo `message.chat.id`. Confira que o chat é privado e confirme a identidade com o vendedor antes de salvar o destino.
3. Na aba Automação, selecione Telegram no teste. Confirme o recebimento no celular. O canal do teste é independente do canal de envio automático.

## Regras e retomada

O gerente escolhe um canal para os envios automáticos. A periodicidade conta dias corridos desde o último relatório enviado daquele cliente a cada destinatário selecionado. O horário segue o relógio do servidor. Ao voltar a funcionar, o serviço verifica os saldos atuais. Cada destinatário recebe no máximo um relatório por cliente no dia. O administrador vem selecionado por padrão. Na ficha do cliente, marque ou desmarque administradores e vendedores. Uma lista vazia suspende os avisos desse cliente.

O relatório considera parcelas de vales em aberto, fora de ordem de cobrança ativa. “Mais de 40 dias” inclui o 41º dia. O valor mínimo é aplicado à soma das parcelas elegíveis do cliente. Na ficha, marcar Personalizar grava apenas aquele campo. Uma orientação personalizada vazia suprime a orientação geral. Desmarcar Personalizar restaura a herança.

Veja a prévia antes de ativar. A prévia indica os destinatários sem contato cadastrado para o canal. Se o serviço perder a confirmação do envio, confira o celular do vendedor e marque o recebimento ou libere uma nova tentativa pelo histórico.
