---
id: 0022
title: Detecção de choque
status: todo
depends_on: [0015, 0017, 0018, 0019, 0020, 0021]
---

# 0022 — Detecção de choque

## Objetivo

O schdlr passa a fazer o que o define: avisar, durante a montagem, quando o mesmo professor ou o
mesmo local físico está em duas células que se sobrepõem no mesmo dia da semana, em semestres da
unidade que acontecem ao mesmo tempo — o mesmo semestre, ou um semestre anual e um semestral cujas
datas se cruzam. O aviso aparece na célula ao alocar, no quadro e numa lista por projeto; os
administradores da unidade veem também todos os choques de um semestre. Choque é aviso: não impede
alocar.

⚠️ **Esta spec estabelece contrato** (a definição de choque, quais projetos entram na comparação e
o `ClashService`). Deve ser executada sozinha, com `/spec 0022`.

## Por que existe

É o "Por que existe" da 0002: o schdlr é um validador de horários. As specs anteriores entregaram as
peças (oferta com professor, local, bloco, célula) e deixaram regras para cá: oferta sem professor
não gera choque de professor (0002), `VIRTUAL` nunca gera choque de local (0015), a sobreposição é
`[start, end)` entre horários de blocos diferentes (0017), e alocar não verifica choque (0020).

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — "Por que existe", "intervalo semiaberto `[start, end)`",
  "oferta sem professor… não gera choque de professor, mas continua gerando choque de local",
  "choque entre semestres simultâneos (v2)" — que esta spec antecipa — e os índices de
  `board_slots`
- `specs/0020-api-quadros.md` — célula (só existe com conteúdo), o `PUT` da célula, o formato da
  grade e "nada aqui verifica choque"
- `specs/0019-api-ofertas.md` — o `PATCH { teacherId }` da oferta
- `specs/0021-api-professores.md` — o `Teacher` (o professor da oferta), inclusive o professor a
  contratar, sem usuário
- `specs/0017-api-blocos-de-horarios.md` — `overlaps`, `toHHMM` (`time-slots/time.ts`)
- `specs/0015-api-locais.md` — `VIRTUAL` não é físico
- `specs/0018-api-projetos.md` — `ProjectAccessService`, visibilidade, `DRAFT`/`PUBLISHED`
- `specs/0016-api-semestres.md` — `TermAccessService` (`resolveTerm`, `canManageTerm`),
  `startDate`/`endDate` e "semestres da mesma unidade podem se sobrepor nas datas"
- `apps/api/src/modules/boards/` (`BoardsService`, que monta a grade), `board-slots/`
  (`BoardSlotsService`, o `PUT`; `board-slot-view.ts` com `CellView`, `toCellView`, `emptyCell`) e
  `time-slots/time.ts`

## Escopo

**Entra:**

- Módulo `src/modules/clashes/` com o `ClashService` (exportado), controllers e o formato do choque
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                                | o que faz                                              |
  | ----------------------------------- | ------------------------------------------------------ |
  | `GET …/projects/:projectId/clashes` | os choques que envolvem células do projeto             |
  | `GET …/terms/:termId/clashes`       | todos os choques entre projetos publicados do semestre |

- No quadro (0020): cada célula ganha `clashes` (os tipos), o quadro ganha `clashesCount`, e a
  resposta do `PUT` da célula traz os choques daquela célula
- Na oferta (0019): a resposta do `PATCH` que troca o professor traz os choques que a troca deixa
- Notas datadas no fim da 0002 (o choque entre semestres simultâneos da mesma unidade deixa de ser
  v2) e da 0016 (as datas do semestre passam a definir com quem ele se compara)

## Não entra

- **Bloquear publicação por choque**: spec seguinte (0023)
- Bloquear alocação: choque é sempre aviso aqui
- **Choque entre unidades ou organizações** (o mesmo professor em duas): v2. Entre semestres da
  mesma unidade, entra (ver "Quais semestres se comparam")
- Tipo de semestre (anual, semestral) no schema: um semestre anual é só um semestre com datas de um
  ano
- Turma conjunta ou choque aceito de propósito (duas turmas no mesmo auditório com o mesmo
  professor): não há como marcar um choque como aceito; ele aparece
