---
id: 0004
title: Auth por OTP
status: done
depends_on: [0001, 0002, 0003]
---

# 0004 — Auth por OTP

## Objetivo

Um usuário consegue se cadastrar, receber por e-mail um código de confirmação, entrar com ele,
manter a sessão por refresh token e sair. Toda a autenticação é por código enviado ao e-mail
(OTP): não há senha. As rotas ficam em `/api/auth`, sobre as tabelas `users`, `otp_codes` e
`refresh_tokens` da 0002, e o e-mail sai pelo `MailService` da 0003.

É a primeira spec que usa o `JwtAuthGuard` da 0001 de verdade (`GET /api/auth/me`), e as
seguintes dependem dela para saber quem está chamando.

Para o desenvolvimento local, onde o e-mail está desligado, um script `pnpm otp [email]` emite
um código válido e o imprime no console.

⚠️ **Esta spec estabelece contrato** (rotas e respostas de auth, o cookie do refresh token, o
formato do usuário autenticado e as constantes do OTP). Deve ser executada sozinha, com
`/spec 0004`.

## Contexto necessário

- `specs/0001-api-boilerplate-nestjs.md` — guard global, `@Public()`, `@CurrentUser()`,
  `JwtPayload = { sub }`, `ZodValidationPipe` e o corpo `400`, a regra de `process.env`, e o
  Registro (rota inexistente dá `404`)
- `specs/0002-api-schema-do-dominio.md` — models `User`, `OtpCode`, `RefreshToken`, enum
  `OtpPurpose`, e a linha de `User` e `OtpCode` em "Regras que ficam com a aplicação"
- `specs/0003-api-envio-de-email.md` — `MailService.sendOtpCode` e o comportamento com
  `MAIL_ENABLED=false`
- `apps/api/src/modules/auth/` — o que a 0001 deixou: strategy, guard, decorators, módulo
- `apps/api/src/main.ts` e `apps/api/test/health.e2e-spec.ts` — o e2e repete à mão o que o
  `main.ts` configura
- `apps/api/src/config/env.schema.ts` e `apps/api/.env.example` (seção Auth)
- `package.json` da raiz — scripts

## Escopo

**Entra:**

- Rotas em `src/modules/auth/`:

  | rota                     | acesso    | sucesso                                |
  | ------------------------ | --------- | -------------------------------------- |
  | `POST /api/auth/sign-up` | público   | `202`, envia código `SIGN_UP`          |
  | `POST /api/auth/code`    | público   | `202`, envia código se o e-mail existe |
  | `POST /api/auth/sign-in` | público   | `200`, access token + cookie           |
  | `POST /api/auth/refresh` | público   | `200`, access token novo + cookie novo |
  | `POST /api/auth/logout`  | público   | `204`, revoga e apaga o cookie         |
  | `GET /api/auth/me`       | com token | `200`, usuário autenticado             |

- `OtpService` (gerar, gravar e conferir código) e `SessionService` (emitir, girar e revogar
  refresh token), separados do `AuthService`, que orquestra
- Schemas Zod de entrada em `src/modules/auth/schemas/`, aplicados com o `ZodValidationPipe`
- `src/modules/auth/auth.constants.ts` com as constantes do OTP e do cookie
- `REFRESH_TOKEN_TTL_DAYS` no `envSchema`
- `cookie-parser` e `@types/cookie-parser` (dev)
- `src/app.setup.ts` com `configureApp(app)`: prefixo, CORS, `cookieParser()` e shutdown hooks.
  O `main.ts` e os e2e passam a chamá-lo, em vez de repetir a configuração
- Script `apps/api/scripts/otp.ts`, script `otp` em `apps/api/package.json` e `otp` na raiz
- Lint passando a cobrir `scripts/`

## Não entra

- Convite para unidade, papéis, `RolesGuard`, permissão por organização ou unidade
- Assinatura e plano: o cadastro cria o usuário **sem** `Subscription`, como a 0002 decidiu
- Trocar nome ou e-mail do usuário, desativar usuário, listar sessões
- Login social, senha, 2FA
- Rate limit genérico (`@nestjs/throttler`). Só entra o intervalo mínimo entre pedidos de
  código, descrito abaixo
