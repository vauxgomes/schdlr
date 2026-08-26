---
id: 0014
title: Currículo e disciplinas do currículo
status: done
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

- [x] Criar currículo em curso de outra unidade responde 404/403, não erro de banco
- [x] Adicionar a mesma disciplina duas vezes ao currículo responde 409
- [x] Adicionar disciplina de outra unidade é rejeitado com erro tratado
- [x] `weeklyLessons` e `level` aceitam apenas inteiros positivos
- [x] A listagem devolve a grade agrupada por `level`, ordenada
- [x] Excluir currículo com projeto responde 409

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

Executada em sequência (`/spec next 3`), na branch `feature/catalogo-academico`. Um módulo (`modules/curricula/`) com dois controllers e dois services: o currículo e a grade têm ciclo de vida próprio, e um service com dez métodos esconderia isso. 30 unitários e 169 e2e passando; os seis critérios têm teste.

- **commits:** `feat(api): currículo e disciplinas do currículo (spec 0014)`
- **desvios:**
  - **A rota da grade é o aninhamento inteiro:**
    `/units/:unitId/courses/:courseId/curricula/:curriculumId/disciplines`. A
    spec fixou o currículo sob o curso "refletindo a FK composta" mas não disse
    onde ficam os itens; a mesma regra aplicada de novo dá isto. É longo, e a
    alternativa (`/units/:unitId/curricula/:curriculumId/disciplines`) teria
    dois endereços para o mesmo agregado — pior.
  - **Excluir currículo leva a grade junto, na mesma transação.** O item não
    tem vida fora do currículo. O 409 fica para o que é história de verdade:
    projeto vinculado, ou item já ofertado — os dois são conferidos antes.
  - **`disciplineId` não se altera no `PATCH` do item.** O unique
    `[curriculumId, disciplineId]` faz da disciplina a identidade da linha:
    trocar seria remover e adicionar, e é isso que o cliente deve fazer.
  - **A listagem de currículos é paginada e vem por nome decrescente**, para a
    matriz mais recente aparecer primeiro. Paginar veio do molde da 0012; a
    ordem é escolha desta spec.
  - **Não há `GET select` de currículo.** Não está no escopo. A 0018 vai
    precisar de um para escolher a matriz do projeto — entra lá.
  - **O teste-rede da 0022 cresceu com as seis mutações deste módulo.**