- Disponibilidade do professor (não pode às sextas), carga máxima, intervalo mínimo entre aulas
- Capacidade do local × tamanho da turma
- Notificar alguém do choque
- Mudança de schema ou migration

## Decisões já tomadas

### O que é choque

- **Duas células chocam** quando, ao mesmo tempo:
  1. são de projetos de **semestres que se comparam** (ver abaixo): o mesmo semestre, ou dois
     semestres da unidade cujas datas se sobrepõem
  2. estão no **mesmo dia da semana** (`weekday`)
  3. os horários se **sobrepõem**, `a.start < b.end && b.start < a.end` (o `overlaps` da 0017),
     mesmo que sejam de blocos diferentes. Horários que encostam (`07:50` e `07:50`) não chocam
  4. e têm o **mesmo professor** (choque `TEACHER`) ou o **mesmo local** (choque `LOCATION`)
- **Professor** é o `teacherId` da oferta da célula, um `Teacher` (0021). Célula sem oferta, ou
  oferta sem professor, não gera choque de professor (0002)
- **Professor a contratar choca como qualquer outro**: é um `Teacher`, só sem usuário. A mesma vaga
  em duas turmas ao mesmo tempo é choque. Quando a pessoa contratada chega, ela tem o próprio
  `Teacher` (0021), e trocar a vaga por ela na oferta é a troca de professor abaixo, com a
  verificação dos choques dela
- **Professor desativado** (0021) choca nas ofertas que ainda o têm
- **Local** é o `locationId` da célula. Local `VIRTUAL` nunca gera choque (0015). Local desativado
  gera como qualquer outro: a alocação existe
- **Célula bloqueada** é vazia (0002) e nunca choca
- **Mesmo professor e mesmo local** nas duas células são **dois choques**, um de cada tipo
- **A mesma oferta em dois quadros no mesmo horário** é choque de professor (se ela tem
  professor): é a mesma pessoa em duas turmas ao mesmo tempo
- **Dentro de um mesmo quadro não há choque**: as células do quadro usam um bloco só, e os horários
  de um bloco não se sobrepõem (0017). Entre quadros do mesmo projeto, há

### Quais semestres se comparam

- **Dois semestres da mesma unidade se comparam quando as datas se sobrepõem**, contando os dias das
  pontas: `a.startDate <= b.endDate && b.startDate <= a.endDate`. Um semestre sempre se compara
  consigo mesmo
- **É o que resolve o curso anual**: o semestre `2026` (fevereiro a dezembro) se sobrepõe ao
  `2026.1` (fevereiro a julho) e ao `2026.2` (agosto a dezembro), então o integrado anual é
  comparado com o superior nos dois. O `2026.1` e o `2026.2` não se sobrepõem e não se comparam
- **As datas passam a importar.** Até aqui eram informativas (0016); agora definem com quem o
  semestre se compara. Um `2026.1` que termina depois do início do `2026.2` faz os dois se compararem
- **Semestre `CANCELLED` não se compara com outros**: o que nele está não vai acontecer. Os projetos
  dele ainda veem os choques entre si
- A sobreposição é por data, não por período exato: semestres que se cruzam por um dia já se
  comparam inteiros. Não há recorte por semana

### Quais projetos entram na comparação

- **Visto de um projeto P**: as células de P entre si, e as de P contra as de todo projeto
  `PUBLISHED` de um semestre que se compara com o de P (inclusive o próprio). Rascunhos de outros
  não entram
- **Visto de um semestre S**: os choques que envolvem alguma célula de projeto `PUBLISHED` de S,
  contra os `PUBLISHED` de S e dos semestres que se comparam com S
- **Por isso, um rascunho vê os choques com a grade publicada, mas a grade publicada não vê os
  choques com rascunhos.** Rascunho é espaço de trabalho; o que é oficial é o publicado
- Projetos de semestres em qualquer status, exceto o `CANCELLED` (acima), entram

### `ClashService`

O contrato da 0023 e de quem mostrar choque depois:

