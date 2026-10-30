---
id: 0002
title: Schema do domínio
status: done
depends_on: [0001]
---

# 0002 — Schema do domínio

## Objetivo

O banco passa a ter todas as tabelas da v1 do schdlr, num `schema.prisma` e numa migration
`init` **gerada pelo Prisma**. Isso inclui usuários e assinatura, organização e unidade,
catálogo acadêmico, espaço e tempo, e a montagem dos horários. O banco garante o que o schema
do Prisma expressa: tipos, FKs, unicidade e política de deleção. As regras que ele não expressa
ficam listadas para a aplicação, na seção "Regras que ficam com a aplicação".

Nenhum endpoint, serviço ou regra de choque entre projetos entra aqui. A spec entrega o
modelo que as próximas vão consumir.

⚠️ **Esta spec estabelece contrato** (nomes de entidade, tabela e coluna, relações e política
de deleção). Deve ser executada sozinha, com `/spec 0002`.

## Por que existe

O schdlr é um validador de horários acadêmicos: detecta, durante a montagem, quando o mesmo
professor ou o mesmo local (físico) é alocado em dois horários que se sobrepõem no mesmo dia da
semana, dentro do mesmo semestre. Tudo o que a v1 faz depende deste modelo, e trocar nome de
tabela ou relação depois custa uma migration por spec que já o usou.

## Contexto necessário

- `specs/0001-api-boilerplate-nestjs.md` — `prisma.config.ts`, `prisma/schema.prisma` sem
  models, `DatabaseService`, scripts `db:*`, e o fato de o CI não ter banco
- `apps/api/prisma/schema.prisma` — generator e datasource que a 0001 deixou
- `apps/api/.env.example` — `DATABASE_URL`
- `docker-compose.yml` — o Postgres de desenvolvimento (`postgres:17-alpine`)

## Glossário

O código é todo em inglês. A tabela abaixo é a ponte com o vocabulário do produto.

| produto (pt)           | entidade         | tabela             |
| ---------------------- | ---------------- | ------------------ |
| Usuário                | `User`           | `users`            |
| Assinatura / plano     | `Subscription`   | `subscriptions`    |
| Código OTP             | `OtpCode`        | `otp_codes`        |
| Sessão (refresh token) | `RefreshToken`   | `refresh_tokens`   |
| Organização            | `Organization`   | `organizations`    |
| Unidade                | `Unit`           | `units`            |
| Membro da unidade      | `UnitMember`     | `unit_members`     |
| Convite para unidade   | `UnitInvitation` | `unit_invitations` |
| Curso                  | `Course`         | `courses`          |
| Currículo              | `Curriculum`     | `curricula`        |
| Disciplina             | `Subject`        | `subjects`         |
| Localização            | `Location`       | `locations`        |
| Semestre               | `Term`           | `terms`            |
| Bloco de horários      | `TimeTable`      | `time_tables`      |
| Horário                | `TimeSlot`       | `time_slots`       |
| Projeto                | `Project`        | `projects`         |
| Oferta                 | `Offering`       | `offerings`        |
| Quadro (turma)         | `Board`          | `boards`           |
| Célula do quadro       | `BoardSlot`      | `board_slots`      |

**Papéis.** "Dono", "responsável pela unidade", "coordenador" e "professor" **não são um enum
único**, porque cada papel mora num lugar diferente:

| papel                    | onde mora              |
| ------------------------ | ---------------------- |
| Dono                     | `Organization.ownerId` |
| Responsável pela unidade | `UnitMember.isManager` |
| Professor                | `UnitMember.isTeacher` |
| Coordenador de curso     | `Course.coordinatorId` |
| Suporte / master         | `User.systemRole`      |

O "usuário comum" é `systemRole = USER`. Um mesmo usuário acumula papéis livremente: dono de
uma organização, responsável numa unidade, professor em outra, coordenador de um curso.

## Escopo

**Entra:**

- Os models, enums e relações da seção "Schema", em `apps/api/prisma/schema.prisma`
- Uma migration `init` gerada com `pnpm db:migrate --name init`, **sem edição manual**

## Não entra

