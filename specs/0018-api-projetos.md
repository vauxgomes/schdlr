---
id: 0018
title: Projetos
status: done
depends_on: [0011, 0012, 0016]
---

# 0018 — Projetos

## Objetivo

Os gestores passam a criar, listar, editar, publicar, despublicar e apagar projetos de horários:
um projeto é a montagem da grade de um curso (pelo currículo escolhido) num semestre. Tudo o que
se pode fazer com um projeto, e quem o enxerga, segue a matriz "status do semestre × projetos" da
0016, que aqui passa a ser aplicada. E fica pronto o que ofertas e quadros vão usar: resolver um
projeto para o usuário logado, respeitando a visibilidade, e saber se ele pode ser editado agora.

⚠️ **Esta spec estabelece contrato** (o `ProjectAccessService`, quem é gestor do projeto e a
visibilidade aplicada). Deve ser executada sozinha, com `/spec 0018`.

## Por que existe

O projeto é o centro do produto: ofertas, quadros, células e a detecção de choque moram dentro
dele. A 0016 fixou o que o status do semestre permite e deixou a aplicação para cá.

## Contexto necessário

- `specs/0016-api-semestres.md` — a matriz "status do semestre × projetos", `TERM_PROJECT_POLICY`,
  `TermAccessService` (`resolveTerm`, `assertProjectAction`), `TERM_STATUS_FORBIDS` e o Registro
  (o papel em `create`, `publish` e `delete` é o do gestor do projeto; em `STARTED`, editar exige
  `canManageTerm`)
- `specs/0002-api-schema-do-dominio.md` — `Project` (`name` único por semestre, `status`
  `DRAFT`/`PUBLISHED`, `workingDays`, `unitId` explícito, `createdById`), `Project → Offering` e
  `Project → Board` em `Cascade`, "`workingDays` é 5 ou 6" e "termo e currículo são da unidade do
  projeto"
- `specs/0011-api-cursos.md` — coordenador do curso
- `specs/0012-api-curriculos.md` — `CURRICULUM_NOT_FOUND`, `CURRICULUM_INACTIVE`, `inUse` do
  currículo
- `specs/0009-api-organizacao-e-unidade.md` — `resolveUnit`, `assertWritable`
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `apps/api/src/modules/terms/` — `term-policy.ts` e `term-access.service.ts`

## Escopo

**Entra:**

- Módulo `src/modules/projects/` com controller, service, schemas Zod e o
  `ProjectAccessService`, exportado
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                                | o que faz                             |
  | ----------------------------------- | ------------------------------------- |
  | `POST …/projects`                   | cria projeto, já em `PUBLISHED`       |
  | `GET …/projects`                    | lista os projetos que o usuário vê    |
  | `GET …/projects/:projectId`         | um projeto                            |
  | `PATCH …/projects/:projectId`       | edita nome e dias letivos             |
  | `POST …/projects/:projectId/status` | publica ou despublica                 |
  | `DELETE …/projects/:projectId`      | apaga, com ofertas, quadros e células |

- `isProjectActionAllowed(status, action, roles)` em `terms/term-policy.ts`: a regra que hoje está
  dentro do `assertProjectAction`, extraída como função pura, sem lançar. O `assertProjectAction`
  passa a usá-la, e o `access` do projeto também. Comportamento do `assertProjectAction` igual

## Não entra

