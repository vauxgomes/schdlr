---
id: 0010
title: Membros e convites
status: done
depends_on: [0003, 0004, 0008, 0009]
---

# 0010 — Membros e convites

## Objetivo

O dono e o responsável pela unidade passam a convidar pessoas por e-mail, com os papéis
pretendidos (responsável, professor ou nenhum), e a ver, editar e remover os membros. Quem é
convidado aceita ou recusa pelos botões do e-mail, ou pela lista de convites quando está logado.
Aceitar cria o `UnitMember`.

## Por que existe

Só os membros da seed estão em alguma unidade. Sem convite, o dono não monta a equipe: não há
professor para as ofertas nem responsável para dividir a gestão. E o `UnitInvitation` da 0002
(papéis pretendidos, `tokenHash` para os botões do e-mail) e as variáveis
`UNIT_INVITE_TTL_DAYS` e `WEB_APP_URL` do `.env.example` estão esperando por esta spec.

## Contexto necessário

- `specs/0009-api-organizacao-e-unidade.md` — `TenantAccessService` (`resolveUnit`,
  `assertWritable`), o `NOT_ALLOWED`, o `404` para quem não enxerga e o prefixo
  `/api/organizations/:orgSlug/units/:unitSlug`
- `specs/0008-api-codigos-de-erro.md` — corpo de erro com `code`, `AppException` e o catálogo
- `specs/0002-api-schema-do-dominio.md` — `UnitMember` (`@@unique([unitId, userId])`),
  `UnitInvitation`, `InvitationStatus` e a tabela de papéis
- `specs/0003-api-envio-de-email.md` — modelo como função pura em `templates/`, um `sendX` no
  `MailService`, corpo nunca no log
- `specs/0004-api-auth-por-otp.md` — `emailSchema`, `nameSchema`, o refresh token (32 bytes
  base64url, SHA-256 no banco), o `503 "Could not send email"` e o `sign-up` de e-mail existente
  e não verificado
- `apps/api/src/modules/organizations/` — o que a 0009 entregou
- `apps/api/src/infra/mail/` e `apps/api/src/config/env.schema.ts`

## Escopo

**Entra:**

- Módulo `src/modules/members/` com controllers, service(s) e schemas Zod
- Rotas da unidade, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                            | o que faz                          |
  | ------------------------------- | ---------------------------------- |
  | `GET …/members`                 | lista os membros                   |
  | `PATCH …/members/:userId`       | muda `isManager` e `isTeacher`     |
  | `DELETE …/members/:userId`      | remove o membro (ou o próprio sai) |
  | `GET …/invitations`             | lista os convites da unidade       |
  | `POST …/invitations`            | convida por e-mail                 |
  | `POST …/invitations/:id/cancel` | cancela um convite pendente        |

- Rotas de quem é convidado:

  | rota                                           | acesso  | o que faz                   |
  | ---------------------------------------------- | ------- | --------------------------- |
  | `GET /api/invitations`                         | token   | meus convites pendentes     |
  | `POST /api/invitations/:id/accept`             | token   | aceito um convite meu       |
  | `POST /api/invitations/:id/reject`             | token   | recuso um convite meu       |
  | `GET /api/invitations/by-token/:token`         | público | o convite do link do e-mail |
  | `POST /api/invitations/by-token/:token/accept` | público | aceita pelo link            |
  | `POST /api/invitations/by-token/:token/reject` | público | recusa pelo link            |

- Modelo de e-mail `unit-invitation.template.ts` e `MailService.sendUnitInvitation`
- `UNIT_INVITE_TTL_DAYS` e `WEB_APP_URL` no `envSchema`

## Não entra

- Coordenador de curso (`Course.coordinatorId`): vai com a spec de curso. Aqui o coordenador é
  só um membro sem flag, como na seed
- **Consequência de remover membro ou tirar `isTeacher` sobre ofertas e cursos.** Ofertas e
  cursos ainda não existem; a spec que os criar decide o que acontece com o professor ou o
  coordenador que deixa a unidade
