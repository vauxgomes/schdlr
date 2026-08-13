---
id: 0012
title: Curso — define o padrão de módulo
status: todo
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

- [ ] Criar curso com código repetido na mesma unidade responde 409
- [ ] O mesmo código em outra unidade é aceito
- [ ] TEACHER não consegue criar nem alterar
- [ ] `GET .../select` devolve só o essencial e não pagina
- [ ] Excluir curso com currículo responde 409
- [ ] Nenhum endpoint devolve curso de outra unidade, mesmo passando id válido de lá

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
