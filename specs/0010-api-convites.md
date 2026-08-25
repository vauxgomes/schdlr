---
id: 0010
title: Convites de unidade
status: done
depends_on: [0009, 0004, 0011]
---

## Objetivo

Convidar alguém para uma unidade, por e-mail se ainda não tiver conta, por notificação se já tiver.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `UnitInvite`, enum `InviteStatus`
- O módulo de mail da spec 0004
- O serviço de criação de notificação da spec 0011 — é ele que grava; esta spec só emite o evento

## Escopo

**Entra:**

- Criar convite com papéis definidos
- Listar convites da unidade, filtrando por status
- Revogar e reenviar
- Aceitar e recusar, pelo convidado
- Aceitar cria o `UnitMember` com os papéis do convite

**Não entra:**

- Convite no nível da organização
- Convite em lote / importação

## Decisões já tomadas

- **Estado em `status`, não em datas nulas.** O schema foi reescrito para `InviteStatus` + `resolvedAt`/`resolvedById` justamente para não precisar testar três colunas para saber se um convite está pendente. Expirado é `PENDING` com `expiresAt` no passado — não é um status próprio.
- **Dois caminhos de entrega:** e-mail já cadastrado recebe notificação in-app; e-mail sem conta recebe e-mail com link de cadastro.
- **Convidar quem já é membro ativo responde 409.** Membro inativo pode ser reconvidado, e aceitar reativa a linha existente em vez de criar outra.
- **O token é opaco e único**, e o convite tem expiração.
- **Só quem convidou ou tem `assertManagement` revoga.**
- Aceitar/recusar é do convidado — a autorização é o token ou o próprio `userId`, não papel na unidade (ele ainda não tem nenhum).

## Critérios de aceite

- [x] Convidar e-mail já membro ativo responde 409
- [x] Convidar e-mail com conta gera notificação e não dispara e-mail de cadastro
- [x] Convidar e-mail sem conta dispara e-mail
- [x] Aceitar cria `UnitMember` com exatamente os papéis do convite
- [x] Aceitar convite expirado responde erro e não cria membro
- [x] Convite revogado não pode ser aceito
- [x] Reconvite de ex-membro reativa a linha existente, sem duplicar

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

Executada em modo `/spec next`, com commit automático. 25 unitários e 105 e2e passando; os sete critérios têm teste em `test/invites.e2e-spec.ts`.

- **commits:** `feat(api): convites de unidade (spec 0010)` — branch `feature/convites`
- **desvios:**
  - **Um evento, dois ouvintes, cada um decidindo se é com ele.** `unit-invite.created` carrega `userId` nulo quando o e-mail não tem conta; o ouvinte de mail sai fora se houver `userId`, o de notificação sai fora se não houver. Quem emite não escolhe canal — é o que a convergência de nomes da 0009 comprou.
  - **A notificação de convite carrega `token`, não `inviteId`.** É com o token que se aceita, e a notificação só é legível pelo próprio convidado. Isso alterou o payload declarado na 0011, que ganhou nota posterior.
  - **Aceitar e recusar ficam fora de `/units/:unitId`**, em `/invites/:token`. O convidado ainda não é membro: sob a unidade, o guard resolveria um contexto vazio e a rota mentiria sobre o que exige.
  - **Autorização de aceite é token + identidade.** Além do token válido, exige que o convite tenha sido endereçado àquele `userId` ou àquele e-mail. Só o token bastaria pela letra da decisão, mas aí qualquer um com o link entraria na unidade.
  - **O e-mail do usuário vem do banco**, não do JWT: a 0003 fixou que o payload leva só `sub` e `staffRole`, e há teste travando isso. Custa uma consulta por aceite.
  - **Reenviar rotaciona o token** e estende a validade, aposentando o link anterior. A spec pedia "reenviar" sem dizer o que acontece com o token antigo; mantê-lo válido deixaria dois links vivos.
  - **Revogar convite já resolvido responde 409**, não 404: ele existe, o estado é que não permite.
  - **`UNIT_INVITE_TTL_DAYS`**, default 7. A spec dizia "o convite tem expiração" sem fixar prazo.
  - **`.env` e `.env.test` estavam sem `PASSWORD_RESET_TTL_MINUTES`**, que só existia no `.env.example` desde a 0005. Alinhados de passagem; ambos têm default, então nada estava quebrado.
