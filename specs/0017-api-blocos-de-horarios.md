---
id: 0017
title: Blocos de horários
status: done
depends_on: [0008, 0009]
---

# 0017 — Blocos de horários

## Objetivo

O dono e o responsável pela unidade passam a cadastrar os blocos de horários da unidade (manhã,
tarde, noite, integral) e os horários de cada bloco (`07:00–07:50`, `07:50–08:40`…), com a
garantia de que os horários de um bloco não se sobrepõem. Todo membro da unidade enxerga os
blocos. É a régua das linhas de cada quadro, e o que a detecção de choque compara.

## Por que existe

Cada quadro escolhe um bloco de horários, e as células do quadro são "horário × dia da semana"
(0002). Sem blocos, não há quadro. E a 0002 deixou para a aplicação a regra de que horários do
mesmo bloco não se sobrepõem, porque a exclusion constraint pediria SQL escrito à mão.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `TimeTable` (`name` único por unidade, `isActive`),
  `TimeSlot` (`name` único por bloco, `startTime`/`endTime` em minutos), `TimeTable → TimeSlot` em
  `Cascade`, `Board.timeTableId` e `BoardSlot.timeSlotId` em `Restrict`, "horário em minutos desde
  0h", "intervalo semiaberto `[start, end)`", "horários do mesmo bloco não se sobrepõem, e quem
  garante é a aplicação" e "cada quadro escolhe o próprio bloco"
- `specs/0009-api-organizacao-e-unidade.md` — `TenantAccessService` (`resolveUnit`,
  `assertWritable` com `{ reactivating }`), o padrão de reativação e o de travar a linha-pai
  (`FOR UPDATE`)
- `specs/0012-api-curriculos.md` — o padrão de apagar enquanto não está em uso
  (`isForeignKeyViolation`)
- `specs/0014-api-duplicacao-de-curriculo.md` — o padrão de duplicar numa transação
- `specs/0008-api-codigos-de-erro.md` — `AppException`, o catálogo, `params` e o `custom` com
  `params.code`
- `specs/README.md`, "Contratos em vigor"

## Escopo

**Entra:**

- Módulos `src/modules/time-tables/` e `src/modules/time-slots/` (um por entidade), com
  controllers, services e schemas Zod
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                                              | o que faz                                   |
  | ------------------------------------------------- | ------------------------------------------- |
  | `POST …/time-tables`                              | cria bloco, com ou sem horários             |
  | `GET …/time-tables`                               | lista os blocos da unidade, com os horários |
  | `GET …/time-tables/:timeTableId`                  | um bloco, com os horários                   |
  | `PATCH …/time-tables/:timeTableId`                | renomeia, desativa, reativa                 |
  | `DELETE …/time-tables/:timeTableId`               | apaga, se nenhum quadro o usa               |
  | `POST …/time-tables/:timeTableId/duplicate`       | cria um bloco novo com cópia dos horários   |
  | `POST …/time-tables/:timeTableId/slots`           | acrescenta horário                          |
  | `PATCH …/time-tables/:timeTableId/slots/:slotId`  | edita horário                               |
  | `DELETE …/time-tables/:timeTableId/slots/:slotId` | apaga horário, se nenhuma célula o usa      |

## Não entra

