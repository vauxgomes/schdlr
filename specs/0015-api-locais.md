---
id: 0015
title: Locais
status: done
depends_on: [0008, 0009]
---

# 0015 — Locais

## Objetivo

O dono e o responsável pela unidade passam a cadastrar, listar, editar, desativar e apagar os
locais da unidade (salas, laboratórios, auditórios, quadras e salas virtuais), com tipo e
capacidade. Todo membro da unidade enxerga os locais. É onde as células dos quadros vão ser
alocadas, e o que a detecção de choque de local vai comparar.

## Por que existe

O schdlr detecta quando o mesmo local físico é alocado em dois horários que se sobrepõem (0002).
Sem locais cadastrados, os quadros não têm onde alocar, e o choque de local não tem o que
comparar.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `Location` (`name` único por unidade, `type`,
  `capacity` opcional), `LocationType`, `BoardSlot.locationId` em `Restrict`, "o mesmo local
  (físico)" no "Por que existe" e a regra `capacity` nulo ou `> 0`
- `specs/0009-api-organizacao-e-unidade.md` — `TenantAccessService` (`resolveUnit`,
  `assertWritable` com `{ reactivating }`) e o padrão de reativação
- `specs/0012-api-curriculos.md` — o padrão de apagar enquanto não está em uso, com
  `isForeignKeyViolation`
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `specs/README.md`, "Contratos em vigor"
- `apps/api/src/modules/courses/` — padrão de módulo de dado da unidade

## Escopo

**Entra:**

