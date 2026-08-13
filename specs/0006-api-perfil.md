---
id: 0006
title: Perfil do usuário
status: todo
depends_on: [0003]
---

## Objetivo

Quem está logado vê e edita os próprios dados.

## Escopo

**Entra:**

- `GET /me` — dados do usuário logado, incluindo assinatura
- `PATCH /me` — altera nome
- `PATCH /me/password` — troca a senha exigindo a senha atual

**Não entra:**

- Troca de e-mail — exige fluxo de confirmação no endereço novo; vira spec própria se for necessário
- Desativar a própria conta

## Decisões já tomadas

- **Trocar a senha exige a senha atual**, mesmo com sessão válida. Sessão sequestrada não deve conseguir trocar a senha.
- **Trocar a senha revoga os outros refresh tokens**, preservando o da sessão que fez a troca.
- `GET /me` é a fonte que o front usa para montar o contexto do usuário — devolve o necessário para isso e nada de hash.

## Critérios de aceite

- [ ] `GET /me` sem token responde 401
- [ ] `GET /me` nunca inclui `passwordHash`
- [ ] Troca de senha com senha atual errada responde 400/401 e não altera nada
- [ ] Depois da troca, a sessão que trocou continua válida e as outras não

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
