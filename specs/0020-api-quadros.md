---
id: 0020
title: Quadros
status: done
depends_on: [0015, 0017, 0018, 0019]
---

# 0020 — Quadros

## Objetivo

Os gestores do projeto passam a montar os quadros: um quadro é a grade de uma turma (`INFO 2A`)
dentro do projeto, com as linhas tiradas de um bloco de horários e as colunas dos dias letivos do
projeto. Em cada célula (horário × dia), aloca-se uma oferta, um local, os dois, ou bloqueia-se a
célula. Quem vê o projeto vê os quadros. A detecção de choque vem na spec seguinte; esta entrega a
grade.

## Por que existe

É a montagem de horários em si: sem quadro e célula, as ofertas (0019), os locais (0015) e os
blocos (0017) não se encontram. E várias specs deixaram para cá decisões sobre a célula:
materializar ou não (0002, 0017), local desativado (0015), bloco desativado (0017).

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `Board` (`name` único por projeto, `timeTableId` em
  `Restrict`), `BoardSlot` (`@@unique([boardId, timeSlotId, weekday])`, `offeringId` e
  `locationId` opcionais, `isBlocked`; no `schema.prisma`, `offeringId` é `SetNull` e `locationId`
  e `timeSlotId` são `Restrict` — vale o schema, conforme o Registro da 0002), `Project → Board` e `Board → BoardSlot` em
  `Cascade`, "cada quadro escolhe o próprio bloco", "oferta sem professor pode ser alocada",
  "célula bloqueada é vazia", "dia da semana de 1 a 6" e as regras cruzadas
- `specs/0018-api-projetos.md` — `ProjectAccessService` (`resolveProject`,
  `assertProjectWritable`), visibilidade, `workingDays` e o `WORKING_DAYS_IN_USE`
- `specs/0019-api-ofertas.md` — oferta do projeto, `slotsCount` (do `_count` de `boardSlots`) e a
  remoção (`OfferingsService.remove`: `$transaction([updateMany, delete])`, que zera o
  `offeringId` das células antes de apagar)
- `specs/0017-api-blocos-de-horarios.md` — bloco e horário, `toHHMM`, "o que as próximas specs
  herdam" (bloco desativado; horário acrescentado depois do quadro)
- `specs/0015-api-locais.md` — "o que as próximas specs herdam" (local desativado; local da unidade)
- `specs/0016-api-semestres.md` — a matriz "status do semestre × projetos"
- `specs/0008-api-codigos-de-erro.md` — `AppException`, o catálogo e o `custom` com `params.code`
- `apps/api/src/modules/projects/`, `offerings/`, `time-tables/`, `locations/`

## Escopo

**Entra:**

- Módulos `src/modules/boards/` e `src/modules/board-slots/` (um por entidade), com controllers,
  services e schemas Zod
- Rotas, todas exigindo token, sob
  `/api/organizations/:orgSlug/units/:unitSlug/projects/:projectId`:

  | rota                                               | o que faz                                |
  | -------------------------------------------------- | ---------------------------------------- |
  | `POST …/boards`                                    | cria quadro                              |
  | `GET …/boards`                                     | lista os quadros do projeto (resumo)     |
  | `GET …/boards/:boardId`                            | o quadro com a grade inteira             |
  | `PATCH …/boards/:boardId`                          | renomeia, troca o bloco (se vazio)       |
  | `DELETE …/boards/:boardId`                         | apaga o quadro e as células              |
  | `PUT …/boards/:boardId/slots/:timeSlotId/:weekday` | define a célula (aloca, limpa, bloqueia) |

- Ajuste na remoção de oferta (0019): célula que fica vazia é apagada, com nota datada na 0019
- `weeklyMinutes` no formato da oferta (0019), ao lado do `slotsCount`

## Não entra

- **Detecção de choque** (professor e local, entre quadros e projetos do semestre): spec seguinte.
  Aqui, alocar não verifica choque nenhum
- Mais de uma oferta na mesma célula (turma dividida, laboratório em grupos): o schema guarda uma
- Copiar ou duplicar quadro, preencher em lote, arrastar uma célula para outra (o web faz com dois
  `PUT`)
- Comparar a carga alocada com a carga horária da disciplina: a semana não sabe quantas semanas o
  semestre tem. A spec entrega os minutos por semana, e o web compara
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis e visibilidade

- **Lê** quem vê o projeto (`resolveProject` da 0018); quem não vê recebe `404
PROJECT_NOT_FOUND`
- **Escreve** (quadro e célula) quem a matriz da 0016 deixa editar o projeto:
  `assertProjectWritable(access, 'edit')`
