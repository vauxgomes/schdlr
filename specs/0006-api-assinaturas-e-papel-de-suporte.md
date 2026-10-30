---
id: 0006
title: Assinaturas e papel de suporte
status: done
depends_on: [0002, 0004, 0005]
---

# 0006 — Assinaturas e papel de suporte

## Objetivo

O suporte passa a atribuir, consultar e renovar o plano de um usuário, e o master passa a
promover usuários a suporte. A API ganha a primeira checagem de permissão além do "estar
logado": um decorator por papel do sistema (`systemRole`). E fica pronto o que as specs de
organização e unidade vão consumir: o plano vigente de um usuário, os limites de cada plano e a
regra de que plano vencido é só leitura.

⚠️ **Esta spec estabelece contrato** (o decorator de papel do sistema, a tabela de limites por
plano, o `getActivePlan` e a regra de plano vencido). Deve ser executada sozinha, com
`/spec 0006`.

## Por que existe

Quem se cadastra nasce sem assinatura, e usuário sem assinatura não cria organização (spec
0002). Sem um jeito de atribuir plano, só o `admin@` da seed consegue usar o produto. E os
limites de organização, unidade e curso dependem de saber qual plano vale para o usuário e se
ele ainda está em vigor.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `Subscription` (uma linha por usuário,
  `assignedById`), enums `PlanType` e `SystemRole`, "Master implica suporte", "Um único master",
  "Assinatura é uma linha por usuário" e "Limites de plano… moram em constante no código"
- `specs/0004-api-auth-por-otp.md` — `JwtAuthGuard` global, `@CurrentUser()` com `{ sub }`, a
  `JwtStrategy` que não consulta o banco, o formato `AuthUser`/`toAuthUser` e o `pnpm otp`
- `specs/0005-api-seed-master-e-tenant-de-teste.md` — o master e os usuários do tenant de
  teste, usados na verificação
- `apps/api/src/modules/auth/` — decorators, guards, `auth-user.ts`
- `apps/api/src/app.module.ts` — onde o `JwtAuthGuard` é registrado como `APP_GUARD`

## Escopo

**Entra:**

- Rotas de suporte, todas exigindo `SUPPORT` (ou `MASTER`):

  | rota                                            | o que faz                        |
  | ----------------------------------------------- | -------------------------------- |
  | `GET /api/support/subscriptions/:email`         | consulta a assinatura do usuário |
  | `PUT /api/support/subscriptions/:email`         | atribui ou troca o plano         |
  | `POST /api/support/subscriptions/:email/extend` | estende a validade em 1 mês      |

- Rota do master, exigindo `MASTER`:

  | rota                                        | o que faz                                    |
  | ------------------------------------------- | -------------------------------------------- |
  | `PUT /api/support/users/:email/system-role` | define `systemRole` como `USER` ou `SUPPORT` |

- `@RequireSystemRole(role)` e `SystemRoleGuard` em `src/modules/auth/`, com o guard registrado
  como `APP_GUARD` depois do `JwtAuthGuard`
- Módulo `src/modules/subscriptions/`: `plans.ts` (planos e limites), `SubscriptionsService`
  (com `getActivePlan`), controller e schemas Zod
- `PlanExpiredException` em `src/modules/subscriptions/`, para as specs seguintes lançarem

## Não entra

- `GET` da própria assinatura. Vai junto com o perfil do usuário (`/me` ou `/profile`), em spec
  própria
- **Aplicar os limites e o "somente leitura"**: contar organizações, unidades e cursos e barrar
  escrita com plano vencido. Esta spec entrega os números, o `getActivePlan` e a exceção; quem
  aplica são as specs de organização, unidade e curso
- Atribuir `BASIC` ou `PRO`: eles existem no código, mas não no enum `PlanType` do banco (ver
  "Planos")
- Mudança de schema ou migration
- Remover a assinatura de um usuário, histórico de assinaturas, pagamento
- Listar ou buscar usuários e assinaturas
- Promover a `MASTER`, rebaixar o `MASTER`, ou o master mudar o próprio papel
- E-mail avisando o usuário de plano atribuído ou perto de vencer
- Usuário de suporte na seed. O master já atende as rotas de suporte, e quem precisar de um
  suporte separado o cria pelo `PUT …/system-role`

## Decisões já tomadas

### Planos

