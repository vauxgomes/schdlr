---
id: 0007
title: Organização
status: todo
depends_on: [0003]
---

## Objetivo

Um usuário cria e administra suas organizações — o topo da hierarquia de tenant.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Organization` e a relação `owner`
- `.claude/rules/code-quality.md` — estrutura de módulo e endpoints

## Escopo

**Entra:**

- CRUD de organização
- `GET /organizations` lista só as do usuário logado
- `GET /organizations/select` com a forma mínima
- Slug gerado a partir do nome, com unicidade garantida

**Não entra:**

- Unidades (spec 0008)
- Transferência de titularidade
- Membros no nível da organização — a titularidade hoje é uma FK única, e virar `OrganizationMember` é decisão em aberto

## Decisões já tomadas

- **Quem cria vira `owner`.** É uma FK direta em `Organization`, não uma tabela de membros — o modelo de membership no nível da organização foi discutido e adiado.
- **Slug único global**, não por usuário, porque ele aparece na URL.
- **O owner é a única autoridade** sobre a organização nesta spec. Papéis de unidade não dão acesso a ela.
- **Excluir organização com unidades é bloqueado** (409), não cascateado.
- `@Get('select')` declarado **antes** de `@Get(':id')`, senão a rota é engolida.

## Critérios de aceite

- [ ] Criar organização define o usuário logado como owner
- [ ] A listagem não devolve organização de outro usuário
- [ ] Slug repetido responde 409
- [ ] Alterar organização de outro usuário responde 403
- [ ] Excluir organização com unidade responde 409

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
