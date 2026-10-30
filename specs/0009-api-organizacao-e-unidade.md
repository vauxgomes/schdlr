---
id: 0009
title: Organização e unidade
status: done
depends_on: [0002, 0004, 0005, 0006, 0008]
---

# 0009 — Organização e unidade

## Objetivo

O dono passa a criar, listar, editar e desativar as próprias organizações e as unidades delas,
dentro dos limites do plano. Membros de unidade passam a enxergar as organizações e unidades de
que fazem parte. E fica pronto o que todas as specs de dado de unidade vão usar: resolver
`/:orgSlug/units/:unitSlug` para o usuário logado, saber o papel dele ali e barrar escrita em
organização desativada ou com o plano do dono vencido.

⚠️ **Esta spec estabelece contrato** (o prefixo das rotas por slug, o `TenantAccessService`, o
`404` para quem não enxerga e o `403 "Not allowed"` para quem enxerga mas não pode). Deve ser
executada sozinha, com `/spec 0009`.

## Por que existe

Hoje só existe a organização da seed, e nada na API a lê. Membros e convites (0010), catálogo,
locais, semestres e projetos moram todos dentro de uma unidade, e cada um precisaria repetir
"quem é este usuário nesta unidade" e "esta organização aceita escrita". A 0006 deixou os
limites, o `getActivePlan` e a `PlanExpiredException` para quem cria organização e unidade
aplicar: é aqui.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `Organization`, `Unit`, `UnitMember`, a tabela de
  papéis ("onde mora"), slug global da organização e por organização da unidade, a regra do
  formato de slug e "o que tem `isActive` não se apaga"
- `specs/0006-api-assinaturas-e-papel-de-suporte.md` — `getActivePlan`, `PLANS`, "o limite
  conta os registros desativados", "plano vencido é só leitura" e `PlanExpiredException`
- `specs/0004-api-auth-por-otp.md` — `@CurrentUser()` com `{ sub }`, padrão dos erros de regra
- `specs/0005-api-seed-master-e-tenant-de-teste.md` — o tenant de teste, um papel por usuário,
  e o `admin@` (dono) que não é membro da unidade
- `specs/0008-api-codigos-de-erro.md` — corpo de erro com `code`, `AppException` e o catálogo
- `apps/api/src/modules/subscriptions/` e `apps/api/src/modules/profile/` — padrão de módulo,
  controller e schema Zod

## Escopo

**Entra:**

- Módulo `src/modules/organizations/` com dois controllers (organizações e unidades), services,
  schemas Zod e o `TenantAccessService`, exportado
- Rotas, todas exigindo token:

  | rota                                                | o que faz                                 |
  | --------------------------------------------------- | ----------------------------------------- |
  | `POST /api/organizations`                           | cria organização, com o usuário como dono |
  | `GET /api/organizations`                            | lista as organizações que o usuário vê    |
  | `GET /api/organizations/:orgSlug`                   | uma organização                           |
  | `PATCH /api/organizations/:orgSlug`                 | edita nome e endereço, desativa e reativa |
  | `POST /api/organizations/:orgSlug/units`            | cria unidade                              |
  | `GET /api/organizations/:orgSlug/units`             | lista as unidades que o usuário vê        |
  | `GET /api/organizations/:orgSlug/units/:unitSlug`   | uma unidade                               |
  | `PATCH /api/organizations/:orgSlug/units/:unitSlug` | edita nome e endereço, desativa e reativa |

## Não entra

- Membros e convites: listar, convidar, mudar papel, remover — é a 0010
- Trocar o slug de organização ou unidade. As URLs são `/<org>/<unidade>` e ficam estáveis
- Transferir a organização para outro dono
- Apagar organização ou unidade: só desativa
- Acesso do suporte ou do master a organizações alheias — fica para o módulo de suporte (0020).
  Aqui o master é um usuário como outro qualquer
- Contagem e limite de cursos (`coursesPerUnit`): vai com a spec de curso
- Mudança de schema ou migration

## Decisões já tomadas

### Quem enxerga e quem escreve

- **Enxerga a organização** quem é dono dela ou membro de alguma unidade **ativa** dela. Enxerga
  a unidade o dono da organização ou um membro da unidade