```ts
type ClashCell = {
  boardSlotId: string
  projectId: string
  boardId: string
  weekday: number
  timeSlotId: string
  startTime: number // minutos
  endTime: number
  teacherId: string | null
  locationId: string | null // já sem os VIRTUAL
}

type Clash = { type: 'TEACHER' | 'LOCATION'; a: ClashCell; b: ClashCell }

findProjectClashes(projectId: string): Promise<Clash[]>   // P × P e P × publicados dos semestres que se comparam
findTermClashes(termId: string): Promise<Clash[]>         // publicados de S × publicados dos semestres que se comparam
findCellClashes(boardSlotId: string): Promise<Clash[]>    // a célula, vista do projeto dela
```

- **Uma consulta e o resto em memória**: lê de uma vez as células com conteúdo dos projetos que
  entram (com o horário, o professor da oferta e o local, já sem `VIRTUAL`), agrupa por dia e por
  professor ou local, e compara os pares do grupo com `overlaps`. Sem SQL de sobreposição; a regra
  mora numa função pura (`detectClashes(cells): Clash[]`), testada sem banco
- **Cada par aparece uma vez por tipo.** Em `findProjectClashes`, quando só uma das células é de P,
  ela é o `a`
- **Ordem**: por `weekday`, depois pelo `startTime` de `a`, depois pelo tipo
- O choque é **calculado na leitura**, sempre; nada é gravado

### Rotas

- **`GET …/projects/:projectId/clashes`**: quem vê o projeto (`resolveProject`, 0018); quem não vê
  recebe `404 PROJECT_NOT_FOUND`. Aceita `?boardId=` (só os que envolvem aquele quadro) e
  `?type=TEACHER|LOCATION`
- **`GET …/terms/:termId/clashes`**: só o dono e o responsável pela unidade (`canManageTerm`, 0016);
  os demais → `403 NOT_ALLOWED`. Aceita `?type=`
- **O choque mostra a outra célula mesmo que o usuário não possa abrir o projeto dela** (rascunho
  alheio não aparece, porque não entra na comparação; publicado em `PLANNING`, sim). Para resolver
  um choque com outro curso, o coordenador precisa saber com quem é. Vão o nome do projeto, o do
  quadro, a posição, a disciplina e o professor ou local — nada além disso do outro projeto

### No quadro (0020)

- **Cada célula** (`CellView`, em `board-slot-view.ts`) do `GET …/boards/:boardId` ganha `clashes: ("TEACHER" | "LOCATION")[]`, vazio
  quando não há; o quadro ganha `clashesCount` (quantos choques envolvem alguma célula dele). O
  detalhe fica na rota do projeto com `?boardId=`
- **O `PUT` da célula** (`BoardSlotsService`) devolve, além da célula, `clashes`: os choques daquela célula no formato
  completo abaixo. É o aviso imediato ao alocar
- O cálculo do quadro é o `findProjectClashes` do projeto, filtrado pelo quadro: uma consulta por
  `GET`, não uma por célula

### Ao trocar o professor da oferta (0019)

- **Trocar o `teacherId` de uma oferta move de uma vez todas as células dela para outro
  professor**, e pode criar choques em várias células, ou desfazê-los. É uma troca possível quando
  a matriz da 0016 deixa editar o projeto: só em `PLANNING` e `ADJUSTMENTS`, pelos gestores (em
  `STARTED` nada se edita desde a 0021)
- **A resposta do `PATCH …/offerings/:offeringId`** ganha `clashes`: os choques `TEACHER` que
  envolvem alguma célula da oferta, já com o professor novo, no formato abaixo. É o aviso imediato,
  como no `PUT` da célula. Vazio quando a troca não deixa choque, ou quando o professor sai (`null`)
- O cálculo é o `findProjectClashes` do projeto da oferta, filtrado às células dela e ao tipo
  `TEACHER`. A troca continua `200` com choque: é aviso
- **Choque de local não muda** com a troca de professor e não entra nessa lista

### Formato

