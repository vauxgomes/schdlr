---
id: 0008
title: Unidade e camada de permissões
status: todo
depends_on: [0007]
---

## Objetivo

Unidades existem sob a organização, e nasce a camada de permissão que **todos** os módulos seguintes vão usar.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — models `Unit`, `UnitMember`, enum `MemberRole`; e o cabeçalho, que explica a invariante de tenant
- `.claude/rules/code-quality.md` — a seção de permissões

## Escopo

**Entra:**

- CRUD de unidade sob a organização
- `UnitMemberGuard`: resolve o `UnitMember` a partir do usuário do JWT e do `unitId` da rota, e injeta o contexto no request
- Os três asserts que o resto do projeto usa: `assertMemberOrOwnership`, `assertCoordinatorOrOwnership`, `assertManagement`
- `GET /units/select`

**Não entra:**

- Gestão de membros (spec 0009) — aqui só o guard que os lê
- Convites (spec 0010)

## Decisões já tomadas

Esta spec é a mais importante do bloco: ela define o contrato de permissão que as onze specs seguintes assumem pronto.

- **O owner da organização tem acesso total às unidades dela**, sem precisar de linha em `UnitMember`. É o `isOwner` do contexto.
- **Papéis são array em `UnitMember`.** Um membro pode ser COORDINATOR e TEACHER ao mesmo tempo.
- **Assert no topo de todo método de service, antes de qualquer consulta.** Não confiar apenas no guard: o guard cobre a rota, o assert cobre a regra.
- **Membro inativo não é membro.** `isActive: false` não passa em nenhum assert.
- **Slug único por organização**, não global — duas organizações podem ter a unidade `centro`.
- **Excluir unidade com membros ativos é bloqueado** (409).
- Níveis: leitura usa `assertMemberOrOwnership`; mutação operacional usa `assertCoordinatorOrOwnership`; gestão (períodos, cursos, unidade) usa `assertManagement`.

## Critérios de aceite

- [ ] Owner da organização acessa a unidade sem ser `UnitMember`
- [ ] Não-membro e não-owner recebe 403
- [ ] Membro com `isActive: false` recebe 403
- [ ] TEACHER lê, mas não altera nada que exija coordenação
- [ ] Slug repetido na mesma organização responde 409; em organização diferente, passa
- [ ] Excluir unidade com membro ativo responde 409

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