- Endpoints, services, DTOs e schemas Zod de qualquer entidade
- **Detecção de choque** entre células (professor e local). É consulta sobre `board_slots`, e
  vem em spec própria. Este schema só garante os índices de que ela precisa
- Pagamentos, histórico de pagamentos e os planos `BASIC`, `PRO` e `ENTERPRISE` (v2/v3)
- Limites de plano (orgs, unidades, cursos). Isso é regra de aplicação: os números moram em
  constante no código, não em tabela
- Membro de projeto / ajudante de projeto (v2)
- Professor fantasma (v2)
- Sistema de notificações (v2)
- Choque entre semestres simultâneos (v2)
- Seed. O `seed.ts` da 0001 continua stub
- Teste automatizado contra banco no CI
- **SQL escrito à mão na migration**: CHECK, exclusion constraint, índice parcial, extensão
  (`btree_gist`). Ver `specs/README.md`, "Regras"
- Implementar as validações de "Regras que ficam com a aplicação": elas entram nas specs dos
  endpoints de cada entidade
- Mudanças no `.env.example`. As variáveis de senha saem na 0001

## Decisões já tomadas

### Convenções

- **Tudo em inglês**: entidade, campo, enum, comentário
- **Tabela em snake_case no plural** (`@@map("time_tables")`), **coluna em snake_case**
  (`@map("start_time")`). Enum do Postgres também em snake_case (`@@map("term_status")`);
  valores em MAIÚSCULAS
- **Id é `String @id @default(cuid())`** em toda tabela
- **`createdAt` e `updatedAt` em toda tabela** (`created_at`, `updated_at`), como
  `@db.Timestamptz(3)`. A exceção são as tabelas que só recebem insert (`otp_codes`,
  `refresh_tokens`), que ficam só com `createdAt`
- **`ACTIVE`/`INACTIVE` vira `isActive Boolean @default(true)`**. Enum de status só onde há mais
  de dois estados ou o nome importa (`TermStatus`, `ProjectStatus`, `InvitationStatus`)
- **Datas sem hora** (`Term.startDate`, `endDate`) usam `@db.Date`

### Deleção

- **O que tem `isActive` não se apaga: desativa.** As FKs que apontam para essas entidades são
  `onDelete: Restrict`. Usuário também nunca é apagado
- **`Cascade` só de dono para parte**, onde a parte não tem vida própria: `TimeTable → TimeSlot`,
  `Curriculum → Subject`, `Project → Offering`, `Project → Board`, `Board → BoardSlot`,
  `User → OtpCode`, `User → RefreshToken`
- **Currículo em uso por projeto não se apaga**: `Project.curriculumId` é `Restrict`. A regra de
  produto "deletar currículo se não estiver em uso" vem de graça daqui
- **`Course.coordinatorId` e `Offering.teacherId` são `SetNull`**, por coerência, embora usuário
  não seja apagado
- `BoardSlot.offeringId` e `locationId` são `Restrict`. Desfazer uma alocação é zerar o campo,
  não apagar a oferta ou o local

### Domínio

- **Slug de organização é único global; slug de unidade é único dentro da organização**
  (`@@unique([organizationId, slug])`). As URLs serão `/<org>/<unidade>`
- **E-mail é guardado em minúsculas e é único.** A normalização é da aplicação; o banco não usa
  `citext`
- **Horário em minutos desde 0h**, `0 ≤ startTime < endTime ≤ 1440`
- **Intervalo é semiaberto, `[start, end)`.** `07:00–07:50` e `07:50–08:40` não se sobrepõem.
  Essa é a definição de sobreposição para o schema e para a futura detecção de choque
- **Horários do mesmo bloco não se sobrepõem, e quem garante é a aplicação.** A validação roda
  numa transação que lê os horários do bloco antes de gravar. Exclusion constraint seria a
  garantia mais forte, mas exige SQL escrito à mão na migration
- **Dia da semana é `Int` de 1 (segunda) a 6 (sábado).** `workingDays` do projeto é 5 ou 6. O
  dia da célula não passar de `workingDays` é regra de aplicação, porque cruza tabelas
