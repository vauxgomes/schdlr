import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Mesma ordem da app: .env.local tem precedência sobre .env.
config({ path: ['.env.local', '.env'], quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
