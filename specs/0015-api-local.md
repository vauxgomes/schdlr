---
id: 0015
title: Local
status: done
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

- [x] Nome repetido na mesma unidade responde 409
- [x] `type` fora do enum responde 400
- [x] `capacity` aceita ausente, e rejeita zero ou negativo
- [x] TEACHER não cria nem altera
- [x] Nenhum endpoint devolve local de outra unidade

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

Executada em sequência (`/spec next 3`), na branch `feature/catalogo-academico`. Cópia direta do molde da 0012, trocando `code` único por `name` único. 30 unitários e 187 e2e passando; os cinco critérios têm teste.

- **commits:** `feat(api): módulo de locais (spec 0015)`
- **desvios:**
  - **`select` devolve `type` e `capacity` além de `{ id, name }`.** São os dois
    campos que a escolha do local usa: o tipo para casar com o
    `requiredLocationType` da disciplina, a capacidade para o humano decidir.
  - **`capacity` rejeita zero e negativo, e ausente continua sendo o jeito de
    dizer "não sei".** Zero é erro de digitação, não sala sem lugar.
  - **A conferência de uso é uma contagem em `BoardSlot` antes do delete**,
    ainda que a FK seja `onDelete: Restrict`. O banco já barraria, mas como
    erro de driver; a contagem troca isso por 409 com mensagem.
  - **Sem filtro por `type` na listagem.** Chegou a existir no rascunho e saiu:
    não está no escopo e ninguém consome. Entra quando a tela pedir.
  - **O teste-rede da 0022 cresceu com as três mutações de local.**
