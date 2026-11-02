---
id: 0021
title: Professores
status: done
depends_on: [0005, 0008, 0009, 0010, 0016, 0018, 0019]
---

# 0021 — Professores

## Objetivo

O professor deixa de ser um papel do usuário e passa a ser uma entidade da organização, com perfil
próprio (nome, área, observações) e **usuário opcional**. A oferta passa a apontar para o professor,
não para o usuário. Com isso, os gestores da unidade cadastram **professores a contratar** —
professores sem usuário, como "Professor de Matemática 1" — e os alocam nas ofertas. Quando a
contratação sai, a pessoa ganha o próprio professor, e a oferta troca de professor: a vaga sai, a
pessoa entra, e o resto da grade fica como estava.

⚠️ **Esta spec estabelece contrato** (o `Teacher`, o vínculo com o usuário e o que a oferta e o
convite passam a guardar) e **muda o schema**. Deve ser executada sozinha, com `/spec 0021`.

## Por que existe

Hoje `UnitMember.isTeacher` marca quem é professor, e `Offering.teacherId` aponta para `users`. Um
`User` exige e-mail único e conta. O professor em processo de contratação não tem nome, e-mail nem
conta, mas precisa ser alocado e precisa aparecer no choque (a mesma vaga em duas turmas ao mesmo
tempo é um problema). E o professor tem dados que não são do usuário.

A detecção de choque (0022) ainda não foi construída, e por isso esta spec vem antes dela: o choque
já nasce sobre o `Teacher`.

## Contexto necessário

- `specs/0002-api-schema-do-dominio.md` — `UnitMember`, `UnitInvitation`, `Offering` e a regra
  cruzada "professor da oferta é membro `isTeacher` ativo da unidade"
- `specs/0009-api-organizacao-e-unidade.md` — `TenantAccessService` (`resolveOrganization`,
  `resolveUnit`, `assertWritable`), `UnitAccess.isTeacher`
- `specs/0010-api-membros-e-convites.md` — membros (`PATCH` com `isTeacher`) e convites (`isTeacher`
  no convite, aceitar soma as flags), o modelo de e-mail do convite
- `specs/0019-api-ofertas.md` — `PATCH { teacherId }`, `INVALID_TEACHER`, o formato da oferta,
  `?teacherId=`, e o ajuste no `MembersService` que zera o professor das ofertas
