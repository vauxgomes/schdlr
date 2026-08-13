import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import type { Response } from 'express'
import { HealthService } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // 503 when the database is unreachable — that is what an external monitor reads.
  @Get()
  async check(@Res({ passthrough: true }) response: Response) {
    const health = await this.healthService.check()

    response.status(health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)

    return health
  }
}