- Membro e convite de projeto (0023), professor fantasma (0021)
- Convite para a organização inteira ou para várias unidades de uma vez
- Transferir a organização, tornar alguém dono
- Limite de membros por plano: a 0006 não tem
- Lembrete de convite perto de vencer, notificação a quem convidou
- Tela do web: aqui só a API e os links que o e-mail leva
- Mudança de schema ou migration

## Decisões já tomadas

### Permissões

Quem enxerga a unidade e o `404` para quem não enxerga são os da 0009 (`resolveUnit`). Faltando
o papel, `AppException('NOT_ALLOWED')` (`403`).

| ação                                   | dono | responsável | outro membro |
| -------------------------------------- | ---- | ----------- | ------------ |
| listar membros                         | sim  | sim         | sim          |
| listar convites da unidade             | sim  | sim         | —            |
| convidar sem `isManager`               | sim  | sim         | —            |
| convidar com `isManager`               | sim  | —           | —            |
| mudar `isTeacher` de um membro         | sim  | sim         | —            |
| mudar `isManager` de um membro         | sim  | —           | —            |
| remover membro que não é responsável   | sim  | sim         | —            |
| remover responsável                    | sim  | —           | —            |
| sair da unidade (`DELETE` de si mesmo) | —    | sim         | sim          |
| cancelar convite sem `isManager`       | sim  | sim         | —            |
| cancelar convite com `isManager`       | sim  | —           | —            |

- **Só o dono cria, promove ou remove responsável.** O responsável cuida do resto da equipe
- **Toda escrita passa por `assertWritable`** da 0009 (organização ou unidade desativada → `409`,
  plano do dono vencido → `403 "Plan expired"`), inclusive aceitar convite. A exceção é
  **recusar**, que é só a resposta de quem foi convidado e não muda a equipe
- O dono pode ser membro de uma unidade da própria organização (por exemplo, também professor);
  ser membro não muda o que ele já podia como dono

### Membros

- **`GET …/members`** responde a lista ordenada por `name`, sem paginação:

  ```json
  [
    {
      "userId": "…",
      "email": "manager@schdlr.dev",
      "name": "Manager Teste",
      "isManager": true,
      "isTeacher": false,
      "createdAt": "2026-10-29T22:00:00.000Z"
    }
  ]
  ```

- **`PATCH …/members/:userId` recebe `{ isManager?, isTeacher? }`**; ao menos um, senão `400`.
  `isManager` vindo do responsável dá `403`, mesmo que o valor não mude. Responde `200` com o
  membro no formato acima. `userId` que não é membro da unidade: `404`
  `{ statusCode: 404, message: "Member not found" }`
- **`DELETE …/members/:userId` apaga a linha de `UnitMember`** e responde `204`. `UnitMember` não
  tem `isActive` e nada aponta para ele: sair da equipe é deixar de ter a linha. Convites antigos
  da pessoa ficam como estão
- **Membro sem flag é válido**, como o `coordinator@` da seed: tirar `isManager` e `isTeacher`
  deixa a pessoa na unidade

### Convidar

- **`POST …/invitations` recebe `{ email, name?, isManager?, isTeacher? }`**, com `emailSchema` e
  `nameSchema` da 0004; as flags valem `false` se ausentes. Convite sem flag é válido
- **O convite é sempre para um `User`** (`inviteeId` não é nulo na 0002):
  - e-mail com usuário ativo → é ele
  - e-mail com usuário inativo → `409` `{ statusCode: 409, message: "User is inactive" }`
  - e-mail sem usuário → cria o `User` (`systemRole: USER`, sem assinatura,
    `emailVerifiedAt` nulo) com `name` informado ou, se ausente, a parte antes do `@`. A pessoa
    entra depois pelo `sign-up` da 0004, que para e-mail não verificado atualiza o nome e envia
    o código