- **O quadro é procurado no projeto do caminho**: de outro projeto, inexistente ou id que não é
  cuid → `404 BOARD_NOT_FOUND`

### Quadro

- **`POST` recebe `{ name, timeTableId }`**:
  - `name` com o `nameSchema` da 0004 (`INFO 2A`, `1º semestre — Noite`)
  - `timeTableId`: bloco da unidade do projeto, senão `404 TIME_TABLE_NOT_FOUND`; desativado → `409
TIME_TABLE_INACTIVE` (0017: bloco desativado não é escolhido por quadro novo)
- **Nome repetido no projeto** → `409 BOARD_NAME_IN_USE`, também pelo `P2002`
- **Quadros do mesmo projeto podem usar blocos diferentes** (0002)
- **`PATCH` recebe `{ name?, timeTableId? }`**; sem campo válido → `400` com o item `EMPTY_UPDATE`.
  Trocar o bloco só com o quadro **sem nenhuma célula** → senão `409 BOARD_NOT_EMPTY`. O bloco novo
  segue as regras do `POST`. Bloco desativado que o quadro já usa continua valendo
- **`DELETE`** apaga o quadro e, em cascata, as células (`Cascade` da 0002), e responde `204`
- **`GET …/boards`** lista os quadros do projeto, ordenados por `name`, em resumo: `id`, `name`,
  `timeTable` (`id`, `name`, `isActive`), `filledSlots` (células com oferta) e `blockedSlots`. Sem a
  grade

### Célula: só existe quando tem conteúdo

- **As células não são materializadas.** A linha de `BoardSlot` existe só quando a célula tem
  oferta, local ou está bloqueada. Célula vazia é a ausência da linha. O `GET` do quadro monta a
  grade inteira (horários do bloco × dias letivos) e preenche com as linhas que existem
- **Por isso, horário acrescentado ao bloco depois (0017) aparece no quadro na hora**, como linha
  vazia, sem nada a sincronizar. E o `WORKING_DAYS_IN_USE` da 0018 continua certo: célula de sábado
  existe só se tem conteúdo
- **`PUT …/slots/:timeSlotId/:weekday` recebe o estado inteiro da célula**:
  `{ offeringId: string | null, locationId: string | null, isBlocked: boolean }`. Os três campos são
  obrigatórios; não é edição parcial. Responde `200` com a célula no formato da grade
- **Estado vazio** (`offeringId` e `locationId` nulos, `isBlocked: false`) apaga a linha, se
  existir. Qualquer outro estado cria ou atualiza a linha (`upsert` na chave única)
- **`timeSlotId` e `weekday` do caminho**: o horário tem de ser do bloco do quadro, e o dia, de `1`
  a `project.workingDays`. Fora disso, inclusive valor fora do formato → `404 BOARD_SLOT_NOT_FOUND`.
  É a posição da célula, e posição que não existe na grade não existe
- **Bloqueada é vazia** (0002): `isBlocked: true` com `offeringId` ou `locationId` → `400` com o item
  `BLOCKED_SLOT_MUST_BE_EMPTY` (um `custom` com `params.code`). Desbloquear e alocar é um `PUT` só,
  com `isBlocked: false`
- **Oferta**: do projeto do caminho, senão `400 INVALID_OFFERING`. Oferta sem professor é aceita, e
  oferta de disciplina desativada também (0019)
- **Local**: da unidade do projeto, senão `400 INVALID_LOCATION`. Local desativado não recebe
  alocação **nova** (0015): `409 LOCATION_INACTIVE` quando o `locationId` muda para um local
  desativado; se a célula já estava naquele local, o `PUT` passa
- **Local sem oferta é permitido** (reservar a sala); **oferta sem local também** (0002)
- **A mesma oferta em várias células e em vários quadros do projeto** é permitida: duas turmas
  podem ter a mesma disciplina com o mesmo professor. Se isso gera choque é da spec de choque
- **Nada aqui verifica choque.** A spec de choque decide se alocar com choque é aviso ou bloqueio, e
  acrescenta isso a esta rota e ao `GET`

### Remoção de oferta (0019)

- **Célula que fica vazia é apagada.** Ao remover uma oferta, as células dela que não têm local
  somem (ficariam vazias); as que têm local ficam, com `offeringId` nulo. No
  `OfferingsService.remove`, o lote da transação passa a ser `deleteMany` (células da oferta sem
  local) → `updateMany` (as que sobram, `offeringId` nulo) → `delete` da oferta. Célula bloqueada
  não tem oferta, então não é afetada
