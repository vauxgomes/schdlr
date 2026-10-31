import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { CurriculumAccessService } from '@modules/curricula/curriculum-access.service'

import { SubjectsService } from './subjects.service'

const SUBJECT_ID = 'cmhsubject000000000000001'
const PATH = ['acme', 'sede', 'course-1', 'cur-1'] as const

const access = (canManageCatalog = true) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  course: { id: 'course-1', isActive: true },
  curriculum: { id: 'cur-1', isActive: true },
  canManageCatalog,
})
const subject = (overrides: Record<string, unknown> = {}) => ({
  id: SUBJECT_ID,
  curriculumId: 'cur-1',
  name: 'Matemática I',
  code: 'MAT-101',
  workload: 80,
  level: 1,
  color: '#1E88E5',
  isActive: true,
  createdAt: new Date('2026-10-30T10:00:00.000Z'),
  updatedAt: new Date('2026-10-30T10:00:00.000Z'),
  _count: { offerings: 0 },
  ...overrides,
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

describe('SubjectsService', () => {
  let db: {
    subject: Record<
      'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'delete',
      jest.Mock
    >
  }
  let curricula: Record<'resolveCurriculum' | 'assertCurriculumWritable', jest.Mock>
  let service: SubjectsService

  beforeEach(() => {
    db = {
      subject: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(subject()),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(subject()),
        update: jest.fn().mockResolvedValue(subject()),
        delete: jest.fn(),
      },
    }
    curricula = {
      resolveCurriculum: jest.fn().mockResolvedValue(access()),
      assertCurriculumWritable: jest.fn(),
    }
    service = new SubjectsService(
      db as unknown as DatabaseService,
      curricula as unknown as CurriculumAccessService,
    )
  })

  it('list devolve a grade inteira por nível e código, no formato da spec', async () => {
    curricula.resolveCurriculum.mockResolvedValue(access(false))
    db.subject.findMany.mockResolvedValue([subject({ isActive: false, _count: { offerings: 2 } })])
    await expect(service.list('tch', ...PATH)).resolves.toEqual([
      {
        id: SUBJECT_ID,
        name: 'Matemática I',
        code: 'MAT-101',
        workload: 80,
        level: 1,
        color: '#1E88E5',
        isActive: false,
        createdAt: new Date('2026-10-30T10:00:00.000Z'),
        updatedAt: new Date('2026-10-30T10:00:00.000Z'),
        inUse: true,
      },
    ])
    expect(curricula.resolveCurriculum).toHaveBeenCalledWith('tch', ...PATH)
    expect(db.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { curriculumId: 'cur-1' },
        orderBy: [{ level: 'asc' }, { code: 'asc' }],
      }),
    )
  })

  describe('get', () => {
    it('procura a disciplina no currículo do caminho', async () => {
      await expect(service.get('tch', ...PATH, SUBJECT_ID)).resolves.toMatchObject({
        id: SUBJECT_ID,
      })
      expect(db.subject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SUBJECT_ID, curriculumId: 'cur-1' } }),
      )
    })

    it('de outro currículo, ou id fora do formato, dá SUBJECT_NOT_FOUND', async () => {
      db.subject.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.get('tch', ...PATH, SUBJECT_ID))).toBe('SUBJECT_NOT_FOUND')
      db.subject.findFirst.mockClear()
      expect(await codeOf(service.get('tch', ...PATH, 'x'))).toBe('SUBJECT_NOT_FOUND')
      expect(db.subject.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    const input = {
      name: 'Matemática I',
      code: 'MAT-101',
      workload: 80,
      level: 1,
      color: '#000000',
    }

    it('quem gerencia o catálogo cria, no currículo', async () => {
      await expect(service.create('crd', ...PATH, input)).resolves.toMatchObject({ inUse: false })
      expect(curricula.assertCurriculumWritable).toHaveBeenCalledWith(access())
      expect(db.subject.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...input, curriculumId: 'cur-1' } }),
      )
    })

    it('sem canManageCatalog dá NOT_ALLOWED antes de assertCurriculumWritable', async () => {
      curricula.resolveCurriculum.mockResolvedValue(access(false))
      expect(await codeOf(service.create('tch', ...PATH, input))).toBe('NOT_ALLOWED')
      expect(curricula.assertCurriculumWritable).not.toHaveBeenCalled()
    })

    it('currículo desativado não recebe disciplina', async () => {
      curricula.assertCurriculumWritable.mockRejectedValue(new AppException('CURRICULUM_INACTIVE'))
      expect(await codeOf(service.create('crd', ...PATH, input))).toBe('CURRICULUM_INACTIVE')
      expect(db.subject.create).not.toHaveBeenCalled()
    })

    it('código usado no currículo dá SUBJECT_CODE_IN_USE, também pelo P2002', async () => {
      db.subject.findUnique.mockResolvedValue({ id: 'outra' })
      expect(await codeOf(service.create('crd', ...PATH, input))).toBe('SUBJECT_CODE_IN_USE')
      expect(db.subject.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { curriculumId_code: { curriculumId: 'cur-1', code: 'MAT-101' } },
        }),
      )

      db.subject.findUnique.mockResolvedValue(null)
      db.subject.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('crd', ...PATH, input))).toBe('SUBJECT_CODE_IN_USE')
    })
  })

  describe('update', () => {
    it('edita a disciplina', async () => {
      await service.update('crd', ...PATH, SUBJECT_ID, { workload: 70 })
      expect(curricula.assertCurriculumWritable).toHaveBeenCalledWith(access())
      expect(db.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SUBJECT_ID }, data: { workload: 70 } }),
      )
    })

    it('sem canManageCatalog dá NOT_ALLOWED', async () => {
      curricula.resolveCurriculum.mockResolvedValue(access(false))
      expect(await codeOf(service.update('tch', ...PATH, SUBJECT_ID, { workload: 70 }))).toBe(
        'NOT_ALLOWED',
      )
      expect(db.subject.update).not.toHaveBeenCalled()
    })

    it('desativada dá SUBJECT_INACTIVE; { isActive: true } reativa', async () => {
      db.subject.findFirst.mockResolvedValue(subject({ isActive: false }))
      expect(await codeOf(service.update('crd', ...PATH, SUBJECT_ID, { workload: 70 }))).toBe(
        'SUBJECT_INACTIVE',
      )
      expect(
        await codeOf(service.update('crd', ...PATH, SUBJECT_ID, { isActive: true, level: 2 })),
      ).toBe('SUBJECT_INACTIVE')
      await expect(
        service.update('crd', ...PATH, SUBJECT_ID, { isActive: true }),
      ).resolves.toBeDefined()
    })

    it('reativar ainda exige o currículo ativo', async () => {
      db.subject.findFirst.mockResolvedValue(subject({ isActive: false }))
      curricula.assertCurriculumWritable.mockRejectedValue(new AppException('CURRICULUM_INACTIVE'))
      expect(await codeOf(service.update('crd', ...PATH, SUBJECT_ID, { isActive: true }))).toBe(
        'CURRICULUM_INACTIVE',
      )
    })

    it('código de outra disciplina do currículo dá 409; o próprio passa', async () => {
      db.subject.findUnique.mockResolvedValue({ id: SUBJECT_ID })
      await expect(
        service.update('crd', ...PATH, SUBJECT_ID, { code: 'MAT-101' }),
      ).resolves.toBeDefined()
      db.subject.findUnique.mockResolvedValue({ id: 'outra' })
      expect(await codeOf(service.update('crd', ...PATH, SUBJECT_ID, { code: 'FIS-101' }))).toBe(
        'SUBJECT_CODE_IN_USE',
      )
    })
  })

  describe('remove', () => {
    it('apaga sem uso, inclusive desativada', async () => {
      db.subject.findFirst.mockResolvedValue(subject({ isActive: false }))
      await expect(service.remove('crd', ...PATH, SUBJECT_ID)).resolves.toBeUndefined()
      expect(curricula.assertCurriculumWritable).toHaveBeenCalledWith(access())
      expect(db.subject.delete).toHaveBeenCalledWith({ where: { id: SUBJECT_ID } })
    })

    it('sem canManageCatalog dá NOT_ALLOWED', async () => {
      curricula.resolveCurriculum.mockResolvedValue(access(false))
      expect(await codeOf(service.remove('tch', ...PATH, SUBJECT_ID))).toBe('NOT_ALLOWED')
      expect(db.subject.delete).not.toHaveBeenCalled()
    })

    it('usada por oferta dá SUBJECT_IN_USE', async () => {
      db.subject.findFirst.mockResolvedValue(subject({ _count: { offerings: 1 } }))
      expect(await codeOf(service.remove('crd', ...PATH, SUBJECT_ID))).toBe('SUBJECT_IN_USE')
      expect(db.subject.delete).not.toHaveBeenCalled()
    })

    it('o P2003 em corrida vira SUBJECT_IN_USE', async () => {
      db.subject.delete.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('crd', ...PATH, SUBJECT_ID))).toBe('SUBJECT_IN_USE')
    })
  })
})
