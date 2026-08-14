import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { Client } from 'pg'
import './load-env'

const DUPLICATE_DATABASE = '42P04'

// Sobe o banco de teste uma vez por execução da suíte: cria se não existir e
// aplica as migrations do Prisma. `migrate deploy` só executa o que já está
// versionado — nunca gera migration nem toca no schema.prisma.
export default async function globalSetup() {
  const url = new URL(process.env.DATABASE_URL as string)
  const database = url.pathname.slice(1)

  await createDatabase(url, database)

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env },
    stdio: 'ignore',
  })
}

async function createDatabase(url: URL, database: string) {
  const maintenance = new URL(url)
  maintenance.pathname = '/postgres'
  maintenance.search = ''

  const client = new Client({ connectionString: maintenance.toString() })
  await client.connect()

  try {
    await client.query(`CREATE DATABASE "${database}"`)
  } catch (error) {
    if ((error as { code?: string }).code !== DUPLICATE_DATABASE) throw error
  } finally {
    await client.end()
  }
}
