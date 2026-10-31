---
id: 0011
title: Cursos
status: done
depends_on: [0008, 0009, 0010]
---

# 0011 — Cursos

## Objetivo

O dono e o responsável pela unidade passam a criar, listar, editar e desativar os cursos da
unidade, dentro do limite `coursesPerUnit` do plano, e a definir o coordenador de cada curso entre
os membros da unidade. Todo membro da unidade enxerga os cursos. E fica pronto o que currículos
e disciplinas (0012–0014) vão usar: resolver um curso da unidade para o usuário logado e saber se
ele pode mexer no catálogo daquele curso.

⚠️ **Esta spec estabelece contrato** (o `CourseAccessService`, quem gerencia o catálogo de um
curso e a regra de leitura do catálogo). Deve ser executada sozinha, com `/spec 0011`.

## Por que existe

Curso é a raiz do catálogo: currículo pertence a curso, disciplina a currículo, e o projeto (a
montagem de horários) escolhe um currículo. A 0006 deixou o limite de cursos por unidade para a
spec de curso aplicar, e a 0010 deixou para cá o que acontece com o coordenador que sai da
unidade.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `Course` (`code` opcional e único por unidade,
  `coordinatorId` com `SetNull`), a tabela de papéis ("Coordenador de curso") e "o que tem
  `isActive` não se apaga"
- `specs/0006-api-assinaturas-e-papel-de-suporte.md` — `coursesPerUnit`, "o limite conta os
  registros desativados"
- `specs/0009-api-organizacao-e-unidade.md` — `TenantAccessService` (`resolveUnit`,
  `assertWritable` com `{ reactivating }`), o padrão de reativação e o de contar e criar com a
  linha-pai travada
- `specs/0010-api-membros-e-convites.md` — `MembersService.remove` e o "Não entra" sobre o
  coordenador que deixa a unidade
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `specs/README.md`, "Contratos em vigor"
- `apps/api/src/modules/units/` e `apps/api/src/modules/members/` — padrão de módulo, controller e
  schema

## Escopo

**Entra:**

- Módulo `src/modules/courses/` com controller, service, schemas Zod e o `CourseAccessService`,
  exportado
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                        | o que faz                                      |
  | --------------------------- | ---------------------------------------------- |
  | `POST …/courses`            | cria curso                                     |
  | `GET …/courses`             | lista os cursos da unidade                     |
  | `GET …/courses/:courseId`   | um curso                                       |
  | `PATCH …/courses/:courseId` | edita, define o coordenador, desativa, reativa |

- Ajuste no `MembersService.remove` (0010): quem sai da unidade deixa de coordenar os cursos dela,
  com nota datada no fim da 0010
- `codeSchema` em `courses/schemas/`, exportado, para currículos e disciplinas

## Não entra

- Currículos e disciplinas: 0012 e 0013
- Apagar curso: só desativa
- Mais de um coordenador por curso, ou coordenador que não é membro da unidade
- Mover curso para outra unidade
- Convite que já chega como coordenador: o coordenador é escolhido entre os membros
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis

- **Gerencia o curso** (criar, editar nome e código, definir coordenador, desativar e reativar):
  o dono e o responsável pela unidade
- **Gerencia o catálogo do curso** (currículos e disciplinas, nas specs seguintes): o dono, o
  responsável e o coordenador **daquele** curso
- **Lê o catálogo da unidade** (cursos, currículos, disciplinas): qualquer um que enxergue a
  unidade (`resolveUnit` da 0009). Professores e coordenadores de outros cursos leem tudo
- **O catálogo inativo também é lido.** Curso, currículo e disciplina desativados aparecem nas
  listagens, com `isActive: false`, para quem enxerga a unidade. Filtrar é do web. É diferente de
  organização e unidade, que somem para os membros: aqui desativar é "não usar mais em projeto
  novo", não "esconder"
- Faltando o papel, `AppException('NOT_ALLOWED')`

### `CourseAccessService`

O contrato de 0012–0014:

```ts
type CourseAccess = UnitAccess & {
  course: Course
  isCoordinator: boolean // course.coordinatorId === userId
  canManageCourse: boolean // dono ou responsável
  canManageCatalog: boolean // dono, responsável ou coordenador do curso
}

resolveCourse(userId: string, orgSlug: string, unitSlug: string, courseId: string): Promise<CourseAccess>
assertCatalogWritable(access: CourseAccess, options?: { reactivating?: boolean }): Promise<void>
```

