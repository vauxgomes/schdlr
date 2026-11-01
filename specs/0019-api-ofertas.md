---
id: 0019
title: Ofertas
status: todo
depends_on: [0010, 0013, 0018]
---

# 0019 — Ofertas

## Objetivo

Cada projeto passa a ter as suas ofertas: uma por disciplina do currículo, que é o que vai ser
alocado nas células dos quadros, com o professor que a ministra. As ofertas são geradas a partir
das disciplinas ativas do currículo quando o projeto é criado e podem ser regeradas a qualquer
momento. Os gestores do projeto definem o professor de cada oferta e podem remover ofertas; remover
uma oferta desaloca as células que a usavam.

## Por que existe

Sem oferta não há o que alocar no quadro, e sem professor na oferta não há choque de professor. A
0002 previu "uma oferta por disciplina ativa do currículo, criada sem professor", e a 0010 deixou
para cá o que acontece com o professor que deixa a unidade.

## Contexto necessário

- `specs/0018-api-projetos.md` — `ProjectAccessService` (`resolveProject`,
  `assertProjectWritable`), a visibilidade, "editar projeto inclui tudo o que mora nele" e a
  criação do projeto (`ProjectsService.create`)
- `specs/0016-api-semestres.md` — a matriz "status do semestre × projetos"
- `specs/0002-api-schema-do-dominio.md` — `Offering` (`@@unique([projectId, subjectId])`,
  `teacherId` opcional com `SetNull`, `Project → Offering` em `Cascade`), `BoardSlot.offeringId` em
  `Restrict`, "oferta sem professor pode ser alocada em célula" e a regra cruzada "professor da
  oferta é membro `isTeacher` ativo da unidade"
- `specs/0013-api-disciplinas.md` — disciplina ativa e desativada, `SUBJECT_IN_USE`
- `specs/0010-api-membros-e-convites.md` — `MembersService` (`update`, `remove`) e o "Não entra"
  sobre o professor que deixa a unidade
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `apps/api/src/modules/projects/` e `apps/api/src/modules/members/`

## Escopo

**Entra:**

- Módulo `src/modules/offerings/` com controller, service e schemas Zod
- Rotas, todas exigindo token, sob
  `/api/organizations/:orgSlug/units/:unitSlug/projects/:projectId`:

  | rota                             | o que faz                                         |
  | -------------------------------- | ------------------------------------------------- |
  | `GET …/offerings`                | lista as ofertas do projeto                       |
  | `GET …/offerings/:offeringId`    | uma oferta                                        |
  | `PATCH …/offerings/:offeringId`  | define ou tira o professor                        |
  | `DELETE …/offerings/:offeringId` | remove a oferta e desaloca as células dela        |
  | `POST …/offerings/generate`      | gera as ofertas que faltam das disciplinas ativas |

- Geração das ofertas na criação do projeto (`ProjectsService.create`, da 0018), na mesma
  transação
- Ajuste no `MembersService` (0010): quem deixa de ser professor da unidade sai das ofertas, com
  nota datada no fim da 0010

## Não entra

- Alocar oferta em célula, e a carga horária alocada × a da disciplina: spec de quadro
- Detectar choque de professor: spec de choque
- Criar oferta avulsa, de disciplina fora do currículo ou de uma disciplina escolhida a dedo: a
  única fonte é a geração
- Versões de uma mesma disciplina (Química, Química Repetentes): spec futura
- Professor fantasma (vaga ainda sem pessoa): spec futura
- Mais de um professor por oferta
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis e visibilidade

- **Lê** quem vê o projeto (`resolveProject` da 0018); quem não vê recebe `404
PROJECT_NOT_FOUND`. A lista de ofertas é a mesma para todos que veem o projeto
- **Escreve** (professor, remover, gerar) quem a matriz da 0016 deixa editar o projeto:
  `assertProjectWritable(access, 'edit')`. Em `PLANNING` e `ADJUSTMENTS`, os gestores do projeto;
  em `STARTED`, o dono e o responsável; em `FINISHED` e `CANCELLED`, ninguém (`409
TERM_STATUS_FORBIDS`)
- **A oferta é procurada no projeto do caminho**: de outro projeto, inexistente ou id que não é
  cuid → `404 OFFERING_NOT_FOUND`