- **Organização ou unidade desativada só o dono enxerga.** Para os membros ela some, como se não
  existisse
- **Quem não enxerga recebe `404`**, nunca `403`, para não revelar que o slug existe:
  `{ statusCode: 404, message: "Organization not found" }` ou `"Unit not found"`. Slug que não
  existe dá a mesma resposta
- **Quem enxerga mas não tem o papel recebe `403`** `{ statusCode: 403, message: "Not allowed" }`
- **Permissões desta spec:**

  | ação                              | dono | responsável (`isManager`) | outro membro |
  | --------------------------------- | ---- | ------------------------- | ------------ |
  | ver organização e unidade         | sim  | sim                       | sim          |
  | criar e editar organização        | sim  | —                         | —            |
  | criar unidade                     | sim  | —                         | —            |
  | editar nome e endereço da unidade | sim  | sim                       | —            |
  | desativar e reativar unidade      | sim  | —                         | —            |

### `TenantAccessService`

O contrato que a 0010 e as specs de catálogo, locais, semestres e projetos usam:

```ts
type OrganizationAccess = {
  organization: Organization
  isOwner: boolean
}

type UnitAccess = OrganizationAccess & {
  unit: Unit
  membership: UnitMember | null // null para o dono que não é membro
  isManager: boolean // membership?.isManager ?? false
  isTeacher: boolean
}

resolveOrganization(userId: string, orgSlug: string): Promise<OrganizationAccess>
resolveUnit(userId: string, orgSlug: string, unitSlug: string): Promise<UnitAccess>
assertWritable(access: OrganizationAccess | UnitAccess): Promise<void>
```

- **`resolve*` aplica a regra de "quem enxerga"** e lança o `404` da seção anterior. Não checa
  papel: quem chama decide se o papel basta e lança
  `AppException('NOT_ALLOWED')`
- **`assertWritable` é o "pode escrever aqui"**, chamado por todo endpoint que grava dado da
  organização, nesta ordem:
  1. organização desativada → `409` `{ statusCode: 409, message: "Organization is inactive" }`
  2. unidade desativada (se for `UnitAccess`) → `409` `{ statusCode: 409, message: "Unit is
inactive" }`
  3. plano do dono ausente ou `EXPIRED` → `PlanExpiredException` (`403 "Plan expired"`)
- **O plano é sempre o do dono** (`organization.ownerId`), não o de quem chama: o responsável
  sem assinatura escreve normalmente na unidade de um dono com plano em vigor
- **Dono sem assinatura conta como vencido** em `assertWritable`. Só a criação de organização
  distingue os dois casos (ver abaixo)
- **O papel é lido do banco a cada requisição**, como o `systemRole` na 0006. Nada de papel no JWT

### Organização

- **`POST` recebe `{ name, slug, address? }`.** `name` com o `nameSchema` da 0004; `slug` com
  `trim`, minúsculas, de 2 a 60 caracteres e no formato `^[a-z0-9]+(-[a-z0-9]+)*$` da 0002;
  `address` opcional, `trim`, até 300 caracteres, e vazio vira `null`. Corpo inválido dá o `400`
  da 0001
- **Ordem das checagens no `POST`:**
  1. sem assinatura → `403` `{ statusCode: 403, message: "Subscription required" }`
  2. plano `EXPIRED` → `PlanExpiredException`
  3. organizações de que é dono (ativas ou não) `>= limits.organizations` → `403`
     `{ statusCode: 403, message: "Plan limit reached" }`. Limite `null` é ilimitado
  4. slug já usado → `409` `{ statusCode: 409, message: "Slug already in use" }`
  5. cria, com `ownerId` = quem chamou, e responde `201`
- **Contar e criar numa transação só, com a linha da assinatura do dono travada**
  (`SELECT … FOR UPDATE` via `$queryRaw`) antes da contagem. Duas criações simultâneas não
  passam do limite. É SQL na aplicação, não na migration
- **Slug repetido em corrida** (o `P2002` do Prisma no `create`) vira o mesmo `409`
- **`PATCH` recebe `{ name?, address?, isActive? }`**, só do dono. `slug` e outras chaves são
  ignorados pelo schema. Corpo sem nenhum campo válido é `400`