- **`Subject.level` é só organizacional**: `Int` não nulo, default `1`. Serve para agrupar e
  ordenar as disciplinas do currículo (101, 202…). Nenhuma outra entidade depende dele
- **Um projeto é composto por vários quadros**, em geral um por semestre ativo do curso. `name`
  guarda o nome da turma (`INFO 2A`), e `Board` é único por `(projectId, name)`
- **Cada quadro escolhe o próprio bloco de horários**: quadros do mesmo projeto podem usar blocos
  diferentes (manhã para o 1º semestre, noite para o 5º)
- **`Offering` é única por `(projectId, subjectId)`**: uma oferta por disciplina ativa do
  currículo, criada sem professor
- **Oferta sem professor pode ser alocada em célula.** Montar o quadro não espera a definição
  do professor, e nenhuma validação de escrita em `BoardSlot` exige `offering.teacherId`. Para a
  futura detecção de choque, a célula com oferta sem professor **não gera choque de professor**
  (não há com quem chocar), mas continua gerando choque de local. Atribuir o professor depois
  pode revelar choques que antes não existiam
- **`BoardSlot` é único por `(boardId, timeSlotId, weekday)`**. As células podem ser
  materializadas (todas criadas junto com o quadro) ou criadas sob demanda; o schema suporta as
  duas, e a escolha é da spec do quadro
- **Célula bloqueada é vazia**, garantido pela aplicação
- **`Project.unitId` é explícito**, mesmo derivável por `termId`, porque toda listagem filtra por
  unidade. Que `term`, `curriculum` e `project` sejam da mesma unidade é regra de aplicação
- **Coerência entre tabelas fica na aplicação**: professor da oferta ser membro `isTeacher`
  ativo da unidade, local da célula ser da unidade do projeto, horário da célula ser do bloco
  do quadro, oferta da célula ser do mesmo projeto. Garantir isso no banco pediria FK composta
  e colunas denormalizadas em quase toda tabela
- **Um único master**, garantido pela aplicação. Só o seed cria master, e nenhum endpoint
  promove a `MASTER`
- **Master implica suporte.** `systemRole` é um enum só (`USER`, `SUPPORT`, `MASTER`), e a
  aplicação trata `MASTER` como superconjunto de `SUPPORT`
- **Assinatura é uma linha por usuário** (`userId @unique`), não um histórico. O histórico chega
  junto com o pagamento (v3). **Usuário que se cadastra sozinho nasce sem assinatura**, e quem
  atribui plano é o suporte. Usuário sem assinatura não cria organização. `TRIAL` exige
  `expiresAt`, e `GRACE` não vence
- **Login só por OTP**: não há coluna de senha. O código é guardado como hash, com contador de
  tentativas. Refresh token também é guardado como hash
- **Convite para unidade** carrega os papéis pretendidos e um `tokenHash` para os botões
  ACEITAR/RECUSAR do e-mail
- **A migration é a que o Prisma gera, sem edição.** Se algo no schema não puder ser expresso
  sem SQL à mão, isso é condição de parada: perguntar, não escrever

## Schema

O `generator` e o `datasource` são os da 0001 e não mudam. Abaixo estão só os enums e os models.

