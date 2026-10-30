---
id: 0008
title: Códigos de erro
status: done
depends_on: [0001, 0004, 0006, 0007]
---

# 0008 — Códigos de erro

## Objetivo

Toda resposta de erro da API passa a ter um `code` estável em `SCREAMING_SNAKE_CASE`, ao lado do
`message` em inglês. O web decide o que mostrar pelo `code` e traduz para português do lado dele;
a API continua 100% em inglês e sem i18n. Os erros de validação ganham, por campo, o código do Zod
e os parâmetros da regra (mínimo, máximo, formato), para o web montar a frase sozinho.

⚠️ **Esta spec estabelece contrato** (o formato do corpo de erro, o catálogo de códigos, a
`AppException` e o filtro global). Deve ser executada sozinha, com `/spec 0008`, e antes das
specs que criam erros novos (0009 em diante).

## Por que existe

Hoje o web só conseguiria reagir a um erro comparando o `message` (`"Plan expired"`), o que quebra
na primeira troca de texto, e teria de traduzir frases em inglês. E o formato não é uniforme: os
erros de regra saem `{ statusCode, message }`, os padrões do Nest (o `401` do guard, o `403` do
`SystemRoleGuard`, o `404` de rota) saem com o campo `error`, e um erro inesperado sai no formato
interno do Nest. As specs 0009 e 0010 criam uns quinze erros novos; é melhor que já nasçam com
código.

## Contexto necessário

- `specs/0001-api-boilerplate-nestjs.md` — `ZodValidationPipe` e o `400` de validação
- `specs/0004-api-auth-por-otp.md` — os erros do auth e a decisão de passar o objeto
  `{ statusCode, message }` para a exceção do Nest
- `specs/0006-api-assinaturas-e-papel-de-suporte.md` — `PlanExpiredException`, os erros do
  suporte e o `403` do `SystemRoleGuard`
- `specs/0007-api-perfil-do-usuario.md` — o `401` do perfil
- `apps/api/src/common/pipes/zod-validation.pipe.ts`, `apps/api/src/app.setup.ts`
- Os pontos que lançam erro hoje: `auth.service.ts`, `subscriptions.service.ts`,
  `plan-expired.exception.ts`, `users.service.ts`, `profile.service.ts`,
  `subscription.schemas.ts` (os `custom` do `superRefine`)

## Escopo

**Entra:**

- `src/common/errors/`: o catálogo (`error-codes.ts`) e a `AppException`
- `src/common/filters/`: um filtro global que monta todo corpo de erro, registrado no
  `configureApp`
- Troca de todos os erros lançados hoje pela `AppException` com o código do catálogo
- `ZodValidationPipe` com `code` e `params` por campo
- Testes atualizados para o corpo novo, e testes do filtro e do pipe
- Nota datada no fim da 0001, da 0004 e da 0006, e o "Contratos em vigor" do `specs/README.md`

## Não entra

- i18n na API, `Accept-Language`, mensagem em português no corpo
- **E-mail**: os modelos continuam em português, como a 0003 decidiu. É o único texto ao usuário
  que sai do servidor
- As mensagens em português do web e o pacote compartilhado do catálogo entre API e web — vêm com
  o web. Até lá, o catálogo da API é a fonte, e o web o espelha
- Mudar status HTTP de qualquer erro: só o corpo muda
- Mensagens dos erros de env na partida (`validateEnv`): não são resposta HTTP

## Decisões já tomadas

### Corpo de erro

```json
{
  "statusCode": 403,
  "code": "PLAN_LIMIT_REACHED",
  "message": "Plan limit reached",
  "params": { "limit": "organizations", "max": 1 }
}
```

- **`statusCode`, `code` e `message` sempre.** `params` só quando o erro tem dados que o web
  precisa para a frase; `errors` só no `VALIDATION_FAILED`. Nenhum outro campo: o `error` que o
  Nest acrescenta (`"Forbidden"`, `"Not Found"`) some
- **`code` é contrato; `message` não.** O web nunca compara `message`. Trocar o texto em inglês
  não quebra nada; trocar ou remover um código é mudança de contrato e pede spec
- **`message` é a frase em inglês do catálogo**, legível em log e curl. Não carrega dado variável
  (e-mail, slug, id): o que varia vai em `params`

### Catálogo

- **Um objeto só em `src/common/errors/error-codes.ts`**, com status e mensagem de cada código:

  ```ts
  export const ERRORS = {
    VALIDATION_FAILED: { status: 400, message: 'Validation failed' },
    PLAN_EXPIRED: { status: 403, message: 'Plan expired' },
    // …
  } as const satisfies Record<string, { status: HttpStatus; message: string }>

  export type ErrorCode = keyof typeof ERRORS
  ```