- `specs/0005-api-seed-master-e-tenant-de-teste.md` — o tenant de teste e o `teacher@`
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `specs/README.md` — "Migrations são geradas pelo Prisma" e "Contratos em vigor"
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`
- `apps/api/src/modules/offerings/offerings.service.ts` (`assertTeacher`),
  `invitations/invitations.service.ts`, `members/members.service.ts`,
  `tenancy/tenant-access.service.ts`, `infra/mail/templates/unit-invitation.template.ts`

## Escopo

**Entra:**

- Schema: `Teacher` novo; `Offering.teacherId` passa a referenciar `Teacher`; sai `isTeacher` de
  `UnitMember` (o `isTeacher` do convite fica, com sentido novo). Migration gerada pelo Prisma
- Módulo `src/modules/teachers/` com controller, service e schemas Zod
- Rotas, todas exigindo token, sob `/api/organizations/:orgSlug`:

  | rota                           | o que faz                                        |
  | ------------------------------ | ------------------------------------------------ |
  | `POST …/teachers`              | cria professor (com ou sem usuário)              |
  | `GET …/teachers`               | lista os professores da organização              |
  | `GET …/teachers/:teacherId`    | um professor                                     |
  | `PATCH …/teachers/:teacherId`  | edita o perfil, desativa, reativa                |
  | `DELETE …/teachers/:teacherId` | apaga professor sem usuário e sem oferta alocada |

- **Semestre em andamento passa a ser só leitura para os projetos** (muda a matriz da 0016): ver
  "Semestre em andamento não se edita"
- Ajustes nas specs já entregues, com nota datada no fim de cada uma (0002, 0005, 0010, 0016, 0018,
  0019): ver "O que muda no que já existe"
- Seed: o `teacher@` com um `Teacher` vinculado, e um professor a contratar
- Banco de dev recriado (`pnpm db:reset`, com autorização explícita do usuário) e semeado

## Não entra

- **Verificar choque ao trocar o professor da oferta**: é da 0022 (a resposta do `PATCH` da oferta
  passa a trazer os choques). Aqui a troca só grava
- Trocar o professor de várias ofertas de uma vez (todas as da vaga para a pessoa): a troca é oferta
  a oferta, pelo `PATCH` da 0019. Um "trocar em lote" pode vir depois
- Titulação, matrícula, regime de trabalho: spec própria, se precisar
- Disponibilidade do professor, carga máxima
- O horário do professor (spec futura): ela usa o `Teacher.userId` para achar as aulas da pessoa
- Choque entre unidades: o `Teacher` é da organização, mas a 0022 compara semestres dentro da
  unidade; atravessar unidades continua v2
- Migrar os dados do banco à mão: não há produção; o banco de dev é recriado
- Foto, contato, currículo do professor

## Decisões já tomadas

### Schema

```prisma
model Teacher {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  userId         String?  @map("user_id")
  name           String
  area           String?
  notes          String?
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  user         User?        @relation(fields: [userId], references: [id], onDelete: Restrict)
  offerings    Offering[]

  @@unique([organizationId, name])
  @@unique([organizationId, userId])
  @@index([userId])
  @@map("teachers")
}
```

- **`Offering.teacherId`** passa a referenciar `Teacher`, com `onDelete: Restrict` (o `Teacher` tem
  `isActive` e só se apaga sem uso). O nome da coluna (`teacher_id`) fica
- **Sai** `UnitMember.isTeacher`: ser professor passa a ser ter um `Teacher`
- **`UnitInvitation.isTeacher` fica**, com um sentido novo (ver "Quando o usuário ganha um
  professor")
- **`@@unique([organizationId, userId])`**: um usuário é no máximo um professor por organização.
  Vários `Teacher` sem usuário (`null`) convivem, porque o Postgres não compara `NULL` na unicidade
- Relações de volta em `Organization` (`teachers`), `User` (`teacherProfiles`); `User.offerings` sai
- **A migration é a que o Prisma gera** (`pnpm db:migrate --name teachers`), sem SQL à mão. Ela
  apaga uma coluna e troca uma FK; o banco de dev é recriado em seguida (ver "Banco de dev")

### Professor

- **É da organização**: um professor dá aula em qualquer unidade dela. As ofertas de todas as
  unidades da organização escolhem entre os mesmos professores
- **Lê** quem enxerga a organização (`resolveOrganization`, 0009). Todo membro vê a lista: é dela que
  se escolhe o professor da oferta
- **Escreve** o dono da organização ou o responsável (`isManager`) de qualquer unidade ativa dela —
  os gestores de unidade. Os demais → `403 NOT_ALLOWED`. Toda escrita passa por `assertWritable` da
  organização
- **`POST` recebe `{ name, area?, notes?, userId? }`**: `name` com o `nameSchema` da 0004; `area` até
  120 caracteres e `notes` até 1000, com `trim`, e vazios viram `null`. **Sem `userId`, é um
  professor a contratar**, e é o uso comum: o gestor cadastra as vagas e as aloca
- **Nome único na organização** → `409 TEACHER_NAME_IN_USE`, também pelo `P2002`. O professor a
  contratar ganha um nome que o distingue ("Professor de Matemática 1", "Prof. Redes — vaga 2")
- **`PATCH` recebe `{ name?, area?, notes?, isActive? }`**; sem campo válido → `400` com o item
  `EMPTY_UPDATE`. **`userId` não é editável**: o schema descarta a chave. Reativar é o corpo
  exatamente `{ isActive: true }`, como na 0009; escrever em professor desativado → `409