- **`resolveCourse`** chama `resolveUnit` e procura o curso **na unidade**: `courseId` de outra
  unidade, inexistente ou que não é cuid é `404 COURSE_NOT_FOUND`. Não checa papel
- **`assertCatalogWritable`** chama o `assertWritable(access)` da 0009 e, depois, curso desativado
  → `409 COURSE_INACTIVE`. `{ reactivating: true }` dispensa só o `409` do curso, como na 0009.
  Toda escrita em curso, currículo e disciplina passa por ele
- O papel é lido do banco a cada requisição, como na 0009

### Curso

- **`POST` recebe `{ name, code?, coordinatorId? }`**:
  - `name` com o `nameSchema` da 0004
  - `code` com o `codeSchema`: `trim`, maiúsculas, de 1 a 20 caracteres, no formato
    `^[A-Z0-9]+([._-][A-Z0-9]+)*$` (`INFO`, `ADS`, `MAT-101`, `2024.1`). Vazio ou ausente vira
    `null`
  - `coordinatorId`: ver "Coordenador"
- **Ordem no `POST`:** `resolveUnit` (404) → não é dono nem responsável (`403 NOT_ALLOWED`) →
  `assertWritable` → cursos da unidade (ativos ou não) `>= limits.coursesPerUnit` → `403
PLAN_LIMIT_REACHED` com `params: { limit: "coursesPerUnit", max }` → coordenador inválido →
  código repetido → `201`
- **Contar e criar numa transação, com a linha da unidade travada** (`FOR UPDATE`), como a 0009.
  Limite `null` é ilimitado
- **`code` é único por unidade quando presente.** Repetido → `409 COURSE_CODE_IN_USE`; o `P2002` em
  corrida vira o mesmo `409` (`isUniqueViolation`). Vários cursos sem código convivem
- **`PATCH` recebe `{ name?, code?, coordinatorId?, isActive? }`**, só de quem gerencia o curso.
  Sem campo válido → `400` com o item `EMPTY_UPDATE`. `code: null` remove o código
- **Reativar é o corpo exatamente `{ isActive: true }`**, como na 0009: dispensa o `409` do curso,
  não o da unidade nem o plano
- **`GET …/courses`** lista todos os cursos da unidade, ativos ou não, ordenados por `name`. Sem
  paginação

### Coordenador

- **`coordinatorId` é o `userId` de um membro da unidade**, ou `null` para tirar. Qualquer membro
  serve, com ou sem flag, como o `coordinator@` da seed. Não é membro (ou não existe) → `400
COORDINATOR_NOT_A_MEMBER`
- **O dono pode ser coordenador só se for membro da unidade.** O papel de dono não basta: a
  coerência "coordenador é membro" vale para todos
- **Um usuário pode coordenar vários cursos**, e um curso tem um coordenador só (a coluna é uma)
- **Quem sai da unidade deixa de coordenar.** O `MembersService.remove` da 0010, na mesma transação
  do `delete`, zera o `coordinatorId` dos cursos **daquela unidade** coordenados pela pessoa. A
  resposta do `DELETE` não muda (`204`). É o `SetNull` que a 0002 escolheu para o coordenador,
  aplicado à saída da unidade. Os cursos ficam sem coordenador até alguém definir outro

### Formato

```json
{
  "id": "…",
  "name": "Curso Teste",
  "code": "TESTE",
  "isActive": true,
  "createdAt": "2026-10-29T22:00:00.000Z",
  "updatedAt": "2026-10-29T22:00:00.000Z",
  "coordinator": { "id": "…", "email": "coordinator@schdlr.dev", "name": "Coordinator Teste" },
  "curriculaCount": 0,
  "access": { "canManageCourse": false, "canManageCatalog": true }
}
```

- **`coordinator`** é `null` sem coordenador
- **`curriculaCount`** conta todos os currículos do curso, ativos ou não. Até a 0012, é sempre `0`
- **`access`** é o papel de quem chamou, como na 0009

### Códigos de erro

| código                     | status | mensagem                    | quando                                           |
| -------------------------- | ------ | --------------------------- | ------------------------------------------------ |
| `COURSE_NOT_FOUND`         | 404    | Course not found            | id inexistente ou de outra unidade               |
| `COURSE_INACTIVE`          | 409    | Course is inactive          | escrita em curso desativado (e no catálogo dele) |
| `COURSE_CODE_IN_USE`       | 409    | Course code already in use  | código repetido na unidade                       |
| `COORDINATOR_NOT_A_MEMBER` | 400    | Coordinator is not a member | `coordinatorId` fora da unidade                  |