- Quadros e células: spec de quadro. Esta spec só fixa o que ela herda (ver "O que as próximas
  specs herdam")
- Horário por dia da semana (sábado com outro horário): o bloco vale para todos os dias do projeto
  (`workingDays`). Quem precisa de outro horário no sábado usa outro bloco
- Intervalo, almoço ou recreio como entidade: é o vão entre dois horários
- Horário que atravessa a meia-noite
- Gerar horários automaticamente ("6 aulas de 50 min a partir das 7h"): o web pode montar a lista
  e mandar no `POST`
- Limite de blocos por plano: a 0006 não tem
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis

- **Escreve** (bloco e horários): o dono e o responsável pela unidade. Coordenador e professor
  recebem `403 NOT_ALLOWED`. Como o local (0015), o bloco é da unidade e compartilhado entre
  cursos
- **Lê** quem enxerga a unidade, inclusive os blocos desativados, com `isActive: false`, como o
  catálogo (0011) e os locais (0015)
- Toda escrita passa por `assertWritable` da 0009. Escrita em horário de bloco desativado → `409
TIME_TABLE_INACTIVE`

### Hora na API

- **A API fala `HH:MM`**, e o banco guarda minutos desde 0h (0002). `"07:50"` ↔ `470`
- **Formato de entrada**: `^([01]\d|2[0-3]):[0-5]\d$`, de `00:00` a `23:59`, em `startTime` e
  `endTime`. Fora disso, `invalid_format` da validação
- **O horário termina no mesmo dia: o máximo é `23:59`** (`1439`). `24:00` não é aceito, e nenhum
  horário atravessa a meia-noite. O banco aceitaria `1440` (0002), mas a API nunca o grava
- **`endTime > startTime`**, senão `400` com o item `END_NOT_AFTER_START` (um `custom` com
  `params.code`), no `path` `endTime`. Horário de duração zero não existe
- **A conversão mora numa função só** (`toMinutes`/`toHHMM`, em `time-slots/`), exportada para as
  specs de quadro e de choque

### Sobreposição

- **Dois horários do mesmo bloco se sobrepõem quando `a.start < b.end && b.start < a.end`**: o
  intervalo semiaberto da 0002. `07:00–07:50` e `07:50–08:40` encostam e não se sobrepõem
- **Criar e editar horário rodam numa transação com a linha do bloco travada** (`FOR UPDATE`), que
  lê os horários do bloco antes de gravar, como a 0002 manda. Duas gravações simultâneas no mesmo
  bloco não passam as duas
- **Sobreposição com horário existente** → `409 TIME_SLOT_OVERLAP` com
  `params: { slotId, name, startTime, endTime }` do horário com que bate (o primeiro, pela ordem
  de início). Na edição, o próprio horário não conta
- **Sobreposição dentro da lista do `POST` do bloco** (ver abaixo) é erro de entrada: `400` com o
  item `SLOTS_OVERLAP` no `path` `slots.<i>` do segundo da dupla

### Bloco

- **`POST` recebe `{ name, slots? }`**:
  - `name` com o `nameSchema` da 0004 (`Manhã`, `Noite — Integrado`)
  - `slots`: lista opcional de `{ name, startTime, endTime }`, de 0 a 48 itens, com as regras de
    horário. Criados na mesma transação do bloco: ou vai tudo, ou nada
- **Nome repetido na unidade** → `409 TIME_TABLE_NAME_IN_USE`, também pelo `P2002`
- **`PATCH` recebe `{ name?, isActive? }`**; sem campo válido → `400` com o item `EMPTY_UPDATE`.
  Bloco desativado → `409 TIME_TABLE_INACTIVE`; reativar é o corpo exatamente `{ isActive: true }`,
  como na 0009. Os horários não entram no `PATCH` do bloco: têm rotas próprias
- **`GET …/time-tables`** lista todos os blocos da unidade, ativos ou não, ordenados por `name`,
  cada um com os horários. Sem paginação: são poucos blocos com poucos horários
- **Busca na unidade do caminho**: bloco de outra unidade, inexistente ou id que não é cuid → `404
TIME_TABLE_NOT_FOUND`. Horário de outro bloco → `404 TIME_SLOT_NOT_FOUND`
- **No máximo 48 horários por bloco.** O 49º → `409 TIME_TABLE_FULL` com `params: { max: 48 }`.
  Um dia inteiro em horários de 30 min cabe

### Horário

- **`POST …/slots` recebe `{ name, startTime, endTime }`**. `name` é obrigatório, de 1 a 40
  caracteres, `trim` (`M1`, `1º horário`). Nome repetido no bloco → `409
TIME_SLOT_NAME_IN_USE`, também pelo `P2002`
- **`PATCH …/slots/:slotId` recebe `{ name?, startTime?, endTime? }`**; sem campo válido → `400`
  `EMPTY_UPDATE`. A regra `endTime > startTime` vale para o resultado (o valor novo contra o que
  fica), e a sobreposição também
- **Horário usado por alguma célula não muda de hora.** `startTime` ou `endTime` num horário com
  célula → `409 TIME_SLOT_IN_USE`. Mudar a hora mudaria em silêncio a grade e os choques de todos os
  projetos que usam o bloco. Renomear passa. Para outra régua, duplica-se o bloco (abaixo)
- **`DELETE …/slots/:slotId`** apaga e responde `204` enquanto nenhuma célula o usa. Usado → `409
TIME_SLOT_IN_USE`, conferido antes e pelo `P2003` do `Restrict` de `BoardSlot.timeSlotId`
- **Acrescentar horário a bloco usado por quadro é permitido**: não muda nada do que já foi
  alocado. O quadro ganha uma linha nova (ver "O que as próximas specs herdam")
- **Ordem dos horários**: sempre por `startTime`, em toda resposta. Não há campo de ordem

### Apagar e duplicar o bloco

- **`DELETE` do bloco** apaga o bloco e, em cascata, os horários (`Cascade` da 0002), e responde
  `204`, enquanto nenhum quadro o usa. Usado → `409 TIME_TABLE_IN_USE`, conferido antes e pelo
  `P2003` do `Restrict` de `Board.timeTableId`. Bloco desativado e sem uso pode ser apagado, como
  local e currículo
- **`POST …/duplicate` recebe `{ name }`** e cria, numa transação, um bloco ativo com a cópia dos
  horários (`name`, `startTime`, `endTime`). A origem pode estar desativada. Nome repetido → `409
TIME_TABLE_NAME_IN_USE`. Responde `201` com o bloco novo. É o caminho para mudar a régua de um
  bloco em uso: duplica, ajusta a cópia, e os projetos novos usam a cópia

### O que as próximas specs herdam

- **Bloco desativado não é escolhido por quadro novo.** Os quadros que já o usam continuam. A spec
  de quadro aplica
- **O horário da célula é do bloco do quadro** (regra cruzada da 0002)
- **Horário acrescentado depois de o quadro existir** não tem células, se o quadro as tiver
  materializado. A spec de quadro decide: criar as células sob demanda, ou materializá-las quando o
  bloco ganha horário. O schema suporta as duas (0002)
- **A sobreposição usada no choque** é a mesma desta spec, `[start, end)`, mas entre horários de
  blocos **diferentes** (dois quadros com blocos diferentes podem chocar). A spec de choque
  reutiliza a função daqui

### Formato

```json
{
  "id": "…",
  "name": "Manhã",
  "isActive": true,
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z",
  "slots": [
    { "id": "…", "name": "M1", "startTime": "07:00", "endTime": "07:50", "inUse": false },
    { "id": "…", "name": "M2", "startTime": "07:50", "endTime": "08:40", "inUse": false }
  ],
  "boardsCount": 0,
  "access": { "canManage": true }
}
```

- **`inUse`** do horário diz se alguma célula o usa (o web trava a edição da hora). **`boardsCount`**
  conta os quadros que usam o bloco; `> 0` esconde o "apagar"
- `POST …/slots` e `PATCH …/slots/:slotId` respondem com o **bloco inteiro**, como acima: o web
  redesenha a régua de uma vez

### Códigos de erro

| código                   | status | mensagem                          | quando                                                       |
| ------------------------ | ------ | --------------------------------- | ------------------------------------------------------------ |
| `TIME_TABLE_NOT_FOUND`   | 404    | Time table not found              | id inexistente ou de outra unidade                           |
| `TIME_TABLE_NAME_IN_USE` | 409    | Time table name already in use    | nome repetido na unidade                                     |
| `TIME_TABLE_INACTIVE`    | 409    | Time table is inactive            | escrita em bloco desativado ou nos horários dele             |
| `TIME_TABLE_IN_USE`      | 409    | Time table is used by a board     | apagar bloco usado por quadro                                |
| `TIME_TABLE_FULL`        | 409    | Time table has too many slots     | 49º horário; `params: { max }`                               |
| `TIME_SLOT_NOT_FOUND`    | 404    | Time slot not found               | id inexistente ou de outro bloco                             |
| `TIME_SLOT_NAME_IN_USE`  | 409    | Time slot name already in use     | nome repetido no bloco                                       |
| `TIME_SLOT_OVERLAP`      | 409    | Time slot overlaps another        | sobreposição; `params: { slotId, name, startTime, endTime }` |
| `TIME_SLOT_IN_USE`       | 409    | Time slot is used by a board slot | mudar a hora ou apagar horário com célula                    |

- `NOT_ALLOWED`, `UNIT_INACTIVE`, `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` são os da 0009;
  `EMPTY_UPDATE`, `END_NOT_AFTER_START` e `SLOTS_OVERLAP` são itens de `VALIDATION_FAILED`

## Critérios de aceite

- [x] Dono e responsável escrevem; coordenador e professor recebem `403`; quem não enxerga a
      unidade, `404`
- [x] Todo membro lista e lê os blocos, inclusive os desativados, com os horários por `startTime`
- [x] `HH:MM` entra e sai, de `00:00` a `23:59`; `24:00` dá `400`; `endTime <= startTime` dá `400`
      `END_NOT_AFTER_START`
- [x] Horários que encostam (`07:00–07:50`, `07:50–08:40`) passam; que se sobrepõem dão `409
TIME_SLOT_OVERLAP` com `params`, na criação e na edição; na lista do `POST` do bloco, `400
SLOTS_OVERLAP`
- [x] Criar e editar horário travam o bloco; o `POST` do bloco com horários é tudo ou nada
- [x] Nome do horário é obrigatório (`400` sem ele); nome repetido dá `409` (bloco na unidade,
      horário no bloco)
- [x] Horário com célula não muda de hora nem se apaga (`409 TIME_SLOT_IN_USE`); renomear passa
- [x] Bloco usado por quadro não se apaga (`409 TIME_TABLE_IN_USE`, inclusive pelo `P2003`); sem
      uso, apaga com os horários
- [x] `duplicate` copia os horários num bloco novo e ativo, inclusive de origem desativada
- [x] O 49º horário dá `409 TIME_TABLE_FULL`
- [x] Escrita em bloco desativado ou nos horários dele dá `409 TIME_TABLE_INACTIVE`;
      `{ isActive: true }` reativa
- [x] `toMinutes`/`toHHMM` e a função de sobreposição exportadas, com teste unitário dos limites
      (`00:00`, `23:59`, `24:00` recusado, intervalos que encostam)
- [x] Códigos novos no catálogo da 0008; "Contratos em vigor" do README ganha o que as próximas
      specs herdam
- [x] Testes unitários dos services e dos schemas; e2e das rotas com os services substituídos
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
B=$API/organizations/root-test-organization/units/unidade-teste/time-tables

TT=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B -d '{"name":"Manhã","slots":[
  {"name":"M1","startTime":"07:00","endTime":"07:50"},
  {"name":"M2","startTime":"07:50","endTime":"08:40"}]}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')                     # 201, encostam
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B -d '{"name":"X","slots":[
  {"name":"A","startTime":"07:00","endTime":"08:00"},{"name":"B","startTime":"07:30","endTime":"08:30"}]}' \
  -w ' %{http_code}\n'                                                            # 400 SLOTS_OVERLAP em slots.1
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $B -d '{"name":"Y"}' -w ' %{http_code}\n'  # 403

curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/slots \
  -d '{"name":"M3","startTime":"08:20","endTime":"09:10"}' -w ' %{http_code}\n'              # 409 TIME_SLOT_OVERLAP (M2)
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/slots \
  -d '{"name":"M3","startTime":"09:00","endTime":"08:00"}' -w ' %{http_code}\n'              # 400 END_NOT_AFTER_START
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/slots \
  -d '{"name":"N5","startTime":"23:10","endTime":"23:59"}'                       # 201
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/slots \
  -d '{"name":"N6","startTime":"23:10","endTime":"24:00"}' -w ' %{http_code}\n'  # 400 (passa da meia-noite)
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/slots \
  -d '{"startTime":"10:00","endTime":"10:50"}' -w ' %{http_code}\n'              # 400 (sem nome)
curl -s -H "Authorization: Bearer $TCH" $B                                       # Manhã, 3 horários por início

# duplicar, desativar, reativar
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/duplicate -d '{"name":"Manhã 2027"}'  # 201
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $B/$TT -d '{"isActive":false}'   # 200
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $B/$TT/slots \
  -d '{"name":"M4","startTime":"10:00","endTime":"10:50"}' -w ' %{http_code}\n'  # 409 TIME_TABLE_INACTIVE
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $B/$TT -d '{"isActive":true}'    # 200