TEACHER_INACTIVE`
- **`GET …/teachers`** lista todos, ativos ou não, ordenados por `name`. Filtros: `?q=` (nome,
  contém, sem diferenciar maiúsculas), `?active=true|false`, `?linked=true|false` (com ou sem
  usuário: `false` é a lista de vagas). Sem paginação
- **Busca na organização do caminho**: de outra organização, inexistente ou id que não é cuid → `404
TEACHER_NOT_FOUND`
- **`DELETE`** apaga e responde `204` quando, ao mesmo tempo:
  - o professor **não tem usuário** (é uma vaga). Professor com usuário nunca se apaga: é a pessoa e o
    histórico dela → `409 TEACHER_HAS_USER`; o caminho é desativar
  - **nenhuma oferta dele está alocada**, isto é, usada em alguma célula de quadro (0020) → senão
    `409 TEACHER_IN_USE`
- **As ofertas dele que não estão alocadas ficam sem professor**: na mesma transação, antes de
  apagar, o `teacherId` delas vira `null` (`updateMany`). A FK é `Restrict`; quem solta as ofertas é
  a aplicação, como na remoção de oferta (0019). Se uma oferta for alocada entre a checagem e o
  `delete`, o `P2003` vira o mesmo `409 TEACHER_IN_USE`
- É a mesma exceção de local e bloco ao "o que tem `isActive` não se apaga": uma vaga criada por
  engano sai enquanto não pesa na grade

### O vínculo com o usuário é fixo

- **O usuário de um `Teacher` é definido só quando ele nasce** (no `POST` com `userId`, ou pelo
  convite, abaixo) **e nunca muda**: não se troca, não se tira, não se acrescenta depois. O `Teacher`
  com usuário **é a pessoa**, e as ofertas dele, inclusive as de semestres encerrados, são o
  histórico dela
- **A vaga nunca vira pessoa.** O professor a contratar continua sem usuário para sempre. Quando a
  pessoa chega, ela tem o próprio `Teacher`, e as ofertas da vaga passam para ele pela troca de
  professor da oferta (ver "Contratar: trocar o professor da oferta"). Depois, a vaga é desativada
- **Um usuário é no máximo um professor por organização**: `userId` de quem já é professor nela →
  `409 USER_ALREADY_TEACHER`, também pelo `P2002`
- **O usuário tem de ser membro de alguma unidade da organização e estar ativo** → senão `400
INVALID_TEACHER_USER`. É o que dá a ele acesso à organização

### Quando o usuário ganha um professor

Dois casos, e só estes caminhos. Ninguém vira professor por ser membro, por coordenar curso ou por
aparecer numa oferta.

| caso                                                | como                                                               | o que acontece                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **1 — a conta já nasce como professor**             | convite com `isTeacher: true` (0010) para quem não tem conta       | o convite cria o `User`, como hoje; **ao aceitar, é criado um `Teacher` com o nome do convidado, já vinculado** |
| **2 — era só usuário e depois ganhou um professor** | já é membro da organização: `POST …/teachers { name, userId }`     | cria o `Teacher` já vinculado                                                                                   |
|                                                     | tem conta, mas não é da organização: convite com `isTeacher: true` | o mesmo do caso 1, ao aceitar                                                                                   |

- **O convite não aponta para uma vaga.** A vaga continua vaga; a pessoa ganha o próprio `Teacher`
  no aceite, e o gestor troca o professor das ofertas depois
- **O `Teacher` nasce no aceite, não no convite.** Convite recusado, cancelado ou vencido não deixa
  professor nenhum
- **Convite com `isTeacher` para quem já é professor na organização**: ao aceitar, nada novo é
  criado; o convidado continua com o `Teacher` que tinha
- **Nome do `Teacher` criado pelo convite** é o `name` do usuário no momento do aceite. Se já houver
  um professor com esse nome na organização (um homônimo), o nome ganha o e-mail entre parênteses
  (`Ana Souza (ana@ifce.edu.br)`). O gestor renomeia depois, se quiser
- **Criado na mesma transação** do aceite, junto com o membro. Se o plano do dono estiver vencido, o
  aceite já é barrado antes (0010), e nada é criado
- Criar com `userId` é do gestor de unidade; o convite, de quem pode convidar (0010)

### Contratar: trocar o professor da oferta

- **É o `PATCH …/offerings/:offeringId { teacherId }` da 0019**, com as regras de quem edita da
  matriz da 0016. Trocar a vaga pela pessoa é trocar o `teacherId` da oferta de um `Teacher` para
  outro. As células da oferta não mudam: o professor delas é o da oferta
- **Só com o semestre em `PLANNING` ou `ADJUSTMENTS`**, pelos gestores do projeto. Em `STARTED`,
  `FINISHED` e `CANCELLED`, nada se edita (abaixo) → `409 TERM_STATUS_FORBIDS`. Para trocar o
  professor de um semestre em andamento, o dono ou o responsável volta o semestre para `ADJUSTMENTS`
  (0016), troca, e o leva de novo a `STARTED`
- **A mesma rotina troca um professor com usuário por outro** (as turmas mudaram de mãos, alguém
  saiu). O histórico fica: as ofertas de semestres encerrados não se editam (0016), então continuam
  com quem deu as aulas
- **Trocar o professor pode criar choques** (o novo professor já tem aula naquele horário) ou
  desfazê-los. A 0022 acrescenta a verificação à resposta deste `PATCH`; aqui a troca só grava

### Professor desativado

- **Não é atribuído a oferta nova** (`409 TEACHER_INACTIVE` no `PATCH` da oferta, quando o
  `teacherId` muda para ele)
- **As ofertas que já o têm continuam**, e continuam valendo para o choque (0022). É o mesmo que
  local desativado (0015)
- **É o fim da vaga preenchida e de quem saiu**: desativar não apaga o histórico e tira o professor
  da lista de escolha. Desativar não mexe no usuário

### Semestre em andamento não se edita

Com o semestre em `STARTED`, **nada dentro dos projetos dele se edita**, por ninguém: dados do
projeto, ofertas (inclusive o professor), quadros e células. Até aqui, a 0016 deixava o dono e o
responsável editarem em `STARTED`.

- **`TERM_PROJECT_POLICY.STARTED`** passa a `{ create: false, edit: 'NOBODY', publish: false,
othersSee: 'PUBLISHED' }`. O valor `UNIT_ADMINS` de `ProjectEditors` deixa de ser usado e sai do
  tipo, com o caso dele em `isProjectActionAllowed`
- **Mudar algo com as aulas começadas é uma decisão explícita**: o dono ou o responsável leva o
  semestre de volta a `ADJUSTMENTS` (a volta `STARTED → ADJUSTMENTS` da 0016), os gestores editam, e o
  semestre volta a `STARTED`. Em `ADJUSTMENTS`, os demais membros continuam vendo os projetos
  publicados (0016), então a grade não some enquanto é corrigida
- **O semestre em si continua editável em `STARTED`** pelo dono e pelo responsável: nome, datas e
  status (`assertTermWritable` não muda). O que fica só leitura são os projetos
- O teste da matriz da 0016 (5 status × 4 ações × 3 papéis) muda na linha de `STARTED`: `edit` dá
  `409 TERM_STATUS_FORBIDS` para todos

### O que muda no que já existe

Cada item vira nota datada no fim da spec indicada, na execução.

- **0019 (ofertas)**:
  - `PATCH { teacherId }` recebe o id de um `Teacher` **ativo** da **organização** da unidade, ou
    `null`. De fora da organização ou inexistente → `400 INVALID_TEACHER`; desativado →
    `409 TEACHER_INACTIVE`. O `assertTeacher` do `OfferingsService` passa a consultar `teachers`
  - formato: `teacher: { id, name, user: { id, email, name } | null }`
  - `?teacherId=` filtra pelo `Teacher`
  - **sai** o ajuste no `MembersService` que zerava o professor das ofertas quando o membro saía da
    unidade ou perdia `isTeacher`: sair de uma unidade não deixa de ser professor da organização.
    Quem deixa a instituição tem o professor desativado, e as ofertas dos semestres abertos trocadas
    pelo gestor
- **0010 (membros e convites)**:
  - o `PATCH` de membro perde `isTeacher` (fica `{ isManager }`); `EMPTY_UPDATE` sem ele
  - o **`isTeacher`** do convite deixa de ligar uma flag no membro: **aceitar cria um `Teacher`
    vinculado** ao convidado, como na seção "Quando o usuário ganha um professor". "Somar as flags"
    (0010) passa a valer só para `isManager`
  - o e-mail do convite continua dizendo "professor" quando o convite tem `isTeacher`
- **0009/0010 (`TenantAccessService`)**: `UnitAccess.isTeacher` passa a ser "o usuário tem um
  `Teacher` ativo nesta organização". O `access` da unidade (0009) não muda de formato
- **0005 (seed)**: o `teacher@` entra como membro sem flag de professor e ganha um `Teacher`
  ("Teacher Teste", vinculado); a seed cria também um professor a contratar ("Professor a contratar
  1", sem usuário). As duas linhas novas entram na saída da seed como as outras
- **0016 (semestres)**: a linha `STARTED` da matriz vira "editar: ninguém", como em "Semestre em
  andamento não se edita"; o texto "`STARTED` restringe ao dono e ao responsável" deixa de valer
- **0018 (projetos)**: "em `STARTED`, dono e responsável editam" deixa de valer; o `access.canEdit`
  é `false` para todos em `STARTED`
- **0002 (schema)**: os models mudados; a regra cruzada vira "professor da oferta é um `Teacher`
  ativo da organização da unidade do projeto"

### Formato

```json
{
  "id": "…",
  "name": "Professor de Matemática 1",
  "area": "Matemática",
  "notes": "Concurso 2026, edital 12",
  "isActive": true,
  "user": null,
  "offeringsCount": 3,
  "createdAt": "2026-11-01T10:00:00.000Z",
  "updatedAt": "2026-11-01T10:00:00.000Z",
  "access": { "canManage": true }
}
```

- **`user`** é `{ id, email, name }` quando o professor tem usuário
- **`offeringsCount`** conta as ofertas com o professor, em qualquer projeto da organização

### Banco de dev

- Depois da migration, o banco de dev é recriado com `pnpm db:reset` e semeado com
  `SET_FIRST_TENANT=true`. **O reset precisa da autorização explícita do usuário** (Registro da 0002;
  o Prisma pede `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` com o texto dele). Sem a autorização,
  o agente para e pergunta

### Códigos de erro

| código                 | status | mensagem                                          | quando                                         |
| ---------------------- | ------ | ------------------------------------------------- | ---------------------------------------------- |
| `TEACHER_NOT_FOUND`    | 404    | Teacher not found                                 | id inexistente ou de outra organização         |
| `TEACHER_NAME_IN_USE`  | 409    | Teacher name already in use                       | nome repetido na organização                   |
| `TEACHER_INACTIVE`     | 409    | Teacher is inactive                               | escrever em professor desativado ou atribuí-lo |
| `TEACHER_IN_USE`       | 409    | Teacher has allocated offerings                   | apagar professor com oferta alocada em célula  |
| `TEACHER_HAS_USER`     | 409    | Teacher has a user                                | apagar professor com usuário                   |
| `INVALID_TEACHER_USER` | 400    | User must be an active member of the organization | criar com `userId` de quem não é membro        |
| `USER_ALREADY_TEACHER` | 409    | User is already a teacher in this organization    | criar com `userId` de quem já é professor nela |

- `INVALID_TEACHER` (0019) muda de sentido: "não é um `Teacher` da organização"
- `NOT_ALLOWED`, `ORGANIZATION_NOT_FOUND`, `ORGANIZATION_INACTIVE` e `PLAN_EXPIRED` são os da 0009;
  `EMPTY_UPDATE` é item de `VALIDATION_FAILED`

## Critérios de aceite

- [x] `schema.prisma` com o `Teacher` acima, `Offering.teacherId → Teacher` e sem
      `UnitMember.isTeacher`; uma migration nova, gerada pelo Prisma, sem edição; `pnpm db:migrate`
      sem drift depois
- [x] Gestores de unidade (dono e responsáveis) criam professores sem usuário e com usuário; demais
      membros leem; quem não enxerga a organização recebe `404`
- [x] Professor sem usuário é listado em `?linked=false` e atribuído a oferta
- [x] `userId` só na criação: membro ativo da organização; não membro dá `400`; já professor dá
      `409`; `userId` no `PATCH` é descartado (o vínculo não muda)
- [x] Caso 1 e caso 2 de "ganhar um professor", e só eles; o convite com `isTeacher` cria o
      `Teacher` vinculado no aceite (com o e-mail no nome se houver homônimo), e nada se o convite
      não for aceito ou se o convidado já for professor
- [x] Trocar o professor da oferta, da vaga para a pessoa e de uma pessoa para outra, pelo `PATCH`
      da 0019; as ofertas de semestres encerrados não mudam
- [x] Nome repetido na organização dá `409`; desativado não é atribuído a oferta nova, mas fica nas
      que já tinha
- [x] `DELETE` só de professor sem usuário (`409 TEACHER_HAS_USER`) e sem oferta alocada em célula
      (`409 TEACHER_IN_USE`); as ofertas dele não alocadas ficam sem professor, na mesma transação
- [x] Ofertas (0019): `PATCH` aceita `Teacher` ativo da organização, recusa de fora (`400`) e
      desativado (`409`); formato e filtro novos; sair da unidade não zera mais o professor
- [x] Convites e membros (0010): o `isTeacher` do convite cria o `Teacher`; `PATCH` de membro sem
      `isTeacher`
- [x] `UnitAccess.isTeacher` vem do `Teacher`
- [x] Seed com o `teacher@` vinculado e um professor a contratar; banco de dev recriado e semeado
- [x] Em `STARTED`, editar projeto, oferta (inclusive o professor), quadro e célula dá `409
TERM_STATUS_FORBIDS` para todos; voltar o semestre a `ADJUSTMENTS` libera de novo; o semestre
      em si continua editável; o teste da matriz da 0016 atualizado na linha `STARTED`
- [x] Notas datadas na 0002, 0005, 0010, 0016, 0018 e 0019; "Contratos em vigor" do README ganha o `Teacher`
- [x] Códigos novos no catálogo da 0008
- [x] Testes unitários do service de professores, dos schemas, e os de ofertas, convites, membros e
      seed ajustados; e2e das rotas com os services substituídos
- [x] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam

## Verificação

```bash
docker compose up -d db
pnpm install --frozen-lockfile

