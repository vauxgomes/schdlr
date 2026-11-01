import { Prisma, TermStatus } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'
import { TermAccessService } from '@modules/terms/term-access.service'
import { ProjectAction } from '@modules/terms/term-policy'

import { ProjectAccess, ProjectAccessService } from './project-access.service'
import { ProjectsService } from './projects.service'

const TERM_ID = 'cmhterm000000000000000001'
const CUR_ID = 'cmhcurriculum000000000001'

const unitAccess = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})
const row = (overrides: { termStatus?: TermStatus; status?: string; name?: string } = {}) => ({
  id: 'prj-1',
  name: overrides.name ?? 'INFO 2026.1',
  status: overrides.status ?? 'DRAFT',
  workingDays: 5,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  term: { id: TERM_ID, name: '2026.1', status: overrides.termStatus ?? 'PLANNING' },
  curriculum: {
    id: CUR_ID,
    name: 'Matriz 2024',
    code: '2024',
    course: { id: 'course-1', name: 'Curso Teste', code: 'TESTE', coordinatorId: 'crd' },
  },
  createdBy: { id: 'crd', email: 'coordinator@schdlr.dev', name: 'Coordinator Teste' },
})
const projectAccess = (
  termStatus: TermStatus = 'PLANNING',
  extra: Partial<{ isProjectManager: boolean; workingDays: number; status: string }> = {},
) =>
  ({
    ...unitAccess(),
    term: { id: TERM_ID, status: termStatus },
    canManageTerm: false,
    project: {
      id: 'prj-1',
      termId: TERM_ID,
      status: extra.status ?? 'DRAFT',
      workingDays: extra.workingDays ?? 5,
    },
    curriculum: { id: CUR_ID },
    course: { id: 'course-1', coordinatorId: 'crd' },
    isProjectManager: extra.isProjectManager ?? true,
  }) as unknown as ProjectAccess
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' })

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return error as AppException
}
const codeOf = async (promise: Promise<unknown>) => (await errorOf(promise)).code