- **Já membro da unidade → `409`** `{ statusCode: 409, message: "Already a member" }`
- **Convidar de novo substitui.** Se há convite `PENDING` e não vencido para o mesmo usuário na
  mesma unidade, ele passa a `CANCELLED` e um novo é criado, com token e validade novos. É o
  "reenviar" — não há rota própria
- **Token como o refresh token da 0004**: 32 bytes aleatórios em base64url, SHA-256 em hexadecimal
  no `token_hash`. O valor só existe no e-mail; o banco não consegue reproduzi-lo. Se a
  `session.service.ts` já tem a função de hash, extrair para um lugar comum e usar nos dois
- **Validade**: `expiresAt` = agora + `UNIT_INVITE_TTL_DAYS` dias
- **Cria (usuário, cancelamento do anterior e convite) numa transação e envia o e-mail depois.**
  Falha do envio → `503` `{ statusCode: 503, message: "Could not send email" }`, e o convite
  criado fica: convidar de novo resolve, como o usuário criado no `sign-up` da 0004
- Responde `201` com o convite

### Status

- **`EXPIRED` é calculado na leitura, como o plano na 0006**: `PENDING` com `expiresAt <= agora`
  sai como `"EXPIRED"`. Nada é gravado quando o convite vence; o valor `EXPIRED` do enum não é
  escrito pela API nesta spec
- **Só convite `PENDING` não vencido aceita, recusa ou cancela.** Vencido → `410`
  `{ statusCode: 410, message: "Invitation expired" }`; já respondido ou cancelado → `409`
  `{ statusCode: 409, message: "Invitation is not pending" }`
- `respondedAt` é preenchido ao aceitar, recusar ou cancelar

### Responder

- **Aceitar**, numa transação: confere o status, chama `assertWritable` da unidade do convite,
  cria o `UnitMember` com as flags do convite e marca `ACCEPTED`. Se a pessoa já virou membro
  por outro convite, as flags do convite **somam** às dela (`true` nunca vira `false`)
- **Recusar** marca `REJECTED`. Não passa por `assertWritable`
- **Pelo link** (`by-token`): é público — quem tem o token recebeu o e-mail. Token desconhecido,
  ou convidado inativo: `404` `{ statusCode: 404, message: "Invitation not found" }`. Aceitar pelo
  link não faz login nem preenche `emailVerifiedAt`
- **Logado** (`:id`): o convite tem de ser do usuário do token; de outra pessoa ou inexistente dá
  o mesmo `404`
- **`GET /api/invitations`** lista os convites `PENDING` não vencidos do usuário logado, em
  unidades e organizações ativas, mais novos primeiro
- **`GET …/by-token/:token`** devolve o convite em qualquer status, para o web mostrar "aceito",
  "vencido" etc.
- Aceitar e recusar respondem `200` com o convite atualizado

### Formato do convite

Em todas as rotas:

```json
{
  "id": "…",
  "email": "nova@ifce.edu.br",
  "name": "nova",
  "isManager": false,
  "isTeacher": true,
  "status": "PENDING",
  "expiresAt": "2026-11-06T10:00:00.000Z",
  "respondedAt": null,
  "createdAt": "2026-10-30T10:00:00.000Z",
  "invitedBy": { "email": "admin@schdlr.dev", "name": "Admin Teste" },
  "unit": { "name": "Unidade Teste", "slug": "unidade-teste" },
  "organization": { "name": "Root-Test-Organization", "slug": "root-test-organization" }
}
```

- **`GET …/invitations` da unidade aceita `?status=`** com um valor de `InvitationStatus`
  (`EXPIRED` filtra os vencidos calculados); sem ele, todos, mais novos primeiro. Valor fora do
  enum: `400`

### E-mail

- **`MailService.sendUnitInvitation({ to, inviterName, unitName, organizationName, isManager,
isTeacher, acceptUrl, rejectUrl, expiresAt })`**, com o modelo em
  `templates/unit-invitation.template.ts`, no padrão da 0003
