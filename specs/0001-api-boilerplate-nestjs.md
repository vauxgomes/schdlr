---
id: 0001
title: Boilerplate da API em NestJS
status: todo
depends_on: [0000]
---

# 0001 — Boilerplate da API em NestJS

## Objetivo

`apps/api` passa a ser o pacote `@schdlr/api`: uma API NestJS em TypeScript que sobe com
`pnpm dev:api`, valida o próprio `.env` com Zod na partida, fala com o Postgres via Prisma,
exige JWT em toda rota por padrão (Passport) e responde `GET /api/health`. Todos os scripts que a
spec 0000 deixou apontados para `@schdlr/api` passam a funcionar, e o job de CI deixa de
pular a API.

Não há nenhum model de domínio. A spec monta o esqueleto e as convenções que as próximas
specs da API vão herdar.

⚠️ **Esta spec estabelece contrato** (estrutura de pastas, aliases, formato de erro de
validação, guard global, nomes de script). Não roda em sequência no `/spec next`: deve ser
executada sozinha, com `/spec 0001`.

## Contexto necessário

- `specs/0000-infra-monorepo-pnpm.md` — nomes dos scripts da raiz, o job de CI em matriz que
  chama `test:all`, o serviço `db` do compose, o Node 24 e o pnpm 10.32.1
- `package.json` e `pnpm-workspace.yaml` da raiz
- `apps/api/.env.example` — movido para cá pela 0000; é a base do `.env.example` desta spec
- `docker-compose.yml` — credenciais e porta do `db`, que a `DATABASE_URL` precisa casar
- `.github/workflows/ci.yml` — o que o job roda quando `apps/api/package.json` existe
- `.prettierrc` da raiz
- Referência de estrutura (outro repo, só leitura): `~/Projects/enem-analytics/apps/api` —
  `src/main.ts`, `src/app.module.ts`, `src/infra/database/`, `src/common/pipes/zod-validation.pipe.ts`,
  `prisma.config.ts`, `tsconfig.json`, `package.json` (bloco `jest`)

## Escopo

**Entra:**

- `apps/api/package.json` com `name: "@schdlr/api"`, `version: "0.0.0"`, `private: true`
- Scaffold NestJS 11 em TypeScript: `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`,
  `eslint.config.mjs`, `src/main.ts`, `src/app.module.ts`
- Estrutura de pastas:

  ```
  apps/api/
  ├── prisma/
  │   ├── schema.prisma        # datasource + generator, nenhum model
  │   ├── migrations/          # vazio (.gitkeep)
  │   └── seed.ts              # stub, não semeia nada
  ├── prisma.config.ts
  ├── src/
  │   ├── main.ts
  │   ├── app.module.ts
  │   ├── config/              # env.schema.ts (Zod) + tipo Env
  │   ├── common/              # pipes, decorators, filters
  │   ├── infra/
  │   │   └── database/        # DatabaseModule + DatabaseService (PrismaClient)
  │   ├── modules/
  │   │   ├── auth/            # strategies/, guards/, decorators/ — só a infra de JWT
  │   │   └── health/
  │   └── shared/              # tipos e enums compartilhados (vazio por ora, .gitkeep)
  └── test/
      ├── jest-e2e.json
      ├── setup-env.ts
      └── health.e2e-spec.ts
  ```

- **Config:** `ConfigModule` global validado por `envSchema` (Zod) em `src/config/env.schema.ts`,
  com tipo `Env` inferido e `ConfigService<Env, true>` nos consumidores
- **Database:** `DatabaseService extends PrismaClient` com `@prisma/adapter-pg`, connect e
  disconnect no ciclo de vida do módulo
- **Zod:** `ZodValidationPipe` em `src/common/pipes/`, usado por parâmetro
  (`@Body(new ZodValidationPipe(schema))`)
- **Passport:** `JwtStrategy` (Bearer, `JWT_SECRET`), `JwtAuthGuard` registrado como
  `APP_GUARD`, decorator `@Public()` e decorator `@CurrentUser()` que devolve o payload tipado
  (`JwtPayload = { sub: string }`)
- **Health:** `GET /api/health`, público, com `@nestjs/terminus` e um ping no banco
  (`SELECT 1`)
- `main.ts`: prefixo global `api`, CORS com `origin: CORS_ORIGIN` e `credentials: true`,
  `enableShutdownHooks()`, `listen(PORT, '0.0.0.0')`
- Testes: Jest unitário (`src/**/*.spec.ts`) e e2e (`test/*.e2e-spec.ts`) com supertest
- `apps/api/.env.example` revisado (ver "O `.env.example`")
- `apps/api/.gitignore` para `dist/`, `coverage/` e o client gerado do Prisma, se ficar fora
  de `node_modules`
- `apps/api/.gitkeep` removido
- Linha do `api` em `README.md` da raiz atualizada para "como rodar"

Scripts de `apps/api/package.json` — os nomes são os que a raiz já chama:

