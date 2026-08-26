---
id: 0013
title: Disciplina
status: done
depends_on: [0012]
---

## Objetivo

O catálogo de disciplinas da unidade.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Discipline`
- `specs/0012-api-curso.md` — o padrão que este módulo repete
- O módulo de curso já implementado

## Escopo

**Entra:**

- CRUD de disciplina sob a unidade, no padrão da spec 0012
- Campos próprios: `workload`, `color`, `requiredLocationType`
- `GET /units/:unitId/disciplines/select`

**Não entra:**

- Vínculo com currículo (spec 0014)

## Decisões já tomadas

- **Mesmo padrão da spec 0012** em rotas, permissões, paginação, select e conflito de código.
- **`workload` é carga horária total**, em horas. Não confundir com `weeklyLessons`, que vive em `CurriculumDiscipline` porque varia por currículo.
- **`requiredLocationType` opcional**; `null` significa que qualquer local serve. Ele ainda não é validado contra nada — a validação entra com o motor de conflito.
- **`color` é livre**, usada pelo front no quadro; sem paleta fixa no backend.
- Disciplina em uso por currículo não pode ser excluída (409).

## Critérios de aceite

- [x] Código repetido na mesma unidade responde 409
- [x] `workload` aceita apenas inteiro positivo
- [x] `requiredLocationType` aceita `null` e os valores do enum
- [x] Excluir disciplina vinculada a currículo responde 409
- [x] TEACHER não cria nem altera

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

Executada em sequência (`/spec next 3`), na branch `feature/catalogo-academico`. Cópia direta do molde da 0012: mesmo trio de DTOs, mesma ordem de rotas, mesmo `findInUnit` privado, mesma forma de listagem. 30 unitários e 149 e2e passando; os cinco critérios têm teste.

- **commits:** `feat(api): módulo de disciplinas (spec 0013)`
- **desvios:**
  - **O `try/catch` de `P2002` virou `withUniqueConflict(message, operation)` em `src/common/unique-violation.ts`.** Esta era a terceira cópia do mesmo bloco de doze linhas (organizations, units, courses), e faltavam mais três módulos do catálogo. Os três serviços anteriores passaram a usar o helper. A 0012 recebeu nota datada, porque o "helper privado" que o Registro dela descreve mudou de endereço.
  - **`select` de disciplina devolve `color` além de `{ id, name, code }`.** O molde da 0012 diz "só o essencial"; aqui a cor é essencial, porque quem escolhe a disciplina no quadro pinta a célula com ela, e uma segunda consulta só para isso não se justifica. O critério continua sendo "o que a tela precisa para desenhar a opção", não uma lista fixa de três campos.
  - **`color` não é validada como cor.** A spec diz "livre, sem paleta fixa no backend" — o schema Zod garante só string curta e não vazia. Se o front passar `banana`, o banco aceita.
  - **O teste-rede da 0022 cresceu com as três mutações de disciplina.**
