import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { CourseAccessService } from '@modules/courses/course-access.service'

import { CurriculaService } from './curricula.service'
import { CurriculumAccessService } from './curriculum-access.service'

const courseAccess = (canManageCatalog = true) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  course: { id: 'course-1', name: 'Curso Teste', code: 'TESTE', isActive: true },
  canManageCatalog,
})
const curriculum = (overrides: Record<string, unknown> = {}) => ({
  id: 'cur-1',
  courseId: 'course-1',
  name: 'Matriz 2024',
  code: '2024',
  description: null,
  isActive: true,
  createdAt: new Date('2026-10-30T10:00:00.000Z'),
  updatedAt: new Date('2026-10-30T10:00:00.000Z'),
  _count: { projects: 0 },
  ...overrides,
})
const curriculumAccess = (canManageCatalog = true) => ({
  ...courseAccess(canManageCatalog),
  curriculum: curriculum(),
})
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' })

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('CurriculaService', () => {
  let db: {
    curriculum: Record<
      'findMany' | 'findUnique' | 'findUniqueOrThrow' | 'create' | 'update' | 'delete',
      jest.Mock
    >
    subject: { groupBy: jest.Mock }
    project: { count: jest.Mock }
  }
  let courses: Record<'resolveCourse' | 'assertCatalogWritable', jest.Mock>
  let curricula: Record<'resolveCurriculum' | 'assertCurriculumWritable', jest.Mock>
  let service: CurriculaService

  beforeEach(() => {
    db = {
      curriculum: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(curriculum()),
        create: jest.fn().mockResolvedValue(curriculum()),
        update: jest.fn(),
        delete: jest.fn(),
      },
      subject: { groupBy: jest.fn().mockResolvedValue([]) },
      project: { count: jest.fn().mockResolvedValue(0) },
    }
    courses = { resolveCourse: jest.fn(), assertCatalogWritable: jest.fn() }
    curricula = { resolveCurriculum: jest.fn(), assertCurriculumWritable: jest.fn() }
    service = new CurriculaService(
      db as unknown as DatabaseService,
      courses as unknown as CourseAccessService,
      curricula as unknown as CurriculumAccessService,
    )
  })

  describe('list', () => {
    it('todos do curso, por código decrescente, com a grade das disciplinas ativas', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess(false))
      db.curriculum.findMany.mockResolvedValue([
        curriculum({ isActive: false, _count: { projects: 1 } }),
        curriculum({ id: 'cur-0', code: '2018' }),
      ])
      db.subject.groupBy.mockResolvedValue([
        { curriculumId: 'cur-1', _count: { _all: 3 }, _sum: { workload: 160 } },
      ])
      await expect(service.list('tch', 'acme', 'sede', 'course-1')).resolves.toEqual([
        {
          id: 'cur-1',
          name: 'Matriz 2024',
          code: '2024',
          description: null,
          isActive: false,
          createdAt: new Date('2026-10-30T10:00:00.000Z'),
          updatedAt: new Date('2026-10-30T10:00:00.000Z'),
          course: { id: 'course-1', name: 'Curso Teste', code: 'TESTE' },
          subjectsCount: 3,
          totalWorkload: 160,
          inUse: true,
          access: { canManageCatalog: false },
        },
        expect.objectContaining({ id: 'cur-0', subjectsCount: 0, totalWorkload: 0, inUse: false }),
      ])
      expect(db.curriculum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { courseId: 'course-1' }, orderBy: { code: 'desc' } }),
      )
      expect(db.subject.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { curriculumId: { in: ['cur-1', 'cur-0'] }, isActive: true },
        }),
      )
    })

    it('curso sem currículo não consulta disciplinas', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      db.curriculum.findMany.mockResolvedValue([])
      await expect(service.list('u', 'acme', 'sede', 'course-1')).resolves.toEqual([])
      expect(db.subject.groupBy).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    const input = { name: 'Matriz 2024', code: '2024', description: null }

    it('quem gerencia o catálogo cria, no curso', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      await expect(service.create('crd', 'acme', 'sede', 'course-1', input)).resolves.toMatchObject(
        { code: '2024', access: { canManageCatalog: true } },
      )
      expect(db.curriculum.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...input, courseId: 'course-1' } }),
      )
    })

    it('sem canManageCatalog dá NOT_ALLOWED antes de assertCatalogWritable', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess(false))
      expect(await codeOf(service.create('tch', 'acme', 'sede', 'course-1', input))).toBe(
        'NOT_ALLOWED',
      )
      expect(courses.assertCatalogWritable).not.toHaveBeenCalled()
    })

    it('curso desativado não recebe currículo', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      courses.assertCatalogWritable.mockRejectedValue(new AppException('COURSE_INACTIVE'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'course-1', input))).toBe(
        'COURSE_INACTIVE',
      )
      expect(db.curriculum.create).not.toHaveBeenCalled()
    })

    it('código usado no curso dá CURRICULUM_CODE_IN_USE, também pelo P2002', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      db.curriculum.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'course-1', input))).toBe(
        'CURRICULUM_CODE_IN_USE',
      )
      expect(db.curriculum.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { courseId_code: { courseId: 'course-1', code: '2024' } },
        }),
      )

      db.curriculum.findUnique.mockResolvedValue(null)
      db.curriculum.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', 'course-1', input))).toBe(
        'CURRICULUM_CODE_IN_USE',
      )
    })
  })

  describe('update', () => {
    it('edita e devolve o currículo relido', async () => {
      curricula.resolveCurriculum.mockResolvedValue(curriculumAccess())
      await expect(
        service.update('crd', 'acme', 'sede', 'course-1', 'cur-1', { description: null }),
      ).resolves.toMatchObject({ id: 'cur-1' })
      expect(db.curriculum.update).toHaveBeenCalledWith({
        where: { id: 'cur-1' },
        data: { description: null },
      })
    })

    it('sem canManageCatalog dá NOT_ALLOWED', async () => {
      curricula.resolveCurriculum.mockResolvedValue(curriculumAccess(false))
      expect(
        await codeOf(service.update('tch', 'acme', 'sede', 'course-1', 'cur-1', { name: 'X' })),
      ).toBe('NOT_ALLOWED')
      expect(curricula.assertCurriculumWritable).not.toHaveBeenCalled()
    })

    it('código de outro currículo do curso dá 409; o próprio passa', async () => {
      curricula.resolveCurriculum.mockResolvedValue(curriculumAccess())
      db.curriculum.findUnique.mockResolvedValue({ id: 'cur-1' })
      await expect(
        service.update('crd', 'acme', 'sede', 'course-1', 'cur-1', { code: '2024' }),
      ).resolves.toBeDefined()
      db.curriculum.findUnique.mockResolvedValue({ id: 'outro' })
      expect(
        await codeOf(service.update('crd', 'acme', 'sede', 'course-1', 'cur-1', { code: '2018' })),
      ).toBe('CURRICULUM_CODE_IN_USE')
    })

    it('só isActive: true é reativação', async () => {
      const access = curriculumAccess()
      curricula.resolveCurriculum.mockResolvedValue(access)
      await service.update('crd', 'acme', 'sede', 'course-1', 'cur-1', { isActive: true })
      expect(curricula.assertCurriculumWritable).toHaveBeenLastCalledWith(access, {
        reactivating: true,
      })
      await service.update('crd', 'acme', 'sede', 'course-1', 'cur-1', { name: 'X' })
      expect(curricula.assertCurriculumWritable).toHaveBeenLastCalledWith(access, {
        reactivating: false,
      })
    })
  })

  describe('remove', () => {
    it('apaga sem uso, passando pelo assertCatalogWritable do curso', async () => {
      const access = curriculumAccess()
      curricula.resolveCurriculum.mockResolvedValue(access)
      await expect(
        service.remove('crd', 'acme', 'sede', 'course-1', 'cur-1'),
      ).resolves.toBeUndefined()
      expect(courses.assertCatalogWritable).toHaveBeenCalledWith(access)
      expect(curricula.assertCurriculumWritable).not.toHaveBeenCalled()
      expect(db.project.count).toHaveBeenCalledWith({ where: { curriculumId: 'cur-1' } })
      expect(db.curriculum.delete).toHaveBeenCalledWith({ where: { id: 'cur-1' } })
    })

    it('sem canManageCatalog dá NOT_ALLOWED', async () => {
      curricula.resolveCurriculum.mockResolvedValue(curriculumAccess(false))
      expect(await codeOf(service.remove('tch', 'acme', 'sede', 'course-1', 'cur-1'))).toBe(
        'NOT_ALLOWED',
      )
      expect(db.curriculum.delete).not.toHaveBeenCalled()
    })

    it('usado por projeto dá CURRICULUM_IN_USE', async () => {
      curricula.resolveCurriculum.mockResolvedValue(curriculumAccess())
      db.project.count.mockResolvedValue(1)
      expect(await codeOf(service.remove('crd', 'acme', 'sede', 'course-1', 'cur-1'))).toBe(
        'CURRICULUM_IN_USE',
      )
      expect(db.curriculum.delete).not.toHaveBeenCalled()
    })

    it('o P2003 em corrida vira CURRICULUM_IN_USE', async () => {
      curricula.resolveCurriculum.mockResolvedValue(curriculumAccess())
      db.curriculum.delete.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('crd', 'acme', 'sede', 'course-1', 'cur-1'))).toBe(
        'CURRICULUM_IN_USE',
      )
    })
  })

  it('get lê pelo resolveCurriculum', async () => {
    curricula.resolveCurriculum.mockResolvedValue(curriculumAccess(false))
    await expect(service.get('tch', 'acme', 'sede', 'course-1', 'cur-1')).resolves.toMatchObject({
      id: 'cur-1',
      access: { canManageCatalog: false },
    })
    expect(curricula.resolveCurriculum).toHaveBeenCalledWith(
      'tch',
      'acme',
      'sede',
      'course-1',
      'cur-1',
    )
  })
})
