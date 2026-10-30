# Specs

Uma spec por vez. Cada uma é autocontida: uma sessão nova consegue executá-la lendo só
aquele arquivo e o que ele lista em "Contexto necessário".

## Uso

```
/spec          # lista e sugere a próxima executável
/spec 0000     # executa a 0000
```

## Regras

- **Uma spec = uma sessão = um commit de implementação.** Se transbordar, a spec estava grande demais — divida.
- A spec é commitada **antes** da implementação (`docs(spec): ...`); a implementação referencia o id (`chore(infra): ... (spec 0000)`).
- **Spec `done` não se edita.** Requisito novo é spec nova, senão o registro vira ficção. Mudança posterior que invalide o que ela decidiu vira nota datada no fim do arquivo (append-only).
- **Nome do arquivo: `NNNN-<área>-<slug>.md`.** O id é uma sequência global única, não uma por área. Áreas: `infra`, `api`, `web`.
- `specs/` é versionado.
- **Migrations são geradas pelo Prisma** (`prisma migrate dev`) a partir do `schema.prisma`. Não se escreve nem se edita `migration.sql` à mão, nem via `--create-only`, a não ser que seja estritamente necessário — e aí a spec diz por quê, ou o agente para e pergunta. Regra de integridade que o schema do Prisma não expressa (CHECK, exclusion constraint, índice parcial) fica na aplicação.

## Contexto

`schdlr` é um monorepo pnpm com dois apps: `apps/api` (NestJS, TypeScript) e `apps/web`
(React, TypeScript). O repositório nasce na spec 0000 sem nenhum dos dois inicializados — só
o encanamento da raiz (workspace, scripts, CI, compose). Os boilerplates entram em specs
próprias.

**Scripts da raiz apontam para pacotes que ainda não existem.** `@schdlr/api` só passa a
existir quando `apps/api/package.json` for criado. Até lá, `pnpm --filter` não casa com nada.
Ver a spec 0000, "Decisões já tomadas".

## Contratos em vigor

O que as specs já entregues decidiram e as próximas herdam. Cada item aponta para onde está a
decisão; em caso de dúvida, vale a spec (e o Registro dela), não este resumo.

**API**

- Pastas, aliases (`@common`, `@config`, `@infra`, `@modules`, `@shared`) e `strict: true`; import
  relativo só dentro do mesmo módulo (0001)
- Env validado na partida pelo `envSchema`; variável nova entra no schema com a spec que a lê.
  Nenhum `process.env` fora de `src/config/`, `prisma.config.ts` e `prisma/seed.ts` (0001)
- `configureApp(app)` em `src/app.setup.ts` é a configuração da app; o `main.ts` e os e2e chamam o
  mesmo (0004)
- Toda rota exige JWT, salvo `@Public()`. Rota inexistente dá `404`, não `401` (0001)
- `@RequireSystemRole('SUPPORT' | 'MASTER')` exige papel mínimo; o papel é lido do banco a cada
  requisição. `MASTER` conta como `SUPPORT` (0006)
- `@CurrentUser()` devolve só `{ sub }`; quem precisa do usuário consulta o banco e trata
  inexistente ou inativo como `401` (0004)
- Validação: `ZodValidationPipe` por parâmetro, `400` com `{ statusCode, message: "Validation
failed", errors: [{ path, message }] }` (0001). `emailSchema` e `nameSchema` de
  `auth/schemas/auth.schemas.ts` são reaproveitados (0004, 0007)
- Erros de regra: a exceção do Nest recebe o objeto `{ statusCode, message }`, para o corpo não
  ganhar o campo `error`. O `401` do guard e o `403` do `SystemRoleGuard` ficam no padrão do Nest
  (0004, 0006)
- E-mail: só pelo `MailService` (`send` ou um `sendX` com modelo em `templates/`); o corpo nunca
  vai para o log (0003)

**Plano e organização**

- `getActivePlan(userId)` dá plano, status e limites, ou `null` sem assinatura. Limites em
  `subscriptions/plans.ts` e contam registros **desativados** (0006)
- Escrita em dado de organização exige o plano **do dono** `ACTIVE`; vencido lança
  `PlanExpiredException` (`403 "Plan expired"`). Sem assinatura não se cria organização
  (`403 "Subscription required"`). Leitura sempre liberada (0006)
- Regras que o schema não expressa e que cada endpoint de escrita tem de validar: tabela "Regras
  que ficam com a aplicação" da 0002

**Testes e verificação**

- `pnpm test:api` roda sem `.env` e sem banco: unitários com o `DatabaseService` substituído; e2e
  com o `AppModule`, `configureApp` e os services substituídos. O env do e2e vem de
  `test/setup-env.ts` (0001, 0004)
- Nenhum teste envia e-mail de verdade (0003)
- Verificação contra o banco de dev: entrar com `pnpm otp <email>` e os usuários da seed (0004,
  0005), e no fim apagar o que o teste criou, devolvendo o banco ao estado da seed
- `pnpm db:reset` precisa de autorização explícita do usuário quando quem chama é um agente
  (Registro da 0002)
- Dependências na linha do NestJS 11. Pacote que só publica ESM não carrega no Jest (Registro da 0001)

## Índice

| id   | spec                                                                             | status  | depende de                   |
| ---- | -------------------------------------------------------------------------------- | ------- | ---------------------------- |
| 0000 | [Monorepo pnpm, CI e compose](0000-infra-monorepo-pnpm.md)                       | ✅ done | —                            |
| 0001 | [Boilerplate da API em NestJS](0001-api-boilerplate-nestjs.md)                   | ✅ done | 0000                         |
| 0002 | [Schema do domínio](0002-api-schema-do-dominio.md)                               | ✅ done | 0001                         |
| 0003 | [Envio de e-mail](0003-api-envio-de-email.md)                                    | ✅ done | 0001, 0002                   |
| 0004 | [Auth por OTP](0004-api-auth-por-otp.md)                                         | ✅ done | 0001, 0002, 0003             |
| 0005 | [Seed do master e do tenant de teste](0005-api-seed-master-e-tenant-de-teste.md) | ✅ done | 0002                         |
| 0006 | [Assinaturas e papel de suporte](0006-api-assinaturas-e-papel-de-suporte.md)     | ✅ done | 0002, 0004, 0005             |
| 0007 | [Perfil do usuário](0007-api-perfil-do-usuario.md)                               | ✅ done | 0004, 0006                   |
| 0008 | [Códigos de erro](0008-api-codigos-de-erro.md)                                   | ⬜ todo | 0001, 0004, 0006, 0007       |
| 0009 | [Organização e unidade](0009-api-organizacao-e-unidade.md)                       | ⬜ todo | 0002, 0004, 0005, 0006, 0008 |
| 0010 | [Membros e convites](0010-api-membros-e-convites.md)                             | ⬜ todo | 0003, 0004, 0008, 0009       |