| script | comando |
|---|---|
| `start:dev` | `nest start --watch` |
| `start` | `nest start` |
| `start:prod` | `node dist/main` |
| `build` | `nest build` |
| `lint` | `eslint "{src,test}/**/*.ts"` |
| `test` | `jest` |
| `test:e2e` | `jest --config test/jest-e2e.json` |
| `test:all` | `pnpm db:generate && pnpm test && pnpm test:e2e` |
| `db:generate` | `prisma generate` |
| `db:migrate` | `prisma migrate dev` |
| `db:migrate:deploy` | `prisma migrate deploy` |
| `db:reset` | `prisma migrate reset` |
| `db:seed` | `prisma db seed` |
| `db:studio` | `prisma studio` |

## Não entra

- **Qualquer model no `schema.prisma`** — `User`, `Tenant`, `Unit` e afins são spec própria.
  Por consequência, nenhuma migration é criada
- Endpoints de auth (login, refresh, logout, reset de senha, convite), hash de senha, refresh
  token, `RolesGuard` e papéis
- Seed de verdade (root, tenant de teste) — o `seed.ts` só imprime que não há o que semear
- E-mail (nodemailer), trilha de auditoria, Redis, storage
- Swagger/OpenAPI, logger estruturado (pino), request id, rate limit, helmet
- `Dockerfile` da API e descomentar o serviço `api` no `docker-compose.yml`
- Rodar o e2e contra Postgres de verdade no CI — o job da 0000 não tem banco
- Mexer no job de CI da 0000 além do que for preciso para ele passar com a API real
- `nestjs-zod`, `class-validator`, `class-transformer`
- Apps web

## Decisões já tomadas

- **NestJS 11, Prisma 7 com `@prisma/adapter-pg`, Zod 4, Jest.** Mesmo stack do ENEM, que já
  provou funcionar junto. Prisma configurado por `prisma.config.ts` na raiz do app, não por
  bloco `prisma` no `package.json`
- **TypeScript `strict: true`.** O projeto é novo; não herda o `noImplicitAny: false` do ENEM
- **Aliases de caminho:** `@common/*`, `@config/*`, `@infra/*`, `@modules/*`, `@shared/*`,
  declarados no `tsconfig.json` e espelhados no `moduleNameMapper` do Jest (unit e e2e). Import
  relativo só dentro do mesmo módulo
- **Um `.prettierrc` só, o da raiz.** O que o `nest new` gera em `apps/api` é apagado
- **O env é validado na partida e a app não sobe com env inválido.** `ConfigModule.forRoot({
  validate })` chama `envSchema.parse`; erro lista cada variável que falhou. Nada lê
  `process.env` direto fora de `src/config/`, `prisma.config.ts` e `prisma/seed.ts`
- **O schema Zod do env cobre só o que a app lê nesta spec:** `NODE_ENV`, `PORT`,
  `DATABASE_URL`, `CORS_ORIGIN`, `JWT_SECRET` (mínimo 32 caracteres), `JWT_EXPIRES_IN`. As demais
  variáveis do `.env.example` entram no schema com a spec que passar a usá-las — validar o que
  ninguém lê é contrato sem dono
- **Arquivos de env lidos:** `.env.local` e depois `.env`, ambos em `apps/api`. Os dois são
  gitignored
- **Todas as rotas exigem JWT, salvo `@Public()`.** Guard global desde o primeiro dia; a spec
  de auth não precisa revisitar cada controller. A `JwtStrategy` só valida assinatura e
  expiração e devolve `{ sub }` — não consulta banco, porque não há `User`
- **Erro de validação do Zod é `400` com este corpo**, que as specs seguintes assumem:

  ```json
  {
    "statusCode": 400,
    "message": "Validation failed",
    "errors": [{ "path": "email", "message": "Invalid email" }]
  }
  ```

  `path` é o `issue.path` juntado por `.`
- **Pipe próprio, por parâmetro, não global.** Sem `nestjs-zod`: o pipe tem ~20 linhas e o
  schema fica explícito na assinatura do handler
- **`test:all` gera o client do Prisma antes de testar.** O pnpm não roda `pre*` scripts por
  padrão, e o CI não tem `.env`: `prisma generate` não pode depender de `DATABASE_URL`
  definida
- **O e2e não depende de banco.** `test/setup-env.ts` define as variáveis de teste (sem ler
  `.env`) e o e2e substitui o `DatabaseService` por um dublê. O health tem dois casos: banco
  respondendo (`200`) e banco falhando (`503`)
- **`DATABASE_URL` aponta para o Postgres já rodando em container**, `localhost:5434`, usuário,
  senha e banco `schdlr` — os padrões do `db` da spec 0000
- **Scaffold pelo CLI, depois ajustado:** `pnpm dlx @nestjs/cli@11 new api --directory apps/api
  --package-manager pnpm --skip-git --strict`, e o resto à mão. O `app.controller`/`app.service`
  de exemplo saem
