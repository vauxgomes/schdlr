import { DatabaseService } from '../../infra/database/database.service'
import { HealthService } from './health.service'

describe('HealthService', () => {
  const buildService = (queryRaw: jest.Mock) =>
    new HealthService({ $queryRaw: queryRaw } as unknown as DatabaseService)

  it('reports ok while the database answers', async () => {
    const health = await buildService(jest.fn().mockResolvedValue([{ '?column?': 1 }])).check()

    expect(health.status).toBe('ok')
    expect(health.database.status).toBe('up')
    expect(health.uptime).toBeGreaterThanOrEqual(0)
  })

  it('reports degraded when the database is unreachable', async () => {
    const health = await buildService(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    ).check()

    expect(health.status).toBe('degraded')
    expect(health.database.status).toBe('down')
  })
})