- **`AppException`** estende `HttpException` e é o único jeito de lançar erro de regra:

  ```ts
  throw new AppException('USER_NOT_FOUND')
  throw new AppException('PLAN_LIMIT_REACHED', { limit: 'organizations', max: 1 })
  ```

  Status e mensagem vêm do catálogo; quem lança não os repete

- **`PlanExpiredException` continua existindo** (a 0006 a entregou como contrato e a 0009 a usa),
  agora como `AppException('PLAN_EXPIRED')`
- **Spec que cria erro novo acrescenta o código ao catálogo**, com status e mensagem, e lista os
  seus numa tabela própria
- **Códigos de domínio são específicos** (`SUBSCRIPTION_NOT_FOUND`, não `NOT_FOUND` com
  `params.entity`): o web associa uma frase por código, sem lógica

Códigos de hoje:

| código                     | status | mensagem                          | onde                                    |
| -------------------------- | ------ | --------------------------------- | --------------------------------------- |
| `VALIDATION_FAILED`        | 400    | Validation failed                 | `ZodValidationPipe` (0001)              |
| `UNAUTHORIZED`             | 401    | Unauthorized                      | `JwtAuthGuard`, `refresh`, `me`, perfil |
| `INVALID_OR_EXPIRED_CODE`  | 401    | Invalid or expired code           | `sign-in` (0004)                        |
| `EMAIL_ALREADY_REGISTERED` | 409    | Email already registered          | `sign-up` (0004)                        |
| `OTP_COOLDOWN`             | 429    | Wait before requesting a new code | `sign-up` (0004)                        |
| `EMAIL_SEND_FAILED`        | 503    | Could not send email              | `sign-up`, `code` (0004)                |
| `FORBIDDEN`                | 403    | Forbidden                         | `SystemRoleGuard` (0006)                |
| `USER_NOT_FOUND`           | 404    | User not found                    | suporte e `system-role` (0006)          |
| `SUBSCRIPTION_NOT_FOUND`   | 404    | Subscription not found            | suporte (0006)                          |
| `PLAN_DOES_NOT_EXPIRE`     | 409    | Plan does not expire              | `extend` (0006)                         |
| `CANNOT_CHANGE_MASTER`     | 409    | Cannot change the master          | `system-role` (0006)                    |
| `PLAN_EXPIRED`             | 403    | Plan expired                      | `PlanExpiredException` (0006)           |
| `NOT_FOUND`                | 404    | Not found                         | rota inexistente                        |
| `BAD_REQUEST`              | 400    | Bad request                       | corpo que não é JSON válido             |
| `INTERNAL_ERROR`           | 500    | Internal server error             | erro não tratado                        |

- **O `403` do `SystemRoleGuard` vira `FORBIDDEN`** com a mensagem `"Forbidden"` (era
  `"Forbidden resource"`, do Nest). O guard passa a lançar `AppException('FORBIDDEN')` em vez de
  devolver `false`
- **O `401` de token ausente, inválido ou vencido** vem do Passport como `UnauthorizedException`
  sem código; o filtro o traduz para `UNAUTHORIZED` (ver "Filtro"). Os `401` lançados à mão no
  `auth.service` e no `profile.service` passam a `AppException('UNAUTHORIZED')`

### Filtro

- **`AppExceptionFilter` com `@Catch()`** (pega tudo), registrado no `configureApp` com
  `app.useGlobalFilters`. Assim o `main.ts` e os e2e têm o mesmo corpo, como a 0004 quis para o
  resto da configuração
- **`AppException`**: corpo do catálogo, com `params` e `errors` se houver
- **Outra `HttpException`** (as do Nest, do Passport, do body-parser): o código sai do status —
  `400 → BAD_REQUEST`, `401 → UNAUTHORIZED`, `403 → FORBIDDEN`, `404 → NOT_FOUND`, `429 →
TOO_MANY_REQUESTS`, outro 4xx → `HTTP_ERROR`, 5xx → `INTERNAL_ERROR` — e a mensagem é a do
  catálogo para esse código, não a do Nest (o `"Cannot GET /api/x"` da rota inexistente vira
  `"Not found"`). `TOO_MANY_REQUESTS` e `HTTP_ERROR` entram no catálogo também
- **Qualquer outro erro** responde `500` `INTERNAL_ERROR`, sem detalhe no corpo, e é registrado
  com `Logger.error` e o stack. Nada de mensagem de exceção interna ou do Prisma chegando ao
  cliente
- O filtro não registra os 4xx: são respostas esperadas

