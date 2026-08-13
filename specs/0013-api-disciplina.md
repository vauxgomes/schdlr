---
id: 0013
title: Disciplina
status: todo
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

- [ ] Código repetido na mesma unidade responde 409
- [ ] `workload` aceita apenas inteiro positivo
- [ ] `requiredLocationType` aceita `null` e os valores do enum
- [ ] Excluir disciplina vinculada a currículo responde 409
- [ ] TEACHER não cria nem altera

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
