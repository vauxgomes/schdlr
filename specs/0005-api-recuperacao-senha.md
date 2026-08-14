---
id: 0005
title: Recuperação de senha
status: done
depends_on: [0003, 0004]
---

## Objetivo

Quem esqueceu a senha consegue definir outra por link enviado no e-mail.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `PasswordReset`
- O módulo de mail da spec 0004

## Escopo

**Entra:**

- `POST /auth/forgot-password` — gera token, envia e-mail
- `POST /auth/reset-password` — valida token e troca a senha
- Template do e-mail de recuperação

**Não entra:**

- Troca de senha por quem está logado (spec 0006)

## Decisões já tomadas

- **Resposta constante.** `forgot-password` devolve sempre a mesma coisa, exista ou não o e-mail. Caso contrário o endpoint vira um enumerador de usuários — e num SaaS B2B saber quem usa o produto tem valor para concorrente.
- **Token guardado como SHA-256**, como o refresh token. O que vai no e-mail é o valor em claro, que não fica no banco.
- **Uso único** via `usedAt`, mais expiração curta.
- **Trocar a senha revoga todos os refresh tokens do usuário.** Se a recuperação foi feita porque a conta estava comprometida, deixar as sessões antigas vivas anula o efeito.

## Critérios de aceite

- [x] `forgot-password` responde igual para e-mail existente e inexistente
- [x] O token em claro não existe em nenhuma linha do banco
- [x] Token expirado responde erro e não troca a senha
- [x] Token já usado responde erro
- [x] Depois do reset, refresh tokens anteriores não funcionam mais

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

25 testes unitários e 35 e2e passando; os cinco critérios têm teste em `test/password-reset.e2e-spec.ts`. O teste extrai o token do próprio corpo do e-mail, como faria quem recebeu a mensagem, e confere que o que está no banco é o SHA-256 desse valor.

- **commits:** `feat(api): recuperação de senha (spec 0005)` — branch `feature/recuperacao-senha`
- **desvios:**
  - **Variável nova `WEB_APP_URL`** (default `http://localhost:3000`), para montar o link do e-mail. Não reusei `CORS_ORIGIN`: ela responde outra pergunta — quem pode chamar a API — e um dia pode virar lista.
  - **`PASSWORD_RESET_TTL_MINUTES`**, default 30. A spec pedia "expiração curta" sem fixar o número.
  - **Token inválido, expirado ou usado respondem 400**, todos com a mesma mensagem. 401 seria sobre identidade; aqui o problema é o payload.
  - **Métodos entraram no `AuthService`**, não num service próprio. As rotas são `/auth/*`, o `hashToken` é o mesmo do refresh token e não há estado novo — um service separado seria fronteira sem conteúdo.
  - **Reset de usuário inativo é recusado**, mesmo com token válido, pela mesma razão que o login o recusa.
  - **Pedidos anteriores não são invalidados** ao gerar um novo token. Cada um é de uso único e expira em 30 minutos; anular os antigos seria comportamento a mais que a spec não pediu.
  - **Não fiz teste de fumaça na app real**, ao contrário das specs anteriores: o fluxo depende de ler o token do corpo do e-mail, e sem SMTP configurado o modo de log não imprime o HTML. Os e2e cobrem o mesmo caminho contra o mesmo Postgres.
- **em aberto:** `forgot-password` é um endpoint público que dispara e-mail e escreve no banco a cada chamada — candidato natural a rate limiting, que a 0002 deixou fora de escopo de propósito.