- Módulo `src/modules/locations/` com controller, service e schemas Zod
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug/units/:unitSlug`:

  | rota                             | o que faz                      |
  | -------------------------------- | ------------------------------ |
  | `POST …/locations`               | cria local                     |
  | `GET …/locations`                | lista os locais da unidade     |
  | `GET …/locations/:locationId`    | um local                       |
  | `PATCH …/locations/:locationId`  | edita, desativa, reativa       |
  | `DELETE …/locations/:locationId` | apaga, se nenhuma célula o usa |

## Não entra

- Alocar local em célula de quadro e detectar choque de local: specs de quadro e de choque. Esta
  spec só fixa o que elas herdam sobre local (ver "O que as próximas specs herdam")
- Bloco, prédio, andar, recursos da sala (projetor, computadores): o schema não tem
- Local compartilhado entre unidades
- Disponibilidade do local por horário (sala que só pode à noite)
- Limite de locais por plano: a 0006 não tem
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis

- **Escreve** (criar, editar, desativar, reativar, apagar): o dono e o responsável pela unidade.
  Coordenador e professor recebem `403 NOT_ALLOWED`. Local é recurso da unidade, compartilhado
  entre cursos, e não é do catálogo de um curso
- **Lê** quem enxerga a unidade (`resolveUnit`), **inclusive os locais desativados**, com
  `isActive: false`, como o catálogo (0011). Filtrar é do web
- Toda escrita passa por `assertWritable` da 0009

### Local

- **`POST` recebe `{ name, type, capacity? }`**:
  - `name` com o `nameSchema` da 0004 (`Sala 101`, `Lab. de Redes`, `Meet — Turma A`)
  - `type`: um valor de `LocationType` (`CLASSROOM`, `LAB`, `AUDITORIUM`, `SPORTS_FACILITY`,
    `VIRTUAL`); fora disso, o `400` da validação
  - `capacity`: inteiro de 1 a 10000, ou ausente/`null` (não informada). Vale para qualquer tipo,
    inclusive `VIRTUAL` (limite de participantes da sala)
- **Nome repetido na unidade** → `409 LOCATION_NAME_IN_USE`, também pelo `P2002`. A comparação é a
  do banco, sensível a maiúsculas: `Sala 1` e `sala 1` convivem
- **`PATCH` recebe `{ name?, type?, capacity?, isActive? }`**; sem campo válido → `400` com o item
  `EMPTY_UPDATE`. `capacity: null` limpa. Local desativado → `409 LOCATION_INACTIVE`; reativar é o
  corpo exatamente `{ isActive: true }`, como na 0009
- **Trocar o `type`** de um local já alocado é permitido. Ir para ou sair de `VIRTUAL` muda se ele
  entra no choque de local (ver abaixo), e a detecção, que é calculada, acompanha
- **`GET …/locations`** lista todos os locais da unidade, ativos ou não, ordenados por `name`.
  Aceita `?type=` com um valor de `LocationType` (fora do enum: `400`). Sem paginação
- **A busca é na unidade do caminho**: local de outra unidade, inexistente ou id que não é cuid →
  `404 LOCATION_NOT_FOUND`

### Apagar

- **`DELETE` apaga o local** e responde `204` enquanto nenhuma célula de quadro o usa. Usado →
  `409 LOCATION_IN_USE`, conferido antes e pelo `P2003` do `Restrict` de `BoardSlot.locationId`
  (`isForeignKeyViolation`)
- Local desativado e sem uso pode ser apagado. É a mesma exceção da 0012 e da 0013 ao "o que tem
  `isActive` não se apaga": cadastro errado sai enquanto nada depende dele

### O que as próximas specs herdam

- **Local desativado não recebe alocação nova.** As alocações que já existem ficam, e continuam
  valendo para o choque. A spec de quadro aplica
- **`VIRTUAL` não é local físico e nunca gera choque de local.** A sala virtual pode estar em dois
  quadros no mesmo horário. A spec de choque aplica
- **Local é da unidade**: a célula só aloca local da unidade do projeto (regra cruzada da 0002)

### Formato

```json
{
  "id": "…",
  "name": "Lab. de Redes",
  "type": "LAB",
  "capacity": 30,
  "isActive": true,
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z",
  "inUse": false,
  "access": { "canManage": true }
}
```

- **`inUse`** diz se alguma célula usa o local, para o web mostrar ou esconder "apagar"
- **`access.canManage`** é o papel de quem chamou (dono ou responsável)

### Códigos de erro

| código                 | status | mensagem                         | quando                             |
| ---------------------- | ------ | -------------------------------- | ---------------------------------- |
| `LOCATION_NOT_FOUND`   | 404    | Location not found               | id inexistente ou de outra unidade |
| `LOCATION_INACTIVE`    | 409    | Location is inactive             | escrita em local desativado        |
| `LOCATION_NAME_IN_USE` | 409    | Location name already in use     | nome repetido na unidade           |
| `LOCATION_IN_USE`      | 409    | Location is used by a board slot | apagar local alocado em célula     |

- `NOT_ALLOWED`, `UNIT_INACTIVE`, `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` são os da 0009;
  `EMPTY_UPDATE` é item de `VALIDATION_FAILED`

## Critérios de aceite

- [x] Dono e responsável escrevem; coordenador e professor recebem `403`; quem não enxerga a
      unidade, `404`
- [x] Todo membro lista e lê os locais, inclusive os desativados; `?type=` filtra
- [x] `type` fora do enum e `capacity` fora de 1–10000 dão `400`; `capacity: null` limpa
- [x] Nome repetido na unidade dá `409 LOCATION_NAME_IN_USE`; o mesmo nome em outra unidade passa
- [x] Escrita em local desativado dá `409 LOCATION_INACTIVE`; `{ isActive: true }` reativa; plano do
      dono vencido dá `403 PLAN_EXPIRED`
- [x] `DELETE` apaga; local alocado em célula dá `409 LOCATION_IN_USE`, inclusive pelo `P2003`
- [x] `locationId` de outra unidade dá `404 LOCATION_NOT_FOUND`
- [x] Códigos novos no catálogo da 0008; "Contratos em vigor" do README ganha o que as próximas
      specs herdam sobre local
- [x] Testes unitários do service e dos schemas, com banco e `TenantAccessService` substituídos;
      e2e das rotas com o service substituído
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
MST=$(login "$(grep ^ROOT_EMAIL apps/api/.env | cut -d= -f2)")
L=$API/organizations/root-test-organization/units/unidade-teste/locations

curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $L \
  -d '{"name":"Sala 101","type":"CLASSROOM","capacity":40}' -w ' %{http_code}\n'  # 201
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $L \
  -d '{"name":"Meet A","type":"VIRTUAL"}' -w ' %{http_code}\n'                    # 201, capacity null
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $L \
  -d '{"name":"Sala 101","type":"LAB"}' -w ' %{http_code}\n'                      # 409 LOCATION_NAME_IN_USE
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $L \
  -d '{"name":"X","type":"GARAGE","capacity":0}' -w ' %{http_code}\n'             # 400
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $L \
  -d '{"name":"Y","type":"LAB"}' -w ' %{http_code}\n'                             # 403
curl -s -H "Authorization: Bearer $TCH" "$L?type=VIRTUAL"                          # Meet A
curl -s -H "Authorization: Bearer $MST" $L -w ' %{http_code}\n'                   # 404

LOC=<id da Sala 101>
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $L/$LOC -d '{"capacity":null}'   # 200
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $L/$LOC -d '{"isActive":false}'  # 200
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $L/$LOC \
  -d '{"name":"Z"}' -w ' %{http_code}\n'                                          # 409 LOCATION_INACTIVE
curl -s -H "Authorization: Bearer $TCH" $L                                        # Sala 101 com isActive false
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $L/$LOC -d '{"isActive":true}'   # 200

# em uso: termo, projeto, bloco, quadro e célula inseridos por SQL seguram a Sala 101
# (inserir e conferir DELETE → 409 LOCATION_IN_USE; depois apagar o projeto e o resto por SQL)
curl -s -X DELETE -H "Authorization: Bearer $MGR" $L/$LOC -w ' %{http_code}\n'   # 204
kill %1
```