- **Assunto:** "Convite para a unidade <unidade> no schdlr"
- **Corpo:** quem convidou, a unidade e a organização, os papéis em português ("responsável",
  "professor"; sem flag, só "membro"), a validade em data, os dois links e "Se não esperava este
  convite, ignore este e-mail." O HTML é uma tabela simples com estilo inline, como o do OTP,
  agora com os dois links como botões
- **Links:** `${WEB_APP_URL}/invitations/<token>?action=accept` e `…?action=reject`. A página do
  web chama as rotas `by-token`; o e-mail não aceita nada sozinho, para que pré-visualizadores de
  link não respondam pelo convidado
- O token nunca vai para o log, como o corpo (0003)

### Env

```ts
UNIT_INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
WEB_APP_URL: z.url(),
```

- No `.env.example`, as duas saem do "Ainda não lido pela API"; o comentário de `WEB_APP_URL`
  (base dos links enviados por e-mail) continua
- `test/setup-env.ts` ganha `WEB_APP_URL`

### Códigos de erro

Todos os erros desta spec são `AppException` e entram no catálogo da 0008. Onde o texto acima
mostra `{ statusCode, message }`, o corpo real é o da 0008, com o `code` abaixo:

| código                   | status | mensagem                  | quando                                       |
| ------------------------ | ------ | ------------------------- | -------------------------------------------- |
| `MEMBER_NOT_FOUND`       | 404    | Member not found          | `userId` não é membro da unidade             |
| `USER_INACTIVE`          | 409    | User is inactive          | convite a usuário desativado                 |
| `ALREADY_A_MEMBER`       | 409    | Already a member          | convite a quem já é membro                   |
| `INVITATION_NOT_FOUND`   | 404    | Invitation not found      | token ou id desconhecido, ou de outra pessoa |
| `INVITATION_EXPIRED`     | 410    | Invitation expired        | responder ou cancelar convite vencido        |
| `INVITATION_NOT_PENDING` | 409    | Invitation is not pending | já aceito, recusado ou cancelado             |
| `EMPTY_UPDATE`           | 400    | —                         | `custom` do Zod: `PATCH` de membro sem flag  |

- `EMAIL_SEND_FAILED` é o da 0004; `NOT_ALLOWED`, `UNIT_NOT_FOUND`, `UNIT_INACTIVE`,
  `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` vêm do `TenantAccessService` da 0009
- `EMPTY_UPDATE` é item de `VALIDATION_FAILED`, como na 0009

## Critérios de aceite

- [x] Não-membro recebe `404` nas rotas da unidade; membro sem papel recebe `403` no que a tabela
      de permissões não dá a ele
- [x] Responsável convida sem `isManager`; com `isManager`, `403`. Mesma regra no `PATCH`, no
      `DELETE` de responsável e no cancelamento
- [x] Convite a e-mail sem conta cria o `User` não verificado, sem assinatura, e o `sign-up`
      depois funciona para ele
- [x] Convite a quem já é membro dá `409`; a usuário inativo, `409`
- [x] Convidar de novo cancela o pendente anterior e cria outro com token novo
- [x] O token não fica no banco (só o SHA-256) nem no log
- [x] Falha do e-mail dá `503` e o convite fica
- [x] Aceitar cria o `UnitMember` com as flags; aceitando já sendo membro, as flags somam
- [x] Vencido dá `410`; respondido ou cancelado dá `409`; a leitura mostra `EXPIRED` sem gravar
- [x] Aceitar, convidar, editar, remover e cancelar com o plano do dono vencido dão
      `403 "Plan expired"`; recusar passa
- [x] `by-token` é público; token desconhecido dá `404`. Rotas `:id` dão `404` para convite de
      outra pessoa
- [x] `DELETE` de si mesmo funciona para membro e responsável e responde `204`
- [x] `UNIT_INVITE_TTL_DAYS` e `WEB_APP_URL` no `envSchema` e fora do "Ainda não lido"
- [x] Todos os erros desta spec saem com o `code` da tabela
- [x] Testes unitários dos services e do modelo de e-mail, com banco, `MailService` e
      `TenantAccessService` substituídos; e2e das rotas com os services substituídos. Nenhum
      teste envia e-mail
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