### Gerar e regerar

- **Gerar cria uma oferta, sem professor, para cada disciplina ativa do currículo do projeto que
  ainda não tem oferta no projeto.** É só acréscimo: não apaga, não troca professor e não mexe em
  célula. Rodar duas vezes seguidas não cria nada na segunda
- **Na criação do projeto**, as ofertas são geradas na mesma transação do `create`. O projeto já
  responde com elas existindo. O formato do projeto (0018) não muda
- **`POST …/offerings/generate`** gera de novo, a qualquer momento em que editar é permitido.
  Responde `200` com `{ created, offerings }`: quantas foram criadas agora e a lista inteira do
  projeto, no formato da listagem
- **Oferta removida de disciplina ativa volta na regeração**: a disciplina ativa sem oferta é
  exatamente o que a geração preenche. Quem remove uma oferta de disciplina ativa e não quer que ela
  volte desativa a disciplina no currículo (0013)
- **Disciplina desativada não gera oferta.** A oferta que já existia quando a disciplina foi
  desativada **continua no projeto e continua válida**: aparece na lista, pode ter professor, ser
  alocada e contar para o choque. A regeração não a apaga
- **Oferta de disciplina desativada que foi removida não volta**: a geração só olha as ativas.
  Reativar a disciplina e regerar a traz de volta
- **Disciplina acrescentada ao currículo depois do projeto** entra na próxima regeração
- **Disciplina apagada** nunca tem oferta: a 0013 só apaga disciplina sem oferta
  (`SUBJECT_IN_USE`). A geração não precisa tratar disciplina que sumiu
- **Concorrência**: a criação usa `createMany` com `skipDuplicates`, apoiada no
  `@@unique([projectId, subjectId])`. Duas regerações simultâneas não duplicam; `created` conta o
  que esta chamada de fato criou
- **Currículo ou curso desativado não impede regerar**: a 0018 decidiu que desativar depois da
  criação não trava o projeto. Currículo desativado com disciplinas ativas continua gerando

### Professor

- **`PATCH` recebe `{ teacherId }`**: o `userId` de um professor da unidade, ou `null` para tirar.
  Única chave editável; outras são ignoradas, e corpo sem `teacherId` → `400` com o item
  `EMPTY_UPDATE`
- **Professor da unidade** é membro da unidade com `isTeacher: true` e usuário ativo (a regra
  cruzada da 0002). Fora disso, inclusive id fora do formato → `400 INVALID_TEACHER`, como o
  `COORDINATOR_NOT_A_MEMBER` da 0011
- **O mesmo professor em várias ofertas** é permitido. Se as células delas se sobrepõem é choque, e
  isso é da spec de choque, não um erro aqui
- Oferta de disciplina desativada aceita professor como qualquer outra

### Remover

- **`DELETE` remove a oferta** e responde `204`. Na mesma transação, antes de apagar, zera o
  `offeringId` de todas as células que a usam (`updateMany`). As células ficam no quadro, vazias
  daquela oferta; o local alocado nelas fica
- **O `Restrict` de `BoardSlot.offeringId` (0002) continua no schema**: protege contra apagar
  oferta por outro caminho. Quem desaloca é a aplicação, não um `SetNull` no banco. Sem migration
- Remover não mexe na disciplina nem no currículo

### Professor que deixa a unidade

- **Quem deixa de ser professor da unidade sai das ofertas dela.** O `MembersService` da 0010
  zera o `teacherId` das ofertas dos projetos da unidade em duas situações, na mesma transação da
  mudança:
  - o membro é removido ou sai (`remove`)
  - o `isTeacher` passa de `true` para `false` (`update`)
- **Só nos projetos de semestres `PLANNING`, `ADJUSTMENTS` e `STARTED`.** Em `FINISHED` e
  `CANCELLED` a grade é histórico e fica como estava: o professor continua nas ofertas
