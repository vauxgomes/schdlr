---
id: 0017
title: Grade de horários
status: todo
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

- [ ] Criar faixa sobreposta a outra da mesma grade responde 409
- [ ] Faixa idêntica em outra grade é aceita
- [ ] `endTime <= startTime` responde 400
- [ ] Valor fora de 0–1440 responde 400
- [ ] Faixas voltam ordenadas por `startTime`
- [ ] Nome de grade repetido na unidade responde 409

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
