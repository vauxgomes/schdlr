import { ConfigService } from '@nestjs/config'

import { hashOpaqueToken } from '@common/crypto/opaque-token'
import { AppException } from '@common/errors/app.exception'
import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'
import { MailService } from '@infra/mail/mail.service'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { InvitationsService } from './invitations.service'

const DAY = 86_400_000
const organization = { id: 'org-1', name: 'Acme', slug: 'acme', ownerId: 'owner', isActive: true }
const unit = {
  id: 'unit-1',
  organizationId: 'org-1',
  name: 'Sede',
  slug: 'sede',
  isActive: true,
  organization,
}

const invitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  unitId: 'unit-1',
  inviteeId: 'guest',
  invitedById: 'owner',
  isManager: false,
  isTeacher: true,
  status: 'PENDING',
  tokenHash: 'h',
  expiresAt: new Date(Date.now() + DAY),
  respondedAt: null,
  createdAt: new Date(),
  invitee: { email: 'guest@schdlr.dev', name: 'guest', isActive: true },
  invitedBy: { email: 'admin@schdlr.dev', name: 'Admin' },
  unit,
  ...overrides,
})

const access = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization,
  unit,
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('InvitationsService', () => {
  let tx: {
    user: Record<'findUnique' | 'create', jest.Mock>
    unitMember: Record<'findUnique' | 'upsert', jest.Mock>
    teacher: Record<'findUnique' | 'create', jest.Mock>
    unitInvitation: Record<'updateMany' | 'create' | 'findUniqueOrThrow', jest.Mock>
  }
  let db: {
    $transaction: jest.Mock
    unitInvitation: Record<'findMany' | 'findFirst' | 'findUnique', jest.Mock>
  }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let mail: { sendUnitInvitation: jest.Mock }
  let service: InvitationsService

  beforeEach(() => {
    tx = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      unitMember: { findUnique: jest.fn(), upsert: jest.fn() },
      teacher: { findUnique: jest.fn(), create: jest.fn() },
      unitInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    }
    db = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      unitInvitation: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    }
    tenants = { resolveUnit: jest.fn(), assertWritable: jest.fn() }
    mail = { sendUnitInvitation: jest.fn() }
    const env: Partial<Env> = { UNIT_INVITE_TTL_DAYS: 7, WEB_APP_URL: 'http://web/' }
    const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>
    service = new InvitationsService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
      mail as unknown as MailService,
      config,
    )
  })

  describe('invite', () => {
    const input = { email: 'guest@schdlr.dev', isManager: false, isTeacher: true }

    beforeEach(() => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      tx.user.findUnique.mockResolvedValue({ id: 'guest', isActive: true })
      tx.unitMember.findUnique.mockResolvedValue(null)
      tx.unitInvitation.create.mockResolvedValue(invitation())
    })

    it('cria com o hash do token e envia os links com o token', async () => {
      await expect(service.invite('owner', 'acme', 'sede', input)).resolves.toMatchObject({
        id: 'inv-1',
        email: 'guest@schdlr.dev',
        status: 'PENDING',
        invitedBy: { email: 'admin@schdlr.dev', name: 'Admin' },
        unit: { name: 'Sede', slug: 'sede' },
        organization: { name: 'Acme', slug: 'acme' },
      })

      const [{ data }] = tx.unitInvitation.create.mock.calls[0] as [
        { data: { tokenHash: string; expiresAt: Date; invitedById: string } },
      ]
      const [sent] = mail.sendUnitInvitation.mock.calls[0] as [
        { acceptUrl: string; rejectUrl: string },
      ]
      const token = /\/invitations\/([\w-]+)\?action=accept$/.exec(sent.acceptUrl)![1]
      expect(token).toHaveLength(43) // 32 bytes em base64url
      expect(data.tokenHash).toBe(hashOpaqueToken(token))
      expect(data.tokenHash).not.toContain(token)
      expect(sent.rejectUrl).toBe(`http://web/invitations/${token}?action=reject`)
      expect(data.invitedById).toBe('owner')
      expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * DAY - 5_000)
    })

    it('cancela o pendente anterior do mesmo usuário na unidade', async () => {
      await service.invite('owner', 'acme', 'sede', input)
      expect(tx.unitInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          unitId: 'unit-1',
          inviteeId: 'guest',
          status: 'PENDING',
          expiresAt: { gt: expect.any(Date) as Date },
        },
        data: { status: 'CANCELLED', respondedAt: expect.any(Date) as Date },
      })
    })

    it('e-mail sem conta cria o usuário com a parte antes do @', async () => {
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'novo' })
      await service.invite('owner', 'acme', 'sede', { ...input, email: 'nova.pessoa@x.dev' })
      expect(tx.user.create).toHaveBeenCalledWith({
        data: { email: 'nova.pessoa@x.dev', name: 'nova.pessoa' },
      })
    })

    it('usa o nome informado para quem não tem conta', async () => {
      tx.user.findUnique.mockResolvedValue(null)
      tx.user.create.mockResolvedValue({ id: 'novo' })
      await service.invite('owner', 'acme', 'sede', { ...input, name: 'Nova' })
      expect(tx.user.create).toHaveBeenCalledWith({
        data: { email: 'guest@schdlr.dev', name: 'Nova' },
      })
    })

    it.each([
      ['usuário inativo', { id: 'guest', isActive: false }, null, 'USER_INACTIVE'],
      ['já membro', { id: 'guest', isActive: true }, { id: 'm' }, 'ALREADY_A_MEMBER'],
    ])('%s dá %s', async (_label, user, membership, code) => {
      tx.user.findUnique.mockResolvedValue(user)
      tx.unitMember.findUnique.mockResolvedValue(membership)
      expect(await codeOf(service.invite('owner', 'acme', 'sede', input))).toBe(code)
      expect(tx.unitInvitation.create).not.toHaveBeenCalled()
      expect(mail.sendUnitInvitation).not.toHaveBeenCalled()
    })

    it('responsável não convida com isManager', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isManager: true }))
      expect(
        await codeOf(service.invite('mgr', 'acme', 'sede', { ...input, isManager: true })),
      ).toBe('NOT_ALLOWED')
      await expect(service.invite('mgr', 'acme', 'sede', input)).resolves.toBeDefined()
    })

    it('membro sem papel não convida', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.invite('u', 'acme', 'sede', input))).toBe('NOT_ALLOWED')
    })

    it('plano vencido barra antes de gravar', async () => {
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await expect(service.invite('owner', 'acme', 'sede', input)).rejects.toBeInstanceOf(
        PlanExpiredException,
      )
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('falha do e-mail dá EMAIL_SEND_FAILED e o convite fica', async () => {
      mail.sendUnitInvitation.mockRejectedValue(new Error('smtp'))
      expect(await codeOf(service.invite('owner', 'acme', 'sede', input))).toBe('EMAIL_SEND_FAILED')
      expect(tx.unitInvitation.create).toHaveBeenCalled()
    })
  })

  describe('listForUnit', () => {
    beforeEach(() => db.unitInvitation.findMany.mockResolvedValue([]))

    it('membro sem papel dá NOT_ALLOWED', async () => {
      tenants.resolveUnit.mockResolvedValue(access())
      expect(await codeOf(service.listForUnit('u', 'acme', 'sede', {}))).toBe('NOT_ALLOWED')
    })

    it.each([
      [undefined, {}],
      ['EXPIRED', { status: 'PENDING', expiresAt: { lte: expect.any(Date) as Date } }],
      ['PENDING', { status: 'PENDING', expiresAt: { gt: expect.any(Date) as Date } }],
      ['CANCELLED', { status: 'CANCELLED' }],
    ] as const)('status %s filtra %j', async (status, filter) => {
      tenants.resolveUnit.mockResolvedValue(access({ isManager: true }))
      await service.listForUnit('u', 'acme', 'sede', { status })
      expect(db.unitInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { unitId: 'unit-1', ...filter },
          orderBy: { createdAt: 'desc' },
        }),
      )
    })

    it('PENDING vencido sai como EXPIRED, sem gravar', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      db.unitInvitation.findMany.mockResolvedValue([
        invitation({ expiresAt: new Date(Date.now() - 1000) }),
      ])
      const [view] = await service.listForUnit('u', 'acme', 'sede', {})
      expect(view.status).toBe('EXPIRED')
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('cancel', () => {
    it('responsável não cancela convite com isManager', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isManager: true }))
      db.unitInvitation.findFirst.mockResolvedValue(invitation({ isManager: true }))
      expect(await codeOf(service.cancel('mgr', 'acme', 'sede', 'inv-1'))).toBe('NOT_ALLOWED')
    })

    it('marca CANCELLED com respondedAt', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isManager: true }))
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tx.unitInvitation.findUniqueOrThrow.mockResolvedValue(invitation({ status: 'CANCELLED' }))
      await expect(service.cancel('mgr', 'acme', 'sede', 'inv-1')).resolves.toMatchObject({
        status: 'CANCELLED',
      })
      expect(tx.unitInvitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', status: 'PENDING' },
        data: { status: 'CANCELLED', respondedAt: expect.any(Date) as Date },
      })
      expect(tenants.assertWritable).toHaveBeenCalled()
    })

    it('convite de outra unidade dá INVITATION_NOT_FOUND', async () => {
      tenants.resolveUnit.mockResolvedValue(access({ isOwner: true }))
      db.unitInvitation.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.cancel('owner', 'acme', 'sede', 'inv-x'))).toBe(
        'INVITATION_NOT_FOUND',
      )
      expect(db.unitInvitation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-x', unitId: 'unit-1' } }),
      )
    })
  })

  describe('responder', () => {
    beforeEach(() => tx.unitInvitation.findUniqueOrThrow.mockResolvedValue(invitation()))

    it('aceitar passa por assertWritable e soma o isManager; sem isTeacher, nenhum Teacher', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(
        invitation({ isManager: true, isTeacher: false }),
      )
      await service.respondById('guest', 'inv-1', 'accept')
      expect(tenants.assertWritable).toHaveBeenCalledWith(
        expect.objectContaining({ organization, unit }),
      )
      expect(tx.unitInvitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: expect.any(Date) as Date },
      })
      expect(tx.unitMember.upsert).toHaveBeenCalledWith({
        where: { unitId_userId: { unitId: 'unit-1', userId: 'guest' } },
        create: { unitId: 'unit-1', userId: 'guest', isManager: true },
        update: { isManager: true },
      })
      expect(tx.teacher.create).not.toHaveBeenCalled()
    })

    it('aceitar com isTeacher cria o Teacher vinculado, com o nome do usuário (0021)', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tx.teacher.findUnique.mockResolvedValue(null)
      await service.respondById('guest', 'inv-1', 'accept')
      expect(tx.unitMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { unitId: 'unit-1', userId: 'guest', isManager: false },
        }),
      )
      expect(tx.teacher.findUnique).toHaveBeenNthCalledWith(1, {
        where: { organizationId_userId: { organizationId: 'org-1', userId: 'guest' } },
        select: { id: true },
      })
      expect(tx.teacher.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', userId: 'guest', name: 'guest' },
      })
    })

    it('com um homônimo na organização, o nome leva o e-mail', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tx.teacher.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'outro' })
      await service.respondById('guest', 'inv-1', 'accept')
      expect(tx.teacher.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', userId: 'guest', name: 'guest (guest@schdlr.dev)' },
      })
    })

    it('quem já é professor na organização fica com o Teacher que tinha', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tx.teacher.findUnique.mockResolvedValue({ id: 't-1' })
      await service.respondById('guest', 'inv-1', 'accept')
      expect(tx.teacher.create).not.toHaveBeenCalled()
    })

    it('recusar um convite com isTeacher não cria Teacher', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      await service.respondById('guest', 'inv-1', 'reject')
      expect(tx.teacher.create).not.toHaveBeenCalled()
      expect(tx.unitMember.upsert).not.toHaveBeenCalled()
    })

    it('aceitar com plano vencido não grava', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await expect(service.respondById('guest', 'inv-1', 'accept')).rejects.toBeInstanceOf(
        PlanExpiredException,
      )
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('recusar não passa por assertWritable', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tenants.assertWritable.mockRejectedValue(new PlanExpiredException())
      await service.respondById('guest', 'inv-1', 'reject')
      expect(tenants.assertWritable).not.toHaveBeenCalled()
      expect(tx.unitMember.upsert).not.toHaveBeenCalled()
      expect(tx.unitInvitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED' }) as object,
        }),
      )
    })

    it.each([
      ['vencido', { expiresAt: new Date(Date.now() - 1000) }, 'INVITATION_EXPIRED'],
      ['já aceito', { status: 'ACCEPTED' }, 'INVITATION_NOT_PENDING'],
      ['cancelado', { status: 'CANCELLED' }, 'INVITATION_NOT_PENDING'],
    ])('%s dá %s', async (_label, overrides, code) => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation(overrides))
      expect(await codeOf(service.respondById('guest', 'inv-1', 'accept'))).toBe(code)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('resposta simultânea: o segundo dá INVITATION_NOT_PENDING', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(invitation())
      tx.unitInvitation.updateMany.mockResolvedValue({ count: 0 })
      expect(await codeOf(service.respondById('guest', 'inv-1', 'accept'))).toBe(
        'INVITATION_NOT_PENDING',
      )
      expect(tx.unitMember.upsert).not.toHaveBeenCalled()
    })

    it('pelo id só o convite do usuário do token', async () => {
      db.unitInvitation.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.respondById('outro', 'inv-1', 'accept'))).toBe(
        'INVITATION_NOT_FOUND',
      )
      expect(db.unitInvitation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1', inviteeId: 'outro' } }),
      )
    })

    it('pelo link procura pelo hash do token', async () => {
      db.unitInvitation.findUnique.mockResolvedValue(invitation({ status: 'ACCEPTED' }))
      await expect(service.findByToken('tok')).resolves.toMatchObject({ status: 'ACCEPTED' })
      expect(db.unitInvitation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashOpaqueToken('tok') } }),
      )
    })

    it.each([
      ['token desconhecido', null],
      ['convidado inativo', invitation({ invitee: { email: 'g', name: 'g', isActive: false } })],
    ])('%s dá INVITATION_NOT_FOUND', async (_label, found) => {
      db.unitInvitation.findUnique.mockResolvedValue(found)
      expect(await codeOf(service.findByToken('tok'))).toBe('INVITATION_NOT_FOUND')
      expect(await codeOf(service.respondByToken('tok', 'accept'))).toBe('INVITATION_NOT_FOUND')
    })
  })

  it('listMine filtra pendentes válidos em unidade e organização ativas', async () => {
    db.unitInvitation.findMany.mockResolvedValue([])
    await service.listMine('guest')
    expect(db.unitInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inviteeId: 'guest',
          status: 'PENDING',
          expiresAt: { gt: expect.any(Date) as Date },
          unit: { isActive: true, organization: { isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    )
  })
})
