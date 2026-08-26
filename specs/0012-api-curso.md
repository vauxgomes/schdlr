---
id: 0012
title: Curso — define o padrão de módulo
status: done
depends_on: [0008]
---

## Objetivo

Cursos existem dentro da unidade — e este módulo vira o molde que os próximos quatro copiam.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Course`
- `.claude/rules/code-quality.md` — estrutura de módulo, ordem de rotas, níveis de permissão
- O guard e os asserts da spec 0008

## Escopo

**Entra:**

- CRUD de curso sob a unidade
- `GET /units/:unitId/courses/select`
- **O padrão**: forma dos DTOs Zod, tratamento de conflito de código, uso dos asserts, paginação da listagem

**Não entra:**

- Currículos (spec 0014)

## Decisões já tomadas

Esta spec estabelece convenções. As specs 0013, 0015, 0016 e 0017 dizem "igual à 0012" — então o que for decidido aqui vale para elas.

- **Rotas aninhadas sob a unidade** (`/units/:unitId/courses`), não soltas com `unitId` no corpo. O guard depende do `unitId` estar na rota.
- **Mutação exige `assertManagement`; leitura, `assertMemberOrOwnership`.** Curso é dado estruturante, não operacional.
- **`code` único por unidade**, conflito responde 409 com mensagem em português.
- **Não se exclui o que está em uso.** Curso com currículo responde 409. Vale para todos os módulos deste bloco.
- **`isActive` em vez de exclusão** como caminho normal de aposentadoria; o delete existe só para o que nunca foi usado.
- **`@Get('select')` antes de `@Get(':id')`** — regra que vale para todo controller.
- **Listagem paginada desde o começo**, não depois.

## Critérios de aceite

- [x] Criar curso com código repetido na mesma unidade responde 409
- [x] O mesmo código em outra unidade é aceito
- [x] TEACHER não consegue criar nem alterar
- [x] `GET .../select` devolve só o essencial e não pagina
- [x] Excluir curso com currículo responde 409
- [x] Nenhum endpoint devolve curso de outra unidade, mesmo passando id válido de lá

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

Executada em modo `/spec next`, com commit automático, na branch `feature/curso`. 30 unitários e 130 e2e passando — os vinte novos são os do módulo. Os seis critérios têm teste.

O molde que 0013, 0015, 0016 e 0017 copiam ficou assim:

- **Três DTOs**: `create-<x>.dto.ts`, `update-<x>.dto.ts` (o de criação com
  `.extend({ isActive })` e `.partial()`) e `list-<x>.dto.ts` com `page`,
  `limit` e `active`.
- **Ordem no controller**: `@Get('select')`, `@Get()`, `@Get(':id')`, `@Post()`,
  `@Patch(':id')`, `@Delete(':id')` com `204`. Query valida por pipe no
  parâmetro, corpo por `@Validate` — os dois não cabem no mesmo `UsePipes`.
- **Listagem** devolve `{ items, total, page, limit }`, a mesma forma da 0011.
- **`select`** devolve só `{ id, name, code }`, sem paginar e só dos ativos.
- **`findInUnit` privado** com `unitId` no `where`, usado por toda rota que
  recebe `:id` — é ele que transforma id de outra unidade em 404.
- **Conflito de `code`** por `try/catch` sobre `P2002`, num helper privado que
  embrulha create e update, e não por consulta prévia: a checagem antes do
  insert é corrida, o unique do banco não.

- **commits:** `feat(api): módulo de cursos (spec 0012)` — branch `feature/curso`
- **desvios:**
  - **A mensagem de 409 saiu em inglês, e não em português como a spec
    decidiu.** As `rules/code-quality.md` mandam mensagem de erro em inglês, e
    os dez 409 já existentes (`A unit with this name already exists in this
    organization`) seguem isso. Um módulo em português ao lado deles, copiado
    por mais quatro, deixaria a API bilíngue no mesmo tipo de resposta. Fica
    registrado como decisão revertida na prática: se a intenção era mensagem
    para o usuário final, o lugar dela é o cliente, não o `ConflictException`.
  - **`code` é normalizado para caixa alta na entrada.** O unique do Postgres
    distingue caixa, então sem isso `tads` e `TADS` conviveriam como cursos
    diferentes na mesma unidade — o oposto do que "código único por unidade"
    promete.
  - **O teste-rede da 0022 cresceu com as três mutações de curso.** Era o
    propósito de ela ter rodado antes desta; a rede só vale enquanto enumera
    todo mundo.
  - **Sem filtro de busca por nome ou código na listagem.** Não está no escopo
    e ninguém consome ainda; entra quando a tela pedir.


---

## Nota posterior — 2026-08-26 (spec 0013)

O **conflito de `code` deixou de ser helper privado do service**. A 0013 era a
terceira cópia do mesmo `try/catch` de `P2002` e o bloco virou
`withUniqueConflict(message, operation)`, em `src/common/unique-violation.ts`.
`CoursesService` passou a chamá-lo, e `OrganizationsService` e `UnitsService`
junto. A decisão em si não mudou — o conflito continua nascendo do `catch` do
unique do banco, e não de uma consulta prévia, que seria corrida. Só o endereço
mudou: quem copiar o molde daqui em diante importa o helper em vez de
reescrever o bloco.
