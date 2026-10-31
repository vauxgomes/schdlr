---
id: 0016
title: Semestres
status: todo
depends_on: [0008, 0009, 0011]
---

# 0016 — Semestres

## Objetivo

O dono e o responsável pela unidade passam a criar, listar, editar e apagar os semestres da
unidade, e a conduzir cada um pelo ciclo de status: planejamento, ajustes, em andamento,
encerrado ou cancelado. E fica fixado, como contrato, o que cada status do semestre permite fazer
com os projetos dele (criar, editar, publicar) e quem os enxerga. A spec de projeto aplica; esta
entrega a regra e o código que a consulta.

⚠️ **Esta spec estabelece contrato** (o ciclo de status do semestre, a matriz "status × projetos"
e o `TermAccessService`). Deve ser executada sozinha, com `/spec 0016`.

## Por que existe

O projeto de horários pertence a um semestre (`Project.termId`), e o choque é detectado dentro do
mesmo semestre (0002). O momento do semestre muda o que faz sentido: no planejamento, os
coordenadores montam e refazem à vontade e os professores ainda não veem nada; nos ajustes, a
grade já foi divulgada e só se corrige; com as aulas começadas, mexer é exceção; encerrado, é
histórico. Sem essa regra num lugar só, cada spec de projeto, oferta e quadro a reinventaria.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `Term` (`name` único por unidade, `startDate` e
  `endDate` em `@db.Date`, `status`, `createdById`, **sem `isActive`**), `TermStatus`,
  `ProjectStatus`, `Project.termId` em `Restrict`, "choque entre semestres simultâneos (v2)" e a
  regra `endDate >= startDate`
- `specs/0009-api-organizacao-e-unidade.md` — `TenantAccessService` (`resolveUnit`,
  `assertWritable`)
- `specs/0011-api-cursos.md` — o coordenador de curso, que entra nos "gestores do projeto"
- `specs/0012-api-curriculos.md` — o padrão de apagar enquanto não está em uso
- `specs/0008-api-codigos-de-erro.md` — `AppException`, o catálogo e `params`
- `specs/README.md`, "Contratos em vigor"

## Escopo

**Entra:**

- Módulo `src/modules/terms/` com controller, service, schemas Zod, o `TermAccessService`
  (exportado) e `term-policy.ts` (a matriz, exportada)
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                          | o que faz                     |
  | ----------------------------- | ----------------------------- |
  | `POST …/terms`                | cria semestre, em `PLANNING`  |
  | `GET …/terms`                 | lista os semestres da unidade |
  | `GET …/terms/:termId`         | um semestre                   |
  | `PATCH …/terms/:termId`       | edita nome e datas            |
  | `POST …/terms/:termId/status` | muda o status                 |
  | `DELETE …/terms/:termId`      | apaga, se não tem projeto     |

## Não entra

- Projetos, ofertas e quadros, e aplicar a matriz a eles: specs próprias. Aqui só a regra e o
  código que a responde
- **Mudar o status pela data.** O status é sempre manual; `startDate` e `endDate` são informativos
  e não disparam nada. Automação fica para depois
- Choque entre semestres simultâneos (v2, como a 0002). Semestres da mesma unidade podem se
  sobrepor nas datas
- Reabrir semestre encerrado ou cancelado
- Notificar os professores quando o semestre passa a ajustes
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis

- **Escreve** (criar, editar, mudar status, apagar): o dono e o responsável pela unidade.
  Coordenador e professor recebem `403 NOT_ALLOWED`. O semestre é da unidade inteira, não de um
  curso
- **Lê** quem enxerga a unidade (`resolveUnit`), em qualquer status, inclusive `CANCELLED`. O que
  muda com o status é o acesso aos **projetos**, não ao semestre
- Toda escrita passa por `assertWritable` da 0009

### Ciclo de status

```
PLANNING ⇄ ADJUSTMENTS ⇄ STARTED → FINISHED
    │            │           │
    └────────────┴───────────┴──→ CANCELLED
```

| status        | produto      | sentido                                                        |
| ------------- | ------------ | -------------------------------------------------------------- |
| `PLANNING`    | Planejamento | os gestores montam os projetos; os demais ainda não veem nada  |
| `ADJUSTMENTS` | Ajustes      | a grade publicada foi divulgada; só se corrige o que existe    |
| `STARTED`     | Em andamento | as aulas começaram; mudar é exceção, do dono ou do responsável |
| `FINISHED`    | Encerrado    | histórico, só leitura                                          |
| `CANCELLED`   | Cancelado    | descartado, só leitura e só para os gestores                   |

