---
id: 0003
title: Envio de e-mail
status: todo
depends_on: [0001, 0002]
---

# 0003 — Envio de e-mail

## Objetivo

A API passa a ter um `MailService` global que envia e-mail pelo Gmail quando
`MAIL_ENABLED=true` e, quando `MAIL_ENABLED=false`, só registra no log o que teria enviado.
A spec também entrega o primeiro modelo de mensagem, o do código OTP, porque o login depende
dele. O log nunca mostra o corpo da mensagem, e por isso nunca mostra o código.

Nenhum endpoint entra aqui. A spec de auth por OTP (0004) chama `sendOtpCode`; convite,
aceitar/recusar e as demais chamam `send` com o próprio modelo.

⚠️ **Esta spec estabelece contrato** (a interface do `MailService`, o formato da linha de log
e a regra de que o corpo nunca vai para o log). Deve ser executada sozinha, com `/spec 0003`.

## Por que existe

Quase todo fluxo da v1 manda e-mail: o código de acesso, o convite para unidade e os botões
ACEITAR/RECUSAR. Sem um módulo único, cada spec decidiria sozinha como enviar, o que logar e
o que fazer quando o envio está desligado. No ambiente local não há envio de verdade, e o
código do OTP chega ao desenvolvedor por um script da 0004, não pelo log.

## Contexto necessário

- `specs/0001-api-boilerplate-nestjs.md` — estrutura de pastas (`src/infra/`), aliases,
  `ConfigService<Env, true>`, a regra "variável entra no schema do env com a spec que a usa" e
  o Registro, que explica por que a seção E-mail do `.env.example` não tem `SMTP_*`
- `specs/0002-api-schema-do-dominio.md` — enum `OtpPurpose` (`SIGN_UP`, `SIGN_IN`)
- `apps/api/src/config/env.schema.ts` — onde as variáveis `MAIL_*` entram
- `apps/api/src/infra/database/` — modelo de módulo global de infra a seguir
- `apps/api/.env.example` — seção E-mail
- `apps/api/test/setup-env.ts` — env do e2e

## Escopo

**Entra:**

- `src/infra/mail/`:

  ```
  src/infra/mail/
  ├── mail.module.ts          # @Global, exporta MailService
  ├── mail.service.ts         # send() e sendOtpCode()
  ├── mail.service.spec.ts
  ├── mail.transport.ts       # token MAIL_TRANSPORT + factory do nodemailer
  ├── mail.types.ts           # MailMessage
  └── templates/
      ├── otp-code.template.ts
      └── otp-code.template.spec.ts
  ```

- `MailModule` importado no `AppModule`
- As variáveis `MAIL_ENABLED`, `MAIL_FROM`, `MAIL_USER` e `MAIL_PASS` no `envSchema`
- `MAIL_ENABLED=false` e `MAIL_FROM` no `test/setup-env.ts`
- Seção E-mail do `apps/api/.env.example` sem a linha "Ainda não lido pela API"
- Dependências `nodemailer` e `@types/nodemailer` (dev)

## Não entra

- Endpoints de auth, geração, hash ou validação do código OTP — isso é da 0004. Esta spec
  recebe o código pronto e só o põe na mensagem
- Tamanho do código, validade e limite de tentativas — decisões da 0004. O modelo recebe a
  validade como parâmetro
- Modelos de convite, aceitar/recusar e qualquer outro além do OTP. Cada um entra com a spec
  do fluxo que o usa
- Ler `WEB_APP_URL` — entra com a primeira spec que montar link em e-mail
- Fila, retry, envio em segundo plano, Redis
- Guardar no banco os e-mails enviados
- Motor de template (Handlebars, MJML, React Email) e anexos
- Outro provedor além do Gmail, e variáveis `SMTP_HOST`/`SMTP_PORT`
- Rate limit de envio
- Enviar e-mail de verdade nos testes ou no CI

## Decisões já tomadas

### Módulo

- **Mora em `src/infra/mail/`**, ao lado de `database/`: é infraestrutura, não domínio. O
  módulo é `@Global()`, e quem envia injeta `MailService` sem importar `MailModule`
- **Transporte pelo `nodemailer`, com `service: 'gmail'`**, autenticado com `MAIL_USER` e
  `MAIL_PASS` (senha de app do Google). Provedor novo pede spec nova, com as variáveis de host e
  porta
- **O transporte é um provider próprio (`MAIL_TRANSPORT`)**, criado por factory a partir do
  `ConfigService`. Com `MAIL_ENABLED=false` a factory devolve `null` e nenhum transporte é
  criado. Os testes substituem o provider por um dublê com `sendMail` em `jest.fn()`
- **A partida não depende do Gmail.** Com `MAIL_ENABLED=true`, o `onModuleInit` chama
  `transport.verify()`; se falhar, registra `warn` e a app sobe igual. Gmail fora do ar não
  derruba a API
- **`MAIL_FROM` é o remetente de toda mensagem**

### Interface

O contrato que as próximas specs usam:

```ts
// mail.types.ts
export type MailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

// mail.service.ts
send(message: MailMessage): Promise<void>
sendOtpCode(input: {
  to: string
  code: string
  purpose: OtpPurpose
  expiresInMinutes: number
}): Promise<void>
```

- **`send` é o único caminho de envio.** `sendOtpCode` monta a mensagem pelo modelo e chama
  `send`. Spec nova que precisar de outro e-mail cria o próprio modelo em `templates/` e um
  método `sendX` no service, no mesmo padrão
