---
id: 0011
title: Notificações
status: done
depends_on: [0003]
---

## Objetivo

O usuário vê o que aconteceu com ele dentro do sistema.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Notification`, enum `NotificationType`

## Escopo

**Entra:**

- Listar notificações do usuário logado, paginadas
- Contador de não lidas
- Marcar uma ou várias como lidas
- Serviço interno de criação, consumido por evento

**Não entra:**

- Push, WebSocket ou SSE — hoje o front busca
- `SUBSCRIPTION_EXPIRING` / `SUBSCRIPTION_EXPIRED`: não há o que os dispare ainda, ver decisão

## Decisões já tomadas

- **Criação por evento**, como o mail: o domínio emite, o módulo de notificação grava. Isso mantém os services de domínio sem saber que notificação existe.
- **`payload` é `Json` com forma tipada por tipo de notificação.** O tipo determina o formato; validar na criação, não na leitura.
- **Sem worker.** Já foi discutido: gravar a notificação é um `INSERT`, e extrair isso para fila custaria mais do que economiza. Fila só se justificaria com fan-out para vários canais.
- **`SUBSCRIPTION_EXPIRING`/`EXPIRED` ficam sem produtor por enquanto.** Vencimento não é ação de ninguém; quando for necessário, a saída mais barata é avaliar no login em vez de criar um scheduler.
- Notificação é sempre **do usuário**, nunca da unidade — a leitura é sempre escopada pelo `userId` do token.

## Critérios de aceite

- [x] A listagem nunca devolve notificação de outro usuário
- [x] O contador de não lidas bate com a listagem
- [x] Marcar como lida é idempotente
- [x] Marcar como lida notificação de outro usuário não tem efeito
- [x] Criar notificação com payload fora do formato do tipo é rejeitado

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

Executada em modo `/spec next`, com commit automático. 25 unitários e 92 e2e passando; os cinco critérios têm teste em `test/notifications.e2e-spec.ts`.

- **commits:** `docs(spec): a 0010 depende da 0011, não o contrário` e `feat(api): notificações (spec 0011)` — branch `feature/notificacoes`
- **achado antes de começar:** a **0010 declarava `depends_on: [0009, 0004]`**, mas o critério dela — "convidar e-mail com conta gera notificação" — precisa de quem grave a notificação, e esta spec reivindica esse trabalho. Corrigido para `[0009, 0004, 0011]`, e a 0011 passou à frente da 0010 na tabela. Mesmo erro que a 0004 tinha.
- **desvios:**
  - **`NotificationsService.create` é `async` embora a validação falhe antes de qualquer `await`.** Sem isso a exceção escapava de forma síncrona, e quem chamasse com `.catch()` em vez de `await` não a pegaria. Um teste cobre exatamente esse caminho.
  - **O listener absorve a falha e loga**, mesma fronteira do mail: erro ao gravar notificação não pode fazer o `PATCH .../status` responder erro, porque a desativação já aconteceu.
  - **`payload` é validado por tipo com um mapa de schemas Zod** (`notification-payloads.ts`), com `satisfies Record<NotificationType, ZodType>` — se um valor novo entrar no enum e ninguém declarar o formato, o TypeScript acusa.
  - **Os dois tipos de assinatura ganharam schema mesmo sem produtor.** A spec decidiu que ficam sem quem os dispare; declarar o formato agora custa três linhas e evita que o `satisfies` acuse falta.
  - **A listagem aceita `unreadOnly`**, que a spec não pediu. O contador e a lista precisavam concordar, e testar isso sem o filtro exigiria contar na mão no teste.
  - **`markRead` devolve `{ updated }`.** É o que torna a idempotência observável: a segunda chamada devolve zero em vez de repetir o efeito.
  - **O elo solto da 0009 foi fechado:** `unit-member.activated` e `unit-member.deactivated` agora têm ouvinte, e desativar um membro passa a notificá-lo de fato.