- **Transições permitidas**, e só elas:

  | de            | para                                   |
  | ------------- | -------------------------------------- |
  | `PLANNING`    | `ADJUSTMENTS`, `CANCELLED`             |
  | `ADJUSTMENTS` | `PLANNING`, `STARTED`, `CANCELLED`     |
  | `STARTED`     | `ADJUSTMENTS`, `FINISHED`, `CANCELLED` |
  | `FINISHED`    | —                                      |
  | `CANCELLED`   | —                                      |

- **Há duas voltas, cada uma de um passo**:
  - `ADJUSTMENTS → PLANNING`: a grade foi divulgada cedo demais e precisa de projeto novo
  - `STARTED → ADJUSTMENTS`: as aulas começaram, mas a grade ainda pede correção que não é
    exceção — o coordenador volta a editar os projetos do curso dele, e publicar e despublicar
    voltam a valer. Os demais membros continuam vendo os `PUBLISHED`
- **As voltas encadeiam**: `STARTED → ADJUSTMENTS → PLANNING` é permitido, um passo por vez. Em
  `PLANNING`, a grade volta a sumir para os demais membros, como a matriz manda
- **`FINISHED` e `CANCELLED` são finais.** O semestre fica só leitura: editar nome ou datas dá
  `409 TERM_CLOSED`, e mudar o status dá `409 INVALID_TERM_TRANSITION`
- **Transição fora da tabela** (inclusive para o mesmo status) → `409 INVALID_TERM_TRANSITION`
  com `params: { from, to }`
- **Mudar o status não mexe nos projetos.** Rascunhos continuam rascunhos e publicados continuam
  publicados; o que muda é o que a matriz abaixo permite daí em diante
- O semestre nasce em `PLANNING`. `status` no corpo do `POST` ou do `PATCH` é ignorado; só a rota
  `…/status` o muda

### Matriz: status do semestre × projetos

**Gestores do projeto** são o dono, o responsável pela unidade e o coordenador do curso do
currículo do projeto. **Demais membros** são todos os outros que enxergam a unidade. A spec de
projeto pode refinar quem é gestor (por exemplo, com membro de projeto), mas não a matriz.

| status        | criar projeto | editar projeto¹       | publicar e despublicar | gestores veem | demais membros veem |
| ------------- | ------------- | --------------------- | ---------------------- | ------------- | ------------------- |
| `PLANNING`    | sim           | gestores              | sim                    | todos         | nenhum              |
| `ADJUSTMENTS` | não           | gestores              | sim                    | todos         | os `PUBLISHED`      |
| `STARTED`     | não           | só dono e responsável | não                    | todos         | os `PUBLISHED`      |
| `FINISHED`    | não           | ninguém               | não                    | todos         | os `PUBLISHED`      |
| `CANCELLED`   | não           | ninguém               | não                    | todos         | nenhum              |

¹ Editar projeto inclui tudo o que mora dentro dele: dados do projeto, ofertas, quadros e células.

- **Os demais membros nunca veem rascunho (`DRAFT`)**, em nenhum status. Em `PLANNING` não veem
  nem o publicado: a grade só é divulgada quando o semestre passa a ajustes
- **Apagar projeto segue "criar"**: só em `PLANNING`
- **`STARTED` restringe ao dono e ao responsável** porque troca de professor ou de sala com aula
  em andamento é decisão da unidade, não do coordenador
- **Projeto que o usuário não pode ver é `404`**, como organização e unidade (0009). Ação que a
  matriz não permite no status atual, para quem vê o projeto, é `409 TERM_STATUS_FORBIDS` com
  `params: { status, action }` — é o momento do semestre que impede, não o papel. Faltando o papel
  (por exemplo, coordenador editando em `STARTED`), é `403 NOT_ALLOWED`

### `term-policy.ts` e `TermAccessService`

O contrato da spec de projeto (e das de oferta e quadro):

```ts
// term-policy.ts — dado puro, sem banco
type ProjectAction = 'create' | 'edit' | 'publish' | 'delete'
type ProjectEditors = 'MANAGERS' | 'UNIT_ADMINS' | 'NOBODY' // gestores | dono e responsável | ninguém
type ProjectVisibility = 'NONE' | 'PUBLISHED'

export const TERM_TRANSITIONS: Record<TermStatus, readonly TermStatus[]>
export const TERM_PROJECT_POLICY: Record<
  TermStatus,
  { create: boolean; edit: ProjectEditors; publish: boolean; othersSee: ProjectVisibility }
>

// term-access.service.ts
type TermAccess = UnitAccess & { term: Term; canManageTerm: boolean } // dono ou responsável

resolveTerm(userId: string, orgSlug: string, unitSlug: string, termId: string): Promise<TermAccess>
assertTermWritable(access: TermAccess): Promise<void>
assertProjectAction(
  access: TermAccess,
  action: ProjectAction,
  roles: { isProjectManager: boolean }, // gestor deste projeto, calculado pela spec de projeto
): void
```