- `PLAN_LIMIT_REACHED`, `NOT_ALLOWED`, `UNIT_INACTIVE`, `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED`
  são os da 0009; `EMPTY_UPDATE` é item de `VALIDATION_FAILED`

## Critérios de aceite

- [x] Dono e responsável criam e editam curso; coordenador e outros membros recebem `403`;
      quem não enxerga a unidade, `404`
- [x] Todo membro lista e lê os cursos, inclusive os desativados
- [x] Acima de `coursesPerUnit` dá `403 PLAN_LIMIT_REACHED` com `params`, contando os desativados;
      contagem e criação numa transação com a unidade travada
- [x] `code` normalizado para maiúsculas; repetido na unidade dá `409 COURSE_CODE_IN_USE`; o mesmo
      código em outra unidade passa; vários cursos sem código convivem
- [x] `coordinatorId` que não é membro da unidade dá `400 COORDINATOR_NOT_A_MEMBER`; `null` tira o
      coordenador
- [x] Remover o membro (ou ele sair) zera o coordenador dos cursos dele naquela unidade, e só nela
- [x] Escrita em curso desativado dá `409 COURSE_INACTIVE`; `{ isActive: true }` reativa; plano do
      dono vencido dá `403 PLAN_EXPIRED`
- [x] `courseId` de outra unidade dá `404 COURSE_NOT_FOUND`
- [x] `CourseAccessService` exportado, com `resolveCourse` e `assertCatalogWritable` como acima
- [x] Códigos novos no catálogo da 0008
- [x] Testes unitários do `CourseAccessService`, do service e dos schemas, com banco e
      `TenantAccessService` substituídos; e2e das rotas com os services substituídos
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

# contra o banco de dev; rodar em bash (no zsh desta máquina, $(…) falha às vezes — Registro da 0010)
pnpm dev:api &
sleep 8
API=localhost:3001/api
J='content-type: application/json'
login() {
  code=$(pnpm -s otp "$1" | cut -d' ' -f1)
  curl -s -X POST $API/auth/sign-in -H "$J" -d "{\"email\":\"$1\",\"code\":\"$code\"}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'
}
ADM=$(login admin@schdlr.dev)
MGR=$(login manager@schdlr.dev)
CRD=$(login coordinator@schdlr.dev)
TCH=$(login teacher@schdlr.dev)
MST=$(login "$(grep ^ROOT_EMAIL apps/api/.env | cut -d= -f2)")
C=$API/organizations/root-test-organization/units/unidade-teste/courses

curl -s -H "Authorization: Bearer $TCH" $C                                      # Curso Teste, coordinator@
curl -s -H "Authorization: Bearer $MST" $C -w ' %{http_code}\n'                 # 404
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $C \
  -d '{"name":"X"}' -w ' %{http_code}\n'                                        # 403 NOT_ALLOWED
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $C \
  -d '{"name":"Informática","code":" info "}' -w ' %{http_code}\n'              # 201, code INFO
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $C \
  -d '{"name":"Outro","code":"INFO"}' -w ' %{http_code}\n'                      # 409 COURSE_CODE_IN_USE
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $C \
  -d '{"name":"Y","coordinatorId":"<id do admin@>"}' -w ' %{http_code}\n'       # 400 COORDINATOR_NOT_A_MEMBER

# limite do GRACE (5 por unidade): já há 2; mais 3 passam, o sexto não
for i in 1 2 3; do curl -s -o /dev/null -X POST -H "Authorization: Bearer $ADM" -H "$J" $C \
  -d "{\"name\":\"Lote $i\"}" -w '%{http_code}\n'; done                         # 201 x3
curl -s -X POST -H "Authorization: Bearer $ADM" -H "$J" $C \
  -d '{"name":"Sexto"}' -w ' %{http_code}\n'                                    # 403 PLAN_LIMIT_REACHED

# coordenador: o teacher@ passa a coordenar o INFO e sai da unidade
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $C/<id do INFO> \
  -d '{"coordinatorId":"<id do teacher@>"}' -w ' %{http_code}\n'                # 200
curl -s -X DELETE -H "Authorization: Bearer $TCH" \
  $API/organizations/root-test-organization/units/unidade-teste/members/<id do teacher@> \
  -w ' %{http_code}\n'                                                          # 204
