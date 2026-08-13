---
id: 0005
title: Recuperação de senha
status: todo
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

- [ ] `forgot-password` responde igual para e-mail existente e inexistente
- [ ] O token em claro não existe em nenhuma linha do banco
- [ ] Token expirado responde erro e não troca a senha
- [ ] Token já usado responde erro
- [ ] Depois do reset, refresh tokens anteriores não funcionam mais

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