- **`resolveTerm`** chama `resolveUnit` e procura o semestre **na unidade**: de outra unidade,
  inexistente ou que não é cuid → `404 TERM_NOT_FOUND`. Não checa papel
- **`assertTermWritable`** é para escrita **no próprio semestre**: `assertWritable` da unidade e,
  depois, `FINISHED` ou `CANCELLED` → `409 TERM_CLOSED`
- **`assertProjectAction`** aplica a matriz: primeiro o status (`409 TERM_STATUS_FORBIDS` se a
  ação não existe naquele status), depois o papel (`403 NOT_ALLOWED`). Não chama `assertWritable`:
  a spec de projeto chama os dois. É síncrono e só lê o que recebe, para ser testado sem banco
- A **visibilidade** (`othersSee`) é aplicada pela spec de projeto nas listagens e no `resolve` do
  projeto, a partir da `TERM_PROJECT_POLICY`

### Semestre

- **`POST` recebe `{ name, startDate, endDate }`**:
  - `name` com o `nameSchema` da 0004 (`2026.1`, `2026 — 1º semestre`)
  - `startDate` e `endDate` como data sem hora, `YYYY-MM-DD` (`z.iso.date()`); `endDate >=
startDate`, senão `400` com o item `END_BEFORE_START` (um `custom` com `params.code`, como a
    0008 manda), no `path` `endDate`
  - `createdById` = quem chamou; `status` = `PLANNING`
- **Nome repetido na unidade** → `409 TERM_NAME_IN_USE`, também pelo `P2002`
- **`PATCH` recebe `{ name?, startDate?, endDate? }`**; sem campo válido → `400` com o item
  `EMPTY_UPDATE`. A regra das datas vale para o resultado (a data nova contra a que fica). Passa por
  `assertTermWritable`
- **`POST …/status` recebe `{ status }`** com um valor de `TermStatus`. Ordem: semestre (`404`) →
  papel (`403`) → `assertWritable` da unidade → transição (`409 INVALID_TERM_TRANSITION`) →
  grava e responde `200` com o semestre
- **`GET …/terms`** lista todos os semestres da unidade, ordenados por `startDate` decrescente
  (os mais recentes primeiro) e depois `name`. Aceita `?status=` com um valor de `TermStatus`
  (fora do enum: `400`). Sem paginação

### Apagar

- **`Term` não tem `isActive`**: não se desativa. O que encerra um semestre que não vai acontecer é
  o `CANCELLED`
- **`DELETE` apaga o semestre** e responde `204` enquanto ele não tem projeto, em qualquer status.
  Com projeto → `409 TERM_IN_USE`, conferido antes e pelo `P2003` do `Restrict` de
  `Project.termId`. Passa por `assertWritable` da unidade (não pelo `TERM_CLOSED`: um semestre
  cancelado e vazio pode sair)

### Formato

```json
{
  "id": "…",
  "name": "2026.1",
  "startDate": "2026-02-02",
  "endDate": "2026-07-04",
  "status": "PLANNING",
  "nextStatuses": ["ADJUSTMENTS", "CANCELLED"],
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z",
  "createdBy": { "id": "…", "email": "manager@schdlr.dev", "name": "Manager Teste" },
  "projectsCount": 0,
  "access": { "canManageTerm": true }
}
```

- **`startDate` e `endDate` saem como `YYYY-MM-DD`**, sem hora nem fuso, como entraram. O
  `@db.Date` chega do Prisma como `Date` à meia-noite UTC; a formatação usa UTC
- **`nextStatuses`** é a linha do status atual em `TERM_TRANSITIONS`, para o web montar os botões.
  Vazio em `FINISHED` e `CANCELLED`
- **`projectsCount`** conta todos os projetos do semestre, de qualquer status, e é o mesmo número
  para todos (o semestre é visível a todos; quais projetos cada um vê é da spec de projeto)

### Códigos de erro

| código                    | status | mensagem                               | quando                                                   |
| ------------------------- | ------ | -------------------------------------- | -------------------------------------------------------- |
| `TERM_NOT_FOUND`          | 404    | Term not found                         | id inexistente ou de outra unidade                       |
| `TERM_NAME_IN_USE`        | 409    | Term name already in use               | nome repetido na unidade                                 |
| `TERM_CLOSED`             | 409    | Term is closed                         | editar semestre `FINISHED` ou `CANCELLED`                |
| `INVALID_TERM_TRANSITION` | 409    | Invalid term status transition         | transição fora da tabela; `params: { from, to }`         |
| `TERM_IN_USE`             | 409    | Term has projects                      | apagar semestre com projeto                              |
| `TERM_STATUS_FORBIDS`     | 409    | Term status does not allow this action | usado pela spec de projeto; `params: { status, action }` |

