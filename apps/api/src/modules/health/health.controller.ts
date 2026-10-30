import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'

import { Public } from '@modules/auth/decorators/public.decorator'

import { DatabaseHealthIndicator } from './database.health'

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.database.ping('database')])
  }
}
