---
id: 0001
title: Migration inicial e DatabaseService
status: todo
depends_on: []
---

## Objetivo

O banco existe com o schema completo e a aplicação consegue consultá-lo.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — o schema inteiro; ler o cabeçalho, que explica a invariante de tenant
- `apps/api/prisma.config.ts` — de onde sai a `DATABASE_URL`
- `docker-compose.yml` — credenciais do Postgres local

## Escopo

**Entra:**

- Subir o Postgres e gerar a migration inicial com `prisma migrate dev --name init`
- `DatabaseService` em `src/infra/database/`, com o adapter `PrismaPg`
- `DatabaseModule` global, para os módulos seguintes injetarem sem reimportar

**Não entra:**

- Seed com dados (o `prisma/seed.ts` fica vazio até haver o que semear)
- Qualquer módulo de domínio

## Decisões já tomadas

- **Nenhum SQL escrito à mão.** Todas as migrations são geradas pelo Prisma. Foi por isso que as EXCLUDE constraints de conflito saíram do schema — conflito é validado na aplicação.
- **Driver adapter (`PrismaPg`), não a engine binária.** O `datasource` do schema não tem `url` justamente porque ela vem do `prisma.config.ts`.
- **`DatabaseService extends PrismaClient`** e conecta em `onModuleInit`. É o padrão do projeto anterior e mantém o `this.db.<model>` nos services.
- **Módulo `@Global()`** — vinte e poucos módulos vão precisar dele; reimportar em cada um é ruído.

## Critérios de aceite

- [ ] `docker compose up -d postgres` sobe o banco e ele aceita conexão
- [ ] Existe `prisma/migrations/<timestamp>_init/migration.sql` gerado pelo Prisma
- [ ] O SQL gerado contém as FKs compostas de tenant (ex.: `projects_term_id_unit_id_fkey`)
- [ ] `DatabaseService` injetável em qualquer módulo sem import explícito
- [ ] A app sobe conectada ao banco e uma consulta trivial (`user.count()`) responde

## Verificação

```bash
pnpm db:migrate
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm build:api
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