pnpm db:migrate --name teachers       # gera a migration
pnpm db:reset --force                  # SÓ com autorização explícita do usuário
pnpm db:migrate                        # "Already in sync"

mv apps/api/.env apps/api/.env.bak 2>/dev/null
pnpm test:api
pnpm build:api
mv apps/api/.env.bak apps/api/.env 2>/dev/null

pnpm --filter @schdlr/api lint
pnpm format && git status --porcelain                         # só a migration e o código

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
O=$API/organizations/root-test-organization
U=$O/units/unidade-teste
T=$O/teachers

curl -s -H "Authorization: Bearer $CRD" $T                                      # Teacher Teste (com usuário) e Professor a contratar 1
curl -s -H "Authorization: Bearer $CRD" "$T?linked=false"                        # só o a contratar
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $T -d '{"name":"X"}' -w ' %{http_code}\n'   # 403
VAGA=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"Professor de Matemática 1","area":"Matemática"}' | id)           # 201, user null
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"Professor de Matemática 1"}' -w ' %{http_code}\n'                # 409 TEACHER_NAME_IN_USE
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $T/$VAGA \
  -d '{"userId":"<id do coordinator@>","notes":"edital 12"}'                    # 200, user continua null

# a vaga numa oferta (projeto montado como na 0019)
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $U/projects/$PRJ/offerings/$OFF \
  -d "{\"teacherId\":\"$VAGA\"}"                                                # 200, teacher.user null