# contra o banco de dev, com MAIL_ENABLED=false (o e-mail só aparece como linha no log)
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
MST=$(login "$(grep ^ROOT_EMAIL apps/api/.env | cut -d= -f2)")
U=$API/organizations/root-test-organization/units/unidade-teste

curl -s -H "Authorization: Bearer $CRD" $U/members                              # 3 membros
curl -s -H "Authorization: Bearer $MST" $U/members -w ' %{http_code}\n'         # 404
curl -s -H "Authorization: Bearer $CRD" $U/invitations -w ' %{http_code}\n'     # 403

# convites
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/invitations \
  -d '{"email":"guest@schdlr.dev","isManager":true}' -w ' %{http_code}\n'        # 403
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/invitations \
  -d '{"email":"Guest@schdlr.dev","isTeacher":true}' -w ' %{http_code}\n'        # 201, cria o guest@
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/invitations \
  -d '{"email":"teacher@schdlr.dev"}' -w ' %{http_code}\n'                       # 409 Already a member
curl -s -X POST -H "Authorization: Bearer $ADM" -H "$J" $U/invitations \
  -d '{"email":"guest@schdlr.dev","isTeacher":true}' > /dev/null                 # substitui o anterior
curl -s -H "Authorization: Bearer $ADM" "$U/invitations?status=CANCELLED"        # o primeiro