- Limpeza de códigos e refresh tokens vencidos
- Seed do root e do tenant de teste
- Teste automatizado contra Postgres de verdade. O fluxo com banco é conferido à mão
- Telas do app web

## Decisões já tomadas

### OTP

- **Constantes em código**, em `auth.constants.ts`, não em env: `OTP_LENGTH = 6`,
  `OTP_TTL_MINUTES = 10`, `OTP_MAX_ATTEMPTS = 5`, `OTP_RESEND_COOLDOWN_SECONDS = 60`
- **O código tem 6 dígitos**, gerado com `crypto.randomInt(0, 1_000_000)` e completado com
  zeros à esquerda
- **Gravado como HMAC-SHA256 com `JWT_SECRET` como chave**, em hexadecimal, em `code_hash`. Hash
  puro de 6 dígitos se quebra em segundos com o banco na mão; a chave fica fora do banco. Trocar
  o `JWT_SECRET` invalida os códigos em aberto, o que dura no máximo 10 minutos. A comparação usa
  `crypto.timingSafeEqual`
- **Só o código mais recente vale.** O "código utilizável" de um usuário é o `OtpCode` mais
  recente dele, de qualquer propósito, com `consumedAt` nulo, `expiresAt` no futuro e
  `attempts < OTP_MAX_ATTEMPTS`. Emitir um código novo não precisa tocar nos anteriores: eles
  deixam de ser o mais recente
- **Código errado soma uma tentativa** no código utilizável. Na quinta, ele morre, e é preciso
  pedir outro
- **Intervalo mínimo de 60 s entre emissões** para o mesmo usuário, contado do `createdAt` do
  último `OtpCode`. O script de dev não respeita o intervalo
- **O propósito sai do estado do usuário**: `emailVerifiedAt` nulo → `SIGN_UP`; preenchido →
  `SIGN_IN`. Entrar com um código `SIGN_UP` preenche `emailVerifiedAt`
- O e-mail sai por `MailService.sendOtpCode` com `expiresInMinutes: OTP_TTL_MINUTES`. É o
  e-mail de confirmação do cadastro que já traz o código

### Fluxos

- **E-mail é normalizado** (`trim` e minúsculas) pelo schema Zod da entrada, antes de qualquer
  consulta, como a 0002 manda
- **`sign-up` recebe `{ name, email }`:**
  - e-mail novo → cria o `User` (`systemRole: USER`, sem assinatura) e envia código `SIGN_UP`
  - e-mail existente e não verificado → atualiza o `name` e envia novo código `SIGN_UP`,
    respeitando o intervalo de 60 s (`429` se cair dentro dele)
  - e-mail existente e verificado → `409` `{ statusCode, message: "Email already registered" }`
- **`code` recebe `{ email }` e responde `202` sempre**, exista o e-mail ou não, para não revelar
  quem tem conta. Só envia se o usuário existe e está ativo e se o intervalo de 60 s já passou;
  caso contrário, não faz nada e responde igual
- **`sign-in` recebe `{ email, code }`.** Usuário inexistente, inativo, sem código utilizável ou
  com código errado: todos dão `401` `{ statusCode, message: "Invalid or expired code" }`, a
  mesma resposta. Sucesso: marca `consumedAt`, preenche `emailVerifiedAt` se for `SIGN_UP`, emite
  a sessão e responde `{ accessToken, user }`
- **Falha do envio de e-mail** em `sign-up` e `code` vira `503`
  `{ statusCode, message: "Could not send email" }`. O usuário criado no `sign-up` fica: pedir
  código de novo resolve
- **Formato do usuário** em `sign-in` e `me`, que as próximas specs reaproveitam:

  ```json
  { "id": "…", "email": "ana@ifce.edu.br", "name": "Ana", "systemRole": "USER" }
  ```

### Sessão

