import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { CourseAccessService } from './course-access.service'
import { CoursesService } from './courses.service'

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
  id: 'course-1',
  unitId: 'unit-1',
  name: 'Informática',
  code: 'INFO',
  coordinatorId: null,
  isActive: true,
  createdAt: new Date('2026-10-29T22:00:00.000Z'),
  updatedAt: new Date('2026-10-29T22:00:00.000Z'),
  coordinator: null,
  _count: { curricula: 0 },
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

describe('CoursesService', () => {
  let tx: {
    $queryRaw: jest.Mock
    course: Record<'count' | 'findUnique' | 'create', jest.Mock>
    unitMember: { findUnique: jest.Mock }
  }
  let db: {
    $transaction: jest.Mock
    course: Record<'findMany' | 'findUnique' | 'findUniqueOrThrow' | 'update', jest.Mock>
    unitMember: { findUnique: jest.Mock }
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let courses: Record<'resolveCourse' | 'assertCatalogWritable', jest.Mock>
  let subscriptions: { getActivePlan: jest.Mock }
  let service: CoursesService

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      course: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      unitMember: { findUnique: jest.fn() },
    }
    db = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      course: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      unitMember: { findUnique: jest.fn() },
    }
    tenants = { resolveUnit: jest.fn(), assertWritable: jest.fn() }
    courses = { resolveCourse: jest.fn(), assertCatalogWritable: jest.fn() }
    subscriptions = {
      getActivePlan: jest.fn().mockResolvedValue({ limits: { coursesPerUnit: 5 } }),
    }
    service = new CoursesService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      courses as unknown as CourseAccessService,
      subscriptions as unknown as SubscriptionsService,
    )
  })

  describe('list', () => {
    it('todos os cursos da unidade, ativos ou não, por nome, no formato da spec', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      db.course.findMany.mockResolvedValue([
        course({
          isActive: false,
          coordinatorId: 'crd',
          coordinator: { id: 'crd', email: 'c@x.dev', name: 'C' },
          _count: { curricula: 2 },
        }),
      ])
      await expect(service.list('crd', 'acme', 'sede')).resolves.toEqual([
        {
          id: 'course-1',
          name: 'Informática',
          code: 'INFO',
          isActive: false,
          createdAt: new Date('2026-10-29T22:00:00.000Z'),
          updatedAt: new Date('2026-10-29T22:00:00.000Z'),
          coordinator: { id: 'crd', email: 'c@x.dev', name: 'C' },
          curriculaCount: 2,
          access: { canManageCourse: false, canManageCatalog: true },
        },
      ])
      expect(db.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit-1' }, orderBy: { name: 'asc' } }),
      )
    })
  })

  describe('create', () => {
    const input = { name: 'Informática', code: 'INFO', coordinatorId: null }

    beforeEach(() => {
      tenants.resolveUnit.mockResolvedValue(unitAccess({ isManager: true }))
      tx.course.count.mockResolvedValue(0)
      tx.course.findUnique.mockResolvedValue(null)
      tx.course.create.mockResolvedValue(course())
    })

    it('o responsável cria, com a unidade travada, contando os desativados', async () => {
      await expect(service.create('mgr', 'acme', 'sede', input)).resolves.toMatchObject({
        code: 'INFO',
        access: { canManageCourse: true, canManageCatalog: true },
      })
      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray]
      expect(sql.join('?')).toBe('SELECT id FROM units WHERE id = ? FOR UPDATE')
      expect(tx.course.count).toHaveBeenCalledWith({ where: { unitId: 'unit-1' } })
      expect(tx.course.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...input, unitId: 'unit-1' } }),
      )
      expect(subscriptions.getActivePlan).toHaveBeenCalledWith('owner')
    })

    it('membro sem papel dá NOT_ALLOWED antes de assertWritable', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it('no limite dá PLAN_LIMIT_REACHED com params, antes do coordenador e do código', async () => {
      tx.course.count.mockResolvedValue(5)
      const error = (await service
        .create('mgr', 'acme', 'sede', { ...input, coordinatorId: 'x' })
        .catch((e: unknown) => e)) as AppException
      expect(error.code).toBe('PLAN_LIMIT_REACHED')
      expect(error.params).toEqual({ limit: 'coursesPerUnit', max: 5 })
      expect(tx.unitMember.findUnique).not.toHaveBeenCalled()
      expect(tx.course.create).not.toHaveBeenCalled()
    })

    it('limite null é ilimitado', async () => {
      subscriptions.getActivePlan.mockResolvedValue({ limits: { coursesPerUnit: null } })
      tx.course.count.mockResolvedValue(99)
      await expect(service.create('mgr', 'acme', 'sede', input)).resolves.toBeDefined()
    })

    it('coordenador que não é membro da unidade dá COORDINATOR_NOT_A_MEMBER', async () => {
      tx.unitMember.findUnique.mockResolvedValue(null)
      expect(
        await codeOf(service.create('mgr', 'acme', 'sede', { ...input, coordinatorId: 'adm' })),
      ).toBe('COORDINATOR_NOT_A_MEMBER')
      expect(tx.unitMember.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId_userId: { unitId: 'unit-1', userId: 'adm' } } }),
      )
    })

    it('código usado na unidade dá COURSE_CODE_IN_USE', async () => {
      tx.course.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe('COURSE_CODE_IN_USE')
      expect(tx.course.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId_code: { unitId: 'unit-1', code: 'INFO' } } }),
      )
    })

    it('sem código não consulta repetição', async () => {
      await service.create('mgr', 'acme', 'sede', { ...input, code: null })
      expect(tx.course.findUnique).not.toHaveBeenCalled()
    })

    it('P2002 em corrida vira COURSE_CODE_IN_USE', async () => {
      tx.course.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      )
      expect(await codeOf(service.create('mgr', 'acme', 'sede', input))).toBe('COURSE_CODE_IN_USE')
    })
  })

  describe('update', () => {
    const access = (role: { isOwner?: boolean; isManager?: boolean } = {}, userId = 'u') => ({
      ...unitAccess(role),
      course: course(),
      isCoordinator: userId === 'crd',
      canManageCourse: !!(role.isOwner || role.isManager),
      canManageCatalog: !!(role.isOwner || role.isManager) || userId === 'crd',
    })

    beforeEach(() => {
      db.course.findUnique.mockResolvedValue(null)
      db.course.update.mockResolvedValue(course())
      db.unitMember.findUnique.mockResolvedValue({ id: 'm' })
    })

    it('o dono define o coordenador entre os membros', async () => {
      courses.resolveCourse.mockResolvedValue(access({ isOwner: true }))
      await service.update('owner', 'acme', 'sede', 'course-1', { coordinatorId: 'tch' })
      expect(db.unitMember.findUnique).toHaveBeenCalled()
      expect(db.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'course-1' }, data: { coordinatorId: 'tch' } }),
      )
    })

    it.each([
      ['coordenador do curso', 'crd'],
      ['outro membro', 'tch'],
    ])('%s dá NOT_ALLOWED', async (_label, userId) => {
      courses.resolveCourse.mockResolvedValue(access({}, userId))
      expect(await codeOf(service.update(userId, 'acme', 'sede', 'course-1', { name: 'X' }))).toBe(
        'NOT_ALLOWED',
      )
      expect(courses.assertCatalogWritable).not.toHaveBeenCalled()
    })

    it('coordenador fora da unidade dá COORDINATOR_NOT_A_MEMBER', async () => {
      courses.resolveCourse.mockResolvedValue(access({ isManager: true }))
      db.unitMember.findUnique.mockResolvedValue(null)
      expect(
        await codeOf(service.update('mgr', 'acme', 'sede', 'course-1', { coordinatorId: 'adm' })),
      ).toBe('COORDINATOR_NOT_A_MEMBER')
    })

    it('null tira o coordenador e remove o código sem consultas', async () => {
      courses.resolveCourse.mockResolvedValue(access({ isManager: true }))
      await service.update('mgr', 'acme', 'sede', 'course-1', { code: null, coordinatorId: null })
      expect(db.unitMember.findUnique).not.toHaveBeenCalled()
      expect(db.course.findUnique).not.toHaveBeenCalled()
    })

    it('código de outro curso da unidade dá COURSE_CODE_IN_USE; o próprio passa', async () => {
      courses.resolveCourse.mockResolvedValue(access({ isManager: true }))
      db.course.findUnique.mockResolvedValue({ id: 'course-1' })
      await expect(
        service.update('mgr', 'acme', 'sede', 'course-1', { code: 'INFO' }),
      ).resolves.toBeDefined()
      db.course.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.update('mgr', 'acme', 'sede', 'course-1', { code: 'ADS' }))).toBe(
        'COURSE_CODE_IN_USE',
      )
    })

    it('só isActive: true é reativação', async () => {
      const manager = access({ isManager: true })
      courses.resolveCourse.mockResolvedValue(manager)
      await service.update('mgr', 'acme', 'sede', 'course-1', { isActive: true })
      expect(courses.assertCatalogWritable).toHaveBeenLastCalledWith(manager, {
        reactivating: true,
      })
      await service.update('mgr', 'acme', 'sede', 'course-1', { name: 'X' })
      expect(courses.assertCatalogWritable).toHaveBeenLastCalledWith(manager, {
        reactivating: false,
      })
    })

    it('curso desativado barra a escrita antes de mexer no banco', async () => {
      courses.resolveCourse.mockResolvedValue(access({ isManager: true }))
      courses.assertCatalogWritable.mockRejectedValue(new AppException('COURSE_INACTIVE'))
      expect(await codeOf(service.update('mgr', 'acme', 'sede', 'course-1', { name: 'Z' }))).toBe(
        'COURSE_INACTIVE',
      )
      expect(db.course.update).not.toHaveBeenCalled()
    })
  })

  it('get lê pelo resolveCourse', async () => {
    courses.resolveCourse.mockResolvedValue({ ...unitAccess(), course: course() })
    db.course.findUniqueOrThrow.mockResolvedValue(course())
    await expect(service.get('tch', 'acme', 'sede', 'course-1')).resolves.toMatchObject({
      id: 'course-1',
      access: { canManageCourse: false, canManageCatalog: false },
    })
    expect(courses.resolveCourse).toHaveBeenCalledWith('tch', 'acme', 'sede', 'course-1')
  })
})
