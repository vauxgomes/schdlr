import { createTestApp, TestContext } from '../support/app'
import { truncateAll } from '../support/database'
import { createOrganization, createUnit } from '../support/factories'

const FOREIGN_KEY_VIOLATION = 'P2003'

// A invariante que o cabeçalho do schema descreve: filho referencia o pai por
// FK composta `[paiId, unitId]`, então o Postgres recusa linha que misture
// unidades. É a única barreira que continua de pé quando um `where` esquece o
// unitId — por isso ela é testada contra banco real, e não contra mock.
describe('Tenant isolation (e2e)', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
  })

  afterAll(async () => {
    await context.app.close()
  })

  it('rejects a curriculum pointing at a course from another unit', async () => {
    const { db } = context
    const organization = await createOrganization(db)
    const unitA = await createUnit(db, { organizationId: organization.id })
    const unitB = await createUnit(db, { organizationId: organization.id })

    const course = await db.course.create({
      data: { unitId: unitA.id, name: 'Systems Analysis', code: 'SA' },
    })

    await expect(
      db.curriculum.create({
        data: { unitId: unitB.id, courseId: course.id, name: '2026.1' },
      }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION })
  })

  it('accepts the same curriculum inside the unit that owns the course', async () => {
    const { db } = context
    const unit = await createUnit(db)

    const course = await db.course.create({
      data: { unitId: unit.id, name: 'Systems Analysis', code: 'SA' },
    })

    const curriculum = await db.curriculum.create({
      data: { unitId: unit.id, courseId: course.id, name: '2026.1' },
    })

    expect(curriculum.courseId).toBe(course.id)
  })

  it('leaves no rows behind between tests', async () => {
    expect(await context.db.unit.count()).toBe(0)
    expect(await context.db.course.count()).toBe(0)
  })
})
