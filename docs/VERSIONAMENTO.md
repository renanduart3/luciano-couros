# Versionamento e publicação

## Regra simples

A versão oficial fica somente no campo `version` do `package.json`. A interface, a API e o atualizador leem esse mesmo valor.

Formato: `MAJOR.MINOR.PATCH`, por exemplo `1.4.2`.

- `PATCH`: correção sem mudança importante de uso. Ex.: `1.0.0` → `1.0.1`.
- `MINOR`: nova funcionalidade compatível. Ex.: `1.0.1` → `1.1.0`.
- `MAJOR`: mudança grande ou incompatível. Ex.: `1.5.0` → `2.0.0`.

## Preparar uma versão

Na máquina de desenvolvimento, escolha apenas um comando:

```powershell
npm run version:patch
npm run version:minor
npm run version:major
```

Depois:

1. Registre as mudanças no `CHANGELOG.md`.
2. Execute `pnpm lint` e `pnpm build`.
3. Faça commit, crie a tag e envie a branch principal:

```powershell
git add .
git commit -m "release: v1.0.1"
git tag v1.0.1
git push origin main --follow-tags
```

Use no commit e na tag a versão que ficou no `package.json`.

## Atualização no cliente

O cliente executa `ATUALIZAR SISTEMA.cmd`. O processo:

1. Lê a versão instalada.
2. Para somente o servidor deste sistema.
3. Cria backup dos bancos locais.
4. Baixa a branch `main` ou aplica `atualizacao.zip`.
5. Instala dependências e compila a versão.
6. Inicia o servidor e valida `/api/health`.
7. Registra `versão anterior → versão nova` em `.runtime/update-history.log`.

Os bancos e configurações locais continuam fora da atualização.

## Futuro serviço do Windows

O serviço deverá executar `node dist/server.cjs` com a pasta do projeto como diretório de trabalho. O endpoint `/api/health` informa a versão ativa e pode ser usado pelo instalador ou pelo monitor do serviço.