### Validação

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "errors": [
    {
      "path": "name",
      "code": "too_big",
      "message": "…",
      "params": { "origin": "string", "maximum": 120, "inclusive": true }
    },
    { "path": "email", "code": "invalid_format", "message": "…", "params": { "format": "email" } }
  ]
}
```

- **`code` do item é o código do issue do Zod 4** (`invalid_type`, `too_small`, `too_big`,
  `invalid_format`, `invalid_value`, `unrecognized_keys`…), em minúsculas como o Zod os define.
  São de outra família que os da tabela, e o web os traduz à parte
- **`params` do item** é só o que a frase precisa, por código:

  | código              | `params`                         |
  | ------------------- | -------------------------------- |
  | `too_small`         | `origin`, `minimum`, `inclusive` |
  | `too_big`           | `origin`, `maximum`, `inclusive` |
  | `invalid_type`      | `expected`                       |
  | `invalid_format`    | `format`                         |
  | `invalid_value`     | `values`                         |
  | `unrecognized_keys` | `keys`                           |
  | outros              | ausente                          |

  Números `bigint` saem como número; o valor recebido (`input`) nunca vai no corpo

- **Regra própria (`custom`) tem código próprio.** Quem cria o issue passa
  `params: { code: 'GRACE_DOES_NOT_EXPIRE' }`; o item sai com esse `code` e com o resto de
  `params`, se houver. Issue `custom` sem `params.code` sai como `custom`. Os dois de hoje, em
  `subscription.schemas.ts`:
  - `GRACE` com `expiresAt` → `GRACE_DOES_NOT_EXPIRE`
  - `TRIAL` com `expiresAt` no passado → `DATE_NOT_IN_FUTURE`
- **`message` do item continua** a do Zod, em inglês, para log e curl
- **`path` continua** como está (caminho com `.`; vazio quando o erro é do valor inteiro, como o
  `:email` do caminho)

### Testes

- Os testes que conferem corpo de erro passam a conferir `code`. Onde hoje comparam `message`,
  trocam por `code` — é o que o web vai fazer
- O filtro tem teste próprio: `AppException` com e sem `params`, exceção do Nest de cada status
  mapeado, erro qualquer virando `500` sem detalhe e com log
- O pipe tem teste dos `params` de cada código da tabela e do `custom` com e sem `params.code`

## Critérios de aceite

- [x] Todo corpo de erro tem `statusCode`, `code` e `message`, e nenhum tem o campo `error`
- [x] O catálogo tem todos os códigos das tabelas, com status e mensagem; nenhum serviço repete
      status ou mensagem ao lançar
- [x] Nenhum `new XxxException({ statusCode, message })` sobra em `src/`: os erros de regra são
      `AppException`
- [x] Os status HTTP de todos os erros de antes continuam os mesmos
- [x] O `401` do token ausente e o `404` de rota inexistente saem com `UNAUTHORIZED` e
      `NOT_FOUND`; o `403` do `SystemRoleGuard`, com `FORBIDDEN`
- [x] Erro não tratado responde `500 INTERNAL_ERROR` sem detalhe, e o stack vai para o log
- [x] Validação devolve `code` e `params` por campo conforme a tabela; os dois `custom` da
      assinatura saem com `GRACE_DOES_NOT_EXPIRE` e `DATE_NOT_IN_FUTURE`
- [x] O filtro é registrado no `configureApp`, e os e2e o exercitam
- [x] Notas datadas na 0001, na 0004 e na 0006; "Contratos em vigor" do README atualizado (o item
      "a exceção do Nest recebe o objeto `{ statusCode, message }`" dá lugar à `AppException` e ao
      catálogo)
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

grep -rnE "Exception\(\{ *statusCode" apps/api/src            # nada

pnpm dev:api &
sleep 8
API=localhost:3001/api
J='content-type: application/json'
login() {
  code=$(pnpm -s otp "$1" | cut -d' ' -f1)
  curl -s -X POST $API/auth/sign-in -H "$J" -d "{\"email\":\"$1\",\"code\":\"$code\"}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'
}
MST=$(login "$(grep ^ROOT_EMAIL apps/api/.env | cut -d= -f2)")
USR=$(login teacher@schdlr.dev)

curl -s $API/profile                                                     # 401 UNAUTHORIZED, sem "error"
curl -s $API/nao-existe -H "Authorization: Bearer $USR"                  # 404 NOT_FOUND, "Not found"
curl -s -X POST $API/auth/sign-in -H "$J" -d '{"email":"x"}'             # 400 VALIDATION_FAILED, invalid_format e invalid_type
curl -s -X POST $API/auth/sign-in -H "$J" -d '{bad json'                 # 400 BAD_REQUEST
curl -s -X POST $API/auth/sign-in -H "$J" \
  -d '{"email":"teacher@schdlr.dev","code":"000000"}'                    # 401 INVALID_OR_EXPIRED_CODE
curl -s -X PATCH $API/profile -H "Authorization: Bearer $USR" -H "$J" \
  -d "{\"name\":\"$(printf 'a%.0s' {1..121})\"}"                         # 400, too_big com maximum 120
curl -s $API/support/subscriptions/teacher@schdlr.dev \
  -H "Authorization: Bearer $USR"                                        # 403 FORBIDDEN
curl -s $API/support/subscriptions/teacher@schdlr.dev \
  -H "Authorization: Bearer $MST"                                        # 404 SUBSCRIPTION_NOT_FOUND
curl -s -X PUT $API/support/subscriptions/teacher@schdlr.dev \
  -H "Authorization: Bearer $MST" -H "$J" \
  -d '{"plan":"GRACE","expiresAt":"2030-01-01T00:00:00Z"}'               # 400, GRACE_DOES_NOT_EXPIRE
curl -s -X POST $API/support/subscriptions/admin@schdlr.dev/extend \
  -H "Authorization: Bearer $MST"                                        # 409 PLAN_DOES_NOT_EXPIRE
kill %1
```