# em uso: termo, projeto, quadro e uma célula no M1 inseridos por SQL
# (conferir: PATCH da hora do M1 → 409 TIME_SLOT_IN_USE; renomear o M1 → 200;
#  DELETE do M1 → 409; DELETE do bloco → 409 TIME_TABLE_IN_USE; depois apagar o projeto por SQL)
curl -s -X DELETE -H "Authorization: Bearer $MGR" $B/$TT -w ' %{http_code}\n'   # 204, leva os horários
kill %1
```

Ao final, apagar os blocos criados no teste e o que tiver sido inserido por SQL, e apagar os
códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec 0017`, na branch `development`.

Commits: `feat(api): blocos de horários (spec 0017)`.

Verificação: sem `.env`, `pnpm test:api` passa (569 unitários, 130 e2e) e `pnpm build:api` também;
`tsc` e lint limpos; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um
script, todas as linhas da seção "Verificação" deram o esperado: `Manhã` com `M2` e `M1` (fora de
ordem no corpo) → `201`, devolvidos por início, encostando; a lista com `07:00–08:00` e
`07:30–08:30` → `400` `SLOTS_OVERLAP` em `slots.1`, e nada ficou gravado; o `coordinator@` → `403`;
`M3` sobre o `M2` → `409 TIME_SLOT_OVERLAP` com `params` do `M2`; `M3` invertido → `400
END_NOT_AFTER_START`; `N5` até `23:59` → `201`; `N6` até `24:00` → `400 invalid_format`; sem nome →
`400`; o `teacher@` lista os três horários por início, com `canManage: false`; duplicar → `201`,
ativo, com os 3 horários; desativado, acrescentar horário → `409 TIME_TABLE_INACTIVE`, e
`{"isActive":true}` reativa. Com currículo, termo, projeto, quadro e célula no `M1` inseridos por
SQL: `boardsCount: 1` e o `M1` com `inUse`; mudar a hora do `M1` → `409 TIME_SLOT_IN_USE`,
renomear → `200`, apagar → `409`; acrescentar horário ao bloco usado → `201`; apagar o bloco → `409
TIME_TABLE_IN_USE`, e o `DELETE` direto por `psql` falha com SQLSTATE `23503`
(`boards_time_table_id_fkey`), o `P2003` que o service trata. Sem eles, o `M2` e o bloco saem
(`204`), e os horários vão junto. Além do roteiro: o master → `404`; nome de bloco repetido → `409
TIME_TABLE_NAME_IN_USE`; nome de horário repetido no bloco → `409 TIME_SLOT_NAME_IN_USE`; `M1`
estendido sobre o `M2` → `409`; `PATCH` só com `endTime` antes do início que fica → `400
END_NOT_AFTER_START`; renomear bloco desativado → `409`; duplicar bloco desativado → `201`; id fora
do formato → `404`; horário de outro bloco → `404 TIME_SLOT_NOT_FOUND`; um bloco com 48 horários
(`201`) recusa o 49º com `409 TIME_TABLE_FULL` e `params: { max: 48 }`. No fim, os blocos de teste
e o que foi inserido por SQL foram apagados, e os códigos OTP e refresh tokens também.