```json
{
  "type": "TEACHER",
  "teacher": {
    "id": "…",
    "name": "Teacher Teste",
    "user": { "id": "…", "email": "teacher@schdlr.dev", "name": "Teacher Teste" }
  },
  "location": null,
  "cells": [
    {
      "project": { "id": "…", "name": "INFO 2026.1", "status": "PUBLISHED" },
      "board": { "id": "…", "name": "INFO 2A" },
      "weekday": 1,
      "timeSlot": { "id": "…", "name": "M1", "startTime": "07:00", "endTime": "07:50" },
      "subject": { "code": "MAT-101", "name": "Matemática I" }
    },
    {
      "project": { "id": "…", "name": "EDIF 2026.1", "status": "PUBLISHED" },
      "board": { "id": "…", "name": "EDIF 1A" },
      "weekday": 1,
      "timeSlot": { "id": "…", "name": "1º", "startTime": "07:30", "endTime": "08:20" },
      "subject": { "code": "FIS-101", "name": "Física I" }
    }
  ]
}
```

- **`teacher`** preenchido no choque `TEACHER`, **`location`** no `LOCATION`; o outro é `null`.
  `teacher.user` é `null` para professor a contratar
- **`cells`** tem sempre dois itens, na ordem `a`, `b` do `ClashService`. `subject` é `null` em
  célula de choque de local sem oferta (local reservado)
- Horas em `HH:MM` (`toHHMM`)

### Códigos de erro

Nenhum código novo. Os possíveis: `PROJECT_NOT_FOUND` (0018), `TERM_NOT_FOUND` (0016),
`NOT_ALLOWED`, `BOARD_NOT_FOUND` (0020, para `?boardId=` de outro projeto) e `VALIDATION_FAILED`
(`?type=` fora do enum).

## Critérios de aceite

- [ ] `detectClashes` cobre, em teste unitário sem banco: sobreposição parcial, total e contida;
      horários que encostam não chocam; dias diferentes não chocam; blocos diferentes chocam;
      oferta sem professor não gera `TEACHER`; `VIRTUAL` não gera `LOCATION`; bloqueada não choca;
      mesmo professor e local geram dois choques; cada par uma vez por tipo
- [ ] Choque entre quadros do mesmo projeto e entre projetos publicados do semestre aparecem; com
      rascunho de outro projeto, não
- [ ] Semestres da unidade com datas sobrepostas se comparam (anual × semestral); sem sobreposição,
      não; semestre `CANCELLED` não se compara com outros; outra unidade, nunca
- [ ] Um rascunho vê os choques com os publicados; um publicado não vê os com rascunhos
- [ ] `…/projects/:projectId/clashes` respeita a visibilidade da 0018 e filtra por `?boardId=` e
      `?type=`; `…/terms/:termId/clashes` só para dono e responsável
- [ ] Células do quadro com `clashes`, quadro com `clashesCount`, e o `PUT` da célula com os
      choques dela; alocar com choque continua `200`
- [ ] Professor a contratar (sem usuário) choca como os outros
- [ ] Trocar o professor de uma oferta, em `PLANNING` ou `ADJUSTMENTS`, devolve no `PATCH` os
      choques `TEACHER` das células dela com o professor novo; trocar para quem não choca, ou para
      `null`, devolve `[]`; a troca continua `200`
- [ ] O cálculo do quadro e do projeto é uma consulta de células, não uma por célula
- [ ] `ClashService` exportado; notas datadas na 0002 e na 0016; "Contratos em vigor" do README
      ganha a definição de choque, quais semestres se comparam e o escopo da comparação