- **`PATCH` só com `isActive: true` reativa** uma organização desativada, sem o `409` de
  "inativa", mas ainda exige o plano em vigor. Qualquer outra mudança passa por `assertWritable`
- **Desativar a organização não mexe nas unidades.** Elas guardam o próprio `isActive`; com a
  organização desativada, todas ficam inacessíveis aos membros e só leitura para o dono
- **`GET /api/organizations`** lista as que o usuário enxerga, ordenadas por `name`. Sem
  paginação

### Unidade

- **`POST` recebe `{ name, slug, address? }`**, com as mesmas regras de campo da organização, e
  só o dono cria. Ordem: `resolveOrganization` (404) → não é dono (`403 "Not allowed"`) →
  `assertWritable` → unidades da organização (ativas ou não) `>= limits.unitsPerOrganization`
  (`403 "Plan limit reached"`) → slug já usado na organização (`409 "Slug already in use"`) →
  `201`
- **Contar e criar numa transação, com a linha da organização travada** (`FOR UPDATE`)
- **O dono não vira membro da unidade que cria.** O acesso dele vem de `ownerId`, como na seed
- **`PATCH` recebe `{ name?, address?, isActive? }`**: dono muda tudo; responsável só `name` e
  `address` — `isActive` vindo de um responsável dá `403 "Not allowed"`. Reativar segue a mesma
  regra da organização (dispensa o `409` da própria unidade, mas não o da organização nem o
  plano)
- **`GET …/units`**: o dono vê todas, ativas ou não; o membro vê as unidades ativas de que é
  membro. Ordenadas por `name`

### Formato

Organização, em todas as rotas:

```json
{
  "id": "…",
  "name": "Root-Test-Organization",
  "slug": "root-test-organization",
  "address": null,
  "isActive": true,
  "createdAt": "2026-10-29T22:00:00.000Z",
  "updatedAt": "2026-10-29T22:00:00.000Z",
  "owner": { "id": "…", "email": "admin@schdlr.dev", "name": "Admin Teste" },
  "access": { "isOwner": true }
}
```

Unidade:

```json
{
  "id": "…",
  "name": "Unidade Teste",
  "slug": "unidade-teste",
  "address": null,
  "isActive": true,
  "createdAt": "2026-10-29T22:00:00.000Z",
  "updatedAt": "2026-10-29T22:00:00.000Z",
  "organization": { "name": "Root-Test-Organization", "slug": "root-test-organization" },
  "access": { "isOwner": false, "isManager": true, "isTeacher": false }
}
```

- **`access` é o papel de quem chamou**, para o web decidir o que mostrar. Não é a lista de
  membros, que é da 0010

### Código

- **`OrganizationsModule` importa o `SubscriptionsModule`** e exporta o `TenantAccessService`
- **Schemas de slug e endereço** ficam em `organizations/schemas/` e são exportados: a 0010 e as
  specs de catálogo usam o mesmo `slugSchema` para validar os `:orgSlug`/`:unitSlug` do caminho.
  Slug inválido no caminho dá `404`, não `400` — é um slug que não existe

### Códigos de erro

Todos os erros desta spec são `AppException` e entram no catálogo da 0008. Onde o texto acima
mostra `{ statusCode, message }`, o corpo real é o da 0008, com o `code` abaixo:

| código                   | status | mensagem                 | quando                                    |
| ------------------------ | ------ | ------------------------ | ----------------------------------------- |
| `ORGANIZATION_NOT_FOUND` | 404    | Organization not found   | slug inexistente ou o usuário não enxerga |
| `UNIT_NOT_FOUND`         | 404    | Unit not found           | idem, para a unidade                      |
| `NOT_ALLOWED`            | 403    | Not allowed              | enxerga, mas o papel não permite          |
| `ORGANIZATION_INACTIVE`  | 409    | Organization is inactive | escrita em organização desativada         |
| `UNIT_INACTIVE`          | 409    | Unit is inactive         | escrita em unidade desativada             |
| `SUBSCRIPTION_REQUIRED`  | 403    | Subscription required    | criar organização sem assinatura          |
| `PLAN_LIMIT_REACHED`     | 403    | Plan limit reached       | acima do limite; `params: { limit, max }` |
| `SLUG_ALREADY_IN_USE`    | 409    | Slug already in use      | slug repetido                             |
| `EMPTY_UPDATE`           | 400    | —                        | `custom` do Zod: `PATCH` sem campo válido |