```prisma
// --- Enums -------------------------------------------------------------------

enum SystemRole {
  USER
  SUPPORT
  MASTER

  @@map("system_role")
}

enum PlanType {
  GRACE
  TRIAL

  @@map("plan_type")
}

enum OtpPurpose {
  SIGN_UP
  SIGN_IN

  @@map("otp_purpose")
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  REJECTED
  EXPIRED
  CANCELLED

  @@map("invitation_status")
}

enum LocationType {
  CLASSROOM
  LAB
  AUDITORIUM
  SPORTS_FACILITY
  VIRTUAL

  @@map("location_type")
}

enum TermStatus {
  PLANNING
  ADJUSTMENTS
  STARTED
  FINISHED
  CANCELLED

  @@map("term_status")
}

enum ProjectStatus {
  DRAFT
  PUBLISHED

  @@map("project_status")
}

// --- Identity ----------------------------------------------------------------

model User {
  id              String     @id @default(cuid())
  email           String     @unique
  name            String
  systemRole      SystemRole @default(USER) @map("system_role")
  isActive        Boolean    @default(true) @map("is_active")
  emailVerifiedAt DateTime?  @map("email_verified_at") @db.Timestamptz(3)
  createdAt       DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime   @updatedAt @map("updated_at") @db.Timestamptz(3)

  subscription          Subscription?
  assignedSubscriptions Subscription[]   @relation("SubscriptionAssignedBy")
  otpCodes              OtpCode[]
  refreshTokens         RefreshToken[]
  ownedOrganizations    Organization[]
  unitMemberships       UnitMember[]
  receivedInvitations   UnitInvitation[] @relation("InvitationInvitee")
  sentInvitations       UnitInvitation[] @relation("InvitationInviter")
  coordinatedCourses    Course[]
  createdTerms          Term[]
  createdProjects       Project[]
  offerings             Offering[]

  @@map("users")
}

model Subscription {
  id           String    @id @default(cuid())
  userId       String    @unique @map("user_id")
  plan         PlanType
  startsAt     DateTime  @default(now()) @map("starts_at") @db.Timestamptz(3)
  expiresAt    DateTime? @map("expires_at") @db.Timestamptz(3)
  assignedById String?   @map("assigned_by_id")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  user       User  @relation(fields: [userId], references: [id], onDelete: Restrict)
  assignedBy User? @relation("SubscriptionAssignedBy", fields: [assignedById], references: [id], onDelete: Restrict)

  @@map("subscriptions")
}

model OtpCode {
  id         String     @id @default(cuid())
  userId     String     @map("user_id")
  purpose    OtpPurpose
  codeHash   String     @map("code_hash")
  attempts   Int        @default(0)
  expiresAt  DateTime   @map("expires_at") @db.Timestamptz(3)
  consumedAt DateTime?  @map("consumed_at") @db.Timestamptz(3)
  createdAt  DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, purpose])
  @@map("otp_codes")
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String    @map("user_id")
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt DateTime? @map("revoked_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}

// --- Tenancy -----------------------------------------------------------------

model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  address   String?
  ownerId   String   @map("owner_id")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  owner User   @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  units Unit[]

  @@index([ownerId])
  @@map("organizations")
}

model Unit {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  name           String
  slug           String
  address        String?
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization     @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  members      UnitMember[]
  invitations  UnitInvitation[]
  courses      Course[]
  locations    Location[]
  terms        Term[]
  timeTables   TimeTable[]
  projects     Project[]

  @@unique([organizationId, slug])
  @@map("units")
}

model UnitMember {
  id        String   @id @default(cuid())
  unitId    String   @map("unit_id")
  userId    String   @map("user_id")
  isManager Boolean  @default(false) @map("is_manager")
  isTeacher Boolean  @default(false) @map("is_teacher")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([unitId, userId])
  @@index([userId])
  @@map("unit_members")
}

model UnitInvitation {
  id          String           @id @default(cuid())
  unitId      String           @map("unit_id")
  inviteeId   String           @map("invitee_id")
  invitedById String           @map("invited_by_id")
  isManager   Boolean          @default(false) @map("is_manager")
  isTeacher   Boolean          @default(false) @map("is_teacher")
  status      InvitationStatus @default(PENDING)
  tokenHash   String           @unique @map("token_hash")
  expiresAt   DateTime         @map("expires_at") @db.Timestamptz(3)
  respondedAt DateTime?        @map("responded_at") @db.Timestamptz(3)
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime         @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit      Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)
  invitee   User @relation("InvitationInvitee", fields: [inviteeId], references: [id], onDelete: Restrict)
  invitedBy User @relation("InvitationInviter", fields: [invitedById], references: [id], onDelete: Restrict)

  @@index([unitId, status])
  @@index([inviteeId, status])
  @@map("unit_invitations")
}

// --- Academic catalog --------------------------------------------------------

model Course {
  id            String   @id @default(cuid())
  unitId        String   @map("unit_id")
  name          String
  code          String?
  coordinatorId String?  @map("coordinator_id")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit        Unit         @relation(fields: [unitId], references: [id], onDelete: Restrict)
  coordinator User?        @relation(fields: [coordinatorId], references: [id], onDelete: SetNull)
  curricula   Curriculum[]

  @@unique([unitId, code])
  @@index([coordinatorId])
  @@map("courses")
}

model Curriculum {
  id          String   @id @default(cuid())
  courseId    String   @map("course_id")
  name        String
  code        String
  description String?
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  course   Course    @relation(fields: [courseId], references: [id], onDelete: Restrict)
  subjects Subject[]
  projects Project[]

  @@unique([courseId, code])
  @@map("curricula")
}

model Subject {
  id           String   @id @default(cuid())
  curriculumId String   @map("curriculum_id")
  name         String
  code         String
  workload     Int
  /// Organizational only: groups and sorts subjects within the curriculum (101, 202…).
  level        Int      @default(1)
  color        String   @default("#000000") @db.Char(7)
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  curriculum Curriculum @relation(fields: [curriculumId], references: [id], onDelete: Cascade)
  offerings  Offering[]

  @@unique([curriculumId, code])
  @@index([curriculumId, level])
  @@map("subjects")
}

// --- Space and time ----------------------------------------------------------

model Location {
  id        String       @id @default(cuid())
  unitId    String       @map("unit_id")
  name      String
  type      LocationType
  capacity  Int?
  isActive  Boolean      @default(true) @map("is_active")
  createdAt DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit       Unit        @relation(fields: [unitId], references: [id], onDelete: Restrict)
  boardSlots BoardSlot[]

  @@unique([unitId, name])
  @@map("locations")
}

model Term {
  id          String     @id @default(cuid())
  unitId      String     @map("unit_id")
  name        String
  startDate   DateTime   @map("start_date") @db.Date
  endDate     DateTime   @map("end_date") @db.Date
  status      TermStatus @default(PLANNING)
  createdById String     @map("created_by_id")
  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime   @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit      Unit      @relation(fields: [unitId], references: [id], onDelete: Restrict)
  createdBy User      @relation(fields: [createdById], references: [id], onDelete: Restrict)
  projects  Project[]

  @@unique([unitId, name])
  @@map("terms")
}

model TimeTable {
  id        String   @id @default(cuid())
  unitId    String   @map("unit_id")
  name      String
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit   Unit       @relation(fields: [unitId], references: [id], onDelete: Restrict)
  slots  TimeSlot[]
  boards Board[]

  @@unique([unitId, name])
  @@map("time_tables")
}

/// Minutes since midnight, half-open interval [startTime, endTime).
model TimeSlot {
  id          String   @id @default(cuid())
  timeTableId String   @map("time_table_id")
  name        String
  startTime   Int      @map("start_time")
  endTime     Int      @map("end_time")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  timeTable  TimeTable   @relation(fields: [timeTableId], references: [id], onDelete: Cascade)
  boardSlots BoardSlot[]

  @@unique([timeTableId, name])
  @@map("time_slots")
}

// --- Scheduling --------------------------------------------------------------

model Project {
  id           String        @id @default(cuid())
  unitId       String        @map("unit_id")
  termId       String        @map("term_id")
  curriculumId String        @map("curriculum_id")
  name         String
  status       ProjectStatus @default(DRAFT)
  workingDays  Int           @default(5) @map("working_days")
  createdById  String        @map("created_by_id")
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  unit       Unit       @relation(fields: [unitId], references: [id], onDelete: Restrict)
  term       Term       @relation(fields: [termId], references: [id], onDelete: Restrict)
  curriculum Curriculum @relation(fields: [curriculumId], references: [id], onDelete: Restrict)
  createdBy  User       @relation(fields: [createdById], references: [id], onDelete: Restrict)
  offerings  Offering[]
  boards     Board[]

  @@unique([termId, name])
  @@index([unitId])
  @@index([termId, status])
  @@map("projects")
}

model Offering {
  id        String   @id @default(cuid())
  projectId String   @map("project_id")
  subjectId String   @map("subject_id")
  teacherId String?  @map("teacher_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  project    Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  subject    Subject     @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  teacher    User?       @relation(fields: [teacherId], references: [id], onDelete: SetNull)
  boardSlots BoardSlot[]

  @@unique([projectId, subjectId])
  @@index([teacherId])
  @@map("offerings")
}

/// One schedule grid of the project, usually one per course semester; name holds the class name.
model Board {
  id          String   @id @default(cuid())
  projectId   String   @map("project_id")
  timeTableId String   @map("time_table_id")
  name        String
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  timeTable TimeTable   @relation(fields: [timeTableId], references: [id], onDelete: Restrict)
  slots     BoardSlot[]

  @@unique([projectId, name])
  @@index([timeTableId])
  @@map("boards")
}

/// weekday: 1 = Monday … 6 = Saturday.
model BoardSlot {
  id         String   @id @default(cuid())
  boardId    String   @map("board_id")
  timeSlotId String   @map("time_slot_id")
  weekday    Int
  offeringId String?  @map("offering_id")
  locationId String?  @map("location_id")
  isBlocked  Boolean  @default(false) @map("is_blocked")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  board    Board     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  timeSlot TimeSlot  @relation(fields: [timeSlotId], references: [id], onDelete: Restrict)
  offering Offering? @relation(fields: [offeringId], references: [id], onDelete: Restrict)
  location Location? @relation(fields: [locationId], references: [id], onDelete: Restrict)

  @@unique([boardId, timeSlotId, weekday])
  @@index([offeringId])
  @@index([locationId])
  @@map("board_slots")
}
```