- **Modelo é função pura** que recebe os dados e devolve `{ subject, text, html }`. Sem
  arquivo `.hbs`, sem leitura de disco. O texto é em português; o código, em inglês
- **`text` é obrigatório, `html` é opcional.** Todo e-mail tem versão em texto puro
- **Falha de envio vira exceção.** Com `MAIL_ENABLED=true`, se o `sendMail` rejeitar, o
  service registra `error` (destinatário, assunto e mensagem do erro) e relança. Quem chamou
  decide a resposta HTTP. Não há retry

### Log

- **Com `MAIL_ENABLED=false`, `send` não envia nada**: registra uma linha `log` com contexto
  `MailService` e resolve normalmente, como se tivesse enviado:

  ```
  [mail desligado] para=ana@ifce.edu.br assunto="Seu código de acesso ao schdlr"
  ```

- **Com `MAIL_ENABLED=true`**, depois de enviar, registra a mesma linha com o prefixo
  `[mail enviado]`
- **O corpo da mensagem nunca vai para o log**, em nenhum ambiente: ele carrega código e, nas
  próximas specs, tokens de convite. A linha é sempre só destinatário e assunto
- Com `MAIL_ENABLED=false` o código do OTP não chega a ninguém pelo e-mail. No ambiente local,
  quem resolve isso é o script da 0004. Produção tem de rodar com o envio ligado

### Modelo do OTP

- **Assunto por propósito:** `SIGN_IN` → "Seu código de acesso ao schdlr"; `SIGN_UP` →
  "Confirme seu cadastro no schdlr"
- **O corpo traz o código em destaque e a validade** ("O código vale por N minutos."), e a
  frase "Se não foi você, ignore este e-mail." O valor de N vem de `expiresInMinutes`; quem o
  fixa é a 0004
- **O HTML é uma tabela simples com estilo inline**, sem imagem, sem link e sem CSS externo

### Env

```ts
MAIL_ENABLED: z.stringbool().default(false),
MAIL_FROM: z.string().min(1),
MAIL_USER: z.email().optional(),
MAIL_PASS: z.string().optional(),
```

- **`MAIL_ENABLED` usa `z.stringbool()`**, não `z.coerce.boolean()`: o coerce transforma a
  string `"false"` em `true`
- **Valor vazio conta como ausente.** `MAIL_USER=` e `MAIL_PASS=` vazios, como no
  `.env.example`, viram `undefined` antes da validação
- **Com `MAIL_ENABLED=true`, `MAIL_USER` e `MAIL_PASS` são obrigatórios.** Um `superRefine`
  acusa cada uma que faltar, com o nome da variável no `path`, e a app não sobe. Com
  `MAIL_ENABLED=false` elas são ignoradas
- `MAIL_PASS` aceita espaços: a senha de app do Google vem em quatro grupos

## Critérios de aceite

- [ ] `MailService` e `MailMessage` têm exatamente as assinaturas da seção "Interface"
- [ ] `MailModule` é global e está no `AppModule`; nenhum outro módulo o importa
- [ ] Com `MAIL_ENABLED=false`, `send` não chama o transporte e registra `[mail desligado]` com
      destinatário e assunto
- [ ] Com `MAIL_ENABLED=true`, `send` chama `sendMail` com `from: MAIL_FROM`, `to`, `subject`,
      `text` e `html`, e registra `[mail enviado]`
- [ ] Falha do `sendMail` registra `error` e a promessa de `send` rejeita
- [ ] O corpo (`text`, `html`) nunca aparece no log, e a linha do `sendOtpCode` não contém o
      código — coberto por teste
- [ ] O modelo do OTP muda o assunto conforme o `purpose` e traz código e validade no `text` e
      no `html`
- [ ] `MAIL_ENABLED=true` sem `MAIL_USER` ou sem `MAIL_PASS`: a app não sobe e a mensagem
      nomeia a variável
- [ ] `MAIL_ENABLED=false` com `MAIL_USER=` e `MAIL_PASS=` vazios: a app sobe
- [ ] `MAIL_ENABLED=true` com credencial errada: a app sobe e registra `warn` do `verify`
- [ ] A seção E-mail do `.env.example` não tem mais a linha "Ainda não lido pela API"
- [ ] `pnpm test:api` passa sem `.env`; `pnpm build:api` e o lint passam
- [ ] Envio real conferido à mão (ver "Verificação")

## Verificação

```bash
pnpm install --frozen-lockfile

# sem .env
mv apps/api/.env apps/api/.env.bak 2>/dev/null
pnpm test:api
pnpm build:api
mv apps/api/.env.bak apps/api/.env 2>/dev/null

pnpm --filter @schdlr/api lint
pnpm format && git status --porcelain           # nada

# env inválido
MAIL_ENABLED=true MAIL_USER= pnpm --filter @schdlr/api start 2>&1 | grep MAIL_USER
MAIL_ENABLED=true MAIL_PASS= pnpm --filter @schdlr/api start 2>&1 | grep MAIL_PASS

# desligado: a app sobe com o .env.example como está
pnpm dev:api    # sobe; nenhum warn de mail

grep -rn "process\.env" apps/api/src | grep -v "^apps/api/src/config/"   # nada
```

**Envio real, à mão.** Não há endpoint ainda, então o envio se confere por um script
descartável (não commitado) que cria a app com `NestFactory.createApplicationContext`, pega o
`MailService` e chama `sendOtpCode` para o e-mail do `ROOT_EMAIL`, com `MAIL_ENABLED=true` e as
credenciais do `.env`. Conferir que o e-mail chega, com o assunto, o código e a validade certos.

## Registro

_(vazio)_
