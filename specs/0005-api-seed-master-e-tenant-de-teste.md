---
id: 0005
title: Seed do master e do tenant de teste
status: done
depends_on: [0002]
---

# 0005 — Seed do master e do tenant de teste

## Objetivo

`pnpm db:seed` passa a semear o usuário **master** (o único `MASTER` do sistema, com o e-mail de
`ROOT_EMAIL`) e, com `SET_FIRST_TENANT=true`, um **tenant de teste** completo o bastante para
exercitar cada papel: uma organização com dono, uma unidade com responsável e professor, e um
curso com coordenador. A seed é idempotente: rodar de novo não muda nem duplica nada.

## Por que existe

A 0002 decidiu que só a seed cria o master, e nenhum endpoint promove alguém a `MASTER`: sem
seed, o sistema não tem suporte. E as specs de organização, unidade, membros e catálogo
precisam de um tenant com cada papel já ocupado para serem testadas à mão.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — models, a tabela de papéis ("onde mora"), "Um único
  master", "Assinatura é uma linha por usuário" e "Usuário sem assinatura não cria organização"
- `specs/0001-api-boilerplate-nestjs.md` — `prisma.config.ts` (seed com `tsx`), a regra de
  `process.env` (o `prisma/seed.ts` pode ler) e os arquivos de env lidos (`.env.local`, `.env`)
- `apps/api/prisma/seed.ts` — o stub atual
- `apps/api/src/infra/database/database.service.ts` — como o `PrismaClient` é criado com o
  `PrismaPg`
- `apps/api/.env.example` — seção Seed

## Escopo

**Entra:**

- `apps/api/prisma/seed.ts` reescrito
- Seção Seed do `apps/api/.env.example` sem a linha "Ainda não lido pela API" e com o comentário
  descrevendo o que é semeado

## Não entra

- Catálogo, espaço e tempo de exemplo (currículo, disciplina, semestre, local, bloco de
  horários, projeto). Cada spec que precisar de dado de exemplo acrescenta o seu
- Mais de um tenant, ou tenant configurável por env além do liga/desliga
- Remover o tenant quando `SET_FIRST_TENANT` volta a `false`
- Endpoint ou script para promover usuário a `MASTER` ou `SUPPORT`
- Teste automatizado da seed. Ela é conferida contra o banco de dev
- Mudar o schema

## Decisões já tomadas

### Execução

- **Roda com `tsx`**, como a 0001 configurou, e usa um `PrismaClient` próprio com o `PrismaPg`,
  como o `DatabaseService`. Sem Nest: o `tsx` não emite metadado de decorator
- **Carrega `.env.local` e `.env`** com o `dotenv`, na mesma ordem da app e do
  `prisma.config.ts`, e valida as variáveis com um schema Zod próprio, no próprio arquivo:

  ```ts
  const seedEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    ROOT_EMAIL: z.email(),
    SET_FIRST_TENANT: z.stringbool().default(false),
  })
  ```

  O `envSchema` da app não serve: ele exige `JWT_SECRET` e outras variáveis que a seed não usa.
  Env inválido: a seed lista as variáveis com problema e sai `1` antes de tocar no banco

- **Tudo numa transação.** Se qualquer passo falhar, nada fica gravado
- **E-mails em minúsculas**, como a 0002 manda: `ROOT_EMAIL` é normalizado antes de usar
- **Saída**: uma linha por registro, dizendo se foi `criado` ou se `já existia`, e um resumo no
  fim. Exemplo:

  ```
  master   vaux.gomes@ifce.edu.br            criado
  tenant   Root-Test-Organization            já existia
  ...
  Seed concluída: 3 criados, 9 já existiam.
  ```

### Idempotência

- **A seed não sobrescreve.** Cada registro é procurado pela chave única (e-mail, slug,
  `[organizationId, slug]`, `[unitId, userId]`, `[unitId, code]`, `userId` da assinatura) e só é
  criado se não existir. O que existe fica como está, mesmo que difira do que a seed criaria.
  Rodar duas vezes seguidas: a segunda só imprime `já existia`
