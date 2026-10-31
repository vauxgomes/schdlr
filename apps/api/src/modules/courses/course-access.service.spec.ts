import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { CourseAccess, CourseAccessService } from './course-access.service'

const COURSE_ID = 'cmhcourse0000000000000001'

const unitAccess = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const course = (overrides: Record<string, unknown> = {}) => ({
  id: COURSE_ID,
  unitId: 'unit-1',
  coordinatorId: 'crd',
  isActive: true,
  ...overrides,
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('CourseAccessService', () => {
  let db: { course: { findFirst: jest.Mock } }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let service: CourseAccessService

  beforeEach(() => {
    db = { course: { findFirst: jest.fn() } }
    tenants = { resolveUnit: jest.fn(), assertWritable: jest.fn() }
    service = new CourseAccessService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  describe('resolveCourse', () => {
    it('procura o curso na unidade resolvida', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      db.course.findFirst.mockResolvedValue(course())
      await service.resolveCourse('u', 'acme', 'sede', COURSE_ID)
      expect(tenants.resolveUnit).toHaveBeenCalledWith('u', 'acme', 'sede')
      expect(db.course.findFirst).toHaveBeenCalledWith({
        where: { id: COURSE_ID, unitId: 'unit-1' },
      })
    })

    it.each([
      ['dono', 'owner', { isOwner: true }, false, true, true],
      ['responsável', 'mgr', { isManager: true }, false, true, true],
      ['coordenador do curso', 'crd', {}, true, false, true],
      ['outro membro', 'tch', {}, false, false, false],
    ])('%s', async (_label, userId, role, isCoordinator, canManageCourse, canManageCatalog) => {
      tenants.resolveUnit.mockResolvedValue(unitAccess(role))
      db.course.findFirst.mockResolvedValue(course())
      await expect(service.resolveCourse(userId, 'acme', 'sede', COURSE_ID)).resolves.toMatchObject(
        { course: course(), isCoordinator, canManageCourse, canManageCatalog },
      )
    })

    it('curso inexistente ou de outra unidade dá COURSE_NOT_FOUND', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      db.course.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.resolveCourse('u', 'acme', 'sede', COURSE_ID))).toBe(
        'COURSE_NOT_FOUND',
      )
    })

    it('id que não é cuid dá COURSE_NOT_FOUND sem consultar o banco', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      expect(await codeOf(service.resolveCourse('u', 'acme', 'sede', 'não é id'))).toBe(
        'COURSE_NOT_FOUND',
      )
      expect(db.course.findFirst).not.toHaveBeenCalled()
    })

    it('a unidade que não se enxerga dá o 404 dela', async () => {
      tenants.resolveUnit.mockRejectedValue(new AppException('UNIT_NOT_FOUND'))
      expect(await codeOf(service.resolveCourse('u', 'acme', 'sede', COURSE_ID))).toBe(
        'UNIT_NOT_FOUND',
      )
    })
  })

  describe('assertCatalogWritable', () => {
    const access = (isActive = true) =>
      ({ ...unitAccess(), course: course({ isActive }) }) as unknown as CourseAccess

    it('passa com o curso ativo, depois do assertWritable da unidade', async () => {
      const ok = access()
      await expect(service.assertCatalogWritable(ok)).resolves.toBeUndefined()
      expect(tenants.assertWritable).toHaveBeenCalledWith(ok)
    })

    it('curso desativado dá COURSE_INACTIVE', async () => {
      expect(await codeOf(service.assertCatalogWritable(access(false)))).toBe('COURSE_INACTIVE')
    })

    it('o 409 da unidade e o plano vêm antes do curso', async () => {
      tenants.assertWritable.mockRejectedValue(new AppException('UNIT_INACTIVE'))
      expect(await codeOf(service.assertCatalogWritable(access(false)))).toBe('UNIT_INACTIVE')
    })

    it('reativar dispensa só o 409 do curso', async () => {
      await expect(
        service.assertCatalogWritable(access(false), { reactivating: true }),
      ).resolves.toBeUndefined()
      expect(tenants.assertWritable).toHaveBeenCalledWith(access(false))

      tenants.assertWritable.mockRejectedValue(new AppException('PLAN_EXPIRED'))
      expect(
        await codeOf(service.assertCatalogWritable(access(false), { reactivating: true })),
      ).toBe('PLAN_EXPIRED')
    })
  })
})
