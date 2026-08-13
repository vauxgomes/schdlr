---
id: 0016
title: Período letivo
status: todo
depends_on: [0012]
---

## Objetivo

O calendário: os períodos letivos da unidade e em que fase cada um está.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Term`, enum `TermStatus`
- `specs/0012-api-curso.md` — o padrão

## Escopo

**Entra:**

- CRUD de período sob a unidade
- Transição de `status` como operação própria, não como campo qualquer do update
- `GET /units/:unitId/terms/select`

**Não entra:**

- Efeitos colaterais da transição em projetos e quadros — entra junto do bloco de scheduling
- Notificação `TERM_STARTED`, que depende do consumidor estar pronto

## Decisões já tomadas

- **`status` só muda por endpoint próprio** (`PATCH .../terms/:id/status`), nunca pelo update genérico. É uma transição de máquina de estado, com regras — não é editar um nome.
- **Transições válidas:** `PLANNING → ADJUSTMENTS → STARTED → FINISHED`, e `CANCELLED` a partir de qualquer uma que não seja `FINISHED`. Transição inválida responde 409.
- **`TERM_STARTED` é disparado por request**, quando alguém marca o período como iniciado. Não existe agendador no projeto e não é para criar um aqui.
- **`endDate` posterior a `startDate`**, validado no Zod.
- **Períodos podem se sobrepor no tempo** — é comum haver um período regular e um intensivo simultâneos. Não validar sobreposição.
- **Nome único por unidade** (`2026.1`).
- Mutação exige `assertManagement`.

## Critérios de aceite

- [ ] Criar com `endDate` anterior ao `startDate` responde 400
- [ ] Nome repetido na unidade responde 409
- [ ] Update genérico não consegue alterar `status`
- [ ] Transição inválida (ex.: `FINISHED → PLANNING`) responde 409
- [ ] Dois períodos com datas sobrepostas são aceitos
- [ ] TEACHER não cria, altera nem muda status

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