- **Os quatro planos vivem em `plans.ts`**, mesmo que só `GRACE` e `TRIAL` existam no enum
  `PlanType` do banco. `BASIC` e `PRO` ficam registrados para não se perder a definição; entram no
  enum (com migration) na spec que os liberar:

  ```ts
  export type Plan = PlanType | 'BASIC' | 'PRO'

  export type PlanLimits = {
    organizations: number | null // null = ilimitado
    unitsPerOrganization: number | null
    coursesPerUnit: number | null
  }

  export const PLANS: Record<Plan, { limits: PlanLimits; durationMonths: number | null }> = {
    GRACE: {
      limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 5 },
      durationMonths: null,
    },
    TRIAL: {
      limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 3 },
      durationMonths: 1,
    },
    // v2: ainda não estão no enum PlanType; não podem ser atribuídos.
    BASIC: {
      limits: { organizations: 1, unitsPerOrganization: 5, coursesPerUnit: 5 },
      durationMonths: 1,
    },
    PRO: {
      limits: { organizations: null, unitsPerOrganization: null, coursesPerUnit: null },
      durationMonths: 1,
    },
  }
  ```

- **`durationMonths: null` é "não vence"**: `GRACE` tem `expiresAt` nulo, sempre
- **Curso é contado por unidade.** No `TRIAL` e no `GRACE` há uma unidade só, então o limite por
  unidade é o total
- **O limite conta os registros desativados.** Organizações, unidades e cursos com
  `isActive = false` ocupam vaga como os ativos: desativar não libera espaço no plano. As specs de
  organização, unidade e curso contam sem filtro de `isActive`, como o `organizationsOwned` do
  perfil (0007)
- **"1 mês" é mês de calendário**: mesmo dia no mês seguinte, às mesmas horas; se o dia não
  existe (31 de janeiro), vai para o último dia do mês (28 ou 29 de fevereiro). Uma função
  `addMonths` própria em `plans.ts`, sem biblioteca de datas

### Plano vigente

- **`getActivePlan(userId)`** é o que as próximas specs chamam:

  ```ts
  type ActivePlan = {
    plan: PlanType
    status: 'ACTIVE' | 'EXPIRED'
    expiresAt: Date | null
    limits: PlanLimits
  }

  getActivePlan(userId: string): Promise<ActivePlan | null> // null = sem assinatura
  ```

- **`EXPIRED` quando `expiresAt <= agora`.** O status é calculado na leitura; nada é gravado
  quando o plano vence
- **Plano vencido é só leitura.** As specs seguintes aplicam assim, e esta spec só fixa a regra:
  - escrita em qualquer dado de uma organização exige o plano **do dono** em `ACTIVE`; vencido →
    `PlanExpiredException`, que responde `403`
    `{ statusCode: 403, message: "Plan expired" }`
  - leitura continua liberada
  - sem assinatura, o usuário não cria organização (`403` `{ statusCode: 403, message:
"Subscription required" }`, também a cargo da spec de organização)

### Rotas de suporte

- **O usuário é identificado pelo e-mail no caminho**, normalizado (`trim` e minúsculas) como no
  resto da API. E-mail sem usuário: `404` `{ statusCode: 404, message: "User not found" }`
- **Formato da assinatura** nas três rotas:

  ```json
  {
    "email": "teacher@schdlr.dev",
    "plan": "TRIAL",
    "status": "ACTIVE",
    "startsAt": "2026-10-30T10:00:00.000Z",
    "expiresAt": "2026-11-30T10:00:00.000Z",
    "limits": { "organizations": 1, "unitsPerOrganization": 1, "coursesPerUnit": 3 },
    "assignedBy": "vaux.gomes@ifce.edu.br"
  }
  ```

- **`GET`** devolve a assinatura; usuário sem assinatura dá `404`
  `{ statusCode: 404, message: "Subscription not found" }`
- **`PUT` recebe `{ plan, expiresAt? }`** e cria ou substitui a linha do usuário (é uma só), com
  `startsAt` = agora e `assignedById` = quem chamou:
  - `plan` aceita só os valores do enum `PlanType` (`GRACE`, `TRIAL`); `BASIC` e `PRO` dão o
    `400` da validação
  - `GRACE`: `expiresAt` tem de vir ausente; informado, dá `400`. Grava `expiresAt` nulo
  - `TRIAL`: `expiresAt` ausente → agora + 1 mês; informado → tem de ser no futuro, senão `400`
  - responde `200` com a assinatura
- **`POST …/extend`** soma 1 mês à validade e responde `200` com a assinatura:
  - parte de `expiresAt` se ainda está no futuro; se já venceu, parte de agora
  - plano sem vencimento (`GRACE`) dá `409` `{ statusCode: 409, message: "Plan does not expire" }`
  - sem assinatura dá o `404` do `GET`
  - atualiza `assignedById` para quem estendeu; `startsAt` não muda
