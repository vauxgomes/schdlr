---
id: 0023
title: Choque ao publicar
status: todo
depends_on: [0018, 0022]
---

# 0023 — Choque ao publicar

## Objetivo

Publicar um projeto (`DRAFT → PUBLISHED`) passa a conferir os choques dele com os projetos já
publicados do semestre e dos semestres que se comparam com ele (0022: datas sobrepostas, como um
anual e um semestral). Com choque, a publicação é recusada e o web mostra a lista. O dono ou o
responsável pela unidade pode publicar mesmo assim, aceitando os choques de forma explícita.

## Por que existe

A grade publicada é a oficial do semestre, e é contra ela que todos os projetos comparam (0022). Um
rascunho vê os choques com a grade publicada, mas a grade publicada não vê os dele. Sem uma
checagem na entrada, um rascunho com choque entraria na grade oficial em silêncio e passaria a
aparecer como choque para os outros cursos. A 0018 deixou a checagem para esta spec, na mesma rota
de status.

## Contexto necessário

- `specs/0018-api-projetos.md` — `POST …/projects/:projectId/status`, `INVALID_PROJECT_TRANSITION`,
  "projeto nasce `PUBLISHED`" e a ação `publish` da matriz
- `specs/0022-api-deteccao-de-choque.md` — a definição de choque, o escopo da comparação, o
  `ClashService` e o formato do choque
- `specs/0016-api-semestres.md` — `canManageTerm` (dono ou responsável)
- `specs/0008-api-codigos-de-erro.md` — `AppException` e `params`
- `apps/api/src/modules/projects/projects.service.ts` (`changeStatus`) e
  `apps/api/src/modules/clashes/`

## Escopo

**Entra:**

- A checagem no `ProjectsService.changeStatus` (0018), na transição `DRAFT → PUBLISHED`
- `acceptClashes` no corpo do `POST …/status`
- `PROJECT_HAS_CLASHES` no catálogo
- Nota datada no fim da 0018

## Não entra

- Barrar edição de projeto já publicado por choque: alocar continua sendo só aviso (0022). Como o
  projeto nasce publicado (0018), a maior parte da montagem acontece publicada, com o aviso na
  célula
- Barrar a criação do projeto: ele nasce publicado e sem célula, então não tem choque
- Registrar quem aceitou quais choques: o schema não guarda
- Checagem ao despublicar (`PUBLISHED → DRAFT`): tirar da grade oficial não cria choque
- Mudança de schema ou migration

## Decisões já tomadas

### Quais choques barram

- **Só os choques do projeto com outros projetos publicados**, do semestre dele ou de um semestre
  que se compara com o dele (0022). Os choques entre células
  do próprio projeto (dois quadros dele no mesmo horário) não barram: continuam como aviso, como
  enquanto ele era rascunho. Eles só dizem respeito ao próprio projeto
- O cálculo é o `findProjectClashes` da 0022, filtrado aos pares em que a outra célula é de outro
  projeto

### Publicar

- **`POST …/status` passa a aceitar `{ status, acceptClashes? }`**; `acceptClashes` é booleano,
  ausente → `false`. Só tem efeito em `DRAFT → PUBLISHED`; nas outras transições é ignorado
- **Ordem em `DRAFT → PUBLISHED`**: projeto (`404`) → `assertProjectWritable(access, 'publish')`
  (como na 0018) → transição → choques com publicados → grava e responde `200`
- **Com choque e sem `acceptClashes`** → `409 PROJECT_HAS_CLASHES` com
  `params: { count, teacher, location }` (total e por tipo). O web busca a lista em
  `GET …/projects/:projectId/clashes` (0022). Nada é gravado
- **Com choque e `acceptClashes: true`**: só o dono e o responsável pela unidade (`canManageTerm`)
  podem. O coordenador recebe `403 NOT_ALLOWED`: aceitar um choque com outro curso é decisão da
  unidade, não de um curso. Publica e responde `200`
- **Sem choque**, publica com ou sem `acceptClashes`, como hoje
- **Corrida**: dois rascunhos publicados ao mesmo tempo poderiam passar cada um sem ver o outro —
  no mesmo semestre, ou em semestres que se comparam (o anual e o `2026.1`). A checagem e a
  gravação rodam numa transação com a linha da **unidade** travada (`FOR UPDATE`): as publicações
  da unidade entram uma de cada vez, e a segunda vê a primeira já publicada. Travar só o semestre
  não bastaria, porque a comparação cruza semestres

### Resposta

- A resposta de sucesso é o projeto, no formato da 0018, sem mudança
- `PROJECT_HAS_CLASHES` não traz a lista no corpo do erro: a lista pode ser grande, e o `params` do
  catálogo (0008) é para dado pequeno. O `count` diz ao web que há o que mostrar

### Códigos de erro

| código                | status | mensagem                                | quando                                                                   |
| --------------------- | ------ | --------------------------------------- | ------------------------------------------------------------------------ |
| `PROJECT_HAS_CLASHES` | 409    | Project clashes with published projects | publicar com choque, sem aceitar; `params: { count, teacher, location }` |

- `NOT_ALLOWED` (aceitar choque sem ser dono ou responsável), `TERM_STATUS_FORBIDS`,
  `INVALID_PROJECT_TRANSITION` e os demais da 0018 continuam

## Critérios de aceite

- [ ] `DRAFT → PUBLISHED` com choque contra projeto publicado dá `409 PROJECT_HAS_CLASHES` com
      `count` e a contagem por tipo, e não grava
- [ ] Choques só entre células do próprio projeto não barram
- [ ] `acceptClashes: true` publica com choque pelo dono ou responsável; pelo coordenador dá `403`
- [ ] Sem choque, publica como antes; `PUBLISHED → DRAFT` não checa nada
- [ ] Checagem e gravação numa transação com a unidade travada
- [ ] Choque com projeto publicado de semestre que se compara (anual × semestral) também barra
- [ ] O teste da matriz da 0016 e os da 0018 continuam passando
- [ ] Código novo no catálogo da 0008; nota datada na 0018; "Contratos em vigor" do README ganha a
      regra de publicação
- [ ] Testes unitários do `changeStatus` (com e sem choque, com e sem `acceptClashes`, por papel) e
      do schema; e2e da rota com o service substituído
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

# contra o banco de dev, em bash; preparo como na 0022: projetos A e B do mesmo semestre,
# publicados, com o teacher@ em A1/M1 e B1/ALT1 na segunda (choque TEACHER)
st() { curl -s -X POST -H "Authorization: Bearer $1" -H "$J" $U/projects/$2/status -d "$3" -w ' %{http_code}\n'; }

st $CRD $B '{"status":"DRAFT"}'                                       # 200
st $CRD $B '{"status":"PUBLISHED"}'                                   # 409 PROJECT_HAS_CLASHES, count 1, teacher 1
st $CRD $B '{"status":"PUBLISHED","acceptClashes":true}'              # 403 (coordenador não aceita)
st $MGR $B '{"status":"PUBLISHED","acceptClashes":true}'              # 200
st $CRD $B '{"status":"DRAFT"}'                                       # 200

# choque só interno não barra: tira o teacher@ de B1/ALT1, cria um segundo quadro B2 no mesmo
# bloco e põe a mesma oferta FIS-101 de B em B1/ALT1 e B2/ALT1 na terça
st $CRD $B '{"status":"PUBLISHED"}'                                   # 200 (só choque interno)
```

Ao final, apagar por SQL o que o preparo criou, e os códigos OTP e refresh tokens dos logins.
