import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { z } from 'zod'

// Mesma ordem da app e do prisma.config.ts: .env.local tem precedência sobre .env.
config({ path: ['.env.local', '.env'], quiet: true })

const seedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  ROOT_EMAIL: z.email(),
  SET_FIRST_TENANT: z.stringbool().default(false),
})

type SeedEnv = z.infer<typeof seedEnvSchema>
type Tx = Prisma.TransactionClient

class SeedError extends Error {}

const TENANT_USERS = {
  admin: { email: 'admin@schdlr.dev', name: 'Admin Teste' },
  manager: { email: 'manager@schdlr.dev', name: 'Manager Teste' },
  coordinator: { email: 'coordinator@schdlr.dev', name: 'Coordinator Teste' },
  teacher: { email: 'teacher@schdlr.dev', name: 'Teacher Teste' },
} as const

let created = 0
let existing = 0

function report(kind: string, label: string, wasCreated: boolean) {
  if (wasCreated) created++
  else existing++
  console.log(`${kind.padEnd(10)} ${label.padEnd(36)} ${wasCreated ? 'criado' : 'já existia'}`)
}

/** Procura pela chave única e só cria se não existir: a seed não sobrescreve. */
async function ensure<T>(
  kind: string,
  label: string,
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const found = await find()
  report(kind, label, !found)
  return found ?? create()
}

async function seedMaster(tx: Tx, rootEmail: string) {
  const otherMaster = await tx.user.findFirst({
    where: { systemRole: 'MASTER', email: { not: rootEmail } },
  })
  if (otherMaster) {
    throw new SeedError(
      `Já existe um MASTER (${otherMaster.email}). Só pode haver um: ajuste ROOT_EMAIL.`,
    )
  }

  const user = await tx.user.findUnique({ where: { email: rootEmail } })
  if (user && user.systemRole !== 'MASTER') {
    throw new SeedError(
      `${rootEmail} já está cadastrado como ${user.systemRole}. A seed não promove usuário: ` +
        'troque ROOT_EMAIL ou ajuste o banco à mão.',
    )
  }

  report('master', rootEmail, !user)
  return (
    user ??
    tx.user.create({
      data: { email: rootEmail, name: 'Master', systemRole: 'MASTER', emailVerifiedAt: new Date() },
    })
  )
}

async function seedTenant(tx: Tx, masterId: string) {
  const users = {} as Record<keyof typeof TENANT_USERS, { id: string }>
  for (const [key, { email, name }] of Object.entries(TENANT_USERS)) {
    users[key as keyof typeof TENANT_USERS] = await ensure(
      'usuário',
      email,
      () => tx.user.findUnique({ where: { email } }),
      () => tx.user.create({ data: { email, name, emailVerifiedAt: new Date() } }),
    )
  }

  await ensure(
    'assinatura',
    `${TENANT_USERS.admin.email} GRACE`,
    () => tx.subscription.findUnique({ where: { userId: users.admin.id } }),
    () =>
      tx.subscription.create({
        data: { userId: users.admin.id, plan: 'GRACE', assignedById: masterId },
      }),
  )

  const organization = await ensure(
    'tenant',
    'Root-Test-Organization',
    () => tx.organization.findUnique({ where: { slug: 'root-test-organization' } }),
    () =>
      tx.organization.create({
        data: {
          name: 'Root-Test-Organization',
          slug: 'root-test-organization',
          ownerId: users.admin.id,
        },
      }),
  )

  const unit = await ensure(
    'unidade',
    'Unidade Teste',
    () =>
      tx.unit.findUnique({
        where: { organizationId_slug: { organizationId: organization.id, slug: 'unidade-teste' } },
      }),
    () =>
      tx.unit.create({
        data: { organizationId: organization.id, name: 'Unidade Teste', slug: 'unidade-teste' },
      }),
  )

  const members = [
    { user: users.manager, email: TENANT_USERS.manager.email, isManager: true, isTeacher: false },
    { user: users.teacher, email: TENANT_USERS.teacher.email, isManager: false, isTeacher: true },
    {
      user: users.coordinator,
      email: TENANT_USERS.coordinator.email,
      isManager: false,
      isTeacher: false,
    },
  ]
  for (const { user, email, isManager, isTeacher } of members) {
    await ensure(
      'membro',
      email,
      () =>
        tx.unitMember.findUnique({
          where: { unitId_userId: { unitId: unit.id, userId: user.id } },
        }),
      () =>
        tx.unitMember.create({ data: { unitId: unit.id, userId: user.id, isManager, isTeacher } }),
    )
  }

  await ensure(
    'curso',
    'Curso Teste (TESTE)',
    () => tx.course.findUnique({ where: { unitId_code: { unitId: unit.id, code: 'TESTE' } } }),
    () =>
      tx.course.create({
        data: {
          unitId: unit.id,
          name: 'Curso Teste',
          code: 'TESTE',
          coordinatorId: users.coordinator.id,
        },
      }),
  )
}

function parseEnv(): SeedEnv {
  const result = seedEnvSchema.safeParse(process.env)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    throw new SeedError(`Variáveis de ambiente inválidas:\n${lines.join('\n')}`)
  }
  return result.data
}

async function main() {
  const env = parseEnv()
  if (env.SET_FIRST_TENANT && env.NODE_ENV === 'production') {
    throw new SeedError('SET_FIRST_TENANT=true não é aceito em NODE_ENV=production.')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  })
  try {
    await prisma.$transaction(async (tx) => {
      const master = await seedMaster(tx, env.ROOT_EMAIL.toLowerCase())
      if (env.SET_FIRST_TENANT) await seedTenant(tx, master.id)
    })
  } finally {
    await prisma.$disconnect()
  }
  console.log(`Seed concluída: ${created} criados, ${existing} já existiam.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof SeedError ? `Seed abortada: ${error.message}` : error)
  process.exit(1)
})
