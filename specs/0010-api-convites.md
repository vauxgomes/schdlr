---
id: 0010
title: Convites de unidade
status: todo
depends_on: [0009, 0004]
---

## Objetivo

Convidar alguém para uma unidade, por e-mail se ainda não tiver conta, por notificação se já tiver.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `UnitInvite`, enum `InviteStatus`
- O módulo de mail da spec 0004

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

- [ ] Convidar e-mail já membro ativo responde 409
- [ ] Convidar e-mail com conta gera notificação e não dispara e-mail de cadastro
- [ ] Convidar e-mail sem conta dispara e-mail
- [ ] Aceitar cria `UnitMember` com exatamente os papéis do convite
- [ ] Aceitar convite expirado responde erro e não cria membro
- [ ] Convite revogado não pode ser aceito
- [ ] Reconvite de ex-membro reativa a linha existente, sem duplicar

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