## Regras que ficam com a aplicação

O schema do Prisma não expressa estas regras, e a migration não ganha SQL escrito à mão para
elas. **Cada uma tem que ser validada pela spec que criar o endpoint de escrita da entidade**,
de preferência no schema Zod da entrada. Esta lista é o contrato que essas specs herdam:

| entidade               | regra                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                 | e-mail normalizado para minúsculas antes de gravar; no máximo um `MASTER`                                                                                                                  |
| `Subscription`         | `TRIAL` exige `expiresAt`; `GRACE` não vence                                                                                                                                               |
| `OtpCode`              | `attempts >= 0`                                                                                                                                                                            |
| `Organization`, `Unit` | slug no formato `^[a-z0-9]+(-[a-z0-9]+)*$`                                                                                                                                                 |
| `Subject`              | `workload >= 1`; `level >= 1`; `color` no formato `^#[0-9A-Fa-f]{6}$`                                                                                                                      |     | `Location` | `capacity` nulo ou `> 0` |
| `Term`                 | `endDate >= startDate`                                                                                                                                                                     |
| `TimeSlot`             | `0 <= startTime < endTime <= 1440`; sem sobreposição `[start, end)` com outro horário do mesmo bloco                                                                                       |
| `Project`              | `workingDays` é 5 ou 6                                                                                                                                                                     |
| `BoardSlot`            | `weekday` entre 1 e `project.workingDays`; `isBlocked` exige `offeringId` e `locationId` nulos e impede preenchê-los; oferta sem professor é aceita                                        |
| cruzadas               | professor da oferta é membro `isTeacher` ativo da unidade; local, termo e currículo são da unidade do projeto; horário da célula é do bloco do quadro; oferta da célula é do mesmo projeto |