# caso 2: o coordinator@ (membro) ganha um professor; a oferta troca da vaga para ele
PESSOA=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"Coordinator Teste","userId":"<id do coordinator@>"}' | id)      # 201, user coordinator@
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"Outro nome","userId":"<id do coordinator@>"}' -w ' %{http_code}\n'  # 409 USER_ALREADY_TEACHER
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T \
  -d '{"name":"Y","userId":"<id do master>"}' -w ' %{http_code}\n'              # 400 INVALID_TEACHER_USER
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $U/projects/$PRJ/offerings/$OFF \
  -d "{\"teacherId\":\"$PESSOA\"}"                                              # 200, teacher.user coordinator@
curl -s -H "Authorization: Bearer $CRD" $T/$VAGA                                 # offeringsCount 0, user null

# a vaga preenchida é desativada; desativado não entra em oferta nova; apagar com oferta dá 409
curl -s -X PATCH -H "Authorization: Bearer $MGR" -H "$J" $T/$VAGA -d '{"isActive":false}' # 200
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $U/projects/$PRJ/offerings/$OFF2 \
  -d "{\"teacherId\":\"$VAGA\"}" -w ' %{http_code}\n'                           # 409 TEACHER_INACTIVE
curl -s -X DELETE -H "Authorization: Bearer $MGR" $T/$PESSOA -w ' %{http_code}\n'   # 409 TEACHER_HAS_USER