- O suporte pode atribuir plano a qualquer usuário, inclusive a outro suporte ou ao master

### Papel do sistema

- **`@RequireSystemRole('SUPPORT' | 'MASTER')` exige um papel mínimo.** A ordem é
  `USER < SUPPORT < MASTER`: `@RequireSystemRole('SUPPORT')` aceita `SUPPORT` e `MASTER`, como a
  0002 decidiu ("master implica suporte"). Vale em método ou em classe
- **O `SystemRoleGuard` consulta o banco.** A `JwtStrategy` continua devolvendo só `{ sub }`
  (0001), e o papel pode mudar enquanto o access token vale. Rota sem o decorator: o guard não
  consulta nada
- **Usuário inexistente, inativo ou com papel abaixo do exigido: `403`** com o corpo padrão do
  Nest. Sem token, quem responde `401` antes é o `JwtAuthGuard`
- **Os dois guards são globais**, registrados nesta ordem no `AppModule`: `JwtAuthGuard`, depois
  `SystemRoleGuard`
- **`PUT …/system-role` recebe `{ systemRole }`**, que aceita `USER` ou `SUPPORT` (`MASTER` dá o
  `400` da validação). Alvo que é `MASTER`: `409` `{ statusCode: 409, message: "Cannot change
the master" }`. Responde `200` com o formato `AuthUser` da 0004

## Critérios de aceite

- [x] `plans.ts` tem os quatro planos com os limites e durações da seção "Planos"
- [x] `addMonths` cobre o fim de mês (31/01 → 28 ou 29/02) e a virada de ano
- [x] `getActivePlan` devolve `null` sem assinatura, `ACTIVE` dentro da validade, `EXPIRED`
      depois dela, e `GRACE` sempre `ACTIVE`
- [x] `PlanExpiredException` responde `403` com `"Plan expired"`
- [x] `@RequireSystemRole('SUPPORT')` aceita `SUPPORT` e `MASTER` e recusa `USER` com `403`;
      `@RequireSystemRole('MASTER')` recusa `SUPPORT`; usuário inativo dá `403`
- [x] Rota sem o decorator não consulta o banco no `SystemRoleGuard`
- [x] `PUT` cria a assinatura na primeira vez e substitui depois, com `startsAt` e `assignedBy`
      atualizados
- [x] `PUT` `TRIAL` sem `expiresAt` vence em 1 mês; com `expiresAt` no passado dá `400`; `GRACE`
      com `expiresAt` dá `400`; `BASIC`/`PRO` dão `400`
- [x] `extend` soma 1 mês a partir da validade ou de agora, se vencido; `GRACE` dá `409`
- [x] `GET`/`PUT`/`extend` com e-mail sem usuário dão `404`; `GET` e `extend` sem assinatura dão
      `404`
- [x] `system-role` promove a `SUPPORT` e rebaixa a `USER`; `MASTER` no corpo dá `400`; alvo
      `MASTER` dá `409`; chamado por `SUPPORT` dá `403`
- [x] Testes unitários de `plans.ts`, `SubscriptionsService` e `SystemRoleGuard`; e2e das rotas
      com os services substituídos
- [x] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam

## Verificação

