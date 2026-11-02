import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'

import { OfferingsService } from './offerings.service'

const OFF_ID = 'cmhoffering00000000000001'
const TCH_ID = 'cmhteacher000000000000001'

const projectAccess = () =>
  ({
    unit: { id: 'unit-1', organizationId: 'org-1', isActive: true },
    project: { id: 'prj-1', curriculumId: 'cur-1' },
  }) as unknown as ProjectAccess
const row = (
  overrides: { teacher?: unknown; teacherId?: string; isActive?: boolean; slots?: number } = {},
) => ({
  id: OFF_ID,
  projectId: 'prj-1',
  subjectId: 'sub-1',
  teacherId: overrides.teacherId ?? null,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  subject: {
    id: 'sub-1',
    name: 'Matemática I',
    code: 'MAT-101',
    workload: 80,
    level: 1,
    color: '#1E88E5',
    isActive: overrides.isActive ?? true,
  },
  teacher: overrides.teacher ?? null,
  boardSlots: Array.from({ length: overrides.slots ?? 0 }, (_, i) => ({
    timeSlot: { startTime: 420 + i * 50, endTime: 470 + i * 50 },
  })),
})
const teacher = {
  id: TCH_ID,
  name: 'Teacher Teste',
  user: { id: 'u-1', email: 'teacher@schdlr.dev', name: 'Teacher Teste' },
}

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('OfferingsService', () => {
  let db: {
    $transaction: jest.Mock
    offering: Record<'findMany' | 'findFirst' | 'update' | 'delete' | 'createMany', jest.Mock>
    subject: { findMany: jest.Mock }
    teacher: { findFirst: jest.Mock }
    boardSlot: Record<'updateMany' | 'deleteMany', jest.Mock>
  }
  let projects: Record<'resolveProject' | 'assertProjectWritable', jest.Mock>
  let service: OfferingsService

  beforeEach(() => {
    db = {
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
      offering: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ teacher })),
        delete: jest.fn(),
        createMany: jest.fn(),
      },
      subject: { findMany: jest.fn().mockResolvedValue([]) },
      teacher: { findFirst: jest.fn().mockResolvedValue({ isActive: true }) },
      boardSlot: { updateMany: jest.fn(), deleteMany: jest.fn() },
    }
    projects = {
      resolveProject: jest.fn().mockResolvedValue(projectAccess()),
      assertProjectWritable: jest.fn(),
    }
    service = new OfferingsService(
      db as unknown as DatabaseService,
      projects as unknown as ProjectAccessService,
    )
  })

  describe('list', () => {
    it('lê pelo resolveProject e devolve o formato da spec, por nível e código', async () => {
      db.offering.findMany.mockResolvedValue([row({ teacher, isActive: false, slots: 2 })])
      await expect(service.list('crd', 'acme', 'sede', 'prj-1', {})).resolves.toEqual([
        {
          id: OFF_ID,
          subject: {
            id: 'sub-1',
            name: 'Matemática I',
            code: 'MAT-101',
            workload: 80,
            level: 1,
            color: '#1E88E5',
            isActive: false,
          },
          teacher,
          slotsCount: 2,
          weeklyMinutes: 100,
          createdAt: new Date('2026-10-31T10:00:00.000Z'),
          updatedAt: new Date('2026-10-31T10:00:00.000Z'),
        },
      ])
      expect(projects.resolveProject).toHaveBeenCalledWith('crd', 'acme', 'sede', 'prj-1')
      expect(db.offering.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'prj-1', AND: [{}, {}] },
          orderBy: [{ subject: { level: 'asc' } }, { subject: { code: 'asc' } }],
        }),
      )
    })

    it('?teacherId= e ?withoutTeacher=true filtram', async () => {
      await service.list('crd', 'acme', 'sede', 'prj-1', { teacherId: TCH_ID })
      expect(db.offering.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { projectId: 'prj-1', AND: [{ teacherId: TCH_ID }, {}] },
        }),
      )
      await service.list('crd', 'acme', 'sede', 'prj-1', { withoutTeacher: true })
      expect(db.offering.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { projectId: 'prj-1', AND: [{}, { teacherId: null }] } }),
      )
    })

    it('quem não vê o projeto recebe o 404 do resolveProject', async () => {
      projects.resolveProject.mockRejectedValue(new AppException('PROJECT_NOT_FOUND'))
      expect(await codeOf(service.list('tch', 'acme', 'sede', 'prj-1', {}))).toBe(
        'PROJECT_NOT_FOUND',
      )
    })
  })

  describe('get', () => {
    it('procura a oferta no projeto do caminho', async () => {
      await expect(service.get('crd', 'acme', 'sede', 'prj-1', OFF_ID)).resolves.toMatchObject({
        id: OFF_ID,
        teacher: null,
        slotsCount: 0,
      })
      expect(db.offering.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: OFF_ID, projectId: 'prj-1' } }),
      )
    })

    it('de outro projeto, inexistente ou id fora do formato dá OFFERING_NOT_FOUND', async () => {
      db.offering.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.get('crd', 'acme', 'sede', 'prj-1', OFF_ID))).toBe(
        'OFFERING_NOT_FOUND',
      )
      db.offering.findFirst.mockClear()
      expect(await codeOf(service.get('crd', 'acme', 'sede', 'prj-1', 'x'))).toBe(
        'OFFERING_NOT_FOUND',
      )
      expect(db.offering.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('define um Teacher da organização, passando pelo assertProjectWritable', async () => {
      await expect(
        service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID }),
      ).resolves.toMatchObject({ teacher })
      expect(projects.assertProjectWritable).toHaveBeenCalledWith(projectAccess())
      expect(db.teacher.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TCH_ID, organizationId: 'org-1' } }),
      )
      expect(db.offering.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: OFF_ID }, data: { teacherId: TCH_ID } }),
      )
    })

    it('com usuário, o nome do professor é o do usuário (0021)', async () => {
      db.offering.update.mockResolvedValue(
        row({ teacher: { ...teacher, name: 'Nome guardado' }, teacherId: TCH_ID }),
      )
      await expect(
        service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID }),
      ).resolves.toMatchObject({ teacher: { name: 'Teacher Teste' } })
    })

    it('vaga sem usuário sai com o próprio nome e user null', async () => {
      const vaga = { id: TCH_ID, name: 'Professor de Matemática 1', user: null }
      db.offering.update.mockResolvedValue(row({ teacher: vaga }))
      await expect(
        service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID }),
      ).resolves.toMatchObject({ teacher: vaga })
    })

    it('professor desativado não entra em oferta nova: TEACHER_INACTIVE', async () => {
      db.teacher.findFirst.mockResolvedValue({ isActive: false })
      expect(
        await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID })),
      ).toBe('TEACHER_INACTIVE')
      expect(db.offering.update).not.toHaveBeenCalled()
    })

    it('o mesmo professor que a oferta já tem não é conferido de novo', async () => {
      db.offering.findFirst.mockResolvedValue(row({ teacherId: TCH_ID }))
      await service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID })
      expect(db.teacher.findFirst).not.toHaveBeenCalled()
    })

    it('null tira o professor sem consultar professores', async () => {
      db.offering.update.mockResolvedValue(row())
      await expect(
        service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: null }),
      ).resolves.toMatchObject({ teacher: null })
      expect(db.teacher.findFirst).not.toHaveBeenCalled()
      expect(db.offering.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { teacherId: null } }),
      )
    })

    it('Teacher de outra organização, inexistente ou id fora do formato dá INVALID_TEACHER', async () => {
      db.teacher.findFirst.mockResolvedValue(null)
      expect(
        await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID })),
      ).toBe('INVALID_TEACHER')
      db.teacher.findFirst.mockClear()
      expect(
        await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: 'x' })),
      ).toBe('INVALID_TEACHER')
      expect(db.teacher.findFirst).not.toHaveBeenCalled()
      expect(db.offering.update).not.toHaveBeenCalled()
    })

    it('a matriz barra antes do professor e da gravação', async () => {
      projects.assertProjectWritable.mockRejectedValue(new AppException('TERM_STATUS_FORBIDS'))
      expect(
        await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: TCH_ID })),
      ).toBe('TERM_STATUS_FORBIDS')
      expect(db.teacher.findFirst).not.toHaveBeenCalled()
      expect(db.offering.update).not.toHaveBeenCalled()
    })

    it('oferta de outro projeto dá 404 antes da matriz', async () => {
      db.offering.findFirst.mockResolvedValue(null)
      expect(
        await codeOf(service.update('crd', 'acme', 'sede', 'prj-1', OFF_ID, { teacherId: null })),
      ).toBe('OFFERING_NOT_FOUND')
      expect(projects.assertProjectWritable).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('apaga as células sem local, zera a oferta nas outras e a apaga, numa transação', async () => {
      db.boardSlot.deleteMany.mockReturnValue('deleteMany')
      db.boardSlot.updateMany.mockReturnValue('updateMany')
      db.offering.delete.mockReturnValue('delete')
      await expect(service.remove('crd', 'acme', 'sede', 'prj-1', OFF_ID)).resolves.toBeUndefined()
      expect(projects.assertProjectWritable).toHaveBeenCalledWith(projectAccess())
      expect(db.boardSlot.deleteMany).toHaveBeenCalledWith({
        where: { offeringId: OFF_ID, locationId: null },
      })
      expect(db.boardSlot.updateMany).toHaveBeenCalledWith({
        where: { offeringId: OFF_ID },
        data: { offeringId: null },
      })
      expect(db.offering.delete).toHaveBeenCalledWith({ where: { id: OFF_ID } })
      expect(db.$transaction).toHaveBeenCalledWith(['deleteMany', 'updateMany', 'delete'])
    })

    it('a matriz barra antes de mexer no banco', async () => {
      projects.assertProjectWritable.mockRejectedValue(new AppException('NOT_ALLOWED'))
      expect(await codeOf(service.remove('crd', 'acme', 'sede', 'prj-1', OFF_ID))).toBe(
        'NOT_ALLOWED',
      )
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('generate', () => {
    it('cria só as que faltam, das disciplinas ativas, e devolve a lista inteira', async () => {
      db.subject.findMany.mockResolvedValue([{ id: 'sub-2' }])
      db.offering.createMany.mockResolvedValue({ count: 1 })
      db.offering.findMany.mockResolvedValue([row()])
      await expect(service.generate('crd', 'acme', 'sede', 'prj-1')).resolves.toEqual({
        created: 1,
        offerings: [expect.objectContaining({ id: OFF_ID })],
      })
      expect(projects.assertProjectWritable).toHaveBeenCalledWith(projectAccess())
      expect(db.subject.findMany).toHaveBeenCalledWith({
        where: {
          curriculumId: 'cur-1',
          isActive: true,
          offerings: { none: { projectId: 'prj-1' } },
        },
        select: { id: true },
      })
      expect(db.offering.createMany).toHaveBeenCalledWith({
        data: [{ projectId: 'prj-1', subjectId: 'sub-2' }],
        skipDuplicates: true,
      })
    })

    it('sem disciplina faltando não cria nada: created 0', async () => {
      await expect(service.generate('crd', 'acme', 'sede', 'prj-1')).resolves.toEqual({
        created: 0,
        offerings: [],
      })
      expect(db.offering.createMany).not.toHaveBeenCalled()
    })

    it('created conta o que esta chamada criou, não o que pediu (corrida)', async () => {
      db.subject.findMany.mockResolvedValue([{ id: 'sub-2' }, { id: 'sub-3' }])
      db.offering.createMany.mockResolvedValue({ count: 1 })
      await expect(service.generate('crd', 'acme', 'sede', 'prj-1')).resolves.toMatchObject({
        created: 1,
      })
    })

    it('não apaga, não muda professor e não mexe em célula', async () => {
      db.subject.findMany.mockResolvedValue([{ id: 'sub-2' }])
      db.offering.createMany.mockResolvedValue({ count: 1 })
      await service.generate('crd', 'acme', 'sede', 'prj-1')
      expect(db.offering.delete).not.toHaveBeenCalled()
      expect(db.offering.update).not.toHaveBeenCalled()
      expect(db.boardSlot.updateMany).not.toHaveBeenCalled()
    })

    it('a matriz barra antes de gerar', async () => {
      projects.assertProjectWritable.mockRejectedValue(new AppException('TERM_STATUS_FORBIDS'))
      expect(await codeOf(service.generate('mgr', 'acme', 'sede', 'prj-1'))).toBe(
        'TERM_STATUS_FORBIDS',
      )
      expect(db.subject.findMany).not.toHaveBeenCalled()
    })
  })
})