- **Access token no corpo, refresh token em cookie.** O access token é o JWT da 0001 (`{ sub }`,
  `JWT_EXPIRES_IN`); o web o guarda em memória
- **Cookie `schdlr_refresh`**: `httpOnly`, `sameSite: 'lax'`, `secure` só em
  `NODE_ENV=production`, `path: '/api/auth'`, `maxAge` de `REFRESH_TOKEN_TTL_DAYS` dias
- **Refresh token é opaco**, 32 bytes aleatórios em base64url, não um JWT. No banco vai o
  SHA-256 dele em `token_hash`; aqui o hash puro basta, porque o valor tem 256 bits de entropia
- **Rotação a cada `refresh`**: o token usado ganha `revokedAt` e um novo é emitido
- **Reuso de token revogado revoga todas as sessões ativas do usuário** e dá `401`. É o sinal de
  que o token vazou
- **`refresh` sem cookie, ou com token desconhecido, vencido ou revogado**: `401` e o cookie é
  apagado. Usuário inativo também dá `401`
- **`logout` é idempotente**: revoga o token do cookie, se houver e for válido, apaga o cookie e
  responde `204` em qualquer caso
- **`me` consulta o banco**: usuário inexistente ou inativo dá `401`. A `JwtStrategy` continua
  sem consultar o banco, como a 0001 decidiu; quem precisa do usuário atual busca

### Configuração da app

- **`configureApp(app)` em `src/app.setup.ts`** concentra prefixo, CORS, `cookieParser()` e
  shutdown hooks. O `main.ts` chama e depois faz `listen`; os e2e chamam no lugar do
  `setGlobalPrefix` manual. Isso muda uma decisão registrada da 0001 (o e2e aplicar o prefixo
  à mão): na execução, acrescentar a nota datada lá
- **`REFRESH_TOKEN_TTL_DAYS`** entra no `envSchema` como `z.coerce.number().int().positive()
.default(7)`. No `.env.example` ele sai do bloco "Ainda não lido"; `UNIT_INVITE_TTL_DAYS` e
  `WEB_APP_URL` continuam marcados

### Script de OTP

- **`pnpm otp [email]` emite um código novo e o imprime.** O banco só tem o hash, então não há
  como ler o código que foi por e-mail; o script gera outro, grava como uma emissão normal e
  mostra o valor:

  ```
  $ pnpm otp ana@ifce.edu.br
  482913  ana@ifce.edu.br  SIGN_IN  vale até 14:32
  ```

- **Sem e-mail, o alvo é o dono do código utilizável mais recente do banco**, com o mesmo
  propósito daquele código. Se não houver nenhum, sai `1` com "Nenhum OTP válido no banco. Passe
  um e-mail."
- **Com e-mail**, emite para aquele usuário com o propósito tirado do `emailVerifiedAt`, mesmo
  que ele não tenha código em aberto. E-mail sem usuário: sai `1` com "Usuário não encontrado"
- **Não envia e-mail e não respeita o intervalo de 60 s.** O código impresso passa a ser o mais
  recente, então o que foi por e-mail deixa de valer
- **Só roda com `NODE_ENV=development`**; fora disso sai `1` sem tocar no banco
- **Sobe um contexto Nest** (`NestFactory.createApplicationContext(AppModule)`) e usa o
  `OtpService`, sem duplicar geração e hash. Roda com `ts-node -r tsconfig-paths/register`, não
  com `tsx`: o esbuild do `tsx` não emite metadado de decorator, e a injeção do Nest depende
  dele. Lê o env pelo `ConfigService`; nenhum `process.env`
- Na raiz, `"otp": "pnpm --filter @schdlr/api otp"`. Isso amplia a lista de scripts que a 0000
  fixou "exatamente": na execução, acrescentar a nota datada lá

## Critérios de aceite