- **Ofertas**: criá-las a partir das disciplinas ativas do currículo (0002: "uma oferta por
  disciplina ativa do currículo, criada sem professor") é da spec de oferta, que decide se é na
  criação do projeto ou numa sincronização. O projeto nasce sem oferta aqui
- Quadros e células: spec de quadro
- **Choque ao publicar**: publicar aqui só troca o status. A spec de choque ao publicar acrescenta
  a checagem a esta rota
- Duplicar projeto (o do semestre anterior para o novo)
- Trocar o semestre ou o currículo de um projeto: são fixos depois de criado. O semestre e o
  currículo em si continuam editáveis (0012, 0013, 0016): o currículo ganha disciplinas, perde as
  que não estão em uso e desativa as que saem da grade
- Membro de projeto convidado (spec futura): refinará quem é gestor, não a matriz
- Mudança de schema ou migration

## Decisões já tomadas

### Gestor do projeto

- **Gestor do projeto** (`isProjectManager`) é o dono da organização, o responsável pela unidade
  ou o coordenador do curso do currículo do projeto. É o "gestores" da matriz da 0016
- **Demais membros** são todos os outros que enxergam a unidade (inclusive coordenadores de outros
  cursos)
- O papel é lido do banco a cada requisição: trocar o coordenador do curso (0011) troca quem gere
  os projetos dele na hora

### Visibilidade

- **Gestor do projeto vê o projeto em qualquer status do semestre e do projeto**
- **Os demais veem** conforme `othersSee` da 0016: `NONE` → nada; `PUBLISHED` → só os projetos
  `PUBLISHED`. Rascunho, nunca
- **Projeto que o usuário não vê é `404 PROJECT_NOT_FOUND`**, como organização e unidade (0009).
  Vale para o `GET` e para toda escrita: quem não vê não descobre que existe
- **`GET …/projects`** filtra por essa regra, projeto a projeto. Aceita `?termId=` e
  `?status=DRAFT|PUBLISHED` (fora do enum: `400`). Ordenada pelo `startDate` do semestre
  decrescente, depois pelo `name`. Sem paginação

### `ProjectAccessService`

O contrato de oferta e quadro:

```ts
type ProjectAccess = TermAccess & {
  project: Project
  curriculum: Curriculum
  course: Course
  isProjectManager: boolean
}

resolveProject(userId: string, orgSlug: string, unitSlug: string, projectId: string): Promise<ProjectAccess>
assertProjectWritable(access: ProjectAccess, action?: ProjectAction): Promise<void> // action padrão: 'edit'
```

- **`resolveProject`** chama `resolveUnit`, procura o projeto **na unidade** e aplica a
  visibilidade: de outra unidade, inexistente, id que não é cuid ou invisível ao usuário → `404
PROJECT_NOT_FOUND`. Não checa a ação
- **`assertProjectWritable`** é o `assertWritable` da unidade seguido do `assertProjectAction` da
  0016 com o `isProjectManager` do acesso. Toda escrita em projeto, oferta, quadro e célula passa
  por ele. Ordem dos erros: organização ou unidade inativa (`409`), plano vencido (`403`), status
  do semestre (`409 TERM_STATUS_FORBIDS`), papel (`403 NOT_ALLOWED`)
- **"Editar projeto" inclui tudo o que mora nele** (0016, nota ¹): oferta, quadro e célula chamam
  `assertProjectWritable(access)` com a ação padrão `edit`

### Projeto

- **`POST` recebe `{ name, termId, curriculumId, workingDays? }`**:
  - `name` com o `nameSchema` da 0004 (`INFO 2026.1`, `Integrado — Manhã`)
  - `termId`: semestre da unidade do caminho, senão `404 TERM_NOT_FOUND`
  - `curriculumId`: currículo de um curso da unidade do caminho, senão `404 CURRICULUM_NOT_FOUND`
  - `workingDays`: `5` ou `6`; ausente → `5`. Outro valor: o `400` da validação
  - `status` = `PUBLISHED`; `createdById` = quem chamou. O projeto **nasce publicado**: o default
    `DRAFT` do schema da 0002 não é usado na criação, e o `status` no corpo é ignorado
- **Ordem no `POST`:** `resolveUnit` (404) → semestre (404) → currículo (404) → gestor calculado
  pelo curso do currículo → `assertWritable` → `assertProjectAction(create)` (`409
TERM_STATUS_FORBIDS` fora de `PLANNING`; `403` para quem não é gestor daquele curso) → curso
  desativado (`409 COURSE_INACTIVE`) → currículo desativado (`409 CURRICULUM_INACTIVE`) → nome
  repetido no semestre (`409 PROJECT_NAME_IN_USE`, também pelo `P2002`) → `201`
- **O coordenador cria projeto só para o curso que coordena**: o papel vem do currículo escolhido
- **Vários projetos do mesmo curso no mesmo semestre** são permitidos (turno, versão alternativa),
  desde que o nome difira
- **`PATCH` recebe `{ name?, workingDays? }`**; sem campo válido → `400` com o item
  `EMPTY_UPDATE`. `termId`, `curriculumId` e `status` no corpo são ignorados. Passa por
  `assertProjectWritable(access, 'edit')`
- **Reduzir `workingDays` de 6 para 5** com alguma célula de sábado (`weekday = 6`) em quadro do
  projeto → `409 WORKING_DAYS_IN_USE`. Sem célula de sábado, passa. Até a spec de quadro, nunca há
  célula
- **Currículo ou curso desativado depois da criação não trava o projeto**: desativar é "não usar
  em projeto novo" (0011)

### Status do projeto

- **`POST …/status` recebe `{ status }`** com `DRAFT` ou `PUBLISHED`. `DRAFT → PUBLISHED` publica;
  `PUBLISHED → DRAFT` despublica. Para o mesmo status → `409 INVALID_PROJECT_TRANSITION` com
  `params: { from, to }`
- **Os dois sentidos são a ação `publish`** da matriz: permitidos em `PLANNING` e `ADJUSTMENTS`,
  pelo gestor do projeto. Ordem: projeto (404) → `assertProjectWritable(access, 'publish')` →
  transição (409) → grava e responde `200`
- **Editar um projeto publicado é permitido** quando a matriz deixa: a mudança aparece na hora para
  quem vê. Não há "rascunho de um publicado"
- **Nascer publicado não expõe nada antes da hora**: só se cria projeto em `PLANNING`, onde os
  demais membros não veem nenhum projeto (0016). `DRAFT` é opcional: quem quer esconder um
  projeto dos demais nos outros status do semestre o despublica
- O `status` só muda por esta rota

### Apagar

- **`DELETE`** apaga o projeto e, em cascata, ofertas, quadros e células (`Cascade` da 0002), e
  responde `204`. É a ação `delete`: só em `PLANNING`, pelo gestor do projeto
  (`assertProjectWritable(access, 'delete')`). Publicado ou não
- Depois de apagado, o currículo e o semestre voltam a poder ser apagados se não tiverem outro
  projeto (`inUse` do currículo, `projectsCount` do semestre)

### Formato

```json
{
  "id": "…",
  "name": "INFO 2026.1",
  "status": "PUBLISHED",
  "workingDays": 5,
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z",
  "term": { "id": "…", "name": "2026.1", "status": "PLANNING" },
  "course": { "id": "…", "name": "Curso Teste", "code": "TESTE" },
  "curriculum": { "id": "…", "name": "Matriz 2024", "code": "2024" },
  "createdBy": { "id": "…", "email": "coordinator@schdlr.dev", "name": "Coordinator Teste" },
  "access": { "isProjectManager": true, "canEdit": true, "canPublish": true, "canDelete": true }
}
```

- **`access`** sai de `isProjectActionAllowed` com o status do semestre e o papel de quem chamou,
  sem contar organização inativa nem plano (que valem para a unidade inteira e o web já sabe pela
  unidade). O web mostra ou esconde os botões por ele

### Códigos de erro

| código                       | status | mensagem                          | quando                                      |
| ---------------------------- | ------ | --------------------------------- | ------------------------------------------- |
| `PROJECT_NOT_FOUND`          | 404    | Project not found                 | inexistente, de outra unidade ou invisível  |
| `PROJECT_NAME_IN_USE`        | 409    | Project name already in use       | nome repetido no semestre                   |
| `INVALID_PROJECT_TRANSITION` | 409    | Invalid project status transition | para o mesmo status; `params: { from, to }` |
| `WORKING_DAYS_IN_USE`        | 409    | Saturday has board slots          | reduzir para 5 dias com célula de sábado    |

- `TERM_NOT_FOUND`, `TERM_STATUS_FORBIDS` (0016), `CURRICULUM_NOT_FOUND`, `CURRICULUM_INACTIVE`
  (0012), `COURSE_INACTIVE` (0011), `NOT_ALLOWED`, `UNIT_INACTIVE`, `ORGANIZATION_INACTIVE` e
  `PLAN_EXPIRED` (0009) são reaproveitados; `EMPTY_UPDATE` é item de `VALIDATION_FAILED`

## Critérios de aceite

- [x] Gestor do projeto (dono, responsável, coordenador do curso) cria, edita, publica e apaga
      conforme a matriz; coordenador de outro curso e professor recebem `403` onde veem e `404`
      onde não veem
- [x] Visibilidade da matriz em todos os status do semestre: os demais não veem nada em
      `PLANNING` e `CANCELLED`, e só os `PUBLISHED` nos outros; rascunho, nunca
- [x] Ação fora do status do semestre dá `409 TERM_STATUS_FORBIDS` antes do `403`
- [x] Em `STARTED`, dono e responsável editam e o coordenador não; ninguém publica
- [x] `termId` e `curriculumId` de fora da unidade dão `404`; curso ou currículo desativado não
      recebe projeto novo (`409`)
- [x] Nome repetido no semestre dá `409 PROJECT_NAME_IN_USE`; o mesmo nome em outro semestre passa
- [x] `workingDays` só 5 ou 6; reduzir para 5 com célula de sábado dá `409 WORKING_DAYS_IN_USE`
- [x] Projeto nasce `PUBLISHED`, com `status` no corpo ignorado
- [x] Publicar e despublicar; para o mesmo status, `409 INVALID_PROJECT_TRANSITION`
- [x] `DELETE` só em `PLANNING`, e leva ofertas, quadros e células
- [x] `isProjectActionAllowed` extraída, o `assertProjectAction` a usa, e o teste da matriz da
      0016 continua passando sem mudança
- [x] `ProjectAccessService` exportado, com `resolveProject` e `assertProjectWritable`
- [x] `access` no formato bate com o que as rotas permitem
- [x] Códigos novos no catálogo da 0008; "Contratos em vigor" do README ganha o gestor do projeto,
      a visibilidade e o `ProjectAccessService`
- [x] Testes unitários do `ProjectAccessService` (visibilidade em cada status do semestre × status
      do projeto × gestor ou não), do service e dos schemas; e2e das rotas com os services
      substituídos
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
id() { node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
MGR=$(login manager@schdlr.dev)
CRD=$(login coordinator@schdlr.dev)
TCH=$(login teacher@schdlr.dev)
U=$API/organizations/root-test-organization/units/unidade-teste
P=$U/projects
COURSE=$(curl -s -H "Authorization: Bearer $CRD" $U/courses \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(c => c.code === "TESTE").id')
CUR=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $U/courses/$COURSE/curricula \
  -d '{"name":"Matriz 2024","code":"2024"}' | id)
TERM=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/terms \
  -d '{"name":"2026.1","startDate":"2026-02-02","endDate":"2026-07-04"}' | id)
OTHER=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/courses -d '{"name":"Outro","code":"OUTRO"}' | id)
OCUR=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/courses/$OTHER/curricula \
  -d '{"name":"Matriz","code":"1"}' | id)