- **`PLAN_LIMIT_REACHED` leva `params`**: `limit` é a chave de `PlanLimits` estourada
  (`"organizations"` ou `"unitsPerOrganization"`) e `max` o valor dela, para o web dizer "seu
  plano permite 1 unidade"
- **`EMPTY_UPDATE` é item de `VALIDATION_FAILED`**, não código do catálogo: o `refine` do schema
  passa `params: { code: 'EMPTY_UPDATE' }`, como a 0008 manda para regra própria
- `PLAN_EXPIRED` é o da 0006, via `PlanExpiredException`

## Critérios de aceite

- [x] Criar organização sem assinatura dá `403 "Subscription required"`; com plano vencido,
      `403 "Plan expired"`; acima do limite, `403 "Plan limit reached"`, contando as
      desativadas; slug repetido dá `409`
- [x] Criar unidade acima do limite dá `403 "Plan limit reached"`, contando as desativadas;
      slug repetido na mesma organização dá `409`, e o mesmo slug em outra organização passa
- [x] Slug fora do formato no corpo dá `400`; no caminho dá `404`
- [x] Contagem e criação acontecem numa transação com a linha travada
- [x] Não-membro recebe `404` em organização e unidade; membro recebe `403 "Not allowed"` no que
      o papel não permite
- [x] Organização ou unidade desativada some para os membros e continua visível ao dono
- [x] Escrita em organização ou unidade desativada dá `409`; com o plano do dono vencido,
      `403 "Plan expired"`, mesmo quando quem escreve é o responsável com plano próprio
- [x] Reativar dispensa o `409` da própria entidade, mas exige o plano em vigor
- [x] Responsável edita nome e endereço da unidade; `isActive` vindo dele dá `403`
- [x] `slug` no `PATCH` é ignorado
- [x] `TenantAccessService` exportado, com `resolveOrganization`, `resolveUnit` e
      `assertWritable` como na seção acima
- [x] Todos os erros desta spec saem com o `code` da tabela; `PLAN_LIMIT_REACHED` com `params`
- [x] Testes unitários do `TenantAccessService` e dos services com banco e
      `SubscriptionsService` substituídos; e2e das rotas com os services substituídos
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

pnpm dev:api &
sleep 8
API=localhost:3001/api
J='content-type: application/json'
login() {
  code=$(pnpm -s otp "$1" | cut -d' ' -f1)
  curl -s -X POST $API/auth/sign-in -H "$J" -d "{\"email\":\"$1\",\"code\":\"$code\"}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'
}
ADM=$(login admin@schdlr.dev)
MGR=$(login manager@schdlr.dev)
CRD=$(login coordinator@schdlr.dev)
TCH=$(login teacher@schdlr.dev)
MST=$(login "$(grep ^ROOT_EMAIL apps/api/.env | cut -d= -f2)")
O=$API/organizations
U=$O/root-test-organization/units

# leitura
curl -s -H "Authorization: Bearer $ADM" $O                                     # 1 org, isOwner
curl -s -H "Authorization: Bearer $TCH" $O                                     # 1 org, isOwner false
curl -s -H "Authorization: Bearer $MST" $O/root-test-organization -w ' %{http_code}\n'  # 404
curl -s -H "Authorization: Bearer $MGR" $U/unidade-teste                       # access.isManager

# limites do GRACE (1 org, 1 unidade)
curl -s -X POST -H "Authorization: Bearer $ADM" -H "$J" $O \
  -d '{"name":"Outra","slug":"outra"}' -w ' %{http_code}\n'                    # 403 Plan limit reached
curl -s -X POST -H "Authorization: Bearer $ADM" -H "$J" $U \
  -d '{"name":"Outra","slug":"outra"}' -w ' %{http_code}\n'                    # 403 Plan limit reached
curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $O \
  -d '{"name":"Do Teacher","slug":"do-teacher"}' -w ' %{http_code}\n'          # 403 Subscription required

# papéis na unidade
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $U/unidade-teste \
  -d '{"name":"Unidade Renomeada"}' -w ' %{http_code}\n'                       # 200
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $U/unidade-teste \
  -d '{"isActive":false}' -w ' %{http_code}\n'                                 # 403 Not allowed
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $U/unidade-teste \
  -d '{"name":"X"}' -w ' %{http_code}\n'                                       # 403 Not allowed
curl -s -X PATCH -H "Authorization: Bearer $ADM" -H "$J" $U/unidade-teste \
  -d '{"name":"Unidade Teste"}' -w ' %{http_code}\n'                           # 200, nome de volta

# desativar some para o membro; escrita dá 409; reativar volta
curl -s -X PATCH -H "Authorization: Bearer $ADM" -H "$J" $U/unidade-teste \
  -d '{"isActive":false}' -w ' %{http_code}\n'                                 # 200
curl -s -H "Authorization: Bearer $MGR" $U/unidade-teste -w ' %{http_code}\n'  # 404
curl -s -X PATCH -H "Authorization: Bearer $ADM" -H "$J" $U/unidade-teste \
  -d '{"name":"X"}' -w ' %{http_code}\n'                                       # 409 Unit is inactive
curl -s -X PATCH -H "Authorization: Bearer $ADM" -H "$J" $U/unidade-teste \
  -d '{"isActive":true}' -w ' %{http_code}\n'                                  # 200

# criação com TRIAL: o master atribui ao teacher@
curl -s -X PUT -H "Authorization: Bearer $MST" -H "$J" \
  $API/support/subscriptions/teacher@schdlr.dev -d '{"plan":"TRIAL"}' > /dev/null
curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $O \
  -d '{"name":"Do Teacher","slug":"do-teacher"}' -w ' %{http_code}\n'          # 201
curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $O/do-teacher/units \
  -d '{"name":"Sede","slug":"unidade-teste"}' -w ' %{http_code}\n'             # 201 (slug é por org)
curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $O \
  -d '{"name":"Dup","slug":"root-test-organization"}' -w ' %{http_code}\n'     # 403 limit (1 org)
# plano vencido: só leitura
docker compose exec -T db psql -U schdlr -d schdlr -c "update subscriptions
  set expires_at = now() - interval '1 minute'
  where user_id = (select id from users where email = 'teacher@schdlr.dev')"
curl -s -X PATCH -H "Authorization: Bearer $TCH" -H "$J" $O/do-teacher \
  -d '{"name":"Y"}' -w ' %{http_code}\n'                                       # 403 Plan expired