# o guest@ entra (não verificado → SIGN_UP) e aceita pela lista
GST=$(login guest@schdlr.dev)
ID=$(curl -s -H "Authorization: Bearer $GST" $API/invitations \
  | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')
curl -s -X POST -H "Authorization: Bearer $MGR" $API/invitations/$ID/accept -w ' %{http_code}\n'  # 404 (não é dele)
curl -s -X POST -H "Authorization: Bearer $GST" $API/invitations/$ID/accept -w ' %{http_code}\n'  # 200
curl -s -X POST -H "Authorization: Bearer $GST" $API/invitations/$ID/accept -w ' %{http_code}\n'  # 409
curl -s -H "Authorization: Bearer $CRD" $U/members                              # 4, guest@ professor

# pelo link: o token só existe no e-mail, então o teste insere um convite com token conhecido
TOKEN=token-de-teste-0010
HASH=$(node -pe "require('crypto').createHash('sha256').update('$TOKEN').digest('hex')")
docker compose exec -T db psql -U schdlr -d schdlr -c "insert into unit_invitations
  (id, unit_id, invitee_id, invited_by_id, is_manager, token_hash, expires_at, updated_at)
  select 'inv-teste-0010', u.id, c.id, a.id, true, '$HASH', now() + interval '1 day', now()
  from units u, users c, users a
  where u.slug = 'unidade-teste' and c.email = 'coordinator@schdlr.dev' and a.email = 'admin@schdlr.dev'"
curl -s $API/invitations/by-token/$TOKEN                                         # 200, PENDING, sem token
curl -s $API/invitations/by-token/outro -w ' %{http_code}\n'                     # 404
curl -s -X POST $API/invitations/by-token/$TOKEN/accept                          # 200; coordinator@ vira responsável (soma)

# membros
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $U/members/<id do coordinator@> \
  -d '{"isManager":false}' -w ' %{http_code}\n'                                  # 403
curl -s -X PATCH -H "Authorization: Bearer $ADM" -H "$J" $U/members/<id do coordinator@> \
  -d '{"isManager":false}' -w ' %{http_code}\n'                                  # 200
curl -s -X DELETE -H "Authorization: Bearer $GST" $U/members/<id do guest@> -w ' %{http_code}\n'  # 204, saiu

# plano vencido: aceitar barra, recusar passa (expirar a assinatura do admin@ por psql,
# criar um convite novo para o guest@ antes, e devolver expires_at a null depois)
kill %1
```

Ao final, devolver o banco ao estado da seed: apagar os convites da `unidade-teste`, o
`UnitMember` e o `User` do `guest@`, conferir que o `coordinator@` voltou a membro sem flag e que
a assinatura do `admin@` está `GRACE` sem `expires_at`, e apagar os códigos OTP e refresh tokens
dos logins.

## Registro

**2026-10-30** — executada com `/spec 0010`, na branch `development`, depois da 0009 e da
refatoração dela em módulos (`tenancy`, `organizations`, `units`).

Commits: `feat(api): membros e convites (spec 0010)`.

Verificação: `pnpm install --frozen-lockfile` ok; sem `.env`, `pnpm test:api` passa (238
unitários, 58 e2e) e `pnpm build:api` também; lint limpo; `pnpm format` estável. Contra o banco de
dev, com `MAIL_ENABLED=false`: o `coordinator@` lista 3 membros; o master recebe `404`; o
`coordinator@` nos convites → `403`. O `manager@` convidando com `isManager` → `403`; convidando
`Guest@schdlr.dev` → `201`, e o `guest@` nasceu `USER`, não verificado e sem assinatura;
convidando o `teacher@` → `409 ALREADY_A_MEMBER`. O `admin@` convidou o `guest@` de novo, e
`?status=CANCELLED` mostrou o primeiro; `?status=OUTRO` → `400`. O `guest@` entrou por OTP
(`SIGN_UP`, ficou verificado), viu 1 convite pendente e aceitou (`200`); o `manager@` aceitando o
convite dele → `404`; aceitar de novo → `409`; o `guest@` entrou como professor. Pelo link, com o
convite inserido por SQL: `GET` → `200` sem token; token desconhecido → `404`; aceitar → `200`, e
o `coordinator@` virou responsável (soma). O `manager@` tirando o `isManager` ou removendo o
`coordinator@` → `403`; o `admin@` tirou (`200`); `userId` que não é membro → `404
MEMBER_NOT_FOUND`; `PATCH` sem flag → `400 EMPTY_UPDATE`; o `guest@` saiu (`204`). Com a
assinatura do `admin@` vencida por SQL: aceitar, convidar, editar, remover e cancelar → `403
PLAN_EXPIRED`; recusar → `200`. Convite vencido por SQL: aceitar → `410`, `?status=EXPIRED` o
lista, e o banco continua com `PENDING`. O `manager@` cancelando um convite com `isManager` →
`403`; o `admin@` cancelou (`200`); cancelar de novo → `409`. O `sign-up` do `novo@`, criado pelo
convite, respondeu `202`, trocou o nome e emitiu um código `SIGN_UP`. Nenhuma linha do log tem o
token ou o link, só `[mail desligado] para=… assunto="Convite para a unidade Unidade Teste no
schdlr"`; o `token_hash` tem 64 caracteres (SHA-256 em hex). No fim, os convites da
`unidade-teste`, o `guest@` e o `novo@` foram apagados, o `coordinator@` voltou a membro sem flag,
a assinatura do `admin@` está `GRACE` sem `expires_at`, e os códigos OTP e refresh tokens foram
apagados.

Desvios:

- **Dois módulos, `src/modules/members/` e `src/modules/invitations/`**, a pedido do usuário, em
  vez de um `members/` só: um módulo por entidade, como `organizations/` e `units/`. Os dois
  importam o `TenancyModule`. O de convites tem dois controllers: `UnitInvitationsController`
  (rotas da unidade) e `InvitationsController` (`/api/invitations`).
- **Ordem das checagens no `PATCH` e no `DELETE` de membro**: o alvo (`404 MEMBER_NOT_FOUND`)
  antes do papel (`403`), porque o `DELETE` só sabe se o responsável pode remover depois de saber
  se o alvo é responsável. Depois, `assertWritable`. No cancelamento, a mesma ideia: convite (`404`),
  papel, status (`410`/`409`), `assertWritable`.
- **Cancelar responde `200` com o convite**, como aceitar e recusar; a spec não dizia.
- **Aceitar**: o status é conferido antes do `assertWritable`, e de novo dentro da transação, com
  `updateMany` filtrando `status: PENDING`: duas respostas simultâneas não passam as duas (a
  segunda dá `409`). O `assertWritable` roda antes da transação, porque só lê. O membro é criado
  com `upsert`, que soma as flags.
- **Sair da unidade** (`DELETE` de si mesmo) também passa por `assertWritable`: com o plano do
  dono vencido, nem sair. "Toda escrita passa por `assertWritable`" não abria exceção.
- **Token**: `generateOpaqueToken` e `hashOpaqueToken` foram extraídos para
  `src/common/crypto/opaque-token.ts`, e a `SessionService` da 0004 passou a usá-los. O formato
  do refresh token não mudou.
- **E-mail**: a validade sai como data em pt-BR no fuso `America/Sao_Paulo` ("O convite vale até
  06/11/2026."). Os nomes no HTML são escapados, porque vêm de entrada do usuário. Os botões são
  "Aceitar" e "Recusar"; o texto puro traz os dois links. `roleLabel` monta "responsável e
  professor", "professor" ou "membro". Uma barra no fim do `WEB_APP_URL` é descartada.
- **`MailService.sendUnitInvitation`** recebe o tipo `UnitInvitationTemplateInput & { to }`, com
  os campos da spec.
- **Convidado inativo nas rotas `:id`** também dá `404`, como no `by-token`.
- **`.env.example`**: `UNIT_INVITE_TTL_DAYS` ganhou o comentário "Validade do convite para uma
  unidade, em dias." no lugar do "Ainda não lido".
- **O roteiro da Verificação foi rodado em `bash`** a partir de um script: no zsh desta máquina,
  algumas substituições `$(…)` falharam com "failed to change group ID". Além do roteiro: plano
  vencido também em editar, remover e cancelar, convite vencido (`410` e `EXPIRED` sem gravar),
  cancelamento por responsável e o `sign-up` de usuário criado pelo convite.
- **Falha real de envio não foi exercitada**: nenhum teste envia e-mail. O `503` com o convite
  mantido está coberto pelo teste unitário com o `MailService` substituído.

## Notas posteriores

**2026-10-31 — spec 0011.** O "Não entra" sobre o coordenador que deixa a unidade foi resolvido
pela 0011: o `MembersService.remove`, na mesma transação do `delete`, zera o `coordinatorId` dos
cursos daquela unidade coordenados pela pessoa. A resposta do `DELETE` (`204`) não mudou.

**2026-10-31 — spec 0019.** O "Não entra" sobre o professor que deixa a unidade foi resolvido
pela 0019: o `MembersService` zera o `teacherId` das ofertas dos projetos da unidade em semestres
`PLANNING`, `ADJUSTMENTS` e `STARTED` quando o membro é removido ou sai (`remove`, no mesmo lote
que zera o coordenador) e quando o `isTeacher` passa de `true` para `false` (`update`, na mesma
transação). Em `FINISHED` e `CANCELLED` a oferta fica como estava. As respostas das rotas de
membro não mudaram.

**2026-11-01 — spec 0021.** O `PATCH …/members/:userId` perdeu o `isTeacher` e recebe só
`{ isManager }` (sem ele, `EMPTY_UPDATE`); como `isManager` é só do dono, o responsável não edita
mais membro nenhum. O `isTeacher` do convite não liga mais flag no membro: aceitar cria um `Teacher`
vinculado ao convidado, com o nome do usuário (homônimo leva o e-mail entre parênteses), na mesma
transação, e nada se ele já for professor na organização. "Somar as flags" vale só para
`isManager`. O e-mail do convite não mudou. O ajuste da 0019 no `MembersService` foi desfeito: sair
da unidade não tira a pessoa das ofertas. O `isTeacher` do formato do membro continua, calculado:
ter `Teacher` ativo na organização. `UnitAccess.isTeacher` passou a ser o mesmo
(`TenantAccessService.isTeacher`).