curl -s -H "Authorization: Bearer $MGR" $C/<id do INFO>                         # coordinator null

# desativar e reativar
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $C/<id do INFO> -d '{"isActive":false}'   # 200
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $C/<id do INFO> \
  -d '{"name":"Z"}' -w ' %{http_code}\n'                                        # 409 COURSE_INACTIVE
curl -s -H "Authorization: Bearer $CRD" $C                                      # INFO aparece, isActive false
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $C/<id do INFO> -d '{"isActive":true}'    # 200
kill %1
```

Ao final, devolver o banco ao estado da seed: apagar por SQL os cursos criados no teste (o `Curso
Teste` da seed fica), recriar o `UnitMember` do `teacher@` com `isTeacher: true`, e apagar os
códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec 0011`, na branch `development`.

Commits: `feat(api): cursos (spec 0011)`.

Verificação: sem `.env`, `pnpm test:api` passa (288 unitários, 68 e2e) e `pnpm build:api` também;
lint limpo; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um script,
todas as linhas da seção "Verificação" deram o esperado: o `teacher@` lista o `Curso Teste` com o
`coordinator@`; o master recebe `404` (`ORGANIZATION_NOT_FOUND`); o `coordinator@` criando → `403
NOT_ALLOWED`; o `manager@` cria `Informática` com `" info "` → `201`, `code: "INFO"`; `INFO` de
novo → `409 COURSE_CODE_IN_USE`; o `admin@` (dono, não membro) como coordenador → `400
COORDINATOR_NOT_A_MEMBER`; três lotes → `201`, o sexto → `403 PLAN_LIMIT_REACHED` com `params: {
limit: "coursesPerUnit", max: 5 }`; o `teacher@` passou a coordenar o `INFO` (`200`), saiu da
unidade (`204`) e o `INFO` ficou com `coordinator: null`; desativado (`200`), editar dá `409
COURSE_INACTIVE`, o `coordinator@` ainda o vê na lista com `isActive: false`, e `{"isActive":true}`
reativa (`200`). Além do roteiro: `courseId` fora do formato → `404 COURSE_NOT_FOUND`; o
`coordinator@` editando → `403`; `code: null` remove o código; `PATCH` vazio → `400` com o item
`EMPTY_UPDATE`; com a assinatura do `admin@` vencida por SQL, `PATCH` do `manager@` → `403
PLAN_EXPIRED` e `GET` → `200`. Na lista, o `coordinator@` tem `canManageCatalog: true` só no `Curso
Teste`. No fim, os cursos criados foram apagados (o `Curso Teste` ficou), o `UnitMember` do
`teacher@` foi recriado com `isTeacher: true`, a assinatura do `admin@` voltou a `GRACE` sem
`expires_at`, e os códigos OTP e refresh tokens foram apagados.

Não exercitado contra o banco (só nos unitários): código repetido em outra unidade e curso de
outra unidade (o `GRACE` do `admin@` só tem uma unidade), e o limite do coordenador "só naquela
unidade" (o `where` do `updateMany` tem o `unitId`).

Desvios:

- **`courseRoles(access, coordinatorId, userId)`** é exportado do `course-access.service.ts`: o
  `resolveCourse` e a listagem (que não resolve curso a curso) calculam o `access` pela mesma
  função. O tipo `CourseAccess` é `UnitAccess & CourseRoles & { course }`, o mesmo da spec.
- **`codeSchema` é o código obrigatório** (de 1 a 20, maiúsculas, formato da spec), para o
  currículo, cujo `code` não é nulo. O "vazio ou ausente vira `null`" é do curso, num schema
  interno (`courseCodeSchema`) que aceita `null` e string vazia e passa o resto pelo
  `codeSchema`.
- **`coordinatorId` no corpo é qualquer string** (ou `null`): o que não é membro, inclusive id fora
  do formato, dá `400 COORDINATOR_NOT_A_MEMBER`, não `VALIDATION_FAILED`.
- **Ordem no `PATCH`**: curso (`404`) → papel (`403`) → `assertCatalogWritable` (`409`/`403`) →
  coordenador (`400`) → código (`409`). A spec só fixava a do `POST`. O `P2002` no `update` também
  vira `COURSE_CODE_IN_USE`.
- **`MembersService.remove`** usa `$transaction([updateMany, delete])` (a forma em lote). Nota
  datada na 0010.
- **O `GET` de um curso** resolve com o `resolveCourse` e relê o curso com coordenador e contagem
  de currículos (duas consultas).
