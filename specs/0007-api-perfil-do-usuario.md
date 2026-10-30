---
id: 0007
title: Perfil do usuário
status: todo
depends_on: [0004, 0006]
---

# 0007 — Perfil do usuário

## Objetivo

O usuário logado passa a ver o próprio perfil numa rota só: dados da conta, tipo de usuário,
quantas organizações tem e a assinatura com o status. E passa a poder trocar o próprio nome.
É a tela "minha conta" do web.

## Por que existe

O `GET /api/auth/me` da 0004 responde só o necessário para a sessão (id, e-mail, nome, papel).
O web precisa mostrar também o plano, se ele está em vigor e quanto do plano já foi usado, e a
0006 deixou o `GET` da própria assinatura para cá.

## Contexto necessário

- `specs/0004-api-auth-por-otp.md` — `@CurrentUser()`, o `GET /api/auth/me` (que não muda) e a
  regra de que usuário inexistente ou inativo dá `401`
- `specs/0006-api-assinaturas-e-papel-de-suporte.md` — `SubscriptionsService.getActivePlan` e o
  tipo `ActivePlan`
- `specs/0002-api-schema-do-dominio.md` — `User` e `Organization` (`ownerId`)
- `apps/api/src/modules/auth/` — `auth-user.ts`, decorators e o padrão de controller
- `apps/api/src/modules/subscriptions/` — o que a 0006 entregou

## Escopo

**Entra:**

- Módulo `src/modules/profile/` com controller, service e schema Zod
- `GET /api/profile` e `PATCH /api/profile`, ambos exigindo token

## Não entra

- Trocar e-mail — fica para a v2
- Foto, telefone ou qualquer campo que o `User` da 0002 não tem. Nenhuma mudança de schema
- Listar as organizações, unidades ou cursos do usuário — aqui vai só a contagem de organizações
- Mudar o `GET /api/auth/me` da 0004
- Desativar a própria conta, listar sessões
- Ver o perfil de outro usuário

## Decisões já tomadas

### Rotas

- **`/api/profile` é sempre o usuário do token.** Não há `:id`; não existe ver ou editar o perfil
  de outra pessoa por aqui
- **O `GET /api/auth/me` continua como está**: é o que o web chama para restaurar a sessão, e o
  perfil é a tela de conta. Os dois coexistem
- **Usuário inexistente ou inativo dá `401`**, como no `me`

### `GET /api/profile`

Responde `200` com:

```json
{
  "id": "…",
  "email": "admin@schdlr.dev",
  "name": "Admin Teste",
  "systemRole": "USER",
  "emailVerifiedAt": "2026-10-29T22:00:00.000Z",
  "createdAt": "2026-10-29T22:00:00.000Z",
  "organizationsOwned": 1,
  "subscription": {
    "plan": "GRACE",
    "status": "ACTIVE",
    "expiresAt": null,
    "limits": { "organizations": 1, "unitsPerOrganization": 1, "coursesPerUnit": 5 }
  }
}
```

- **`systemRole` é o "tipo de usuário"** (`USER`, `SUPPORT`, `MASTER`)
- **`organizationsOwned`** conta todas as organizações de que o usuário é dono
  (`Organization.ownerId`), ativas ou não. Ser membro de unidade não conta
- **`subscription` é o `ActivePlan` da 0006** (`plan`, `status`, `expiresAt`, `limits`), vindo
  de `getActivePlan`, sem cálculo próprio. Sem assinatura, `subscription` é `null`
- O status de plano vencido aparece como `"EXPIRED"`; a regra de "somente leitura" não muda nada
  no perfil, que é do usuário e não da organização

### `PATCH /api/profile`

- **Recebe `{ name }`**, com a mesma validação do `sign-up` da 0004: `trim`, de 1 a 120
  caracteres. Corpo inválido dá o `400` da 0001
- **Só `name` é editável.** Campo desconhecido no corpo é ignorado pelo schema Zod (que remove
  chaves extras), não gera erro; `email` e `systemRole` enviados não mudam nada
- **Responde `200` com o perfil completo**, no formato do `GET`
- Plano vencido ou ausente não impede trocar o nome

### Código

- **O schema do nome é o mesmo do `sign-up`.** Extrair `nameSchema` de
  `src/modules/auth/schemas/auth.schemas.ts` e usar nos dois lugares, em vez de repetir a regra
- **O `ProfileModule` importa o `SubscriptionsModule`** para usar o `SubscriptionsService`. Se a
  0006 não o tiver exportado, exportar
- `ProfileService.get(userId)` monta o perfil com três leituras: o usuário, a contagem de
  organizações (`count` por `ownerId`, sem filtro de `isActive`) e o `getActivePlan`

## Critérios de aceite

- [ ] `GET /api/profile` sem token dá `401`; com token devolve exatamente o formato acima
- [ ] `organizationsOwned` conta as organizações de que o usuário é dono, ativas ou não
- [ ] `subscription` é `null` sem assinatura, `ACTIVE` dentro da validade e `EXPIRED` depois
- [ ] `PATCH` troca o nome (com `trim`) e devolve o perfil atualizado
- [ ] `PATCH` com nome vazio ou acima de 120 caracteres dá `400`; `email` e `systemRole` no corpo
      são ignorados
- [ ] Usuário inativo dá `401` nas duas rotas
- [ ] O `sign-up` e o perfil usam o mesmo `nameSchema`
- [ ] Testes unitários do `ProfileService` com banco e `SubscriptionsService` substituídos; e2e
      das rotas com o service substituído
- [ ] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam

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
TCH=$(login teacher@schdlr.dev)

curl -s $API/profile -w ' %{http_code}\n'                                     # 401
curl -s -H "Authorization: Bearer $ADM" $API/profile                           # 1 org, GRACE ACTIVE
curl -s -H "Authorization: Bearer $TCH" $API/profile                           # 0 orgs, subscription null
curl -s -X PATCH -H "Authorization: Bearer $TCH" -H "$J" $API/profile \
  -d '{"name":"  Teacher Renomeado  ","systemRole":"MASTER"}'                  # 200, nome trocado, USER
curl -s -X PATCH -H "Authorization: Bearer $TCH" -H "$J" $API/profile \
  -d '{"name":""}' -w ' %{http_code}\n'                                        # 400
curl -s -X PATCH -H "Authorization: Bearer $TCH" -H "$J" $API/profile \
  -d '{"name":"Teacher Teste"}' -w ' %{http_code}\n'                           # 200, nome de volta
kill %1
```

## Registro

_(vazio)_