st()  { curl -s -X POST -H "Authorization: Bearer $1" -H "$J" $2/status -d "{\"status\":\"$3\"}" -w ' %{http_code}\n'; }

# PLANNING
PRJ=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $P \
  -d "{\"name\":\"INFO 2026.1\",\"termId\":\"$TERM\",\"curriculumId\":\"$CUR\"}" | id)   # 201, PUBLISHED, 5 dias
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $P \
  -d "{\"name\":\"X\",\"termId\":\"$TERM\",\"curriculumId\":\"$OCUR\"}" -w ' %{http_code}\n'  # 403 (não coordena)
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $P \
  -d "{\"name\":\"INFO 2026.1\",\"termId\":\"$TERM\",\"curriculumId\":\"$CUR\"}" -w ' %{http_code}\n'  # 409 PROJECT_NAME_IN_USE
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $P \
  -d "{\"name\":\"Y\",\"termId\":\"$TERM\",\"curriculumId\":\"$CUR\",\"workingDays\":7}" -w ' %{http_code}\n'  # 400
st $CRD $P/$PRJ PUBLISHED                                                        # 409 INVALID_PROJECT_TRANSITION (já nasce publicado)
curl -s -H "Authorization: Bearer $TCH" $P                                        # [] (PLANNING: demais não veem)
curl -s -H "Authorization: Bearer $TCH" $P/$PRJ -w ' %{http_code}\n'             # 404

