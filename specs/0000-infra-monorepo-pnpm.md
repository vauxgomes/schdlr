---
id: 0000
title: Monorepo pnpm, CI e compose
status: done
depends_on: []
---

# 0000 — Monorepo pnpm, CI e compose

## Objetivo

O repositório passa a ser um workspace pnpm na versão `0.0.0`, com o lugar de `apps/api` e
`apps/web` reservado, os scripts da raiz já apontando para `@schdlr/api`, um workflow de CI
que testa cada app e um `docker-compose.yml` com o Postgres de desenvolvimento — tudo pronto
para que a spec que criar o boilerplate da API só precise preencher `apps/api`.

## Contexto necessário

- `.env.example` (raiz) — **é o env da API**, não o da raiz: os próprios comentários dizem
  "Relativo ao diretório de onde a API roda (apps/api)" e "a senha é o POSTGRES_PASSWORD do
  `.env` da raiz". Dá a porta do Postgres (`5434`), usuário, senha e banco (`schdlr`)
- `.prettierrc` — já existe, é o que o script `format` vai usar
- `.vscode/settings.json` — só cor da barra de status; fica como está
- Repositório git sem nenhum commit, na branch `master`
- Ferramentas locais: Node `v24.11.1`, pnpm `10.32.1`

## Escopo

**Entra:**

- `package.json` da raiz: `name: "schdlr"`, `version: "0.0.0"`, `private: true`,
  `packageManager: "pnpm@10.32.1"`, `engines.node: ">=24"`, os scripts abaixo e `prettier`
  como devDependency
- `pnpm-workspace.yaml` com `apps/*`
- `apps/api/.gitkeep` e `apps/web/.gitkeep`
- `pnpm-lock.yaml` gerado e versionado
- `.nvmrc` com `24`
- `.gitignore` (node_modules, dist, build, coverage, `.env` e `.env.*` exceto `.env.example`,
  `.DS_Store`, logs)
