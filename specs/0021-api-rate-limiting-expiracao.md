---
id: 0021
title: Rate limiting e expiração de tokens
status: todo
depends_on: [0005]
---

## Objetivo

Os endpoints públicos de autenticação deixam de aceitar abuso barato, e as tabelas de token param de crescer para sempre.

## Quando executar

**Antes do primeiro deploy alcançável pela internet** — não antes disso, e não muito depois.

Adiada em 2026-08-14, depois de ser iniciada e revertida. O motivo: rate limiting protege superfície exposta, e não há deploy, nginx nem usuário; a limpeza resolve tabela que cresce, e as tabelas estão vazias. Mais decisivo, a pergunta central desta spec — quantos proxies confiar para descobrir o IP do cliente — **depende da topologia de deploy, que ainda não existe**. Executar agora seria decidir contra hipótese.

Fica atrás das specs de domínio de propósito: a 0008 define o contrato de permissão que onze specs assumem pronto, e represá-la custa mais do que adiar endurecimento.

## Por que as duas coisas na mesma spec

São o envelhecimento da superfície que as specs 0003 a 0005 construíram: as mesmas rotas públicas e as mesmas duas tabelas. `forgot-password` é o caso que junta os dois — é público, dispara e-mail e insere uma linha a cada chamada, então sem limite ele é ao mesmo tempo um amplificador de spam e uma fábrica de lixo em `password_resets`. Cada metade sozinha seria meia sessão.

## Contexto necessário

- `apps/api/src/modules/auth/auth.controller.ts` — as rotas públicas e o que cada uma custa
- `apps/api/src/app.module.ts` e `apps/api/src/app.setup.ts` — onde guard global e módulo entram
- `apps/api/src/common/filters/all-exceptions.filter.ts` — o formato de erro que o 429 precisa respeitar
- `apps/api/prisma/schema.prisma` — models `RefreshToken` e `PasswordReset`
- `.claude/rules/testing.md`
- Registro das specs 0002 e 0005, onde estas duas pendências foram anotadas

## Escopo

**Entra:**

- `@nestjs/throttler` com guard global e limite frouxo por padrão
- Limite apertado, rota a rota, em `login`, `register`, `forgot-password`, `reset-password` e `refresh`
- `@nestjs/schedule` com uma rotina diária que apaga `password_resets` vencidos e `refresh_tokens` fora da janela de detecção
- 429 saindo no formato de erro padrão da aplicação

**Não entra:**

- Redis ou qualquer armazenamento compartilhado de contagem — decisão registrada abaixo
- Bloqueio de conta após N tentativas
- CAPTCHA
- Métricas e alarme de abuso

**Dependências novas:** `@nestjs/throttler` e `@nestjs/schedule` — pacotes de primeira parte do NestJS, mesma família dos que já estão no `package.json`. Instalar avisando, sem perguntar.

## Decisões já tomadas

- **Contagem em memória, por instância.** Redis resolveria a contagem compartilhada, mas hoje roda uma instância só e ele seria peça de infraestrutura sem contrapartida. O gatilho para revisitar é a segunda instância — e quando ela vier, o Redis entra por vários motivos ao mesmo tempo (contagem, fila, cache), não só por este.
- **Limite por IP, não por e-mail.** Contar tentativa de login por e-mail cria um jeito trivial de trancar a conta alheia: basta errar a senha de alguém algumas vezes.
- **Apagar, não arquivar.** Token vencido não tem valor de auditoria. O que tem — quem entrou, de onde, quando — merece trilha própria, e não é esta tabela que a guarda.
- **Refresh token revogado sobrevive a uma janela.** Apagar na hora cegaria a detecção de reuso, que existe justamente para reconhecer token vazado depois do fato. A limpeza só leva o que já passou dessa janela.
- **Agendador dentro da aplicação**, não cron externo nem job de banco: é uma consulta por dia e não justifica peça separada. Com mais de uma instância isso vira execução duplicada — revisitar junto com a decisão do Redis.
- **A rotina apaga por lote e loga quantas linhas saíram.** Sem log não há como saber se ela parou de rodar.

## Critérios de aceite

- [ ] Estourar o limite de `login` responde 429; a rota continua funcionando para outro IP
- [ ] O limite de uma rota não consome o de outra (`login` esgotado não bloqueia `forgot-password`)
- [ ] Uso normal de rota autenticada não encosta no limite
- [ ] O corpo do 429 é `{ statusCode, message }`, como todo erro da aplicação
- [ ] A rotina apaga `password_resets` vencidos e usados
- [ ] A rotina apaga `refresh_tokens` expirados e os revogados fora da janela
- [ ] A rotina não apaga token válido nem revogado dentro da janela
- [ ] Rodar a rotina duas vezes seguidas é inofensivo

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