- [x] As seis rotas respondem com os status e corpos da seção "Fluxos" e "Sessão"
- [x] Corpo inválido em qualquer rota dá o `400` da 0001, com `path` e `message`
- [x] `sign-up` com e-mail novo cria o usuário sem `Subscription` e envia um código `SIGN_UP`
- [x] `sign-up` com e-mail verificado dá `409`; não verificado reenvia, com `429` dentro de 60 s
- [x] `code` responde `202` para e-mail inexistente sem enviar nada
- [x] O código gravado é HMAC-SHA256 e nunca o valor em claro
- [x] Só o código mais recente vale; o quinto erro mata o código; código vencido dá `401`
- [x] `sign-in` com código `SIGN_UP` preenche `emailVerifiedAt`
- [x] O cookie `schdlr_refresh` sai com `HttpOnly`, `SameSite=Lax`, `Path=/api/auth` e, só em
      produção, `Secure`
- [x] `refresh` gira o token; reusar o token antigo dá `401` e revoga todas as sessões do
      usuário
- [x] `logout` responde `204` com e sem cookie, e o refresh revogado deixa de funcionar
- [x] `GET /api/auth/me` sem token dá `401`; com token devolve o formato do usuário
- [x] `pnpm otp <email>` imprime um código que funciona no `sign-in`; `pnpm otp` sem argumento
      pega o código utilizável mais recente; com `NODE_ENV=production`, sai `1`
- [x] `main.ts` e e2e usam `configureApp`; nenhum e2e chama `setGlobalPrefix` à mão
- [x] Notas datadas acrescentadas na 0000 (script `otp` na raiz) e na 0001 (`configureApp`)
- [x] Testes unitários de `OtpService` e `SessionService` com o `DatabaseService` substituído; e2e
      das rotas com os services substituídos, cobrindo status, corpo e atributos do cookie
- [x] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam
- [x] Nenhum `process.env` fora de `src/config/`, `prisma.config.ts` e `prisma/seed.ts`

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
grep -rn "process\.env" apps/api/src apps/api/scripts | grep -v "^apps/api/src/config/"   # nada

# fluxo de ponta a ponta contra o banco de dev, com MAIL_ENABLED=false
pnpm dev:api &
sleep 8
API=localhost:3001/api/auth
J='content-type: application/json'
curl -s -i -X POST $API/sign-up -H "$J" -d '{"name":"Ana","email":"Ana@IFCE.edu.br"}'   # 202
CODE=$(pnpm -s otp ana@ifce.edu.br | cut -d' ' -f1)
curl -s -c jar -X POST $API/sign-in -H "$J" -d "{\"email\":\"ana@ifce.edu.br\",\"code\":\"$CODE\"}"
#   200 { accessToken, user }; jar tem schdlr_refresh
TOKEN=...                                                         # accessToken da resposta
curl -s -H "Authorization: Bearer $TOKEN" $API/me                 # 200, systemRole USER
cp jar jar.old
curl -s -b jar -c jar -X POST $API/refresh                        # 200, cookie novo
curl -s -b jar.old -X POST $API/refresh -w '%{http_code}'         # 401 (reuso)
curl -s -b jar -X POST $API/refresh -w '%{http_code}'             # 401 (sessões revogadas)
curl -s -X POST $API/logout -w '%{http_code}'                     # 204
curl -s -X POST $API/code -H "$J" -d '{"email":"ninguem@x.dev"}' -w '%{http_code}'  # 202
kill %1

