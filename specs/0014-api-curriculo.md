---
id: 0014
title: Currículo e disciplinas do currículo
status: todo
depends_on: [0012, 0013]
---

## Objetivo

A grade: quais disciplinas um curso tem, em que período e com quantas aulas por semana.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — models `Curriculum` e `CurriculumDiscipline`, e as FKs compostas de tenant nos dois
- `specs/0012-api-curso.md` — o padrão

## Escopo

**Entra:**

- CRUD de currículo sob o curso
- CRUD dos itens da grade (`CurriculumDiscipline`): `level`, `weeklyLessons`, `isRequired`
- Listagem da grade agrupada por `level`

**Não entra:**

- Projetos (spec 0018)
- Cópia de currículo entre cursos ou versionamento de matriz

## Decisões já tomadas

- **`Curriculum` fica sob o curso** (`/units/:unitId/courses/:courseId/curricula`), refletindo a FK composta.
- **`weeklyLessons` é obrigatório.** Sem ele não dá para responder "o quadro está completo?" nem "faltam duas aulas". Foi acrescentado ao schema exatamente para isso.
- **Uma disciplina aparece uma vez por currículo** — o unique `[curriculumId, disciplineId]` já garante; o service traduz para 409.
- **`level` é inteiro a partir de 1**, sem limite superior fixo no backend.
- **Item com oferta vinculada não pode ser excluído** (409).
- **Ao criar item, o `unitId` vem da rota**, nunca do corpo — a FK composta rejeitaria de qualquer forma, mas errar aqui vira erro de banco feio em vez de 400 claro.

## Critérios de aceite

- [ ] Criar currículo em curso de outra unidade responde 404/403, não erro de banco
- [ ] Adicionar a mesma disciplina duas vezes ao currículo responde 409
- [ ] Adicionar disciplina de outra unidade é rejeitado com erro tratado
- [ ] `weeklyLessons` e `level` aceitam apenas inteiros positivos
- [ ] A listagem devolve a grade agrupada por `level`, ordenada
- [ ] Excluir currículo com projeto responde 409

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
