import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { TeachersService } from './teachers.service'

const TEACHER_ID = 'cmhteacher000000000000001'
const USER_ID = 'cmhuser000000000000000001'

const orgAccess = (isOwner = false) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  isOwner,
})
const teacher = (overrides: Record<string, unknown> = {}) => ({
  id: TEACHER_ID,
  organizationId: 'org-1',
  userId: null,
  name: 'Professor de Matemática 1',
  area: 'Matemática',
  notes: null,
  isActive: true,
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-01T10:00:00.000Z'),
  user: null,
  _count: { offerings: 0 },
  ...overrides,
})
const linkedUser = { id: USER_ID, email: 'ana@schdlr.dev', name: 'Ana Souza' }
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

describe('TeachersService', () => {
  let db: {
    $transaction: jest.Mock
    teacher: Record<
      'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'delete',
      jest.Mock
    >
    unitMember: { findFirst: jest.Mock }
    offering: Record<'count' | 'updateMany', jest.Mock>
  }
  let tenants: Record<'resolveOrganization' | 'assertWritable', jest.Mock>
  let service: TeachersService

  /** O primeiro findFirst de membro é o "responsável por alguma unidade" do resolve. */
  const asManager = (isManager = true) =>
    db.unitMember.findFirst.mockResolvedValueOnce(isManager ? { id: 'm' } : null)

  beforeEach(() => {
    db = {
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
      teacher: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(teacher()),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(teacher()),
        update: jest.fn().mockResolvedValue(teacher()),
        delete: jest.fn(),
      },
      unitMember: { findFirst: jest.fn().mockResolvedValue({ id: 'm' }) },
      offering: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    }
    tenants = {
      resolveOrganization: jest.fn().mockResolvedValue(orgAccess()),
      assertWritable: jest.fn(),
    }
    service = new TeachersService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  describe('papéis', () => {
    it('gestor é o responsável por alguma unidade ativa da organização', async () => {
      asManager()
      db.teacher.findMany.mockResolvedValue([teacher()])
      const [view] = await service.list('mgr', 'acme', {})
      expect(view.access).toEqual({ canManage: true })
      expect(db.unitMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'mgr',
          isManager: true,
          unit: { organizationId: 'org-1', isActive: true },
        },
        select: { id: true },
      })
    })

    it('o dono gerencia sem consultar membros', async () => {
      tenants.resolveOrganization.mockResolvedValue(orgAccess(true))
      db.teacher.findMany.mockResolvedValue([teacher()])
      const [view] = await service.list('owner', 'acme', {})
      expect(view.access).toEqual({ canManage: true })
      expect(db.unitMember.findFirst).not.toHaveBeenCalled()
    })

    it.each([
      [
        'criar',
        (s: TeachersService) => s.create('u', 'acme', { name: 'X', area: null, notes: null }),
      ],
      ['editar', (s: TeachersService) => s.update('u', 'acme', TEACHER_ID, { notes: 'x' })],
      ['apagar', (s: TeachersService) => s.remove('u', 'acme', TEACHER_ID)],
    ])('membro sem papel lê, mas %s dá NOT_ALLOWED', async (_label, act) => {
      asManager(false)
      expect(await codeOf(act(service))).toBe('NOT_ALLOWED')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
    })

    it('quem não enxerga a organização recebe o 404 do resolveOrganization', async () => {
      tenants.resolveOrganization.mockRejectedValue(new AppException('ORGANIZATION_NOT_FOUND'))
      expect(await codeOf(service.list('x', 'acme', {}))).toBe('ORGANIZATION_NOT_FOUND')
    })
  })

  describe('list', () => {
    it('devolve o formato da spec; com usuário, o nome é o do usuário; ordena pelo nome devolvido', async () => {
      asManager(false)
      db.teacher.findMany.mockResolvedValue([
        teacher({ id: 't-z', name: 'Zeca guardado', userId: USER_ID, user: linkedUser }),
        teacher({ _count: { offerings: 3 } }),
      ])
      await expect(service.list('u', 'acme', {})).resolves.toEqual([
        expect.objectContaining({ id: 't-z', name: 'Ana Souza', user: linkedUser }),
        {
          id: TEACHER_ID,
          name: 'Professor de Matemática 1',
          area: 'Matemática',
          notes: null,
          isActive: true,
          user: null,
          offeringsCount: 3,
          createdAt: new Date('2026-11-01T10:00:00.000Z'),
          updatedAt: new Date('2026-11-01T10:00:00.000Z'),
          access: { canManage: false },
        },
      ])
      expect(db.teacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      )
    })

    it('?q= procura no nome e no do usuário; ?active= e ?linked= filtram', async () => {
      await service.list('u', 'acme', { q: 'mat', active: false, linked: true })
      expect(db.teacher.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            OR: [
              { name: { contains: 'mat', mode: 'insensitive' } },
              { user: { name: { contains: 'mat', mode: 'insensitive' } } },
            ],
            isActive: false,
            userId: { not: null },
          },
        }),
      )
      await service.list('u', 'acme', { linked: false })
      expect(db.teacher.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', userId: null } }),
      )
    })
  })

  describe('get', () => {
    it('procura na organização do caminho; inexistente ou id fora do formato dá 404', async () => {
      await service.get('u', 'acme', TEACHER_ID)
      expect(db.teacher.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TEACHER_ID, organizationId: 'org-1' } }),
      )
      db.teacher.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.get('u', 'acme', TEACHER_ID))).toBe('TEACHER_NOT_FOUND')
      db.teacher.findFirst.mockClear()
      expect(await codeOf(service.get('u', 'acme', 'x'))).toBe('TEACHER_NOT_FOUND')
      expect(db.teacher.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    const body = { name: 'Professor de Matemática 1', area: 'Matemática', notes: null }

    it('sem userId é uma vaga', async () => {
      await expect(service.create('mgr', 'acme', body)).resolves.toMatchObject({ user: null })
      expect(tenants.assertWritable).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      )
      expect(db.teacher.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...body, organizationId: 'org-1', userId: null } }),
      )
    })

    it('com userId de membro ativo da organização, já vinculado', async () => {
      db.teacher.create.mockResolvedValue(teacher({ userId: USER_ID, user: linkedUser }))
      await expect(
        service.create('mgr', 'acme', { ...body, userId: USER_ID }),
      ).resolves.toMatchObject({ name: 'Ana Souza', user: linkedUser })
      expect(db.unitMember.findFirst).toHaveBeenLastCalledWith({
        where: {
          userId: USER_ID,
          unit: { organizationId: 'org-1', isActive: true },
          user: { isActive: true },
        },
        select: { id: true },
      })
      expect(db.teacher.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...body, organizationId: 'org-1', userId: USER_ID } }),
      )
    })

    it('userId de quem não é membro ativo, ou fora do formato, dá INVALID_TEACHER_USER', async () => {
      asManager()
      db.unitMember.findFirst.mockResolvedValueOnce(null)
      expect(await codeOf(service.create('mgr', 'acme', { ...body, userId: USER_ID }))).toBe(
        'INVALID_TEACHER_USER',
      )
      expect(await codeOf(service.create('mgr', 'acme', { ...body, userId: 'x' }))).toBe(
        'INVALID_TEACHER_USER',
      )
      expect(db.teacher.create).not.toHaveBeenCalled()
    })

    it('userId de quem já é professor na organização dá USER_ALREADY_TEACHER', async () => {
      db.teacher.findUnique.mockResolvedValueOnce({ id: 'outro' })
      expect(await codeOf(service.create('mgr', 'acme', { ...body, userId: USER_ID }))).toBe(
        'USER_ALREADY_TEACHER',
      )
      expect(db.teacher.findUnique).toHaveBeenCalledWith({
        where: { organizationId_userId: { organizationId: 'org-1', userId: USER_ID } },
        select: { id: true },
      })
    })

    it('nome repetido na organização dá TEACHER_NAME_IN_USE, também pelo P2002', async () => {
      db.teacher.findUnique.mockResolvedValueOnce({ id: 'outro' })
      expect(await codeOf(service.create('mgr', 'acme', body))).toBe('TEACHER_NAME_IN_USE')
      db.teacher.create.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.create('mgr', 'acme', body))).toBe('TEACHER_NAME_IN_USE')
    })

    it('P2002 com userId, quando o usuário virou professor na corrida, dá USER_ALREADY_TEACHER', async () => {
      db.teacher.create.mockRejectedValue(prismaError('P2002'))
      db.teacher.findUnique
        .mockResolvedValueOnce(null) // usuário livre
        .mockResolvedValueOnce(null) // nome livre
        .mockResolvedValueOnce({ id: 'outro' }) // na releitura, já é professor
      expect(await codeOf(service.create('mgr', 'acme', { ...body, userId: USER_ID }))).toBe(
        'USER_ALREADY_TEACHER',
      )
    })

    it('plano vencido não grava', async () => {
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await expect(service.create('mgr', 'acme', body)).rejects.toBeInstanceOf(PlanExpiredException)
      expect(db.teacher.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('edita o perfil', async () => {
      await service.update('mgr', 'acme', TEACHER_ID, { name: 'Prof. Redes — vaga 2', area: null })
      expect(db.teacher.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEACHER_ID },
          data: { name: 'Prof. Redes — vaga 2', area: null },
        }),
      )
    })

    it('desativado: só a reativação passa; o resto dá TEACHER_INACTIVE', async () => {
      db.teacher.findFirst.mockResolvedValue(teacher({ isActive: false }))
      expect(await codeOf(service.update('mgr', 'acme', TEACHER_ID, { notes: 'x' }))).toBe(
        'TEACHER_INACTIVE',
      )
      expect(
        await codeOf(service.update('mgr', 'acme', TEACHER_ID, { isActive: true, notes: 'x' })),
      ).toBe('TEACHER_INACTIVE')
      await expect(
        service.update('mgr', 'acme', TEACHER_ID, { isActive: true }),
      ).resolves.toBeDefined()
    })

    it('nome de outro professor dá TEACHER_NAME_IN_USE; o próprio, não', async () => {
      db.teacher.findUnique.mockResolvedValueOnce({ id: TEACHER_ID })
      await expect(
        service.update('mgr', 'acme', TEACHER_ID, { name: 'Professor de Matemática 1' }),
      ).resolves.toBeDefined()
      db.teacher.findUnique.mockResolvedValueOnce({ id: 'outro' })
      expect(await codeOf(service.update('mgr', 'acme', TEACHER_ID, { name: 'X' }))).toBe(
        'TEACHER_NAME_IN_USE',
      )
      db.teacher.update.mockRejectedValue(prismaError('P2002'))
      expect(await codeOf(service.update('mgr', 'acme', TEACHER_ID, { name: 'Y' }))).toBe(
        'TEACHER_NAME_IN_USE',
      )
    })
  })

  describe('remove', () => {
    it('vaga sem oferta alocada: solta as ofertas não alocadas e apaga, numa transação', async () => {
      db.offering.updateMany.mockReturnValue('updateMany')
      db.teacher.delete.mockReturnValue('delete')
      await expect(service.remove('mgr', 'acme', TEACHER_ID)).resolves.toBeUndefined()
      expect(db.offering.count).toHaveBeenCalledWith({
        where: { teacherId: TEACHER_ID, boardSlots: { some: {} } },
      })
      expect(db.offering.updateMany).toHaveBeenCalledWith({
        where: { teacherId: TEACHER_ID, boardSlots: { none: {} } },
        data: { teacherId: null },
      })
      expect(db.teacher.delete).toHaveBeenCalledWith({ where: { id: TEACHER_ID } })
      expect(db.$transaction).toHaveBeenCalledWith(['updateMany', 'delete'])
    })

    it('professor com usuário nunca se apaga: TEACHER_HAS_USER', async () => {
      db.teacher.findFirst.mockResolvedValue(teacher({ userId: USER_ID, user: linkedUser }))
      expect(await codeOf(service.remove('mgr', 'acme', TEACHER_ID))).toBe('TEACHER_HAS_USER')
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('com oferta alocada em célula dá TEACHER_IN_USE, também pelo P2003', async () => {
      db.offering.count.mockResolvedValue(1)
      expect(await codeOf(service.remove('mgr', 'acme', TEACHER_ID))).toBe('TEACHER_IN_USE')
      expect(db.$transaction).not.toHaveBeenCalled()

      db.offering.count.mockResolvedValue(0)
      db.$transaction.mockRejectedValue(prismaError('P2003'))
      expect(await codeOf(service.remove('mgr', 'acme', TEACHER_ID))).toBe('TEACHER_IN_USE')
    })
  })
})