- `NOT_ALLOWED`, `UNIT_INACTIVE`, `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` são os da 0009;
  `EMPTY_UPDATE` e `END_BEFORE_START` são itens de `VALIDATION_FAILED`
- `TERM_STATUS_FORBIDS` entra no catálogo aqui, junto com `assertProjectAction`, que o lança

## Critérios de aceite

- [ ] Dono e responsável escrevem; coordenador e professor recebem `403`; quem não enxerga a
      unidade, `404`
- [ ] Todo membro lista e lê os semestres, em qualquer status; `?status=` filtra
- [ ] Semestre nasce em `PLANNING`; `status` no `POST`/`PATCH` é ignorado
- [ ] `endDate` antes de `startDate` dá `400` com `END_BEFORE_START`, também no `PATCH` com uma
      data só; datas saem `YYYY-MM-DD`
- [ ] Nome repetido na unidade dá `409 TERM_NAME_IN_USE`
- [ ] Todas as transições da tabela passam; todas as outras, inclusive para o mesmo status, dão
      `409 INVALID_TERM_TRANSITION` com `params`
- [ ] `FINISHED` e `CANCELLED` não se editam (`409 TERM_CLOSED`) nem mudam de status
- [ ] `DELETE` apaga semestre sem projeto em qualquer status; com projeto dá `409 TERM_IN_USE`,
      inclusive pelo `P2003`
- [ ] `nextStatuses` e `projectsCount` no formato
- [ ] `TERM_TRANSITIONS` e `TERM_PROJECT_POLICY` exportados, com exatamente as tabelas acima
- [ ] `assertProjectAction` cobre a matriz inteira em teste unitário: cada status × ação × gestor
      ou não, com `409 TERM_STATUS_FORBIDS` antes de `403 NOT_ALLOWED`
- [ ] `TermAccessService` exportado, com `resolveTerm`, `assertTermWritable` e `assertProjectAction`
- [ ] Códigos novos no catálogo da 0008; "Contratos em vigor" do README ganha o ciclo e a matriz
- [ ] Testes unitários do service, da política e dos schemas; e2e das rotas com o service
      substituído
- [ ] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam

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
T=$API/organizations/root-test-organization/units/unidade-teste/terms
st() { curl -s -X POST -H "Authorization: Bearer $1" -H "$J" $T/$2/status -d "{\"status\":\"$3\"}" -w ' %{http_code}\n'; }

curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"2026.1","startDate":"2026-02-02","endDate":"2026-07-04","status":"STARTED"}'  # 201, PLANNING
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"2026.1","startDate":"2026-02-02","endDate":"2026-07-04"}' -w ' %{http_code}\n'  # 409 TERM_NAME_IN_USE
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"X","startDate":"2026-08-01","endDate":"2026-07-01"}' -w ' %{http_code}\n'     # 400 END_BEFORE_START
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $T \
  -d '{"name":"Y","startDate":"2026-08-01","endDate":"2026-12-01"}' -w ' %{http_code}\n'     # 403
curl -s -H "Authorization: Bearer $TCH" $T                                         # 2026.1, nextStatuses

TERM=<id do 2026.1>
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $T/$TERM \
  -d '{"endDate":"2026-01-01"}' -w ' %{http_code}\n'                               # 400 (antes do início que ficou)
st $CRD $TERM ADJUSTMENTS                                                          # 403
st $MGR $TERM STARTED                                                              # 409 INVALID_TERM_TRANSITION
st $MGR $TERM ADJUSTMENTS                                                          # 200
st $MGR $TERM PLANNING                                                             # 200 (volta)
st $MGR $TERM ADJUSTMENTS                                                          # 200
st $MGR $TERM STARTED                                                              # 200, nextStatuses com ADJUSTMENTS
st $MGR $TERM PLANNING                                                             # 409 (volta é um passo só)
st $MGR $TERM ADJUSTMENTS                                                          # 200 (volta)
st $MGR $TERM STARTED                                                              # 200
st $MGR $TERM FINISHED                                                             # 200, nextStatuses []
st $MGR $TERM STARTED                                                              # 409 (FINISHED é final)
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $T/$TERM \
  -d '{"name":"Z"}' -w ' %{http_code}\n'                                           # 409 TERM_CLOSED
st $MGR $TERM CANCELLED                                                            # 409
curl -s -H "Authorization: Bearer $TCH" "$T?status=FINISHED"                       # 2026.1

# em uso: um projeto inserido por SQL segura o semestre
# (inserir e conferir DELETE → 409 TERM_IN_USE; depois apagar o projeto por SQL)
curl -s -X DELETE -H "Authorization: Bearer $MGR" $T/$TERM -w ' %{http_code}\n'   # 204 (encerrado e vazio)
kill %1
```

Ao final, apagar os semestres criados no teste e o que tiver sido inserido por SQL, e apagar os
códigos OTP e refresh tokens dos logins.
