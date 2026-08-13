---
id: 0011
title: Notificações
status: todo
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

- [ ] A listagem nunca devolve notificação de outro usuário
- [ ] O contador de não lidas bate com a listagem
- [ ] Marcar como lida é idempotente
- [ ] Marcar como lida notificação de outro usuário não tem efeito
- [ ] Criar notificação com payload fora do formato do tipo é rejeitado

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
