---
id: 0004
title: Infraestrutura de e-mail
status: todo
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

- [ ] Registrar um usuário dispara o e-mail de boas-vindas
- [ ] SMTP indisponível não afeta a resposta do registro
- [ ] Sem variáveis de SMTP no ambiente, a app sobe e o envio apenas loga
- [ ] O payload de cada evento é tipado, sem `any`

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