describe('ProjectsService', () => {
  let db: {
    project: Record<
      'findMany' | 'findUnique' | 'findUniqueOrThrow' | 'create' | 'update' | 'delete',
      jest.Mock
    >
    term: { findFirst: jest.Mock }
    curriculum: { findFirst: jest.Mock }
    boardSlot: { count: jest.Mock }
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let projects: Record<'resolveProject' | 'assertProjectWritable', jest.Mock>
  let terms: TermAccessService
  let service: ProjectsService

  beforeEach(() => {
    db = {
      project: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row()),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn(),
        delete: jest.fn(),
      },
      term: { findFirst: jest.fn().mockResolvedValue({ id: TERM_ID, status: 'PLANNING' }) },
      curriculum: {
        findFirst: jest.fn().mockResolvedValue({
          id: CUR_ID,
          isActive: true,
          course: { id: 'course-1', coordinatorId: 'crd', isActive: true },
        }),
      },
      boardSlot: { count: jest.fn().mockResolvedValue(0) },
    }
    tenants = { resolveUnit: jest.fn().mockResolvedValue(unitAccess()), assertWritable: jest.fn() }
    projects = { resolveProject: jest.fn(), assertProjectWritable: jest.fn() }
    // A matriz de verdade: assertProjectAction é síncrono e só lê o que recebe.
    terms = new TermAccessService({} as DatabaseService, tenants as unknown as TenantAccessService)
    service = new ProjectsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      terms,
      projects as unknown as ProjectAccessService,
    )
  })

  describe('list', () => {
    it('filtra o que o usuário vê, projeto a projeto, no formato da spec', async () => {
      db.project.findMany.mockResolvedValue([
        row({ termStatus: 'ADJUSTMENTS', status: 'PUBLISHED', name: 'A' }),
        row({ termStatus: 'ADJUSTMENTS', status: 'DRAFT', name: 'B' }),
        row({ termStatus: 'PLANNING', status: 'PUBLISHED', name: 'C' }),
      ])
      await expect(service.list('tch', 'acme', 'sede', {})).resolves.toEqual([
        {
          id: 'prj-1',
          name: 'A',
          status: 'PUBLISHED',
          workingDays: 5,
          createdAt: new Date('2026-10-31T10:00:00.000Z'),
          updatedAt: new Date('2026-10-31T10:00:00.000Z'),
          term: { id: TERM_ID, name: '2026.1', status: 'ADJUSTMENTS' },
          course: { id: 'course-1', name: 'Curso Teste', code: 'TESTE' },
          curriculum: { id: CUR_ID, name: 'Matriz 2024', code: '2024' },
          createdBy: { id: 'crd', email: 'coordinator@schdlr.dev', name: 'Coordinator Teste' },
          access: { isProjectManager: false, canEdit: false, canPublish: false, canDelete: false },
        },
      ])
      // O coordenador do curso vê os três.
      await expect(service.list('crd', 'acme', 'sede', {})).resolves.toHaveLength(3)
    })

    it('?termId= e ?status= filtram; semestres mais recentes primeiro', async () => {
      db.project.findMany.mockResolvedValue([])
      await service.list('crd', 'acme', 'sede', { termId: TERM_ID, status: 'PUBLISHED' })
      expect(db.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { unitId: 'unit-1', termId: TERM_ID, status: 'PUBLISHED' },
          orderBy: [{ term: { startDate: 'desc' } }, { name: 'asc' }],
        }),
      )
    })

    // "access bate com o que as rotas permitem": o mesmo status e papel no assertProjectAction.
    const STATUSES = ['PLANNING', 'ADJUSTMENTS', 'STARTED', 'FINISHED', 'CANCELLED'] as const
    const WHO = [
      ['responsável', 'mgr', { isManager: true }],
      ['coordenador do curso', 'crd', {}],
      ['outro', 'tch', {}],
    ] as const
    it.each(STATUSES.flatMap((s) => WHO.map(([label, id, role]) => [s, label, id, role] as const)))(
      '%s, %s: access bate com assertProjectAction',
      async (termStatus, _label, userId, role) => {
        const access = unitAccess(role)
        tenants.resolveUnit.mockResolvedValue(access)
        db.project.findMany.mockResolvedValue([row({ termStatus, status: 'PUBLISHED' })])
        const [view] = await service.list(userId, 'acme', 'sede', {})
        if (!view) return // invisível a quem não é gestor: nem aparece

        const allows = (action: ProjectAction) => {
          try {
            terms.assertProjectAction(
              {
                ...access,
                term: { status: termStatus },
                canManageTerm: access.isOwner || access.isManager,
              } as never,
              action,
              { isProjectManager: view.access.isProjectManager },
            )
            return true
          } catch {
            return false
          }
        }
        expect(view.access).toMatchObject({
          canEdit: allows('edit'),
          canPublish: allows('publish'),
          canDelete: allows('delete'),
        })
      },
    )
  })

  describe('create', () => {
    const input = {
      name: 'INFO 2026.1',
      termId: TERM_ID,
      curriculumId: CUR_ID,
      workingDays: 5 as const,
    }

    it('o coordenador do curso cria, já PUBLISHED, com o semestre e o currículo da unidade', async () => {
      db.project.create.mockResolvedValue(row({ status: 'PUBLISHED' }))
      await expect(service.create('crd', 'acme', 'sede', input)).resolves.toMatchObject({
        status: 'PUBLISHED',
      })
      expect(db.term.findFirst).toHaveBeenCalledWith({ where: { id: TERM_ID, unitId: 'unit-1' } })
      expect(db.curriculum.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CUR_ID, course: { unitId: 'unit-1' } } }),
      )
      expect(tenants.assertWritable).toHaveBeenCalled()
      expect(db.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'INFO 2026.1',
            workingDays: 5,
            unitId: 'unit-1',
            termId: TERM_ID,
            curriculumId: CUR_ID,
            createdById: 'crd',
            status: 'PUBLISHED',
          },
        }),
      )
    })

    it('semestre ou currículo fora da unidade dão 404', async () => {
      db.term.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('TERM_NOT_FOUND')
      db.term.findFirst.mockResolvedValue({ id: TERM_ID, status: 'PLANNING' })
      db.curriculum.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe(
        'CURRICULUM_NOT_FOUND',
      )
      expect(await codeOf(service.create('crd', 'acme', 'sede', { ...input, termId: 'x' }))).toBe(
        'TERM_NOT_FOUND',
      )
    })

    it('coordenador de outro curso dá NOT_ALLOWED', async () => {
      expect(await codeOf(service.create('outro', 'acme', 'sede', input))).toBe('NOT_ALLOWED')
      expect(db.project.create).not.toHaveBeenCalled()
    })

    it('fora de PLANNING dá TERM_STATUS_FORBIDS antes do 403', async () => {
      db.term.findFirst.mockResolvedValue({ id: TERM_ID, status: 'ADJUSTMENTS' })
      const error = await errorOf(service.create('outro', 'acme', 'sede', input))
      expect(error.code).toBe('TERM_STATUS_FORBIDS')
      expect(error.params).toEqual({ status: 'ADJUSTMENTS', action: 'create' })
    })

    it('plano vencido barra antes da matriz', async () => {
      tenants.assertWritable.mockRejectedValue(new AppException('PLAN_EXPIRED'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('PLAN_EXPIRED')
    })

    it('curso e currículo desativados não recebem projeto, nessa ordem', async () => {
      db.curriculum.findFirst.mockResolvedValue({
        id: CUR_ID,
        isActive: false,
        course: { id: 'course-1', coordinatorId: 'crd', isActive: false },
      })
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('COURSE_INACTIVE')
      db.curriculum.findFirst.mockResolvedValue({
        id: CUR_ID,
        isActive: false,
        course: { id: 'course-1', coordinatorId: 'crd', isActive: true },
      })
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('CURRICULUM_INACTIVE')
    })

    it('nome usado no semestre dá PROJECT_NAME_IN_USE, também pelo P2002', async () => {
      db.project.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('PROJECT_NAME_IN_USE')
      expect(db.project.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { termId_name: { termId: TERM_ID, name: 'INFO 2026.1' } },
        }),
      )
      db.project.findUnique.mockResolvedValue(null)
      db.project.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('crd', 'acme', 'sede', input))).toBe('PROJECT_NAME_IN_USE')
    })
  })

  describe('update', () => {
    it('passa pelo assertProjectWritable com edit', async () => {
      const access = projectAccess()
      projects.resolveProject.mockResolvedValue(access)
      await service.update('crd', 'acme', 'sede', 'prj-1', { workingDays: 6 })
      expect(projects.assertProjectWritable).toHaveBeenCalledWith(access, 'edit')
      expect(db.project.update).toHaveBeenCalledWith({
        where: { id: 'prj-1' },
        data: { workingDays: 6 },
      })
    })

    it('reduzir para 5 com célula de sábado dá WORKING_DAYS_IN_USE; sem célula passa', async () => {
      projects.resolveProject.mockResolvedValue(projectAccess('PLANNING', { workingDays: 6 }))
      db.boardSlot.count.mockResolvedValue(2)
      expect(await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', { workingDays: 5 }))).toBe(
        'WORKING_DAYS_IN_USE',
      )
      expect(db.boardSlot.count).toHaveBeenCalledWith({
        where: { board: { projectId: 'prj-1' }, weekday: 6 },
      })
      db.boardSlot.count.mockResolvedValue(0)
      await expect(
        service.update('crd', 'acme', 'sede', 'prj-1', { workingDays: 5 }),
      ).resolves.toBeDefined()
    })

    it('a matriz barra antes de mexer no banco', async () => {
      projects.resolveProject.mockResolvedValue(projectAccess('STARTED'))
      projects.assertProjectWritable.mockRejectedValue(new AppException('NOT_ALLOWED'))
      expect(await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', { name: 'X' }))).toBe(
        'NOT_ALLOWED',
      )
      expect(db.project.update).not.toHaveBeenCalled()
    })

    it('nome de outro projeto do semestre dá 409; o próprio passa', async () => {
      projects.resolveProject.mockResolvedValue(projectAccess())
      db.project.findUnique.mockResolvedValue({ id: 'prj-1' })
      await expect(
        service.update('crd', 'acme', 'sede', 'prj-1', { name: 'INFO 2026.1' }),
      ).resolves.toBeDefined()
      db.project.findUnique.mockResolvedValue({ id: 'outro' })
      expect(await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', { name: 'B' }))).toBe(
        'PROJECT_NAME_IN_USE',
      )
    })
  })

  describe('changeStatus', () => {
    it.each([
      ['DRAFT', 'PUBLISHED'],
      ['PUBLISHED', 'DRAFT'],
    ] as const)('%s → %s com a ação publish', async (from, to) => {
      const access = projectAccess('ADJUSTMENTS', { status: from })
      projects.resolveProject.mockResolvedValue(access)
      await service.changeStatus('crd', 'acme', 'sede', 'prj-1', { status: to })
      expect(projects.assertProjectWritable).toHaveBeenCalledWith(access, 'publish')
      expect(db.project.update).toHaveBeenCalledWith({
        where: { id: 'prj-1' },
        data: { status: to },
      })
    })

    it('para o mesmo status dá INVALID_PROJECT_TRANSITION com params', async () => {
      projects.resolveProject.mockResolvedValue(projectAccess('PLANNING', { status: 'DRAFT' }))
      const error = await errorOf(
        service.changeStatus('crd', 'acme', 'sede', 'prj-1', { status: 'DRAFT' }),
      )
      expect(error.code).toBe('INVALID_PROJECT_TRANSITION')
      expect(error.params).toEqual({ from: 'DRAFT', to: 'DRAFT' })
      expect(db.project.update).not.toHaveBeenCalled()
    })

    it('a matriz vem antes da transição', async () => {
      projects.resolveProject.mockResolvedValue(projectAccess('STARTED', { status: 'DRAFT' }))
      projects.assertProjectWritable.mockRejectedValue(new AppException('TERM_STATUS_FORBIDS'))
      expect(
        await codeOf(service.changeStatus('crd', 'acme', 'sede', 'prj-1', { status: 'DRAFT' })),
      ).toBe('TERM_STATUS_FORBIDS')
    })
  })

  it('remove passa pelo assertProjectWritable com delete e apaga', async () => {
    const access = projectAccess()
    projects.resolveProject.mockResolvedValue(access)
    await expect(service.remove('crd', 'acme', 'sede', 'prj-1')).resolves.toBeUndefined()
    expect(projects.assertProjectWritable).toHaveBeenCalledWith(access, 'delete')
    expect(db.project.delete).toHaveBeenCalledWith({ where: { id: 'prj-1' } })
  })

  it('get lê pelo resolveProject', async () => {
    projects.resolveProject.mockResolvedValue(projectAccess())
    await expect(service.get('crd', 'acme', 'sede', 'prj-1')).resolves.toMatchObject({
      id: 'prj-1',
      access: { isProjectManager: true, canEdit: true, canPublish: true, canDelete: true },
    })
    expect(projects.resolveProject).toHaveBeenCalledWith('crd', 'acme', 'sede', 'prj-1')
  })
})