- É o mesmo que a 0011 fez com o coordenador que sai da unidade. A resposta das rotas de membro
  não muda

### Formato

```json
{
  "id": "…",
  "subject": {
    "id": "…",
    "name": "Matemática I",
    "code": "MAT-101",
    "workload": 80,
    "level": 1,
    "color": "#1E88E5",
    "isActive": true
  },
  "teacher": { "id": "…", "email": "teacher@schdlr.dev", "name": "Teacher Teste" },
  "slotsCount": 0,
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z"
}
```

- **`teacher`** é `null` sem professor
- **`subject.isActive`** é `false` para oferta de disciplina desativada; o web a marca
- **`slotsCount`** conta as células alocadas com a oferta. Até a spec de quadro, sempre `0`
- **`GET …/offerings`** lista todas as ofertas do projeto, ordenadas pelo `level` e depois pelo
  `code` da disciplina, como a grade da 0013. Aceita `?teacherId=` (as ofertas daquele professor) e
  `?withoutTeacher=true`. Sem paginação

### Códigos de erro

| código               | status | mensagem                              | quando                                 |
| -------------------- | ------ | ------------------------------------- | -------------------------------------- |
| `OFFERING_NOT_FOUND` | 404    | Offering not found                    | id inexistente ou de outro projeto     |
| `INVALID_TEACHER`    | 400    | Teacher must be a teacher of the unit | `teacherId` não é professor da unidade |

- `PROJECT_NOT_FOUND` (0018), `TERM_STATUS_FORBIDS` (0016), `NOT_ALLOWED`, `UNIT_INACTIVE`,
  `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` (0009) são reaproveitados; `EMPTY_UPDATE` é item de
  `VALIDATION_FAILED`

## Critérios de aceite

- [ ] Criar projeto gera uma oferta sem professor por disciplina ativa do currículo, na mesma
      transação
- [ ] `generate` cria só as que faltam, das disciplinas ativas; a segunda chamada seguida cria `0`;
      não apaga nem muda professor de nenhuma oferta
- [ ] Oferta removida de disciplina ativa volta na regeração; de disciplina desativada, não volta
- [ ] Oferta de disciplina desativada continua no projeto, com `subject.isActive: false`, aceita
      professor e não é apagada pela regeração
- [ ] `PATCH` aceita professor da unidade e `null`; quem não é professor da unidade (sem
      `isTeacher`, de fora ou usuário inativo) dá `400 INVALID_TEACHER`
- [ ] `DELETE` zera o `offeringId` das células da oferta e a apaga, numa transação, e responde `204`
- [ ] Escrever segue a matriz da 0016: `STARTED` só dono e responsável, `FINISHED`/`CANCELLED` dão
      `409 TERM_STATUS_FORBIDS`; quem não vê o projeto recebe `404`
- [ ] Remover o membro, ou tirar o `isTeacher` dele, zera o professor nas ofertas da unidade em
      projetos de semestres `PLANNING`, `ADJUSTMENTS` e `STARTED`, e não nos `FINISHED`/`CANCELLED`
- [ ] Listagem ordenada por `level` e `code`; `?teacherId=` e `?withoutTeacher=true` filtram
- [ ] Códigos novos no catálogo da 0008; nota datada na 0010; "Contratos em vigor" do README ganha
      a geração, a remoção e o professor que deixa a unidade
- [ ] Testes unitários do service (geração, regeração, remoção) e dos schemas, e do `MembersService`
      com o professor que sai; e2e das rotas com o service substituído
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
TCH=$(login teacher@schdlr.dev)
U=$API/organizations/root-test-organization/units/unidade-teste
COURSE=$(curl -s -H "Authorization: Bearer $CRD" $U/courses \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(c => c.code === "TESTE").id')
K=$U/courses/$COURSE/curricula
CUR=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K -d '{"name":"Matriz 2024","code":"2024"}' | id)
for s in 'MAT-101 80 1' 'FIS-101 60 1' 'QUI-201 40 2'; do set -- $s
  curl -s -o /dev/null -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$CUR/subjects \
    -d "{\"name\":\"$1\",\"code\":\"$1\",\"workload\":$2,\"level\":$3}"; done