- `.prettierignore` (lockfile, dist, build, coverage, node_modules)
- `.env.example` atual movido para `apps/api/.env.example`; um `.env.example` novo na raiz só
  com o que o compose lê (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`)
- `docker-compose.yml` com o serviço `db` ativo e `api` e `web` comentados
- `.github/workflows/ci.yml` com um job de teste por app, hoje só a API
- Seção "Como rodar" no `README.md` que já existe: pré-requisitos, `pnpm install`,
  `docker compose up -d db`, tabela dos scripts. O resto do README não muda

Scripts da raiz, exatamente estes:

```json
"scripts": {
  "dev:api": "pnpm --filter @schdlr/api start:dev",
  "build:api": "pnpm --filter @schdlr/api build",
  "test:api": "pnpm --filter @schdlr/api test:all",
  "db:generate": "pnpm --filter @schdlr/api db:generate",
  "db:migrate": "pnpm --filter @schdlr/api db:migrate",
  "db:migrate:deploy": "pnpm --filter @schdlr/api db:migrate:deploy",
  "db:reset": "pnpm --filter @schdlr/api db:reset",
  "db:seed": "pnpm --filter @schdlr/api db:seed",
  "db:studio": "pnpm --filter @schdlr/api db:studio",
  "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
}
```

## Não entra

- **Inicializar NestJS ou React** — nenhum `package.json`, `tsconfig`, `src/` ou dependência
  dentro de `apps/`. Só o `.gitkeep`
- Scripts para o web (`dev:web`, `build:web`, `test:web`) — entram com o boilerplate do web
- Turborepo, Nx ou qualquer orquestrador além do pnpm
- `packages/` compartilhados (tsconfig base, eslint config, tipos)
- ESLint, Husky, lint-staged, commitlint
- Lint, format check ou build no CI — só teste
- `Dockerfile` de qualquer app, imagem publicada, deploy ou `docker-compose.prod.yml`
- Tag de git, CHANGELOG ou automação de release — a versão `0.0.0` vive só no `package.json`
- `CLAUDE.md` e `.claude/`
- Editar o conteúdo do `.env.example` da API além de movê-lo

## Decisões já tomadas

- **Scripts apontam para `@schdlr/api` mesmo sem o pacote existir.** O nome do pacote fica
  fixado aqui: a spec do boilerplate da API cria `apps/api/package.json` com
  `"name": "@schdlr/api"` e os scripts `start:dev`, `build`, `test:all`, `db:*`. Até lá,
  `pnpm --filter` não casa com nada e sai `0` — não é erro, e não se cria pacote-fantasma
  para "fazer funcionar"
- **Lockfile versionado e `--frozen-lockfile` no CI.** O CI instala exatamente o que está no
  repo
- **Node 24**, que é o da máquina, fixado em `.nvmrc` e `engines`. O CI lê do `.nvmrc`, não
  repete o número
- **O job de teste é uma matriz por app**, com `app: [api]` hoje. Entrar o web é acrescentar
  `web` à lista, sem duplicar job. Cada app expõe `test:all`, e o job chama
  `pnpm --filter @schdlr/${{ matrix.app }} test:all`
- **App sem `package.json` é pulado de forma visível, não verde em silêncio.** Um passo
  confere `apps/<app>/package.json`; ausente, emite `::notice::` dizendo que não há o que
  testar, e os passos de install e teste ficam `skipped`. Rodar o filtro vazio e sair `0`
  pareceria "testes passaram", que é mentira
- **Gatilho do CI: `push` em `master` e `pull_request`**, mais `workflow_dispatch`
- **O compose é um só, `docker-compose.yml`**, nome que o `.env.example` da API já usa. O que
  não existe ainda fica comentado, com uma linha dizendo qual spec descomenta
- **O `db` sobe agora**, porque não depende de app nenhum: `postgres:17-alpine`, porta
  `${POSTGRES_PORT:-5434}:5432`, credenciais com padrão `schdlr`, volume nomeado e
  `healthcheck` com `pg_isready`. A `DATABASE_URL` do `apps/api/.env.example` tem que bater
  com esses padrões sem edição
- **`api` e `web` comentados** no compose, já com `depends_on: db: condition: service_healthy`
  no `api`, para a spec que os ativar só descomentar e ajustar
- **O `.env.example` atual vai para `apps/api/`** — o conteúdo é da API. A raiz fica só com o
  que o compose consome
- **`docker compose` sobe sem `.env` na raiz**: todas as variáveis do compose têm padrão
  (`${VAR:-valor}`) e nenhum serviço declara `env_file` obrigatório

## Critérios de aceite

- [x] `pnpm install` num clone limpo termina sem erro e gera/respeita o `pnpm-lock.yaml`
- [x] `package.json` da raiz tem `version: "0.0.0"`, `packageManager: "pnpm@10.32.1"` e os 10
      scripts exatamente como na seção "Escopo"
- [x] `pnpm-workspace.yaml` declara `apps/*`
- [x] `apps/api/.gitkeep` e `apps/web/.gitkeep` existem e são os únicos arquivos em `apps/`
      (fora o `apps/api/.env.example`)
- [x] `pnpm test:api` sai `0` hoje, sem pacote que case
- [x] `pnpm format` roda e não reformata nada que já estava formatado de novo na segunda vez
- [x] `docker compose config` valida **sem `.env` na raiz**
- [x] `docker compose up -d db` sobe e o serviço fica `healthy`
- [x] `psql` conecta com a `DATABASE_URL` do `apps/api/.env.example`, sem editar nada
- [x] `api` e `web` estão comentados no compose, cada um com a nota de qual spec os ativa
- [x] `.github/workflows/ci.yml` tem um job de teste em matriz com `app: [api]`
- [x] Com `apps/api/package.json` ausente, o job emite um `notice` e pula install e teste
- [x] `.env` não é versionado; `.env.example` (raiz e api) é
- [x] `README.md` lista os scripts e como subir o banco

## Verificação

```bash
# clone limpo
rm -rf node_modules && pnpm install --frozen-lockfile

node -p "require('./package.json').version"                 # 0.0.0
pnpm test:api; echo "exit $?"                               # exit 0
pnpm format && git status --porcelain                       # nada (depois do commit)

find apps -type f | sort
# apps/api/.env.example
# apps/api/.gitkeep
# apps/web/.gitkeep

# compose sem .env na raiz
mv .env .env.bak 2>/dev/null; docker compose config -q && echo "compose ok"; mv .env.bak .env 2>/dev/null
docker compose up -d db
docker compose ps db                                        # (healthy)
psql "$(grep ^DATABASE_URL apps/api/.env.example | cut -d= -f2- | tr -d '"' | sed 's/?.*//')" -c 'select 1'
docker compose down

# workflow
npx --yes @action-validator/cli .github/workflows/ci.yml   # ou actionlint, se instalado
git check-ignore .env && echo ".env ignorado"
```

O workflow só se prova rodando: depois do push, abrir a execução no GitHub Actions e conferir
que o job `test (api)` aparece, emite o `notice` de app sem `package.json` e termina verde com
install e teste `skipped`. Sem remote configurado, registrar no Registro que essa parte ficou
pendente.

## Registro

**2026-10-29** — executada com `/spec next`, na branch `development`.

Commits: `chore(infra): monorepo pnpm, CI e compose (spec 0000)` — implementação, Registro e
status no mesmo commit.

Verificação: `pnpm install --frozen-lockfile` ok; versão `0.0.0`; `pnpm test:api` sai `0`
("No projects matched"); `pnpm format` estável na segunda passada; `find apps` mostra só os três
arquivos esperados; `docker compose config -q` ok sem `.env`; `db` sobe `(healthy)`;
`select 1` ok com a `DATABASE_URL` do `apps/api/.env.example`; `.env` ignorado, os dois
`.env.example` não.

Desvios:

- **Sem `psql` local.** A conexão foi testada com o `psql` da própria imagem
  (`docker run --rm postgres:17-alpine psql …`), trocando `localhost` por
  `host.docker.internal` — mesma porta `5434`, mesmas credenciais, nada editado no
  `.env.example`.
- **Validador do workflow não rodou.** `npx @action-validator/cli` foi bloqueado pela política
  de permissões da sessão e não há `actionlint` instalado. Só o parse do YAML foi conferido
  (Ruby/Psych). Rodar o validador à mão.
- **Execução no GitHub Actions pendente.** Não houve push (regra do projeto: só commit local).
  Falta conferir no Actions que `test (api)` emite o `notice` e termina verde com install e
  teste `skipped`.
- **A primeira passada do `pnpm format` realinhou as tabelas markdown** de `specs/README.md`,
  `0001`, `0002` e do `README.md` (só espaçamento, nenhum texto mudou). Foi incluído no commit
  para que `pnpm format` fique estável.
- `.gitignore` manteve a linha `.plans/` que já existia.
- Notas de "qual spec descomenta" no compose citam "a spec que criar o Dockerfile da API/web",
  sem id: essa spec ainda não existe no índice.
- Docker Desktop estava parado; foi aberto (`open -a Docker`) para a verificação.

## Notas posteriores

**2026-10-30 — spec 0004.** A raiz ganhou um 11º script, `"otp": "pnpm --filter @schdlr/api
otp"`, que emite um código OTP para o ambiente local. Os 10 scripts que esta spec fixou
"exatamente" continuam iguais.
