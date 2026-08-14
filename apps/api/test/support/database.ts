import { DatabaseService } from '../../src/infra/database/database.service'

// Rede de segurança: se um `.env` errado vazar para a suíte, o truncate para
// aqui em vez de esvaziar o banco de desenvolvimento.
function assertTestDatabase() {
  const database = new URL(process.env.DATABASE_URL as string).pathname.slice(1)

  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to truncate "${database}": test databases must end with _test`)
  }
}

export async function truncateAll(db: DatabaseService) {
  assertTestDatabase()

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `

  if (tables.length === 0) return

  const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ')

  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}
