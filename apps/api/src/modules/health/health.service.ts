import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../../infra/database/database.service'

@Injectable()
export class HealthService {
  constructor(private readonly db: DatabaseService) {}

  async check() {
    const database = await this.checkDatabase()
    const memory = process.memoryUsage()

    return {
      status: database.status === 'up' ? ('ok' as const) : ('degraded' as const),
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database,
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
    }
  }

  private async checkDatabase() {
    const startedAt = Date.now()

    try {
      await this.db.$queryRaw`SELECT 1`
      return { status: 'up' as const, latencyMs: Date.now() - startedAt }
    } catch {
      return { status: 'down' as const, latencyMs: Date.now() - startedAt }
    }
  }
}
