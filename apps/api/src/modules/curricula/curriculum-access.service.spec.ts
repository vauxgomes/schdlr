import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { CourseAccessService } from '@modules/courses/course-access.service'

import { CurriculumAccess, CurriculumAccessService } from './curriculum-access.service'

const CURRICULUM_ID = 'cmhcurriculum000000000001'

const courseAccess = () => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  course: { id: 'course-1', isActive: true },
  canManageCatalog: true,
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('CurriculumAccessService', () => {
  let db: { curriculum: { findFirst: jest.Mock } }
  let courses: Record<'resolveCourse' | 'assertCatalogWritable', jest.Mock>
  let service: CurriculumAccessService

  beforeEach(() => {
    db = { curriculum: { findFirst: jest.fn() } }
    courses = { resolveCourse: jest.fn(), assertCatalogWritable: jest.fn() }
    service = new CurriculumAccessService(
      db as unknown as DatabaseService,
      courses as unknown as CourseAccessService,
    )
  })

  describe('resolveCurriculum', () => {
    it('procura o currículo no curso resolvido e mantém o acesso do curso', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      db.curriculum.findFirst.mockResolvedValue({ id: CURRICULUM_ID })
      await expect(
        service.resolveCurriculum('u', 'acme', 'sede', 'course-1', CURRICULUM_ID),
      ).resolves.toMatchObject({ canManageCatalog: true, curriculum: { id: CURRICULUM_ID } })
      expect(courses.resolveCourse).toHaveBeenCalledWith('u', 'acme', 'sede', 'course-1')
      expect(db.curriculum.findFirst).toHaveBeenCalledWith({
        where: { id: CURRICULUM_ID, courseId: 'course-1' },
      })
    })

    it('inexistente ou de outro curso dá CURRICULUM_NOT_FOUND', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      db.curriculum.findFirst.mockResolvedValue(null)
      expect(
        await codeOf(service.resolveCurriculum('u', 'acme', 'sede', 'course-1', CURRICULUM_ID)),
      ).toBe('CURRICULUM_NOT_FOUND')
    })

    it('id que não é cuid dá CURRICULUM_NOT_FOUND sem consultar o banco', async () => {
      courses.resolveCourse.mockResolvedValue(courseAccess())
      expect(await codeOf(service.resolveCurriculum('u', 'acme', 'sede', 'course-1', 'x'))).toBe(
        'CURRICULUM_NOT_FOUND',
      )
      expect(db.curriculum.findFirst).not.toHaveBeenCalled()
    })

    it('o curso que não se resolve dá o 404 dele', async () => {
      courses.resolveCourse.mockRejectedValue(new AppException('COURSE_NOT_FOUND'))
      expect(
        await codeOf(service.resolveCurriculum('u', 'acme', 'sede', 'course-1', CURRICULUM_ID)),
      ).toBe('COURSE_NOT_FOUND')
    })
  })

  describe('assertCurriculumWritable', () => {
    const access = (isActive = true) =>
      ({ ...courseAccess(), curriculum: { isActive } }) as unknown as CurriculumAccess

    it('passa com o currículo ativo, depois do assertCatalogWritable', async () => {
      const ok = access()
      await expect(service.assertCurriculumWritable(ok)).resolves.toBeUndefined()
      expect(courses.assertCatalogWritable).toHaveBeenCalledWith(ok)
    })

    it('currículo desativado dá CURRICULUM_INACTIVE', async () => {
      expect(await codeOf(service.assertCurriculumWritable(access(false)))).toBe(
        'CURRICULUM_INACTIVE',
      )
    })

    it('o 409 do curso vem antes', async () => {
      courses.assertCatalogWritable.mockRejectedValue(new AppException('COURSE_INACTIVE'))
      expect(await codeOf(service.assertCurriculumWritable(access(false)))).toBe('COURSE_INACTIVE')
    })

    it('reativar dispensa só o 409 do currículo', async () => {
      await expect(
        service.assertCurriculumWritable(access(false), { reactivating: true }),
      ).resolves.toBeUndefined()
      courses.assertCatalogWritable.mockRejectedValue(new AppException('COURSE_INACTIVE'))
      expect(
        await codeOf(service.assertCurriculumWritable(access(false), { reactivating: true })),
      ).toBe('COURSE_INACTIVE')
    })
  })
})
