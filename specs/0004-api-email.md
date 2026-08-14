---
id: 0004
title: Infraestrutura de e-mail
status: done
depends_on: [0002]
---

## Objetivo

Qualquer parte da aplicação consegue disparar um e-mail sem bloquear a resposta do request.

## Escopo

**Entra:**

- `MailModule` com Nodemailer, transporte configurado por ambiente
- `@nestjs/event-emitter`: o domínio emite evento, o mail escuta e envia
- Templates como funções TypeScript que devolvem HTML
- E-mail de boas-vindas ligado ao registro da spec 0003

**Não entra:**

- Fila (BullMQ/Redis) — decisão registrada abaixo
- Templates de convite (spec 0010) e de recuperação de senha (spec 0005), que só entram junto dos seus fluxos

## Decisões já tomadas

- **Envio por evento, nunca no caminho do request.** O service de domínio emite e devolve; falha de SMTP não pode virar erro 500 num cadastro que deu certo.
- **Sem fila por enquanto.** Já foi discutido: a fila só se paga com retry/DLQ de verdade, e isso é problema de quando houver volume. Se o login por OTP entrar, essa decisão precisa ser revista, porque aí o e-mail passa a ser caminho crítico.
- **Templates em TS, não em engine de template.** Poucos e-mails, tipagem no payload, zero dependência nova.
- **Uma constante por evento** (`MailEvent.Welcome`, etc.), com o payload tipado ao lado — evita string solta espalhada.
- Em desenvolvimento, sem SMTP configurado, o envio **loga em vez de falhar**.

## Critérios de aceite

- [x] Registrar um usuário dispara o e-mail de boas-vindas
- [x] SMTP indisponível não afeta a resposta do registro
- [x] Sem variáveis de SMTP no ambiente, a app sobe e o envio apenas loga
- [x] O payload de cada evento é tipado, sem `any`

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

25 testes unitários e 27 e2e passando. Conferido na app real sem SMTP: sobe avisando `SMTP_HOST is not set`, o registro responde 201 e o envio vira a linha `Mail not sent, no transport configured`. Dados do teste de fumaça removidos do banco de desenvolvimento.

- **commits:** `feat(api): infraestrutura de e-mail (spec 0004)` — branch `feature/infraestrutura-email`
- **desvios:**
  - **Módulo em `src/infra/mail/`**, junto do banco, e não em `src/modules/`. É infraestrutura: nenhum domínio o injeta, todos chegam nele por evento.
  - **Onde o erro é absorvido:** `MailService.send` deixa a falha de transporte subir, e o `MailListener` a captura e loga. A fronteira entre domínio e entrega fica num lugar só, e o service continua testável quanto a falhar de verdade.
  - **`SMTP_SECURE` é `z.enum(['true','false'])` com transform**, não `z.coerce.boolean()` — que converteria a string `'false'` em `true`.
  - **Conteúdo do template em português.** A regra de idioma vale para código; corpo de e-mail é texto para o usuário final.
  - **Tipagem do payload é por declaração no ponto de emissão** (`const welcome: WelcomeMailPayload = ...`), e não por um emissor genérico tipado. O `EventEmitter2` aceita `any` na assinatura; um wrapper só para isso seria abstração especulativa com um evento só.
  - **`MailModule` não é `@Global()`.** Só o listener consome o service, e quem dispara usa o `EventEmitter2`, esse sim global.
- **em aberto:** um evento hoje tem um ouvinte. Quando a 0010 e a 0011 entrarem, convite vai querer disparar e-mail e notificação a partir do mesmo evento — vale revisitar se o nome dos eventos continua sendo `mail.*` ou se passa a ser o fato de domínio (`unit.invited`), com o mail sendo um ouvinte entre outros.