# ADJUSTMENTS: o professor vê o publicado; ninguém cria
st $MGR $U/terms/$TERM ADJUSTMENTS                                               # 200
curl -s -H "Authorization: Bearer $TCH" $P                                        # INFO 2026.1, access todo false
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $P \
  -d "{\"name\":\"Z\",\"termId\":\"$TERM\",\"curriculumId\":\"$CUR\"}" -w ' %{http_code}\n'  # 409 TERM_STATUS_FORBIDS
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $P/$PRJ -d '{"workingDays":6}'  # 200
curl -s -X DELETE -H "Authorization: Bearer $CRD" $P/$PRJ -w ' %{http_code}\n'   # 409 TERM_STATUS_FORBIDS
st $CRD $P/$PRJ DRAFT                                                            # 200
curl -s -H "Authorization: Bearer $TCH" $P/$PRJ -w ' %{http_code}\n'             # 404 (rascunho)
st $CRD $P/$PRJ DRAFT                                                            # 409 INVALID_PROJECT_TRANSITION
st $CRD $P/$PRJ PUBLISHED                                                        # 200

# STARTED: só dono e responsável editam; ninguém publica
st $MGR $U/terms/$TERM STARTED                                                   # 200
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $P/$PRJ \
  -d '{"name":"INFO A"}' -w ' %{http_code}\n'                                    # 403
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $P/$PRJ \
  -d '{"name":"INFO A"}' -w ' %{http_code}\n'                                    # 200
