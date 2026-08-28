---
id: 0017
title: Grade de horários
status: done
depends_on: [0012]
---

## Objetivo

As faixas de horário da unidade — na prática, um turno e suas aulas.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — models `Timetable` e `TimeSlot`
- `specs/0012-api-curso.md` — o padrão

## Escopo

**Entra:**

- CRUD de `Timetable` sob a unidade
- CRUD de `TimeSlot` aninhado na grade
- Validação de sobreposição entre faixas da mesma grade
- `GET /units/:unitId/timetables/select`, com os slots quando pedido

**Não entra:**

- Uso da grade por um board — spec de scheduling, fora deste bloco

## Decisões já tomadas

- **`Timetable` é o turno na prática** (Manhã, Tarde, Noite), mas o nome é livre; não existe enum de turno no schema e não é para criar um.
- **Horário em minutos desde a meia-noite**, inteiro. Sem tipo `Time`, sem fuso: é hora de parede.
- **Faixas da mesma grade não podem se sobrepor** — validado no service, comparando `[startTime, endTime)`. Grades diferentes podem se sobrepor livremente, é o caso normal de turnos que se tocam.
- **`endTime` maior que `startTime`**, ambos entre 0 e 1440.
- **Slot usado em algum quadro não pode ser excluído nem ter horário alterado** (409). Mudar o horário de uma faixa em uso remexeria quadros já montados sem que ninguém visse.
- Mutação exige `assertManagement`.

## Critérios de aceite

- [x] Criar faixa sobreposta a outra da mesma grade responde 409
- [x] Faixa idêntica em outra grade é aceita
- [x] `endTime <= startTime` responde 400
- [x] Valor fora de 0–1440 responde 400
- [x] Faixas voltam ordenadas por `startTime`
- [x] Nome de grade repetido na unidade responde 409

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

Executada em sequência (`/spec next 2`), na branch `feature/catalogo-academico`. Um módulo (`modules/timetables/`) com dois controllers e dois services, como o de currículo. 40 unitários e 236 e2e passando; os seis critérios têm teste.

- **commits:** `feat(api): grade de horários (spec 0017)`
- **desvios:**
  - **A rota da faixa é `/units/:unitId/timetables/:timetableId/time-slots`**,
    em kebab-case. É o primeiro recurso de duas palavras do projeto — os
    anteriores eram todos de uma só.
  - **`overlaps(a, b)` é função pura em `timetables/utils/overlap.ts`**, com
    teste unitário. O intervalo é meio-aberto `[start, end)`, então faixas que
    se tocam não conflitam — é o caso das aulas seguidas.
  - **A sobreposição é conferida contra todas as faixas da grade, ativas ou
    não.** Desativar uma faixa não libera o horário dela: a faixa continua no
    desenho da grade, e reativá-la depois traria o conflito de volta calado.
  - **Renomear ou desativar uma faixa em uso continua permitido**; só o horário
    é que congela. A spec diz "não pode ser excluído nem ter horário alterado",
    e é literalmente isso — o nome não move aula nenhuma.
  - **Excluir grade leva as faixas junto, na mesma transação**, como o
    currículo leva a sua. O que barra é uso: turma montada sobre a grade, ou
    faixa já ocupada num quadro — dois 409 distintos, para a mensagem dizer
    qual dos dois aconteceu.
  - **`1440` é aceito como `endTime`** (fim do dia) e como `startTime` só na
    forma que o `refine` deixaria passar — na prática, nenhuma, porque não há
    `endTime` maior.
  - **`withSlots=true` no `select` traz só as faixas ativas**, ordenadas por
    `startTime`.
  - **O teste-rede da 0022 cresceu com as seis mutações deste módulo.**
