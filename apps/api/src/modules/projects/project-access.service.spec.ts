import { ProjectStatus, TermStatus } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'
import { TermAccessService } from '@modules/terms/term-access.service'

import { ProjectAccess, ProjectAccessService } from './project-access.service'

const PROJECT_ID = 'cmhproject000000000000001'

const unitAccess = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const found = (termStatus: TermStatus, projectStatus: ProjectStatus, coordinatorId = 'crd') => ({
  id: PROJECT_ID,
  unitId: 'unit-1',
  status: projectStatus,
  term: { id: 'term-1', status: termStatus },
  curriculum: { id: 'cur-1', course: { id: 'course-1', coordinatorId } },
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('ProjectAccessService', () => {
  let db: { project: { findFirst: jest.Mock } }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let terms: { assertProjectAction: jest.Mock }
  let service: ProjectAccessService

  beforeEach(() => {
    db = { project: { findFirst: jest.fn() } }
    tenants = { resolveUnit: jest.fn().mockResolvedValue(unitAccess()), assertWritable: jest.fn() }
    terms = { assertProjectAction: jest.fn() }
    service = new ProjectAccessService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      terms as unknown as TermAccessService,
    )
  })

  describe('resolveProject', () => {
    it('procura na unidade e separa projeto, semestre, currículo e curso', async () => {
      db.project.findFirst.mockResolvedValue(found('PLANNING', 'DRAFT'))
      const access = await service.resolveProject('crd', 'acme', 'sede', PROJECT_ID)
      expect(db.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PROJECT_ID, unitId: 'unit-1' } }),
      )
      expect(access).toMatchObject({
        project: { id: PROJECT_ID, status: 'DRAFT' },
        term: { id: 'term-1' },
        curriculum: { id: 'cur-1' },
        course: { id: 'course-1' },
        isProjectManager: true,
        canManageTerm: false,
      })
      expect(access.project).not.toHaveProperty('term')
      expect(access.curriculum).not.toHaveProperty('course')
    })

    it.each([
      ['dono', 'owner', { isOwner: true }, true],
      ['responsável', 'mgr', { isManager: true }, true],
      ['coordenador do curso', 'crd', {}, false],
      ['coordenador de outro curso', 'outro', {}, false],
    ])('%s: isProjectManager e canManageTerm', async (_label, userId, role, canManageTerm) => {
      tenants.resolveUnit.mockResolvedValue(unitAccess(role))
      db.project.findFirst.mockResolvedValue(found('ADJUSTMENTS', 'PUBLISHED'))
      await expect(
        service.resolveProject(userId, 'acme', 'sede', PROJECT_ID),
      ).resolves.toMatchObject({ isProjectManager: userId !== 'outro', canManageTerm })
    })

    it('de outra unidade, ou id fora do formato, dá PROJECT_NOT_FOUND', async () => {
      db.project.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.resolveProject('u', 'acme', 'sede', PROJECT_ID))).toBe(
        'PROJECT_NOT_FOUND',
      )
      db.project.findFirst.mockClear()
      expect(await codeOf(service.resolveProject('u', 'acme', 'sede', 'x'))).toBe(
        'PROJECT_NOT_FOUND',
      )
      expect(db.project.findFirst).not.toHaveBeenCalled()
    })

    describe('visibilidade: status do semestre × status do projeto × gestor', () => {
      // A matriz da 0016, escrita à mão: o que os demais membros veem.
      const OTHERS_SEE: Record<TermStatus, Record<ProjectStatus, boolean>> = {
        PLANNING: { DRAFT: false, PUBLISHED: false },
        ADJUSTMENTS: { DRAFT: false, PUBLISHED: true },
        STARTED: { DRAFT: false, PUBLISHED: true },
        FINISHED: { DRAFT: false, PUBLISHED: true },
        CANCELLED: { DRAFT: false, PUBLISHED: false },
      }
      const cases = Object.entries(OTHERS_SEE).flatMap(([termStatus, byProject]) =>
        Object.entries(byProject).flatMap(([projectStatus, othersSee]) => [
          [termStatus, projectStatus, 'gestor', true] as const,
          [termStatus, projectStatus, 'demais', othersSee] as const,
        ]),
      )

      it('cobre 5 × 2 × 2', () => expect(cases).toHaveLength(20))

      it.each(cases)('%s, %s, %s → vê %p', async (termStatus, projectStatus, who, sees) => {
        db.project.findFirst.mockResolvedValue(
          found(termStatus as TermStatus, projectStatus as ProjectStatus),
        )
        const run = service.resolveProject(
          who === 'gestor' ? 'crd' : 'tch',
          'acme',
          'sede',
          PROJECT_ID,
        )
        if (sees) await expect(run).resolves.toBeDefined()
        else expect(await codeOf(run)).toBe('PROJECT_NOT_FOUND')
      })
    })
  })

  describe('assertProjectWritable', () => {
    const access = { isProjectManager: true } as unknown as ProjectAccess

    it('assertWritable da unidade e depois a matriz, com edit como padrão', async () => {
      await service.assertProjectWritable(access)
      expect(tenants.assertWritable).toHaveBeenCalledWith(access)
      expect(terms.assertProjectAction).toHaveBeenCalledWith(access, 'edit', {
        isProjectManager: true,
      })
      await service.assertProjectWritable(access, 'publish')
      expect(terms.assertProjectAction).toHaveBeenLastCalledWith(access, 'publish', {
        isProjectManager: true,
      })
    })

    it('organização, unidade ou plano barram antes da matriz', async () => {
      tenants.assertWritable.mockRejectedValue(new AppException('PLAN_EXPIRED'))
      expect(await codeOf(service.assertProjectWritable(access))).toBe('PLAN_EXPIRED')
      expect(terms.assertProjectAction).not.toHaveBeenCalled()
    })
  })
})