st $MGR $P/$PRJ DRAFT                                                            # 409 TERM_STATUS_FORBIDS

# FINISHED: só leitura; CANCELLED não se alcança daqui (FINISHED é final)
st $MGR $U/terms/$TERM FINISHED                                                  # 200
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $P/$PRJ \
  -d '{"name":"W"}' -w ' %{http_code}\n'                                         # 409 TERM_STATUS_FORBIDS
curl -s -H "Authorization: Bearer $TCH" $P/$PRJ -w ' %{http_code}\n'             # 200 (publicado)
kill %1
```

Ao final, apagar por SQL o projeto, o semestre, os currículos e o curso `OUTRO` criados no teste
(o `DELETE` da API não passa em `FINISHED`), e os códigos OTP e refresh tokens dos logins. A
visibilidade em `CANCELLED` fica coberta pelo teste unitário do `ProjectAccessService`.

## Registro

**2026-10-31** — executada com `/spec 0018`, na branch `development`.

Commits: `feat(api): projetos (spec 0018)`.

Verificação: sem `.env`, `pnpm test:api` passa (647 unitários, 141 e2e) e `pnpm build:api` também;
`tsc` e lint limpos; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um
script, todas as linhas da seção "Verificação" deram o esperado. Em `PLANNING`: o `coordinator@`
cria `INFO 2026.1` (`201`, `PUBLISHED`, 5 dias, `access` todo `true`, com `"status":"DRAFT"` no
corpo ignorado); no curso que não coordena → `403`; nome repetido → `409 PROJECT_NAME_IN_USE`; 7 dias
→ `400`; publicar → `409 INVALID_PROJECT_TRANSITION` (já nasce publicado); o `teacher@` lista `[]`
e lê `404`. Em `ADJUSTMENTS`: o `teacher@` vê o publicado com `access` todo `false`; criar → `409
TERM_STATUS_FORBIDS`; o `coordinator@` passa a 6 dias (`200`); apagar → `409 TERM_STATUS_FORBIDS`;
despublicar → `200`, e o `teacher@` lê o rascunho → `404`; `DRAFT` de novo → `409
INVALID_PROJECT_TRANSITION` com `{ from, to }`; publicar de novo → `200`. Em `STARTED`: o
`coordinator@` editando → `403`, o `manager@` → `200`; despublicar → `409 TERM_STATUS_FORBIDS`. Em
`FINISHED`: editar → `409 TERM_STATUS_FORBIDS`; o `teacher@` lê o publicado (`200`). Além do
roteiro: `termId` fora do formato → `404 TERM_NOT_FOUND`; `curriculumId` inexistente → `404
CURRICULUM_NOT_FOUND`; o `teacher@` criando em `PLANNING` → `403`; o master → `404`; o `teacher@`
editando o projeto que não vê → `404`, e o que vê → `403`; em `ADJUSTMENTS`, o `teacher@` criando →
`409` antes do `403`; currículo desativado → `409 CURRICULUM_INACTIVE`, curso desativado → `409
COURSE_INACTIVE`; com uma célula de sábado inserida por SQL, voltar a 5 dias → `409
WORKING_DAYS_IN_USE`, e sem ela → `200`; o mesmo nome num segundo semestre → `201`, e o `DELETE`
dele em `PLANNING` (com quadro e célula inseridos por SQL) → `204`, levando quadro e célula, com o
`projectsCount` do semestre voltando a `0`; o `teacher@` apagando esse projeto, que não vê → `404`.
Uma linha do script, a do `204`, imprimiu `undefined` por formatar uma resposta sem corpo; o
resultado está nas consultas seguintes. No fim, os projetos, semestres, currículos, o curso `OUTRO`
e o que foi inserido por SQL foram apagados, e os códigos OTP e refresh tokens também.

Não exercitado contra o banco: a visibilidade em `CANCELLED` (coberta, como a spec previa, pelo
teste do `ProjectAccessService`: 5 status do semestre × 2 do projeto × gestor ou não, escrita à mão).

Desvios:

- **Além de `isProjectActionAllowed`, `term-policy.ts` ganhou `isProjectActionOpen`** (a ação
  existe no status, para alguém) e **`isProjectVisible`** (a regra de "quem vê"). O
  `assertProjectAction` usa as duas primeiras para manter o `409` antes do `403`; o teste da
  matriz da 0016 passou sem mudança. `isProjectActionAllowed` recebe `roles` como
  `{ isProjectManager, canManageTerm }`.
- **`isProjectManagerOf(access, course, userId)`** é exportado de `project-access.service.ts`: o
  `resolveProject`, a criação e a listagem calculam o gestor pela mesma função.
- **O `POST` resolve o semestre e o currículo direto no banco** (na unidade do `resolveUnit`), sem
  `resolveTerm`, e chama o `assertProjectAction` com o `TermAccess` montado ali, para não resolver a
  unidade duas vezes.
- **A listagem lê os projetos da unidade e filtra a visibilidade em memória**, projeto a projeto,
  com a mesma `isProjectVisible` do `resolveProject`.
- **Ordem no `PATCH`**: projeto (`404`) → `assertProjectWritable(edit)` → sábado em uso (`409`) →
  nome repetido (`409`). A spec só fixava a do `POST` e a do `…/status`.
- **`PATCH` e `…/status` releem o projeto** depois de gravar, para devolver o formato inteiro.
- **O projeto nasce `PUBLISHED`** (a spec mudou depois da primeira execução, e o commit foi refeito
  com `--amend`): o `create` grava `status: 'PUBLISHED'` explicitamente, no lugar do default `DRAFT`
  do schema. Reverificado contra o banco: criar com `"status":"DRAFT"` no corpo → `201` `PUBLISHED`;
  publicar → `409 INVALID_PROJECT_TRANSITION`; o `teacher@` não vê em `PLANNING` (`[]`, `404`) e vê
  em `ADJUSTMENTS` sem publicar à mão (`200`); despublicado, volta a `404`.

## Notas posteriores

**2026-10-31 — spec 0019.** O projeto não nasce mais sem oferta: o `ProjectsService.create` grava
o projeto e gera as ofertas das disciplinas ativas do currículo (`generateOfferings`, de
`offerings/generate-offerings.ts`) no mesmo `$transaction`. O formato do projeto não mudou.
