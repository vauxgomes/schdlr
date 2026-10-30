import { Controller, Get, Res, ServiceUnavailableException } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'
import type { Response } from 'express'

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
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      return await this.health.check([() => this.database.ping('database')])
    } catch (error) {
      // O 503 mantém o corpo do terminus, que diz qual indicador caiu: é resposta de
      // monitoramento, não erro que o web trata, e não passa pelo AppExceptionFilter (spec 0008).
      if (!(error instanceof ServiceUnavailableException)) throw error
      res.status(error.getStatus())
      return error.getResponse()
    }
  }
}