- **`SET_FIRST_TENANT=false` não apaga** o tenant que uma execução anterior criou

### Master

- **O master é o usuário de `ROOT_EMAIL`**, com `systemRole: MASTER`, `name: "Master"`,
  `isActive: true` e `emailVerifiedAt` preenchido. É semeado sempre, com ou sem tenant
- **Só um `MASTER`.** Se já existe um `MASTER` com outro e-mail, a seed para com erro, sem gravar
  nada, dizendo qual e-mail é o master atual
- **`ROOT_EMAIL` já cadastrado como usuário comum** (`USER` ou `SUPPORT`): a seed para com erro, sem
  promover. Promover seria sobrescrever, e a regra é não sobrescrever. A mensagem diz que é
  preciso trocar o `ROOT_EMAIL` ou ajustar o banco à mão
- **O master não ganha assinatura.** Ele não cria organização; quem cria é o dono

### Tenant de teste

Com `SET_FIRST_TENANT=true`, semeia, nesta ordem:

| registro           | dados                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| 4 usuários         | `admin@`, `manager@`, `coordinator@` e `teacher@schdlr.dev`, `systemRole: USER`, verificados |
| assinatura do dono | `admin@`: plano `GRACE`, sem `expiresAt`, `assignedBy` = master                              |
| organização        | `Root-Test-Organization`, slug `root-test-organization`, dono `admin@`                       |
| unidade            | `Unidade Teste`, slug `unidade-teste`                                                        |
| membro responsável | `manager@` com `isManager: true`                                                             |
| membro professor   | `teacher@` com `isTeacher: true`                                                             |
| membro coordenador | `coordinator@`, sem flag (é membro da unidade para enxergá-la)                               |
| curso              | `Curso Teste`, código `TESTE`, coordenador `coordinator@`                                    |

- **Nomes dos usuários**: `Admin Teste`, `Manager Teste`, `Coordinator Teste`, `Teacher Teste`
- **Cada papel num usuário diferente**, para que as specs seguintes testem um papel por vez. O
  dono (`admin@`) não é membro da unidade: o acesso dele vem de `Organization.ownerId`
- **Todos com `emailVerifiedAt` preenchido**: os endereços `@schdlr.dev` não recebem e-mail, e o
  acesso é por OTP, que no ambiente local sai pelo `pnpm otp <email>` da 0004
- **O tenant não é semeado em `NODE_ENV=production`.** Com `SET_FIRST_TENANT=true` em produção, a
  seed para com erro antes de tocar no banco. O master é semeado em qualquer ambiente

### `.env.example`

A seção Seed perde a linha "Ainda não lido pela API" (quem lê é a seed, e ela tem o próprio
schema) e passa a dizer o que é semeado. O comentário atual continua valendo, com dois acréscimos:

- o master é o único `MASTER` e a seed para se já houver outro, ou se `ROOT_EMAIL` já for de um
  usuário comum
- os usuários do tenant entram com `pnpm otp <email>` no ambiente local

## Critérios de aceite

- [x] `pnpm db:seed` num banco vazio, com `SET_FIRST_TENANT=false`, cria só o master
- [x] Com `SET_FIRST_TENANT=true`, cria os 4 usuários, a assinatura, a organização, a unidade,
      os 3 membros e o curso, com os dados da tabela
- [x] Rodar de novo sai `0`, imprime só `já existia` e não muda nenhuma linha (`updated_at`
      igual)
- [x] Existe exatamente um `MASTER`, com o e-mail de `ROOT_EMAIL` em minúsculas
- [x] Com outro `MASTER` no banco, a seed sai `1` e não grava nada
- [x] Com `ROOT_EMAIL` já cadastrado como `USER`, a seed sai `1` e não promove
- [x] Com `NODE_ENV=production` e `SET_FIRST_TENANT=true`, a seed sai `1` antes de tocar no banco
- [x] Sem `ROOT_EMAIL`, a seed sai `1` e a mensagem nomeia `ROOT_EMAIL`
- [x] A seção Seed do `.env.example` não tem mais "Ainda não lido pela API"
- [x] `pnpm test:api` e `pnpm build:api` continuam passando

