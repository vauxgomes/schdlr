---
id: 0018
title: Projeto
status: todo
depends_on: [0014, 0016]
---

## Objetivo

A execução de um currículo num período letivo — o container onde o horário vai ser montado.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Project`, enum `ProjectStatus`, e as três FKs compostas que ele carrega
- `specs/0014-api-curriculo.md` e `specs/0016-api-periodo.md`

## Escopo

**Entra:**

- CRUD de projeto sob a unidade
- Criação amarrando `Term` + `Curriculum`, com `createdBy` preenchido pelo membro logado
- Transição de `status` entre `DRAFT` e `PUBLISHED`, em endpoint próprio
- Listagem filtrável por período e por currículo

**Não entra:**

- Ofertas, quadros e slots — é onde entram as regras de conflito, e isso ganha desenho próprio antes de virar spec
- Duplicar projeto de um período para o outro

## Decisões já tomadas

- **Um currículo é executado uma vez por período.** O unique `[termId, curriculumId]` está no schema de propósito; turnos diferentes se resolvem com boards de grades diferentes dentro do mesmo projeto, não com projetos paralelos. Conflito responde 409.
- **`status` nasce `DRAFT`** e muda por endpoint próprio, como em `Term`.
- **Criar projeto exige período editável.** Período `FINISHED` ou `CANCELLED` não aceita projeto novo — validar antes de qualquer escrita.
- **`createdById` é o `UnitMember` do usuário logado**, resolvido pelo guard; nunca vem do corpo.
- **`unitId` vem da rota** e é o mesmo usado nas três FKs compostas. Se o `Term` ou o `Curriculum` forem de outra unidade, o banco recusa — mas o service deve checar antes e responder 404 tratado, em vez de deixar vazar erro de constraint.
- Criar e alterar exige `assertCoordinatorOrOwnership`; ler, `assertMemberOrOwnership`.

## Critérios de aceite

- [ ] Criar projeto para o mesmo `(term, curriculum)` duas vezes responde 409
- [ ] Criar projeto em período `FINISHED` responde 409
- [ ] Passar `curriculumId` de outra unidade responde 404 tratado, não erro de banco
- [ ] `createdById` ignora o que vier no corpo e usa o membro logado
- [ ] Update genérico não altera `status`
- [ ] TEACHER lê mas não cria

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