- [ ] Testes unitários do `ClashService` (com banco substituído) e de `detectClashes`; e2e das
      rotas com o service substituído
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
id() { node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
MGR=$(login manager@schdlr.dev)
CRD=$(login coordinator@schdlr.dev)
U=$API/organizations/root-test-organization/units/unidade-teste

# preparo: um currículo (MAT-101, FIS-101), um semestre, dois blocos que se cruzam
# (Manhã: 07:00–07:50, 07:50–08:40; Alternativo: 07:30–08:20), uma sala e uma sala VIRTUAL,
# e dois projetos publicados do mesmo curso: A (quadro A1, bloco Manhã) e B (quadro B1, bloco
# Alternativo). O professor do teacher@ ($TEACHER) nas ofertas MAT-101 de A e FIS-101 de B; o
# professor a contratar da seed ($VAGA) disponível.
# (montar com as rotas das specs 0012–0020, como nos roteiros anteriores)
cell() { curl -s -X PUT -H "Authorization: Bearer $CRD" -H "$J" $1/slots/$2/$3 -d "$4"; }

cell $A1 $M1 1 "{\"offeringId\":\"$MAT_A\",\"locationId\":\"$SALA\",\"isBlocked\":false}"   # clashes []
cell $B1 $ALT1 1 "{\"offeringId\":\"$FIS_B\",\"locationId\":\"$SALA\",\"isBlocked\":false}" # 2 choques: TEACHER e LOCATION com A1/M1
cell $B1 $ALT1 2 "{\"offeringId\":\"$FIS_B\",\"locationId\":\"$SALA\",\"isBlocked\":false}" # [] (outro dia)
cell $A1 $M2 1 "{\"offeringId\":null,\"locationId\":\"$MEET\",\"isBlocked\":false}"        # [] (só a VIRTUAL)
cell $B1 $ALT1 1 "{\"offeringId\":null,\"locationId\":\"$MEET\",\"isBlocked\":false}"      # [] — e M2 (07:50) × ALT1 (07:30–08:20) com VIRTUAL não choca
curl -s -H "Authorization: Bearer $CRD" $U/projects/$A/boards/$A1                # M1/seg: clashes [] agora; clashesCount 0

# trocar o professor da oferta: o FIS-101 de B passa para o teacher@ (que está em A1/M1 na segunda)
OFS=$U/projects/$B/offerings/$FIS_B
cell $B1 $ALT1 1 "{\"offeringId\":\"$FIS_B\",\"locationId\":null,\"isBlocked\":false}" > /dev/null
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $OFS -d '{"teacherId":null}'      # clashes []
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $OFS \
  -d "{\"teacherId\":\"$TEACHER\"}"                                             # 200, clashes: 1 TEACHER com A1/M1
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $OFS \
  -d "{\"teacherId\":\"$VAGA\"}"                                                # 200, clashes [] (a vaga não está em A)
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $OFS -d "{\"teacherId\":\"$TEACHER\"}" > /dev/null

# rascunho: B volta a choque de professor e é despublicado
cell $B1 $ALT1 1 "{\"offeringId\":\"$FIS_B\",\"locationId\":null,\"isBlocked\":false}"     # 1 choque TEACHER
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $U/projects/$B/status -d '{"status":"DRAFT"}' > /dev/null
curl -s -H "Authorization: Bearer $CRD" $U/projects/$A/clashes                   # [] (B é rascunho)
curl -s -H "Authorization: Bearer $CRD" $U/projects/$B/clashes                   # 1 TEACHER com A (publicado)
curl -s -H "Authorization: Bearer $CRD" $U/terms/$TERM/clashes -w ' %{http_code}\n'   # 403
curl -s -H "Authorization: Bearer $MGR" $U/terms/$TERM/clashes                   # [] (só publicados)
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $U/projects/$B/status -d '{"status":"PUBLISHED"}' > /dev/null
curl -s -H "Authorization: Bearer $MGR" "$U/terms/$TERM/clashes?type=TEACHER"    # 1

# semestre anual: ANUAL (2026-02-02 a 2026-12-18) com o projeto C publicado e o teacher@ em C1/M1
# na segunda; 2026.1 é o $TERM acima (2026-02-02 a 2026-07-04)
curl -s -H "Authorization: Bearer $CRD" $U/projects/$C/clashes                   # TEACHER com A1/M1 (2026.1)
curl -s -H "Authorization: Bearer $MGR" "$U/terms/$ANUAL/clashes"                # inclui o choque com 2026.1
# 2026.2 (2026-08-03 a 2026-12-18) com o projeto D e o teacher@ em D1/M1 na segunda
curl -s -H "Authorization: Bearer $CRD" $U/projects/$D/clashes                   # TEACHER com C (anual), não com A
# cancelar o 2026.2: C deixa de ver o choque com D
kill %1
```

Ao final, apagar por SQL os projetos, os semestres, o currículo, os blocos e os locais de teste, e os
códigos OTP e refresh tokens dos logins.