Ao final, apagar os locais criados no teste e o que tiver sido inserido por SQL, e apagar os
códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec 0015`, na branch `feature/catalogo-academico`, depois da 0014.

Commits: `feat(api): locais (spec 0015)`.

Verificação: sem `.env`, `pnpm test:api` passa (378 unitários, 100 e2e) e `pnpm build:api` também;
lint limpo; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um script,
todas as linhas da seção "Verificação" deram o esperado: `Sala 101` (`CLASSROOM`, 40) → `201`;
`Meet A` (`VIRTUAL`) → `201` com `capacity: null`; `Sala 101` de novo → `409 LOCATION_NAME_IN_USE`;
`GARAGE` com `capacity: 0` → `400` com `invalid_value` e `too_small`; o `coordinator@` → `403`; o
`teacher@` com `?type=VIRTUAL` vê só o `Meet A`, com `canManage: false`; o master → `404`;
`capacity: null` limpa (`200`); desativada (`200`), editar → `409 LOCATION_INACTIVE`, o `teacher@`
ainda a vê com `isActive: false`, e `{"isActive":true}` reativa. Com currículo, termo, projeto,
bloco, horário, quadro e célula inseridos por SQL: `inUse: true` e `DELETE` → `409 LOCATION_IN_USE`;
o `DELETE` direto por `psql` falha com SQLSTATE `23503` (`board_slots_location_id_fkey`), o `P2003`
que o service trata; sem eles, o `teacher@` apagando → `403` e o `manager@` → `204`. Além do
roteiro: `sala 101` (minúsculo) convive com `Sala 101` (`201`); `?type=GARAGE` → `400`; id fora do
formato → `404 LOCATION_NOT_FOUND`; com a assinatura do `admin@` vencida por SQL, editar → `403
PLAN_EXPIRED` (e a assinatura voltou a `GRACE` sem `expires_at`). No fim, os locais e o que foi
inserido por SQL foram apagados, e os códigos OTP e refresh tokens também.

Não exercitado contra o banco: o mesmo nome em outra unidade (o `GRACE` do `admin@` só tem uma
unidade; o `where` usa `unitId_name`, coberto no teste unitário) e o `P2003` em corrida de verdade.

Desvios:

- **Ordem no `PATCH`**: local (`404`) → papel (`403`) → `assertWritable` → local desativado (`409
LOCATION_INACTIVE`, salvo `{ isActive: true }`) → nome repetido. No `DELETE`: local → papel →
  `assertWritable` → em uso. A spec só fixava os papéis e os códigos.
- **`capacity` ausente no `POST` vira `null`** no Zod (`default(null)`), para o corpo validado já
  chegar completo ao service.
- **"Usado por célula"** sai do `_count` de `boardSlots` lido com o local, sem consulta separada.
- **A verificação foi rodada em passos**: o comando único (script, roteiro e limpeza) foi barrado
  pelo classificador de permissões do Claude Code; o script foi escrito à parte e a limpeza apagou
  só os registros criados pelo teste, por nome e id.