## Critérios de aceite

- [x] `schema.prisma` tem os 19 models e 7 enums da seção "Schema", com os `@@map`/`@map` como
      estão _(com uma mudança de `onDelete` — ver Registro)_
- [x] Existe uma migration só, `<timestamp>_init`, **idêntica à que o Prisma gerou**: nenhuma
      linha escrita ou editada à mão
- [x] `pnpm db:reset` num banco vazio aplica a migration sem erro
- [x] Depois de aplicar, `pnpm db:migrate` diz que não há mudança (sem drift)
- [x] `\dt` mostra 19 tabelas em snake_case plural (fora `_prisma_migrations`), e nenhuma coluna
      em camelCase
- [x] Os enums do Postgres têm os nomes em snake_case da seção "Schema"
- [x] As unicidades compostas existem no banco: slug de unidade por organização,
      `(projectId, subjectId)` em `offerings`, `(projectId, name)` em `boards`,
      `(boardId, timeSlotId, weekday)` em `board_slots`
- [x] `subjects.level` é `integer not null default 1`; `boards` tem `name` não nulo e não tem `level`
- [x] Apagar currículo usado por projeto falha por FK; apagar projeto leva ofertas, quadros e
      células junto
- [x] `pnpm db:generate` e `pnpm build:api` passam; `pnpm test:api` continua passando sem banco
- [x] Nenhum comentário ou identificador em português no `schema.prisma`