## Verificação

Exige `pnpm db:reset`, que apaga o banco de dev. O Prisma recusa o reset quando quem chama é
um agente, sem autorização explícita do usuário (Registro da 0002): pedir antes.

```bash
docker compose up -d db
q() { docker compose exec -T db psql -U schdlr -d schdlr -Atc "$1"; }

pnpm db:reset --force                       # aplica as migrations e já roda a seed

# só o master
SET_FIRST_TENANT=false pnpm db:seed
q "select email, system_role from users"    # 1 linha, MASTER

# tenant
SET_FIRST_TENANT=true pnpm db:seed
q "select email, system_role, email_verified_at is not null from users order by email"
q "select o.slug, u.email from organizations o join users u on u.id = o.owner_id"
q "select u.email, m.is_manager, m.is_teacher from unit_members m join users u on u.id = m.user_id"
q "select c.code, u.email from courses c join users u on u.id = c.coordinator_id"
q "select u.email, s.plan, s.expires_at from subscriptions s join users u on u.id = s.user_id"

# idempotência
q "select max(updated_at) from users" > /tmp/antes
SET_FIRST_TENANT=true pnpm db:seed          # só "já existia"
q "select max(updated_at) from users" | diff - /tmp/antes && echo "nada mudou"

# erros
SET_FIRST_TENANT=true NODE_ENV=production pnpm db:seed; echo $?   # 1
ROOT_EMAIL=outro@schdlr.dev pnpm db:seed; echo $?                  # 1 (já há master)
ROOT_EMAIL= pnpm db:seed 2>&1 | grep ROOT_EMAIL

pnpm test:api
pnpm build:api
```

## Registro

**2026-10-29** — executada com `/spec next 2`, na branch `development`. Foi a única da
sequência: a 0003 saiu da fila por estabelecer contrato (e instalar `nodemailer`), e a 0004
depende dela.

Commits: `feat(api): seed do master e do tenant de teste (spec 0005)`.

Verificação: com `SET_FIRST_TENANT=false`, a seed criou só o master (`MASTER`); com `true`,
criou os 4 usuários verificados, a assinatura `GRACE` do `admin@` atribuída pelo master, a
organização, a unidade, os 3 membros com as flags da tabela e o curso com o coordenador. Rodar de
novo, com `ROOT_EMAIL` em maiúsculas, imprimiu `0 criados, 12 já existiam`, e o `id` +
`updated_at` de todas as linhas ficaram iguais. Saíram `1`, sem gravar: tenant em
`NODE_ENV=production`, outro `MASTER` no banco (`ROOT_EMAIL=outro@…`) e `ROOT_EMAIL` cadastrado
como `USER`. Master em produção sem tenant sai `0`. Sem `ROOT_EMAIL`, a mensagem nomeia
`ROOT_EMAIL`. `test:api` (sem `.env`), `build:api`, lint e `format` passam.

Desvios:

- **Sem `pnpm db:reset`.** O modo autônomo não pode pedir a autorização que o Prisma exige. O
  banco de dev já estava no estado equivalente: migration `init` aplicada e zero linhas em
  `users` e `organizations`. A seed rodou sobre ele.
- **O caso "`ROOT_EMAIL` cadastrado como `USER`"** foi montado rebaixando o master por SQL
  (`update users set system_role='USER'`), rodando a seed e restaurando `MASTER` em seguida. O
  `updated_at` não mudou, porque o `@updatedAt` é do client do Prisma.
- **O banco de dev ficou semeado** com o master e o tenant de teste, que é o estado esperado
  para as próximas specs.
- O comentário do `.env.example` cita `pnpm otp <email>`, que só passa a existir com a 0004.
