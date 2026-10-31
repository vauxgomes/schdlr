---
id: 0012
title: Currículos
status: done
depends_on: [0011]
---

# 0012 — Currículos

## Objetivo

Quem gerencia o catálogo de um curso (dono, responsável e o coordenador do curso) passa a criar,
listar, editar, desativar e apagar os currículos dele. Um currículo é uma versão da grade do
curso (a matriz de 2018, a de 2024). Apagar só é possível enquanto nenhum projeto usa o
currículo; depois disso, só desativar.

## Por que existe

O projeto de horários (spec futura) escolhe um currículo, e as ofertas saem das disciplinas
dele. Sem currículo não há disciplina (0013) nem duplicação (0014). E a 0002 já previu a regra de
produto "apagar currículo se não estiver em uso", com o `Restrict` de `Project.curriculumId`.

## Contexto necessário

- `specs/0011-api-cursos.md` — `CourseAccessService` (`resolveCourse`, `assertCatalogWritable`),
  `canManageCatalog`, a regra de leitura do catálogo (inativo também aparece) e o `codeSchema`
- `specs/0002-api-schema-do-dominio.md` — `Curriculum` (`code` obrigatório e único por curso),
  `Curriculum → Subject` em `Cascade`, `Project.curriculumId` em `Restrict` e "currículo em uso
  por projeto não se apaga"
- `specs/0009-api-organizacao-e-unidade.md` — o padrão de reativação (`{ isActive: true }`)
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `apps/api/src/modules/courses/` — o que a 0011 entregou
- `apps/api/src/infra/database/prisma-errors.ts` — `isUniqueViolation`

## Escopo

**Entra:**

- Módulo `src/modules/curricula/` com controller, service, schemas Zod e o
  `CurriculumAccessService`, exportado
- Rotas, todas exigindo token, sob
  `/api/organizations/:orgSlug/units/:unitSlug/courses/:courseId`:

  | rota                               | o que faz                      |
  | ---------------------------------- | ------------------------------ |
  | `POST …/curricula`                 | cria currículo                 |
  | `GET …/curricula`                  | lista os currículos do curso   |
  | `GET …/curricula/:curriculumId`    | um currículo                   |
  | `PATCH …/curricula/:curriculumId`  | edita, desativa, reativa       |
  | `DELETE …/curricula/:curriculumId` | apaga, se nenhum projeto o usa |

- `isForeignKeyViolation` (`P2003`) em `src/infra/database/prisma-errors.ts`, ao lado de
  `isUniqueViolation`

## Não entra

- Disciplinas: 0013. Duplicar currículo: 0014
- Mover currículo para outro curso
- Limite de currículos por plano: a 0006 não tem
- Marcar um currículo como "o vigente" do curso: o projeto escolhe qual usar
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis

- **Escreve** (criar, editar, desativar, reativar, apagar) quem tem `canManageCatalog` no curso
  (0011): dono, responsável e o coordenador **do curso**. Os demais recebem `403 NOT_ALLOWED`
- **Lê** quem enxerga a unidade, inclusive os currículos desativados, como o resto do catálogo
  (0011)

### `CurriculumAccessService`

O contrato de 0013 e 0014:

```ts
type CurriculumAccess = CourseAccess & { curriculum: Curriculum }

resolveCurriculum(
  userId: string, orgSlug: string, unitSlug: string, courseId: string, curriculumId: string,
): Promise<CurriculumAccess>
assertCurriculumWritable(access: CurriculumAccess, options?: { reactivating?: boolean }): Promise<void>
```

- **`resolveCurriculum`** chama `resolveCourse` e procura o currículo **no curso**: de outro curso,
  inexistente ou que não é cuid → `404 CURRICULUM_NOT_FOUND`. Não checa papel
- **`assertCurriculumWritable`** chama `assertCatalogWritable` (unidade, organização, plano e curso
  ativo) e, depois, currículo desativado → `409 CURRICULUM_INACTIVE`. `{ reactivating: true }`
  dispensa só o `409` do currículo

### Currículo

- **`POST` recebe `{ name, code, description? }`**:
  - `name` com o `nameSchema` da 0004
  - `code` com o `codeSchema` da 0011, aqui **obrigatório** (a 0002 o fez não nulo)
  - `description` opcional, `trim`, até 1000 caracteres; vazia vira `null`
- **Ordem no `POST`:** `resolveCourse` (404) → sem `canManageCatalog` (`403`) →
  `assertCatalogWritable` (curso desativado não recebe currículo novo) → código repetido no curso
  (`409 CURRICULUM_CODE_IN_USE`, também pelo `P2002`) → `201`
- **`PATCH` recebe `{ name?, code?, description?, isActive? }`**; sem campo válido → `400` com o
  item `EMPTY_UPDATE`. `description: null` limpa. Reativar é o corpo exatamente
  `{ isActive: true }`, como na 0009