```bash
docker compose up -d db
pnpm install --frozen-lockfile

mv apps/api/.env apps/api/.env.bak 2>/dev/null
pnpm test:api
pnpm build:api
mv apps/api/.env.bak apps/api/.env 2>/dev/null

pnpm --filter @schdlr/api lint
pnpm format && git status --porcelain                         # nada

# contra o banco de dev
pnpm dev:api &
sleep 8
API=localhost:3001/api
J='content-type: application/json'
login() {  # imprime o accessToken de $1
  code=$(pnpm -s otp "$1" | cut -d' ' -f1)
  curl -s -X POST $API/auth/sign-in -H "$J" -d "{\"email\":\"$1\",\"code\":\"$code\"}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'
}
MST=$(login "$(grep ^ROOT_EMAIL apps/api/.env | cut -d= -f2)")
USR=$(login teacher@schdlr.dev)
S=$API/support/subscriptions
R=$API/support/users

# assinaturas, com o master no papel de suporte
curl -s -H "Authorization: Bearer $USR" $S/teacher@schdlr.dev -w ' %{http_code}\n'        # 403
curl -s -H "Authorization: Bearer $MST" $S/teacher@schdlr.dev -w ' %{http_code}\n'        # 404 sem assinatura
curl -s -X PUT -H "Authorization: Bearer $MST" -H "$J" $S/teacher@schdlr.dev \
  -d '{"plan":"TRIAL"}' -w ' %{http_code}\n'                                              # 200, vence em 1 mês
curl -s -X POST -H "Authorization: Bearer $MST" $S/teacher@schdlr.dev/extend -w ' %{http_code}\n'  # 200, +1 mês
curl -s -X PUT -H "Authorization: Bearer $MST" -H "$J" $S/teacher@schdlr.dev \
  -d '{"plan":"PRO"}' -w ' %{http_code}\n'                                                # 400
curl -s -X POST -H "Authorization: Bearer $MST" $S/admin@schdlr.dev/extend -w ' %{http_code}\n'    # 409 GRACE

# papel: o master promove o manager@ a suporte
curl -s -X PUT -H "Authorization: Bearer $MST" -H "$J" $R/manager@schdlr.dev/system-role \
  -d '{"systemRole":"SUPPORT"}' -w ' %{http_code}\n'                                      # 200
SUP=$(login manager@schdlr.dev)
curl -s -H "Authorization: Bearer $SUP" $S/teacher@schdlr.dev -w ' %{http_code}\n'        # 200 (suporte lê)
curl -s -X PUT -H "Authorization: Bearer $SUP" -H "$J" $R/teacher@schdlr.dev/system-role \
  -d '{"systemRole":"SUPPORT"}' -w ' %{http_code}\n'                                      # 403 (só o master)
curl -s -X PUT -H "Authorization: Bearer $MST" -H "$J" $R/manager@schdlr.dev/system-role \
  -d '{"systemRole":"USER"}' -w ' %{http_code}\n'                                         # 200
curl -s -H "Authorization: Bearer $SUP" $S/teacher@schdlr.dev -w ' %{http_code}\n'        # 403 (papel lido do banco)
kill %1
```

Ao final, devolver o tenant ao estado da seed: apagar a assinatura do `teacher@` criada no teste
e conferir que o `manager@` voltou a `USER`.

## Registro

**2026-10-30** — executada com pedido do usuário para construir a 0006 e a 0007, na branch
`development`.

Commits: `feat(api): assinaturas e papel de suporte (spec 0006)`.

Verificação: `pnpm install --frozen-lockfile` ok; sem `.env`, `pnpm test:api` passa (92
unitários, 23 e2e) e `pnpm build:api` também; lint limpo; `pnpm format` estável. Contra o banco de
dev, com o master no papel de suporte: `teacher@` (`USER`) consultando → `403`; `GET` sem
assinatura → `404 "Subscription not found"`; `PUT TRIAL` → `200`, validade em 30/11 (1 mês);
`extend` → `200`, validade em 30/12; `PUT PRO` → `400` em `plan`; `TRIAL` com data no passado →
`400`; `extend` do `admin@` (`GRACE`) → `409`; e-mail inexistente → `404 "User not found"`. O
master promoveu o `manager@` a `SUPPORT` (`200`); com ele: consulta → `200`, `system-role` → `403`.
Mudar o papel do master → `409`. Rebaixado o `manager@`, o token dele ainda válido passou a dar
`403`, porque o papel é lido do banco. No fim, a assinatura do `teacher@` foi apagada, o `manager@`
voltou a `USER`, e os códigos OTP e refresh tokens criados pelos logins do teste foram apagados.

Desvios:

- **A rota `system-role` mora num módulo `users`** (`src/modules/users/`), não em
  `subscriptions`. A spec não dizia onde; mudar papel não é assunto de assinatura.
- **`emailSchema` passou a ser exportado** de `auth/schemas/auth.schemas.ts` e é usado para
  validar e normalizar o `:email` dos caminhos. E-mail inválido no caminho dá o `400` da 0001.
- **As regras de `expiresAt`** (`GRACE` não aceita data; `TRIAL` exige data futura) ficaram no
  schema Zod, então o erro sai no formato `400` da 0001, com `path: "expiresAt"`.
- **O `403` do `SystemRoleGuard` é o padrão do Nest**:
  `{ message: "Forbidden resource", error: "Forbidden", statusCode: 403 }`.
- **`addMonths` trabalha em UTC**, para o resultado não depender do fuso do servidor.
- **`RequireSystemRole` aceita só `'SUPPORT'` ou `'MASTER'`** no tipo: exigir `USER` seria o
  mesmo que estar logado.
- Testes além dos pedidos: o schema de atribuição e o `UsersService`.
