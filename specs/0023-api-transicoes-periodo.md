---
id: 0023
title: Transições do período letivo, revisadas
status: todo
depends_on: [0016]
---

## Objetivo

O período ganha caminho de volta: um período que já começou pode ser reaberto para ajuste e depois retomado — e é isso que torna possível travar mutação de projeto sem criar trabalho impossível de desfazer.

## Por que existe, e por que antes da 0018

A 0016 desenhou a vida do período como uma fila de mão única: `PLANNING → ADJUSTMENTS → STARTED → FINISHED`. Na prática, `ADJUSTMENTS` estava no lugar errado. Ele não é a fase antes de começar — quem está montando o período está em `PLANNING`. Ele é o período **reaberto**: já começou, e alguém precisa mexer.

Sem o caminho de volta, qualquer regra do tipo "só se mexe em `PLANNING` ou `ADJUSTMENTS`" vira bloqueio permanente assim que o período começa, porque não existe transição que saia de `STARTED` para trás. A 0018 depende dessa regra, então a tabela precisa mudar antes dela.

## Contexto necessário

- `apps/api/src/modules/terms/utils/term-status.ts` — a tabela de transições
- `apps/api/src/modules/terms/utils/term-status.spec.ts` — o teste que a fixa
- `apps/api/test/academic/terms.e2e-spec.ts` — o helper `walkTo` e os casos de transição
- `apps/api/test/platform/audit.e2e-spec.ts` — o teste-rede faz `PLANNING → ADJUSTMENTS`, que deixa de ser válido
- `specs/0016-api-periodo.md` — a spec que decidiu a tabela antiga

## Escopo

**Entra:**

- A tabela de transições nova, em `term-status.ts`
- Atualização do teste unitário e dos casos de e2e que a tabela invalida
- Nota posterior datada na 0016

**Não entra:**

- **A trava de mutação em si.** Ela mora na 0018 (`Project`) e nas specs de `Board`, `Offer` e `BoardSlot`, porque é lá que existe o que travar. Esta spec só entrega o estado do mundo que a torna viável
- Efeito colateral da reabertura sobre projetos já publicados — quem decide isso é a 0018
- Notificação de mudança de status

## Decisões já tomadas

### A tabela

```
PLANNING    → { STARTED, CANCELLED }
ADJUSTMENTS → { STARTED, CANCELLED }
STARTED     → { ADJUSTMENTS, CANCELLED, FINISHED }
FINISHED    → { }
CANCELLED   → { }
```

- **`PLANNING` vai direto para `STARTED`.** Montar o período é `PLANNING`; não há fase intermediária antes de começar.
- **`ADJUSTMENTS` só é alcançável a partir de `STARTED`.** É o período reaberto, não o período em preparação. Um período nunca nasce nem passa por ele antes de começar.
- **`STARTED → ADJUSTMENTS` é a porta de volta**, e é o ponto inteiro desta spec. Reabrir é ato explícito, com autor e horário na trilha de auditoria — quem mexeu num período em andamento fica registrado como tendo reaberto antes.
- **De `ADJUSTMENTS` não se encerra.** Para chegar a `FINISHED` é preciso voltar a `STARTED`: encerrar um período que está aberto para ajuste esconderia que ele nunca foi retomado.
- **De `ADJUSTMENTS` se cancela.** Descobrir durante o ajuste que o período não vai acontecer é caso real.
- **`FINISHED` e `CANCELLED` são o mesmo estado do ponto de vista de quem consulta**: período encerrado, nada mais muda. O que os separa é a decisão que levou até ali — terminou como previsto, ou foi interrompido. Nenhuma regra deve olhar um sem olhar o outro.
- **Transição inválida continua respondendo 409**, e o vocabulário de auditoria (`term.status-changed`) não muda.

### O que isso não decide

- Reabrir um período **não** desfaz nada sozinho: projetos, quadros e ofertas continuam como estavam. O que a reabertura faz é destravar a edição deles, e quem define essa trava é a 0018.

## Critérios de aceite

- [ ] `PLANNING → STARTED` é aceito
- [ ] `PLANNING → ADJUSTMENTS` responde 409
- [ ] `STARTED → ADJUSTMENTS → STARTED` é aceito, e pode repetir
- [ ] `ADJUSTMENTS → FINISHED` responde 409
- [ ] `ADJUSTMENTS → CANCELLED` é aceito
- [ ] `FINISHED` e `CANCELLED` não saem para lugar nenhum
- [ ] A reabertura aparece na trilha como `term.status-changed`, com `from` e `status`
- [ ] O teste unitário da tabela cobre os cinco estados de origem

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
