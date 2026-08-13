---
id: 0015
title: Local
status: todo
depends_on: [0012]
---

## Objetivo

As salas, laboratórios e demais espaços onde uma aula pode acontecer.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Location`, enum `LocationType`
- `specs/0012-api-curso.md` — o padrão

## Escopo

**Entra:**

- CRUD de local sob a unidade, no padrão da spec 0012
- `type`, `capacity` opcional
- `GET /units/:unitId/locations/select`

**Não entra:**

- Alocação de local em horário — isso é `BoardSlot`, fora deste bloco
- Bloqueio de local por período (reforma, indisponibilidade)

## Decisões já tomadas

- **Mesmo padrão da spec 0012.**
- **Nome único por unidade** — "Sala 101" duas vezes na mesma unidade é sempre erro de digitação.
- **`capacity` é opcional** e hoje puramente informativo; nada valida turma contra capacidade.
- **Local usado em algum slot não pode ser excluído** (409). A FK no schema é `onDelete: Restrict`, então o banco já barra; o service traduz para mensagem clara.

## Critérios de aceite

- [ ] Nome repetido na mesma unidade responde 409
- [ ] `type` fora do enum responde 400
- [ ] `capacity` aceita ausente, e rejeita zero ou negativo
- [ ] TEACHER não cria nem altera
- [ ] Nenhum endpoint devolve local de outra unidade

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