- **`GET …/curricula`** lista todos os currículos do curso, ativos ou não, ordenados por `code`
  decrescente (as matrizes mais novas costumam ter o código maior). Sem paginação

### Apagar

- **`DELETE` apaga o currículo e, em cascata, as disciplinas dele** (`Cascade` da 0002) e responde
  `204`. Exige `canManageCatalog` e passa por `assertCatalogWritable` (o do curso, não o do
  currículo: um currículo desativado e sem uso pode ser apagado)
- **Usado por algum projeto → `409 CURRICULUM_IN_USE`.** O service confere antes de apagar, e o
  `P2003` do `Restrict` de `Project.curriculumId`, em corrida, vira o mesmo `409`
  (`isForeignKeyViolation`)
- É a exceção prevista na 0002 ao "o que tem `isActive` não se apaga": currículo errado ou de teste
  sai inteiro enquanto ninguém depende dele

### Formato

```json
{
  "id": "…",
  "name": "Matriz 2024",
  "code": "2024",
  "description": null,
  "isActive": true,
  "createdAt": "2026-10-30T10:00:00.000Z",
  "updatedAt": "2026-10-30T10:00:00.000Z",
  "course": { "id": "…", "name": "Curso Teste", "code": "TESTE" },
  "subjectsCount": 0,
  "totalWorkload": 0,
  "inUse": false,
  "access": { "canManageCatalog": true }
}
```

- **`subjectsCount` e `totalWorkload`** contam só as disciplinas **ativas** — é a grade que vale.
  Até a 0013, são `0`
- **`inUse`** diz se algum projeto usa o currículo, para o web mostrar ou esconder "apagar"
- **`curriculaCount`** do curso (0011) passa a contar os currículos de verdade, sem mudança de
  código lá

### Códigos de erro

| código                   | status | mensagem                        | quando                             |
| ------------------------ | ------ | ------------------------------- | ---------------------------------- |
| `CURRICULUM_NOT_FOUND`   | 404    | Curriculum not found            | id inexistente ou de outro curso   |
| `CURRICULUM_INACTIVE`    | 409    | Curriculum is inactive          | escrita em currículo desativado    |
| `CURRICULUM_CODE_IN_USE` | 409    | Curriculum code already in use  | código repetido no curso           |
| `CURRICULUM_IN_USE`      | 409    | Curriculum is used by a project | apagar currículo usado por projeto |

- Os da 0009 e da 0011 (`NOT_ALLOWED`, `COURSE_NOT_FOUND`, `COURSE_INACTIVE`…) vêm do
  `CourseAccessService`; `EMPTY_UPDATE` é item de `VALIDATION_FAILED`

## Critérios de aceite

- [x] Dono, responsável e o coordenador do curso criam, editam e apagam; coordenador de **outro**
      curso e professor recebem `403`; quem não enxerga a unidade, `404`
- [x] Todo membro lista e lê os currículos, inclusive os desativados
- [x] `code` é obrigatório e normalizado; repetido no mesmo curso dá `409`; o mesmo código em outro
      curso passa
- [x] Curso desativado não recebe currículo novo (`409 COURSE_INACTIVE`)
- [x] Escrita em currículo desativado dá `409 CURRICULUM_INACTIVE`; `{ isActive: true }` reativa
- [x] `DELETE` apaga o currículo e as disciplinas; usado por projeto dá `409 CURRICULUM_IN_USE`,
      inclusive pelo `P2003`
- [x] `curriculumId` de outro curso dá `404 CURRICULUM_NOT_FOUND`
- [x] `subjectsCount`, `totalWorkload` e `inUse` no formato; `curriculaCount` do curso conta os
      currículos
- [x] `CurriculumAccessService` exportado, com `resolveCurriculum` e `assertCurriculumWritable`
- [x] Códigos novos no catálogo da 0008
- [x] Testes unitários do `CurriculumAccessService`, do service e dos schemas; e2e das rotas com os
      services substituídos
- [x] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam

## Verificação

