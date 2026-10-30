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

## Índice

| id   | spec                                                                             | status  | depende de       |
| ---- | -------------------------------------------------------------------------------- | ------- | ---------------- |
| 0000 | [Monorepo pnpm, CI e compose](0000-infra-monorepo-pnpm.md)                       | ✅ done | —                |
| 0001 | [Boilerplate da API em NestJS](0001-api-boilerplate-nestjs.md)                   | ✅ done | 0000             |
| 0002 | [Schema do domínio](0002-api-schema-do-dominio.md)                               | ✅ done | 0001             |
| 0003 | [Envio de e-mail](0003-api-envio-de-email.md)                                    | ✅ done | 0001, 0002       |
| 0004 | [Auth por OTP](0004-api-auth-por-otp.md)                                         | ⬜ todo | 0001, 0002, 0003 |
| 0005 | [Seed do master e do tenant de teste](0005-api-seed-master-e-tenant-de-teste.md) | ✅ done | 0002             |