- **O `SetNull` da FK não basta**: ele zeraria a oferta e deixaria a linha vazia. Quem decide entre
  apagar e zerar é a aplicação, antes do `delete`
- É o que mantém "célula existe só com conteúdo" verdadeiro. Nota datada na 0019

### Carga por semana

- **`weeklyMinutes` de uma oferta** é a soma das durações (`endTime − startTime`) dos horários das
  células em que ela está, em todos os quadros do projeto. Entra no formato da oferta (0019), ao
  lado do `slotsCount`
- **No quadro**, o resumo `offerings` traz, para cada oferta alocada **naquele quadro**, `slots` e
  `weeklyMinutes` só daquele quadro

### Formato

`GET …/boards/:boardId` e as respostas de escrita no quadro:

```json
{
  "id": "…",
  "name": "INFO 2A",
  "timeTable": { "id": "…", "name": "Manhã", "isActive": true },
  "workingDays": 5,
  "rows": [
    {
      "timeSlot": { "id": "…", "name": "M1", "startTime": "07:00", "endTime": "07:50" },
      "cells": [
        {
          "weekday": 1,
          "isBlocked": false,
          "offering": {
            "id": "…",
            "subject": {
              "id": "…",
              "name": "Matemática I",
              "code": "MAT-101",
              "color": "#1E88E5",
              "isActive": true
            },
            "teacher": { "id": "…", "name": "Teacher Teste" }
          },
          "location": { "id": "…", "name": "Sala 101", "type": "CLASSROOM", "isActive": true }
        },
        { "weekday": 2, "isBlocked": false, "offering": null, "location": null }
      ]
    }
  ],
  "offerings": [{ "offeringId": "…", "slots": 4, "weeklyMinutes": 200 }],
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z"
}
```

- **`rows`** segue os horários do bloco por `startTime`; **`cells`** tem sempre `workingDays`
  itens, de `1` em diante, vazios inclusive
- **`PUT` da célula** responde só a célula, no formato de um item de `cells`, com `timeSlotId`
  acrescentado
- `workingDays` é o do projeto, repetido aqui para o web desenhar sem outra chamada

### Códigos de erro

| código                 | status | mensagem                            | quando                                             |
| ---------------------- | ------ | ----------------------------------- | -------------------------------------------------- |
| `BOARD_NOT_FOUND`      | 404    | Board not found                     | id inexistente ou de outro projeto                 |
| `BOARD_NAME_IN_USE`    | 409    | Board name already in use           | nome repetido no projeto                           |
| `BOARD_NOT_EMPTY`      | 409    | Board has slots                     | trocar o bloco de quadro com célula                |
| `BOARD_SLOT_NOT_FOUND` | 404    | Board slot not found                | horário fora do bloco ou dia fora dos dias letivos |
| `INVALID_OFFERING`     | 400    | Offering must belong to the project | `offeringId` de fora do projeto                    |
| `INVALID_LOCATION`     | 400    | Location must belong to the unit    | `locationId` de fora da unidade                    |

- `TIME_TABLE_NOT_FOUND`, `TIME_TABLE_INACTIVE` (0017), `LOCATION_INACTIVE` (0015),
  `PROJECT_NOT_FOUND` (0018), `TERM_STATUS_FORBIDS` (0016), `NOT_ALLOWED`, `UNIT_INACTIVE`,
  `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` (0009) são reaproveitados; `EMPTY_UPDATE` e
  `BLOCKED_SLOT_MUST_BE_EMPTY` são itens de `VALIDATION_FAILED`

## Critérios de aceite

- [x] Gestores criam, renomeiam e apagam quadros conforme a matriz da 0016; quem não vê o projeto
      recebe `404`
- [x] Bloco de fora da unidade dá `404`; desativado dá `409` no quadro novo e continua valendo no
      quadro que já o usa
- [x] Trocar o bloco só com o quadro vazio (`409 BOARD_NOT_EMPTY`)
- [x] O `GET` devolve a grade inteira (horários × dias letivos), com as células vazias sintetizadas;
      horário acrescentado ao bloco depois aparece como linha vazia
- [x] `PUT` cria, atualiza e, com o estado vazio, apaga a linha; posição fora da grade dá `404`
- [x] Bloqueada com oferta ou local dá `400 BLOCKED_SLOT_MUST_BE_EMPTY`
- [x] Oferta de outro projeto e local de outra unidade dão `400`; local desativado só barra
      alocação nova