Não exercitado contra o banco: duas gravações simultâneas no mesmo bloco (a trava `FOR UPDATE` está
coberta no teste unitário, que confere o SQL) e o `P2003` em corrida.

Desvios:

- **Nome de horário repetido na lista do `POST` do bloco** → `409 TIME_SLOT_NAME_IN_USE`, conferido
  antes de gravar. A spec não dizia; reaproveita o código do nome repetido no bloco em vez de criar
  um item novo de `VALIDATION_FAILED`.
- **"Mudar a hora" de horário com célula** é mandar `startTime` ou `endTime` **diferente** do atual:
  reenviar a mesma hora passa.
- **Ordem no `PATCH` do horário**: bloco (`404`) → papel (`403`) → `assertWritable` → bloco
  desativado (`409`) → horário (`404`) → resultado das horas (`400`) → hora com célula (`409
TIME_SLOT_IN_USE`) → nome e sobreposição, na transação travada. No `PATCH`/`DELETE` do bloco:
  bloco → papel → `assertWritable` → desativado ou em uso.
- **O bloco é criado com os horários numa operação aninhada do Prisma** (`slots: { create }`), que é
  atômica; o `duplicate` copia do mesmo jeito, lendo os horários da origem antes.
- **`TimeTablesService` é exportado** (`findInUnit`, `view` e `canManageTimeTables`) e usado pelo
  `TimeSlotsService`, que importa o `TimeTablesModule`. `MAX_SLOTS` mora em
  `time-tables/schemas/`. `toMinutes`, `toHHMM` e `overlaps` moram em `time-slots/time.ts`, com o
  `hhmmSchema` em `time-slots/schemas/`.
- **`END_NOT_AFTER_START` do `PATCH` com uma hora só** sai do service com o mesmo `path`, `code` e
  `message` do item que o Zod gera (a constante `END_NOT_AFTER_START`).
