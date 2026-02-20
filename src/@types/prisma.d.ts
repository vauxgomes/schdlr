// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PrismaClient } from '@prisma/client'

declare module '@prisma/client' {
  interface PrismaClient {
    $connect(): Promise<void>
  }
}
