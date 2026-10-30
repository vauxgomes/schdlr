import { Injectable } from '@nestjs/common'
import { HealthIndicatorService } from '@nestjs/terminus'

import { DatabaseService } from '@infra/database/database.service'

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly database: DatabaseService,
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

  async ping(key: string) {
    const indicator = this.healthIndicator.check(key)
    try {
      await this.database.$queryRaw`SELECT 1`
      return indicator.up()
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) })
    }
  }
}