```bash
docker compose up -d db
pnpm install --frozen-lockfile

mv apps/api/.env apps/api/.env.bak 2>/dev/null
pnpm test:api
pnpm build:api
mv apps/api/.env.bak apps/api/.env 2>/dev/null

pnpm --filter @schdlr/api lint
pnpm format && git status --porcelain                         # nada

# contra o banco de dev, em bash
pnpm dev:api &
sleep 8
API=localhost:3001/api
J='content-type: application/json'
login() {
  code=$(pnpm -s otp "$1" | cut -d' ' -f1)
  curl -s -X POST $API/auth/sign-in -H "$J" -d "{\"email\":\"$1\",\"code\":\"$code\"}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'
}
MGR=$(login manager@schdlr.dev)
CRD=$(login coordinator@schdlr.dev)
TCH=$(login teacher@schdlr.dev)
U=$API/organizations/root-test-organization/units/unidade-teste
COURSE=$(curl -s -H "Authorization: Bearer $CRD" $U/courses \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(c => c.code === "TESTE").id')
K=$U/courses/$COURSE/curricula

curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $K \
  -d '{"name":"Matriz 2024","code":"2024"}' -w ' %{http_code}\n'                 # 403
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K \
  -d '{"name":"Matriz 2024","code":"2024"}' -w ' %{http_code}\n'                 # 201 (coordenador do curso)
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K \
  -d '{"name":"Dup","code":"2024"}' -w ' %{http_code}\n'                         # 409 CURRICULUM_CODE_IN_USE
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K \
  -d '{"name":"Sem código"}' -w ' %{http_code}\n'                                # 400
curl -s -H "Authorization: Bearer $TCH" $K                                       # 1 currículo
curl -s -H "Authorization: Bearer $TCH" $U/courses/$COURSE                       # curriculaCount 1

# desativar, escrever, reativar
CUR=<id do 2024>
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $K/$CUR -d '{"isActive":false}'      # 200
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $K/$CUR \
  -d '{"name":"X"}' -w ' %{http_code}\n'                                         # 409 CURRICULUM_INACTIVE
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $K/$CUR -d '{"isActive":true}'       # 200

# em uso: um projeto inserido por SQL (termo + projeto) segura o currículo
# (inserir term e project da unidade-teste apontando para $CUR)
curl -s -X DELETE -H "Authorization: Bearer $CRD" $K/$CUR -w ' %{http_code}\n'  # 409 CURRICULUM_IN_USE
# (apagar o projeto e o termo por SQL)
curl -s -X DELETE -H "Authorization: Bearer $CRD" $K/$CUR -w ' %{http_code}\n'  # 204
kill %1
```

Ao final, conferir que nenhum currículo, termo ou projeto de teste ficou, e apagar os códigos OTP
e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec 0012`, na branch `development`, logo depois da 0011.

Commits: `feat(api): currículos (spec 0012)`.

Verificação: sem `.env`, `pnpm test:api` passa (320 unitários, 78 e2e) e `pnpm build:api` também;
lint limpo; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um script,
todas as linhas da seção "Verificação" deram o esperado: o `teacher@` criando → `403`; o
`coordinator@` cria `2024` no `Curso Teste` (`201`); o mesmo código → `409
CURRICULUM_CODE_IN_USE`; sem código → `400`; o `teacher@` lista 1 currículo, com
`canManageCatalog: false`, e o curso passa a ter `curriculaCount: 1`; desativado pelo `manager@`
(`200`), editar dá `409 CURRICULUM_INACTIVE`, o `teacher@` ainda o lê com `isActive: false`, e
`{"isActive":true}` reativa. Com termo e projeto inseridos por SQL: `inUse: true` e `DELETE` → `409
CURRICULUM_IN_USE`; sem eles, o `teacher@` apagando → `403` e o `coordinator@` → `204`. Além do
roteiro: o master → `404`; três disciplinas inseridas por SQL (80 h e 60 h ativas, 40 h
desativada) deram `subjectsCount: 2` e `totalWorkload: 140`, e sumiram com o `DELETE` (cascata);
depois do `DELETE`, o id → `404 CURRICULUM_NOT_FOUND`, e um id fora do formato também; num segundo
curso criado pelo `manager@`, o `coordinator@` (de outro curso) criando → `403`, o mesmo código
`2024` → `201`, e com o curso desativado, criar currículo → `409 COURSE_INACTIVE`. O `DELETE`
direto por `psql` de um currículo em uso falha com SQLSTATE `23503`
(`projects_curriculum_id_fkey`), que o Prisma traduz para o `P2003` que o service trata. No fim, o
segundo curso, os currículos, as disciplinas, o termo e o projeto de teste foram apagados, e os
códigos OTP e refresh tokens também.

Não exercitado contra o banco: o `P2003` em corrida de verdade (coberto pelo teste unitário).

Desvios:

- **`subjectsCount` e `totalWorkload`** saem de um `subject.groupBy` por `curriculumId`, filtrado
  por `isActive: true` (uma consulta para a lista inteira); `inUse` vem do `_count` de `projects`.
- **`course` no formato** vem do `CourseAccess` (o curso já resolvido), sem `include`.
- **`description` no `POST`** usa `default(null)`; vazia, só espaços ou `null` vira `null`.
- **Ordem no `PATCH`**: currículo (`404`) → papel (`403`) → `assertCurriculumWritable` → código
  repetido (`409`). No `DELETE`: currículo → papel → `assertCatalogWritable` → em uso (`409`). A
  spec só fixava a do `POST`.
- **`PATCH` relê o currículo depois do `update`**, para devolver a grade e o `inUse`, como o `GET`.