NODE_ENV=production pnpm otp ana@ifce.edu.br; echo $?             # 1
```

Ao final, apagar o usuário de teste do banco de dev ou deixar registrado no Registro que ele
ficou.

## Registro

**2026-10-30** — executada com `/spec 0004`, na branch `development`.

Commits: `feat(api): auth por OTP (spec 0004)` — implementação, notas na 0000 e na 0001,
Registro e status no mesmo commit.

Verificação: `pnpm install --frozen-lockfile` ok; sem `.env`, `pnpm test:api` passa (58
unitários, 13 e2e) e `pnpm build:api` gera `dist/main.js`; lint limpo; `pnpm format` estável; os
greps de `process.env` e `../../` saem vazios. Contra o banco de dev, com `MAIL_ENABLED=false`:
`sign-up` com `Ana@IFCE.edu.br` → `202` e o log `[mail desligado] … assunto="Confirme seu cadastro
no schdlr"`; repetir dentro de 60 s → `429`; `sign-up` de `admin@schdlr.dev` (verificado) → `409`;
`pnpm otp ana@ifce.edu.br` imprimiu um código `SIGN_UP`; código errado → `401`; código certo →
`200` com `{ accessToken, user }` e cookie `schdlr_refresh` `HttpOnly` em `/api/auth`; `me` sem
token `401`, com token `200`; `refresh` → `200`; reusar o cookie antigo → `401`, e o novo também
deixou de valer; `logout` sem cookie → `204`; `code` para e-mail inexistente → `202`. No banco,
`email_verified_at` preenchido, nenhuma assinatura, `code_hash` com 64 caracteres hexadecimais.
Depois: `pnpm otp` sem argumento achou o código em aberto da Ana; cinco erros seguidos mataram o
código (o certo deu `401` depois); um código emitido antes de outro deixou de valer;
`NODE_ENV=production pnpm otp` saiu `1`. O usuário de teste foi apagado no fim (cascade levou
códigos e refresh tokens); o banco voltou aos 5 usuários da seed da 0005.

Desvios:

- **O script com `NODE_ENV=production` conecta ao banco, mas não consulta.** O `NODE_ENV` é lido
  pelo `ConfigService`, e o contexto Nest abre a conexão do `DatabaseService` no `init`, antes da
  checagem. Nenhuma linha é lida ou gravada. Checar antes exigiria ler `process.env` no script.
- **Corpos de erro sem o campo `error`.** As exceções recebem o objeto `{ statusCode, message }`
  para que o corpo seja exatamente o da spec (o padrão do Nest acrescenta `error: "Conflict"`).
  O `401` do guard e do `refresh` continua o padrão do Nest
  (`{ message: "Unauthorized", statusCode: 401 }`). O `429` diz `"Wait before requesting a new
code"`, texto que a spec não fixava.
- **Refresh e consumo de código são à prova de corrida:** `updateMany` com `revokedAt: null` ou
  `consumedAt: null` no filtro. Dois `refresh` simultâneos com o mesmo token contam como reuso.
- **`requestCode` com falha de e-mail dá `503`**, como a spec manda. Isso revela que o e-mail
  existe só quando o envio falha.
- **`clearCookie` recebe as mesmas opções do cookie, com `maxAge`.** O Express 5 (o do Nest 11)
  ignora `maxAge` ao apagar; `path` e os demais atributos precisam bater.
- **Arquivos além dos listados:** `auth-user.ts` (`AuthUser` e `toAuthUser`, o formato que as
  próximas specs reaproveitam), `auth.constants.spec.ts` e `auth.service.spec.ts`. As opções do
  cookie saem de `refreshCookieOptions(isProduction, ttlDays)`, testada nos dois ambientes; o
  `Secure` em produção não é exercitado pelo e2e, que roda em `NODE_ENV=test`.
- **O teste do `JwtAuthGuard` da 0001 foi ajustado** (nota datada na 0001).
- **`.env.example`:** `REFRESH_TOKEN_TTL_DAYS` ganhou um comentário próprio e saiu do bloco
  "Ainda não lido"; `UNIT_INVITE_TTL_DAYS` e `WEB_APP_URL` continuam marcados.

## Notas posteriores

**2026-10-30 — spec 0008.** Os erros do auth deixaram de passar o objeto `{ statusCode, message }`
à exceção do Nest, como o Registro acima descreve: são `AppException` com código do catálogo
(`INVALID_OR_EXPIRED_CODE`, `EMAIL_ALREADY_REGISTERED`, `OTP_COOLDOWN`, `EMAIL_SEND_FAILED`,
`UNAUTHORIZED`), e o corpo é montado pelo `AppExceptionFilter`. Status e mensagens não mudaram; o
`401` do guard e do `refresh` também sai com `code: "UNAUTHORIZED"` e sem o campo `error`.