## Verificação

```bash
docker compose up -d db

pnpm db:migrate --name init
pnpm db:reset --force            # reaplica do zero
pnpm db:migrate                  # "Already in sync" — nenhuma migration nova
ls apps/api/prisma/migrations    # só <timestamp>_init (+ migration_lock.toml)

docker compose exec -T db psql -U schdlr -d schdlr -c '\dt'
docker compose exec -T db psql -U schdlr -d schdlr -c '\dT'
docker compose exec -T db psql -U schdlr -d schdlr -Atc "select table_name, column_name
  from information_schema.columns
  where table_schema = 'public' and column_name <> lower(column_name)"   # nada

# deleção: currículo em uso não sai, projeto leva os filhos
# (inserir org, unidade, curso, currículo, termo, projeto, oferta, quadro e célula numa
#  transação; tentar DELETE no currículo -> erro de FK; DELETE no projeto -> filhos somem;
#  ROLLBACK no fim)

pnpm db:generate
pnpm build:api
pnpm test:api
```

## Registro

**2026-10-29** — executada com `/spec 0002`, na branch `development`.

Commits: `feat(api): schema do domínio (spec 0002)` — schema, migration, Registro e status no
mesmo commit.

Verificação: `pnpm db:migrate --name init` gerou `20261030010156_init`; `pnpm db:reset --force`
reaplicou do zero e `pnpm db:migrate` respondeu "Already in sync". O `psql` mostra 19 tabelas
(fora `_prisma_migrations`), os 7 enums em snake_case, nenhuma coluna em camelCase, as 4
unicidades compostas, `subjects.level integer not null default 1` e `boards` sem `level`. Numa
transação desfeita no fim: apagar currículo em uso falha por FK (`projects_curriculum_id_fkey`), e
apagar o projeto leva ofertas, quadros e células, deixando o currículo e o local. `db:generate`,
`build:api` e `test:api` (sem `.env`) passam. O `shasum` do `migration.sql` foi tirado logo
depois da geração e conferido no fim: nenhuma edição.

Desvios:

- **`BoardSlot.offeringId` é `onDelete: SetNull`, não `Restrict`.** Com `Restrict`, apagar um
  projeto que tem célula alocada **falha**: o cascade `Project → Offering` esbarra na FK da
  célula, que o Postgres confere na hora, antes de o cascade `Board → BoardSlot` apagar as
  células. `NoAction` falha igual: a checagem roda antes do cascade dos quadros. Resolver com
  `Restrict` exigiria `DEFERRABLE`, que é SQL escrito à mão. Decidido com o usuário: não haverá
  endpoint de remoção de oferta, e `SetNull` mantém a grade intacta caso uma oferta saia algum
  dia ("desfazer uma alocação é zerar o campo"). O bloco "Schema" e a seção "Deleção" acima
  ficaram como foram escritos; **vale o `schema.prisma`**.
- **A migration `init` foi gerada duas vezes.** A primeira (`20261030005616_init`, com
  `Restrict`) foi apagada antes do commit, e o banco de dev foi resetado (com autorização do
  usuário, que o Prisma exige quando quem chama é um agente) para gerar a definitiva. Só
  `20261030010156_init` existe, sem edição.
- **`pnpm db:reset` recusa rodar chamado pelo Claude Code** sem
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Specs futuras que pedirem reset na
  Verificação vão precisar da autorização do usuário na hora.
- Na tabela de "Regras que ficam com a aplicação", a linha de `Location` (`capacity` nulo ou
  `> 0`) ficou grudada no fim da linha de `Subject` e não aparece como linha própria. A regra
  vale igual; a tabela não foi corrigida para não editar o corpo da spec.