- [x] Oferta sem professor, oferta de disciplina desativada, local sem oferta e oferta sem local
      são aceitos; a mesma oferta em vários quadros também
- [x] Remover oferta apaga as células dela sem local e zera a oferta nas que têm local
- [x] `slotsCount` e `weeklyMinutes` da oferta e o resumo `offerings` do quadro batem com as células
- [x] Reduzir o projeto a 5 dias com célula de sábado continua dando `409 WORKING_DAYS_IN_USE`
- [x] Códigos novos no catálogo da 0008; nota datada na 0019; "Contratos em vigor" do README ganha
      "célula existe só com conteúdo"
- [x] Testes unitários dos services (grade sintetizada, `PUT` nos três estados, remoção de oferta)
      e dos schemas; e2e das rotas com os services substituídos
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

# preparo: currículo com 2 disciplinas, semestre, projeto (gera as ofertas), bloco e locais
COURSE=$(curl -s -H "Authorization: Bearer $CRD" $U/courses \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(c => c.code === "TESTE").id')
K=$U/courses/$COURSE/curricula
CUR=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K -d '{"name":"Matriz 2024","code":"2024"}' | id)
for s in 'MAT-101 80' 'FIS-101 60'; do set -- $s
  curl -s -o /dev/null -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$CUR/subjects \
    -d "{\"name\":\"$1\",\"code\":\"$1\",\"workload\":$2}"; done
TERM=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/terms \
  -d '{"name":"2026.1","startDate":"2026-02-02","endDate":"2026-07-04"}' | id)
PRJ=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $U/projects \
  -d "{\"name\":\"INFO 2026.1\",\"termId\":\"$TERM\",\"curriculumId\":\"$CUR\"}" | id)
TT=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/time-tables -d '{"name":"Manhã","slots":[
  {"name":"M1","startTime":"07:00","endTime":"07:50"},{"name":"M2","startTime":"07:50","endTime":"08:40"}]}' | id)
LOC=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/locations -d '{"name":"Sala 101","type":"CLASSROOM"}' | id)
P=$U/projects/$PRJ
B=$P/boards

BRD=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $B \
  -d "{\"name\":\"INFO 2A\",\"timeTableId\":\"$TT\"}" | id)                     # 201
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $B \
  -d "{\"name\":\"INFO 2A\",\"timeTableId\":\"$TT\"}" -w ' %{http_code}\n'       # 409 BOARD_NAME_IN_USE
curl -s -H "Authorization: Bearer $CRD" $B/$BRD                                  # 2 linhas × 5 dias, tudo vazio

M1=<id do M1>; MAT=<id da oferta MAT-101>
cell() { curl -s -X PUT -H "Authorization: Bearer $CRD" -H "$J" $B/$BRD/slots/$1/$2 -d "$3" -w ' %{http_code}\n'; }
cell $M1 1 "{\"offeringId\":\"$MAT\",\"locationId\":\"$LOC\",\"isBlocked\":false}"   # 200
cell $M1 2 '{"offeringId":null,"locationId":null,"isBlocked":true}'                # 200, bloqueada
cell $M1 3 "{\"offeringId\":\"$MAT\",\"locationId\":null,\"isBlocked\":true}"     # 400 BLOCKED_SLOT_MUST_BE_EMPTY
cell $M1 6 '{"offeringId":null,"locationId":null,"isBlocked":true}'                # 404 BOARD_SLOT_NOT_FOUND (5 dias)
cell $M1 2 '{"offeringId":null,"locationId":null,"isBlocked":false}'               # 200, vazia (linha apagada)
curl -s -H "Authorization: Bearer $CRD" $P/offerings                              # MAT-101: slotsCount 1, weeklyMinutes 50

# horário novo no bloco aparece no quadro
curl -s -o /dev/null -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/time-tables/$TT/slots \
  -d '{"name":"M3","startTime":"08:40","endTime":"09:30"}'
curl -s -H "Authorization: Bearer $TCH" $B/$BRD -w ' %{http_code}\n'             # 404 (PLANNING: professor não vê)
curl -s -H "Authorization: Bearer $CRD" $B/$BRD                                  # 3 linhas

# trocar bloco com célula; local desativado; remoção de oferta
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $B/$BRD \
  -d "{\"timeTableId\":\"$TT\"}" -w ' %{http_code}\n'                            # 409 BOARD_NOT_EMPTY
curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $U/locations/$LOC -d '{"isActive":false}'
cell $M1 1 "{\"offeringId\":\"$MAT\",\"locationId\":\"$LOC\",\"isBlocked\":false}"   # 200 (o local já estava)
cell <id do M2> 1 "{\"offeringId\":\"$MAT\",\"locationId\":\"$LOC\",\"isBlocked\":false}"  # 409 LOCATION_INACTIVE
cell <id do M2> 1 "{\"offeringId\":\"$MAT\",\"locationId\":null,\"isBlocked\":false}"     # 200
curl -s -X DELETE -H "Authorization: Bearer $CRD" $P/offerings/$MAT -w ' %{http_code}\n'  # 204
curl -s -H "Authorization: Bearer $CRD" $B/$BRD                                  # M1/seg só com o local; M2/seg vazia
curl -s -X DELETE -H "Authorization: Bearer $CRD" $B/$BRD -w ' %{http_code}\n'   # 204
kill %1
```

Ao final, apagar por SQL o projeto, o semestre, o currículo, o bloco e o local de teste, e os
códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec 0020`, na branch `development`.

Commits: `feat(api): quadros (spec 0020)`.

Verificação: sem `.env`, `pnpm test:api` passa (714 unitários, 157 e2e) e `pnpm build:api` também;
`tsc` e lint limpos; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um
script, todas as linhas da seção "Verificação" deram o esperado, mais: bloco inexistente → `404
TIME_TABLE_NOT_FOUND` e desativado → `409 TIME_TABLE_INACTIVE` no quadro novo; horário de outro
bloco e dia fora do formato → `404 BOARD_SLOT_NOT_FOUND`; oferta de fora do projeto → `400
INVALID_OFFERING`, local de fora da unidade → `400 INVALID_LOCATION`; local sem oferta e a FIS-101
(sem professor) sem local → `200`; a MAT-101 num segundo quadro (`INFO 2B`) → `200`, com
`slotsCount 2` e `weeklyMinutes 100`, e a lista resumida com `filledSlots` 2 e 1; o `INFO 2B`
esvaziado renomeia e troca para outro bloco (`200`); com o bloco do quadro desativado, alocar e
limpar continuam passando; com 6 dias e uma célula de sábado, voltar a 5 → `409
WORKING_DAYS_IN_USE`, e sem ela → `200`; remover a MAT-101 apagou a célula M2/seg (sem local) e
deixou a M1/seg só com o local, conferido no banco; em `STARTED`, o `coordinator@` escrevendo →
`403`, o `manager@` → `200` e o `teacher@` lê (`200`); apagar o quadro → `204`, sem nenhuma célula
sobrando. No fim, projeto, semestre, currículo, os dois blocos, o local, os códigos OTP e os
refresh tokens foram apagados.

Durante a execução, o usuário perguntou por um `GET` que trouxesse todos os quadros com a grade de
uma vez; decidiu que não é preciso: o web chama `GET …/boards` e depois cada quadro.

Desvios:

- **`PATCH` com `timeTableId` igual ao atual, num quadro com célula, dá `409 BOARD_NOT_EMPTY`**,
  como o roteiro da Verificação espera. A checagem de "vazio" vale sempre que `timeTableId` vem no
  corpo; as do bloco (`404`, `409 TIME_TABLE_INACTIVE`) só quando ele muda, e é isso que deixa o
  bloco desativado que o quadro já usa continuar valendo.
- **Ordem nas escritas**: projeto (`404`) → quadro (`404`) → posição da célula (`404`) →
  `assertProjectWritable` (`409`/`403`) → bloco, oferta e local (`404`/`400`/`409`) → nome (`409`).
  O corpo inválido (`400 VALIDATION_FAILED`) vem antes de tudo, pelo pipe. A spec não fixava.
- **O formato da célula** (`withCellDetails`, `toCellView`, `emptyCell`) mora em
  `board-slots/board-slot-view.ts`, e o `BoardsService` o importa para montar a grade. O
  `BoardsModule` exporta o `BoardsService` (`findBoard`) para o `BoardSlotsModule`.
- **O `weekday` do caminho** só aceita dígitos (`/^\d+$/`); `1a`, `x` ou `0` dão `404`.
- **O resumo `offerings` do quadro** sai na ordem da grade (primeira célula de cada oferta, por
  horário e dia). `filledSlots` e `blockedSlots` da lista são contados em memória, sobre
  `offeringId` e `isBlocked` das células.
- **Oferta (0019)**: o `_count` de `boardSlots` deu lugar a um `select` das durações dos horários
  das células; `slotsCount` é o tamanho dessa lista e `weeklyMinutes`, a soma.