Ao final, apagar os códigos OTP e refresh tokens dos logins. Nada mais é gravado.

## Registro

**2026-10-30** — executada com `/spec 0008`, na branch `development`.

Commits: `feat(api): códigos de erro (spec 0008)`.

Verificação: `pnpm install --frozen-lockfile` ok; sem `.env`, `pnpm test:api` passa (120
unitários, 35 e2e) e `pnpm build:api` também; lint limpo; `pnpm format` estável; o grep de
`Exception({ statusCode` sai vazio. Contra o banco de dev: sem token → `401 UNAUTHORIZED`; rota
inexistente → `404 NOT_FOUND "Not found"`; `sign-in` com `{"email":"x"}` → `400
VALIDATION_FAILED` com `invalid_format` (`format: "email"`) e `invalid_type` (`expected:
"string"`); JSON quebrado → `400 BAD_REQUEST`; código errado → `401 INVALID_OR_EXPIRED_CODE`; nome
de 121 caracteres → `too_big` com `maximum: 120`; `USER` no suporte → `403 FORBIDDEN`; `teacher@`
sem assinatura → `404 SUBSCRIPTION_NOT_FOUND`; `GRACE` com `expiresAt` → `GRACE_DOES_NOT_EXPIRE`;
`extend` do `admin@` → `409 PLAN_DOES_NOT_EXPIRE`. Nenhum corpo trouxe o campo `error`. No fim,
os códigos OTP e refresh tokens dos logins foram apagados.

Desvios:

- **O `503` do `GET /api/health` fica fora do filtro**, decidido com o usuário: a spec não falava
  do health, e a leitura literal ("5xx → `INTERNAL_ERROR`") apagaria qual indicador caiu. O
  controller pega a `ServiceUnavailableException` do terminus e devolve o corpo dela com o status
  `503` (`@Res({ passthrough: true })`). É resposta de monitoramento, não erro que o web trata; o
  e2e do health não mudou.
- **`HttpException` não-`AppException` mantém o status original**, como "só o corpo muda" pede: um
  `410` sai `410 HTTP_ERROR`, um `503` sai `503 INTERNAL_ERROR`. O `status` de `HTTP_ERROR` no
  catálogo (`400`) é só o padrão. Mensagens que a spec não fixava: `TOO_MANY_REQUESTS` → `"Too many
requests"`, `HTTP_ERROR` → `"Request failed"`.
- **O filtro registra os 5xx** que vêm como `HttpException` (com stack), além do erro qualquer; os
  4xx, não. O `EMAIL_SEND_FAILED` (`503`, `AppException`) não é registrado de novo: o
  `MailService` já o registra.
- **`AppException(code, params?, errors?)`**: o terceiro argumento só o pipe usa. Os tipos
  `ErrorBody` e `ValidationErrorItem` moram em `app.exception.ts`, e `getBody()` dá o corpo (usado
  pelo filtro e pelos testes).
- **O `SystemRoleGuard` lança `FORBIDDEN` também sem `request.user`**, caso que antes devolvia
  `false`.
- **`params` do `invalid_value` converte `bigint` em número**, como no `too_small`/`too_big`.
- Testes além dos pedidos: o e2e do perfil cobre rota inexistente, JSON inválido e o `500`; o do
  suporte, o `GRACE_DOES_NOT_EXPIRE` e um erro de service com código; o spec do schema de
  assinatura confere os dois `params.code`.