curl -s -H "Authorization: Bearer $TCH" $O/do-teacher -w ' %{http_code}\n'     # 200
kill %1
```

Ao final, devolver o banco ao estado da seed: apagar a unidade e a organização `do-teacher` e a
assinatura do `teacher@`, conferir que a `unidade-teste` está ativa e com o nome original, e
apagar os códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-30** — executada com `/spec 0009`, na branch `development`, logo depois da 0008.

Commits: `feat(api): organização e unidade (spec 0009)`.

Verificação: `pnpm install --frozen-lockfile` ok; sem `.env`, `pnpm test:api` passa (174
unitários, 43 e2e) e `pnpm build:api` também; lint limpo; `pnpm format` estável. Contra o banco de
dev, todas as linhas da seção "Verificação" deram o esperado: `admin@` e `teacher@` listam a
organização com `isOwner` `true` e `false`; o master recebe `404`; o `manager@` vê a unidade com
`isManager`; segunda organização e segunda unidade do `admin@` (`GRACE`) → `403
PLAN_LIMIT_REACHED` com `params`; `teacher@` sem assinatura → `403 SUBSCRIPTION_REQUIRED`;
responsável renomeia (`200`) e não desativa (`403 NOT_ALLOWED`); o coordenador não renomeia
(`403`); desativada pelo dono, a unidade some para o `manager@` (`404`), e escrita do dono dá
`409 UNIT_INACTIVE`; `{"isActive":true}` reativa. Com `TRIAL`, o `teacher@` criou `do-teacher`
(`201`) e uma unidade com o slug `unidade-teste` (`201`, slug é por organização); a segunda
organização dá `403` de limite. Com o plano vencido por SQL: `PATCH` → `403 PLAN_EXPIRED`, `GET` →
`200`, e reativar também dá `PLAN_EXPIRED`. Além do roteiro: slug inválido no caminho → `404`, no
corpo → `400`; `PATCH` só com `slug` → `400` com o item `EMPTY_UPDATE`. No fim, a organização e a
unidade `do-teacher` e a assinatura do `teacher@` foram apagadas, a `unidade-teste` ficou ativa e
com o nome original, e os códigos OTP e refresh tokens dos logins foram apagados.

Desvios:

- **`assertWritable(access, { reactivating? })`**: o segundo parâmetro, opcional, não estava na
  assinatura da spec. É como o "reativar dispensa o `409` da própria entidade" chega ao serviço:
  com ele, a organização de um `OrganizationAccess` ou a unidade de um `UnitAccess` pode estar
  inativa; a organização de um `UnitAccess` e o plano continuam exigidos. Quem chama sem ele tem o
  contrato da spec.
- **Reativação é o corpo exatamente `{ isActive: true }`** (`isReactivation` no schema). Reativar e
  renomear na mesma chamada passa pelo `assertWritable` inteiro e dá `409`.
- **O slug do caminho é validado dentro do `resolve*`**, com o `slugSchema` (inclusive `trim` e
  minúsculas: `/organizations/ROOT-TEST-ORGANIZATION` resolve). Quem usa o `TenantAccessService`
  não precisa de pipe no `:orgSlug`/`:unitSlug`.
- **O membro cuja única unidade foi desativada recebe `ORGANIZATION_NOT_FOUND`** em
  `…/units/unidade-teste`, não `UNIT_NOT_FOUND`: sem unidade ativa, ele já não enxerga a
  organização. É o `404` que a spec pede, com o código da primeira checagem que falha.
- **O plano na criação de organização é lido dentro da transação**, na mesma consulta que trava a
  assinatura (`SELECT plan, expires_at … FOR UPDATE`). Para calcular o status sem duplicar a regra
  da 0006, `toActivePlan` passou a ser exportado de `subscriptions.service.ts`. A unidade lê os
  limites com `getActivePlan` depois do `assertWritable`, fora da transação, e trava a organização.
- **Organização e unidade compartilham os schemas** (`createTenantSchema`, `updateTenantSchema`),
  porque os campos e regras são os mesmos.
- **Ordem no `PATCH` da unidade**: papel (`403`) antes de `assertWritable` (`409`/`403`), como na
  criação.
- Testes além dos pedidos: os schemas e um e2e com os services reais e o banco substituído, para o
  `404` de slug inválido no caminho.

## Notas posteriores

**2026-10-30 — a pedido do usuário, depois do commit da 0009.** O que a seção "Código" e o
"Escopo" puseram em `src/modules/organizations/` foi dividido em três módulos:

- **`src/modules/tenancy/`** (`TenancyModule`): o `TenantAccessService`, exportado, e o
  `slugSchema` (`tenancy/schemas/tenancy.schemas.ts`). Quem precisa do acesso importa o
  `TenancyModule`, não o `OrganizationsModule`, que não exporta mais nada
- **`src/modules/units/`** (`UnitsModule`, que importa o `TenancyModule` e o
  `SubscriptionsModule`): controller, service e schemas próprios
  (`createUnitSchema`, `updateUnitSchema`, `isUnitReactivation`)
- **`src/modules/organizations/`**: controller, service, `createOrganizationSchema`,
  `updateOrganizationSchema`, `isOrganizationReactivation` e o `addressSchema`, que a unidade
  importa

Isso desfaz o desvio "Organização e unidade compartilham os schemas" do Registro: a preferência é
um schema por entidade e um módulo por pasta; agrupar, só com pasta de módulos. O
`isUniqueViolation` foi para `src/infra/database/prisma-errors.ts`. Rotas, respostas, regras e o
contrato do `TenantAccessService` não mudaram; só o endereço.