# apagar uma vaga: com oferta alocada em célula, não; só atribuída, sim (a oferta fica sem professor)
VAGA3=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $T -d '{"name":"Prof. Física — vaga 3"}' | id)
curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $U/projects/$PRJ/offerings/$OFF3 \
  -d "{\"teacherId\":\"$VAGA3\"}"
# (com a $OFF3 numa célula de quadro)
curl -s -X DELETE -H "Authorization: Bearer $MGR" $T/$VAGA3 -w ' %{http_code}\n'  # 409 TEACHER_IN_USE
# (tirada a célula)
curl -s -X DELETE -H "Authorization: Bearer $MGR" $T/$VAGA3 -w ' %{http_code}\n'  # 204
curl -s -H "Authorization: Bearer $CRD" $U/projects/$PRJ/offerings/$OFF3         # teacher null

# caso 1: o novo@ é convidado como professor e ganha um Teacher com o nome dele no aceite
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/invitations \
  -d '{"email":"novo@schdlr.dev","name":"Novo Professor","isTeacher":true}'     # 201
curl -s -H "Authorization: Bearer $CRD" "$T?q=Novo"                              # [] (ainda não aceitou)
# (o novo@ entra por OTP e aceita pela lista, como na 0010)
curl -s -H "Authorization: Bearer $CRD" "$T?q=Novo"                              # Novo Professor, user novo@
kill %1
```

Ao final, apagar o que o teste criou (projeto, semestre, currículo, os professores novos, o convite,
o membro e o usuário `novo@`), devolvendo o banco ao estado da seed, e os códigos OTP e refresh
tokens dos logins.

## Registro

**2026-11-01** — executada com `/spec 0021`, na branch `development`.

Commits: `feat(api): professores (spec 0021)`.

Verificação: com a autorização do usuário, `pnpm db:reset --force` recriou o banco de dev; o
`pnpm db:migrate --name teachers` gerou `20261102001155_teachers` (sem edição) e o `pnpm db:migrate`
seguinte deu "Already in sync". Seed com `SET_FIRST_TENANT=true`: 14 criados, com as duas linhas
`professor`. Sem `.env`, `pnpm test:api` passa (747 unitários, 171 e2e) e `pnpm build:api` também;
`tsc` e lint limpos; `pnpm format` estável. Contra o banco de dev, numa instância na porta 3011 com
`MAIL_ENABLED=false` (a 3001 estava ocupada por outra instância, que não foi tocada), rodado em
`bash` a partir de um script, todas as linhas da seção "Verificação" deram o esperado: o
`coordinator@` lista o `Teacher Teste` (com usuário) e a vaga, `canManage: false`; `?linked=false`
só a vaga; criar → `403`; o `manager@` cria a vaga (`201`, `user: null`), nome repetido → `409
TEACHER_NAME_IN_USE`; `PATCH` com `userId` o descarta. A vaga entra na MAT-101 (`teacher.user:
null`) e `?teacherId=` a acha; o id do usuário no lugar do `Teacher` → `400 INVALID_TEACHER`. O
`coordinator@` ganha o próprio professor (`201`), de novo → `409 USER_ALREADY_TEACHER`, o master →
`400 INVALID_TEACHER_USER`; a MAT-101 troca da vaga para ele, e a vaga fica com `offeringsCount 0`.
A vaga desativada: escrever → `409 TEACHER_INACTIVE`, entrar em oferta nova → `409
TEACHER_INACTIVE`, e fica na QUI-201 que já a tinha. A pessoa não se apaga (`409
TEACHER_HAS_USER`). Uma vaga com a FIS-101 numa célula → `409 TEACHER_IN_USE`; tirada a célula →
`204`, e a FIS-101 fica sem professor. Caso 1: antes do aceite, `?q=Novo` → `[]`; o `novo@` entra
por OTP, aceita, e aparece "Novo Professor" com o `novo@`. Em `STARTED`, `PATCH` da oferta (pelo
`manager@` e pelo `coordinator@`), do projeto, do quadro e `PUT` da célula → `409
TERM_STATUS_FORBIDS`; `access.canEdit: false`; o `PATCH` do semestre → `200`; de volta a
`ADJUSTMENTS`, a oferta e a célula voltam a aceitar. Além do roteiro: id fora do formato e de outra
organização → `404 TEACHER_NOT_FOUND`; o master → `404 ORGANIZATION_NOT_FOUND`; com o nome guardado
"Prof. Coord", o professor do `coordinator@` sai como "Coordinator Teste"; `?q=coordinator` o acha
pelo nome do usuário; o `teacher@` saiu da unidade (`204`) e a FIS-101 continuou com ele; a lista
de membros e o `access` da unidade trazem `isTeacher` pelo `Teacher`; `PATCH` de membro só com
`isTeacher` → `400 EMPTY_UPDATE`; um convidado com o nome de um professor existente virou
"Professor a contratar 1 (homo@schdlr.dev)"; um convite com `isTeacher` recusado não criou nada.
Nenhum e-mail saiu (`MAIL_ENABLED=false`). No fim, projeto, semestre, currículo, bloco, os
professores, convites, membros e usuários criados foram apagados, o `teacher@` voltou à unidade
(reinserido por SQL, com outro `id` e `created_at`), e os códigos OTP e refresh tokens se foram.

Não exercitado contra o banco: convite com `isTeacher` para quem já é professor na organização (a
unidade de teste é a única, e todo professor dela já é membro; coberto pelo teste unitário), e as
corridas pelo `P2002` e pelo `P2003`.

Desvios:

- **Com usuário, o `name` devolvido é sempre o `User.name`** (decisão do usuário durante a
  execução). Vale no professor e no `teacher` da oferta, por `teacherName` em
  `teachers/teacher-name.ts`. O `Teacher.name` guardado continua obrigatório e único na
  organização: é o nome da vaga e o do `TEACHER_NAME_IN_USE`. Por isso o `?q=` procura também no
  nome do usuário, e a lista é ordenada em memória pelo nome devolvido (`localeCompare` pt-BR), não
  pelo `orderBy` do banco. Fica em aberto: o `PATCH { name }` de professor com usuário muda só o
  nome guardado, que não aparece.
- **Reset antes da migration.** O `prisma migrate dev` não roda num terminal não interativo quando
  vai apagar coluna com dados (`unit_members.is_teacher`). O banco foi recriado primeiro (com a
  autorização) e a migration gerada sobre ele vazio, sem `--create-only` e sem edição. O nome traz
  a data em UTC (`20261102…`).
- **`isTeacher` no formato do membro (0010) ficou**, calculado: ter `Teacher` ativo na organização.
  A spec não dizia o que fazer com ele.
- **`PATCH` de membro é só do dono**: com `isManager` como única chave, o responsável não tem mais
  o que editar ali.
- **`TenantAccessService.isTeacher(userId, organizationId)`** é público: o `resolveUnit` o chama
  (uma consulta a mais por requisição de unidade) e o `UnitsService` também, na listagem e na
  criação.
- **Oferta**: `TEACHER_INACTIVE` só quando o `teacherId` muda; repetir o professor que a oferta já
  tem não consulta nada. A mensagem de `INVALID_TEACHER` virou "Teacher must be a teacher of the
  organization".
- **Ordem nas escritas de professor**: `POST` — papel (`403`) → `assertWritable` → usuário (`400`)
  → já professor (`409`) → nome (`409`); `PATCH` — professor (`404`) → papel → `assertWritable` →
  desativado (`409`) → nome; `DELETE` — professor → papel → `assertWritable` → com usuário → com
  oferta alocada. Um `P2002` no `POST` com `userId` relê o vínculo para escolher entre
  `USER_ALREADY_TEACHER` e `TEACHER_NAME_IN_USE`.
- **`DELETE`**: o `updateMany` solta só as ofertas sem célula (`boardSlots: { none: {} }`), para
  que uma alocação na corrida caia no `Restrict` (`P2003` → `409 TEACHER_IN_USE`) em vez de ser
  solta junto.
- **Homônimo no convite**: se "Nome (e-mail)" também já existir na organização, o aceite falha
  pelo `P2002` (500). Não tratado.
- **Seed**: o `Teacher` é procurado pelo nome na organização, como as outras linhas da seed.
