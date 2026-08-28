---
id: 0016
title: Período letivo
status: done
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

- [x] Criar com `endDate` anterior ao `startDate` responde 400
- [x] Nome repetido na unidade responde 409
- [x] Update genérico não consegue alterar `status`
- [x] Transição inválida (ex.: `FINISHED → PLANNING`) responde 409
- [x] Dois períodos com datas sobrepostas são aceitos
- [x] TEACHER não cria, altera nem muda status

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

Executada em sequência (`/spec next 2`), na branch `feature/catalogo-academico`. Molde da 0012 mais a transição de status em rota própria. 35 unitários e 210 e2e passando; os seis critérios têm teste.

- **commits:** `feat(api): módulo de períodos letivos (spec 0016)`
- **desvios:**
  - **A máquina de estado é uma função pura em `terms/utils/term-status.ts`**,
    com tabela de transições e teste unitário próprio. As regras de código
    mandam política para `utils/`, e assim a tabela é conferível de um lugar
    só, em vez de virar uma cadeia de `if` dentro do service.
  - **`CANCELLED` é terminal.** A spec lista as transições válidas e nenhuma
    sai de cancelado; segui a lista. Se reabrir um período cancelado for
    necessário, é decisão de produto e vira spec.
  - **`status` não é rejeitado no `PATCH` genérico: é ignorado.** O schema Zod
    não declara o campo e o Zod descarta o que não conhece — o efeito prático
    é o que o critério pede (o update não altera status), sem um 400 a mais.
    O teste fixa esse comportamento.
  - **A ordem das datas é revalidada no update.** O `refine` da criação vê o
    corpo inteiro; num `PATCH` parcial, quem garante a invariante é a
    comparação com o que já está gravado.
  - **O evento `TERM_STARTED` não é emitido.** A notificação está em "Não
    entra" e não há consumidor — quem seria notificado são os membros do
    projeto, que só existem a partir da 0018. O ponto de emissão, quando
    entrar, é `updateStatus`.
  - **A listagem não filtra por status.** Período não tem `isActive`, e filtro
    por fase não está no escopo. Só paginação, ordenada por `startDate`
    decrescente.
  - **Excluir período com projeto responde 409**, pela regra do bloco ("não se
    exclui o que está em uso"), ainda que não seja critério desta spec.
  - **O teste-rede da 0022 cresceu com as quatro mutações de período.**