- **Dependências de produção:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
  `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/terminus`, `passport`,
  `passport-jwt`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `zod`, `reflect-metadata`,
  `rxjs`. Dev: as do scaffold mais `prisma`, `dotenv`, `tsx`, `@types/passport-jwt`,
  `@types/pg`, `@types/supertest`, `supertest`. **Nada além disso sem perguntar**
- **Seed roda com `tsx`**, declarado em `migrations.seed` no `prisma.config.ts`

## O `.env.example`

Parte do que a 0000 moveu para `apps/api/.env.example` e mantém **todas as seções** (Application,
Database, CORS, Auth, Seed, Auditoria, E-mail), com os mesmos comentários. Muda só:

- O comentário de Database passa a dizer que a URL aponta para o Postgres do container
  (`docker compose up -d db`), porta `5434`
- `DATABASE_URL="postgresql://schdlr:schdlr@localhost:5434/schdlr?schema=public"` — igual,
  conferido contra o compose
- Cada seção que a app ainda não lê ganha no topo a linha
  `# Ainda não lido pela API — entra no schema do env com a spec que usar.`
  (Seed, Auditoria, E-mail e as variáveis de Auth além de `JWT_SECRET` e `JWT_EXPIRES_IN`)
- `JWT_SECRET` continua vazio no exemplo — e por isso a app **não sobe** com o `.env.example`
  copiado sem preencher. É intencional; o `README.md` diz como gerar
- **Saem as variáveis de senha**, porque o login é só por OTP: `PASSWORD_RESET_TTL_MINUTES` e
  `ROOT_PASSWORD`. O comentário da seção Seed perde as frases que dependiam delas ("ROOT_PASSWORD
  não tem padrão: sem ela a seed para antes de tocar no banco" e "senha igual ao e-mail") e
  passa a dizer que o acesso dos usuários semeados é por OTP no próprio e-mail

## Critérios de aceite

- [ ] `apps/api/package.json` existe com `name: "@schdlr/api"` e os 14 scripts da tabela
- [ ] `apps/api/.gitkeep` não existe mais
- [ ] Na raiz, `pnpm dev:api` sobe a API em `:3001` com o `.env` preenchido
- [ ] `curl localhost:3001/api/health` devolve `200` com o banco de pé, sem token
- [ ] Qualquer outra rota sem token devolve `401`
- [ ] Com `JWT_SECRET` vazio ou curto, a app não sobe e a mensagem nomeia `JWT_SECRET`
- [ ] Com `DATABASE_URL` ausente, a app não sobe e a mensagem nomeia `DATABASE_URL`
- [ ] Nenhum `process.env` fora de `src/config/`, `prisma.config.ts` e `prisma/seed.ts`
- [ ] `ZodValidationPipe` tem teste unitário cobrindo o caso válido e o corpo `400` do contrato
- [ ] `JwtAuthGuard` tem teste: rota `@Public()` passa sem token, rota comum sem token dá `401`,
      token válido popula `@CurrentUser()`
- [ ] e2e do health cobre `200` e `503` sem precisar de Postgres
- [ ] `pnpm test:api` passa na raiz **sem `.env` em `apps/api`**
- [ ] `pnpm build:api` gera `apps/api/dist/main.js`
- [ ] `pnpm db:generate`, `pnpm db:migrate` (sem model: nada a migrar) e `pnpm db:seed` (imprime
      que não há o que semear) saem `0`
- [ ] `pnpm db:studio` abre conectado ao banco
- [ ] `pnpm --filter @schdlr/api lint` sai limpo
- [ ] `pnpm format` não altera nada depois do commit
- [ ] `apps/api/.env.example` tem todas as seções originais e as marcações de "ainda não lido"
- [ ] `grep -n "PASSWORD\|senha" apps/api/.env.example` não acha nada
- [ ] Imports entre módulos usam os aliases; nenhum `../../`
- [ ] O job `test (api)` do CI deixa de emitir o `notice` e roda install e teste

## Verificação

```bash
docker compose up -d db
pnpm install --frozen-lockfile

# sem .env: testes e build passam
mv apps/api/.env apps/api/.env.bak 2>/dev/null
pnpm test:api
pnpm build:api && test -f apps/api/dist/main.js && echo "build ok"
pnpm db:generate
mv apps/api/.env.bak apps/api/.env 2>/dev/null

pnpm --filter @schdlr/api lint
pnpm format && git status --porcelain                        # nada

pnpm db:migrate
pnpm db:seed

# app de pé
pnpm dev:api &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/health         # 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/qualquer-coisa # 401
kill %1

# env inválido
JWT_SECRET=curto pnpm --filter @schdlr/api start 2>&1 | grep JWT_SECRET

grep -rn "process\.env" apps/api/src | grep -v "^apps/api/src/config/"    # nada
grep -rn "\.\./\.\./" apps/api/src                                       # nada
```

O CI só se prova rodando: depois do push, o job `test (api)` tem que executar install e
`test:all`, sem o `notice` de app ausente, e ficar verde.

## Registro

_(vazio)_