TERM=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/terms \
  -d '{"name":"2026.1","startDate":"2026-02-02","endDate":"2026-07-04"}' | id)
PRJ=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $U/projects \
  -d "{\"name\":\"INFO 2026.1\",\"termId\":\"$TERM\",\"curriculumId\":\"$CUR\"}" | id)
O=$U/projects/$PRJ/offerings

curl -s -H "Authorization: Bearer $CRD" $O                                        # 3 ofertas, sem professor
curl -s -X POST -H "Authorization: Bearer $CRD" $O/generate                      # created 0

# professor
OFF=<id da oferta MAT-101>
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $O/$OFF \
  -d '{"teacherId":"<id do teacher@>"}'                                          # 200, teacher@
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $O/$OFF \
  -d '{"teacherId":"<id do coordinator@>"}' -w ' %{http_code}\n'                 # 400 INVALID_TEACHER (sem isTeacher)
curl -s -H "Authorization: Bearer $CRD" "$O?teacherId=<id do teacher@>"           # MAT-101

# remover e regerar
curl -s -X DELETE -H "Authorization: Bearer $CRD" $O/$OFF -w ' %{http_code}\n'   # 204
curl -s -X POST -H "Authorization: Bearer $CRD" $O/generate                      # created 1, MAT-101 de volta, sem professor

# disciplina desativada: a oferta fica; removida, não volta
QUI=<id da disciplina QUI-201>
curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $K/$CUR/subjects/$QUI -d '{"isActive":false}'
curl -s -X POST -H "Authorization: Bearer $CRD" $O/generate                      # created 0; QUI-201 na lista, subject.isActive false
curl -s -X DELETE -H "Authorization: Bearer $CRD" $O/<id da oferta QUI-201> -w ' %{http_code}\n'  # 204
curl -s -X POST -H "Authorization: Bearer $CRD" $O/generate                      # created 0; QUI-201 não volta

# disciplina nova entra na regeração
curl -s -o /dev/null -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$CUR/subjects \
  -d '{"name":"BIO-101","code":"BIO-101","workload":40}'
curl -s -X POST -H "Authorization: Bearer $CRD" $O/generate                      # created 1 (BIO-101)

# célula desalocada ao remover: quadro e célula com a FIS-101 inseridos por SQL
# (DELETE da oferta FIS-101 → 204; a célula fica, com offering_id null)

# professor que sai da unidade: teacher@ na FIS-101 (regerada) e tirar o isTeacher dele
# (PATCH do membro com isTeacher false → as ofertas dele neste projeto ficam sem professor;
#  depois devolver isTeacher true)

# status do semestre
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/terms/$TERM/status -d '{"status":"ADJUSTMENTS"}' > /dev/null
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/terms/$TERM/status -d '{"status":"STARTED"}' > /dev/null
curl -s -X POST -H "Authorization: Bearer $CRD" $O/generate -w ' %{http_code}\n' # 403 (STARTED: só dono e responsável)
curl -s -X POST -H "Authorization: Bearer $MGR" $O/generate -w ' %{http_code}\n' # 200
curl -s -H "Authorization: Bearer $TCH" $O -w ' %{http_code}\n'                  # 200 (publicado, STARTED)
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/terms/$TERM/status -d '{"status":"FINISHED"}' > /dev/null
curl -s -X POST -H "Authorization: Bearer $MGR" $O/generate -w ' %{http_code}\n' # 409 TERM_STATUS_FORBIDS
kill %1
```

Ao final, apagar por SQL o projeto (leva as ofertas, o quadro e a célula), o semestre e o currículo
de teste (leva as disciplinas), conferir que o `teacher@` continua com `isTeacher: true`, e apagar
os códigos OTP e refresh tokens dos logins.
