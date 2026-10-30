import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InvitationStatus, Prisma } from '@prisma/client'

import { generateOpaqueToken, hashOpaqueToken } from '@common/crypto/opaque-token'
import { AppException } from '@common/errors/app.exception'
import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'
import { MailService } from '@infra/mail/mail.service'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

import { CreateInvitationInput, ListInvitationsQuery } from './schemas/invitation.schemas'

export type InvitationView = {
  id: string
  email: string
  name: string
  isManager: boolean
  isTeacher: boolean
  status: InvitationStatus
  expiresAt: Date
  respondedAt: Date | null
  createdAt: Date
  invitedBy: { email: string; name: string }
  unit: { name: string; slug: string }
  organization: { name: string; slug: string }
}

const withDetails = {
  invitee: { select: { email: true, name: true, isActive: true } },
  invitedBy: { select: { email: true, name: true } },
  unit: { include: { organization: true } },
} satisfies Prisma.UnitInvitationInclude

type InvitationWithDetails = Prisma.UnitInvitationGetPayload<{ include: typeof withDetails }>

const DAY_MS = 24 * 60 * 60 * 1000

/** EXPIRED é calculado na leitura, como o plano (0006): nada é gravado quando o convite vence. */
const isExpired = ({ status, expiresAt }: { status: InvitationStatus; expiresAt: Date }) =>
  status === 'PENDING' && expiresAt <= new Date()

function statusFilter(status: InvitationStatus): Prisma.UnitInvitationWhereInput {
  const now = new Date()
  if (status === 'EXPIRED') return { status: 'PENDING', expiresAt: { lte: now } }
  if (status === 'PENDING') return { status: 'PENDING', expiresAt: { gt: now } }
  return { status }
}

@Injectable()
export class InvitationsService {
  private readonly ttlDays: number
  private readonly webAppUrl: string

  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlDays = config.get('UNIT_INVITE_TTL_DAYS', { infer: true })
    this.webAppUrl = config.get('WEB_APP_URL', { infer: true }).replace(/\/$/, '')
  }

  // --- Unidade: dono e responsável -------------------------------------------------------------

  async listForUnit(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { status }: ListInvitationsQuery,
  ): Promise<InvitationView[]> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    if (!access.isOwner && !access.isManager) throw new AppException('NOT_ALLOWED')

    const invitations = await this.database.unitInvitation.findMany({
      where: { unitId: access.unit.id, ...(status && statusFilter(status)) },
      include: withDetails,
      orderBy: { createdAt: 'desc' },
    })
    return invitations.map(toView)
  }

  /**
   * Usuário, cancelamento do pendente anterior e convite numa transação; o e-mail vai depois.
   * Se o envio falhar, o convite fica: convidar de novo resolve.
   */
  async invite(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { email, name, isManager, isTeacher }: CreateInvitationInput,
  ): Promise<InvitationView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    assertCanManageInvitation(access, isManager)
    await this.tenants.assertWritable(access)

    const unitId = access.unit.id
    const token = generateOpaqueToken()
    const invitation = await this.database.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } })
      if (existing && !existing.isActive) throw new AppException('USER_INACTIVE')

      // Sem conta: nasce sem assinatura e não verificado; entra depois pelo sign-up (0004).
      const invitee =
        existing ?? (await tx.user.create({ data: { email, name: name ?? email.split('@')[0] } }))

      const member = await tx.unitMember.findUnique({
        where: { unitId_userId: { unitId, userId: invitee.id } },
        select: { id: true },
      })
      if (member) throw new AppException('ALREADY_A_MEMBER')

      // Convidar de novo substitui: é o "reenviar".
      const now = new Date()
      await tx.unitInvitation.updateMany({
        where: { unitId, inviteeId: invitee.id, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'CANCELLED', respondedAt: now },
      })

      return tx.unitInvitation.create({
        data: {
          unitId,
          inviteeId: invitee.id,
          invitedById: userId,
          isManager,
          isTeacher,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now.getTime() + this.ttlDays * DAY_MS),
        },
        include: withDetails,
      })
    })

    const link = `${this.webAppUrl}/invitations/${token}`
    try {
      await this.mail.sendUnitInvitation({
        to: invitation.invitee.email,
        inviterName: invitation.invitedBy.name,
        unitName: invitation.unit.name,
        organizationName: invitation.unit.organization.name,
        isManager,
        isTeacher,
        acceptUrl: `${link}?action=accept`,
        rejectUrl: `${link}?action=reject`,
        expiresAt: invitation.expiresAt,
      })
    } catch {
      // O MailService já registrou o erro.
      throw new AppException('EMAIL_SEND_FAILED')
    }
    return toView(invitation)
  }

  async cancel(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    id: string,
  ): Promise<InvitationView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const invitation = await this.database.unitInvitation.findFirst({
      where: { id, unitId: access.unit.id },
      include: withDetails,
    })
    if (!invitation) throw new AppException('INVITATION_NOT_FOUND')

    assertCanManageInvitation(access, invitation.isManager)
    assertPending(invitation)
    await this.tenants.assertWritable(access)
    return this.markResponded(invitation, 'CANCELLED')
  }

  // --- Convidado ------------------------------------------------------------------------------

  /** Pendentes e válidos, em unidades e organizações ativas, mais novos primeiro. */
  async listMine(userId: string): Promise<InvitationView[]> {
    const invitations = await this.database.unitInvitation.findMany({
      where: {
        inviteeId: userId,
        ...statusFilter('PENDING'),
        unit: { isActive: true, organization: { isActive: true } },
      },
      include: withDetails,
      orderBy: { createdAt: 'desc' },
    })
    return invitations.map(toView)
  }

  /** Convite de outra pessoa dá o mesmo 404 que um inexistente. */
  async respondById(
    userId: string,
    id: string,
    action: 'accept' | 'reject',
  ): Promise<InvitationView> {
    const invitation = await this.database.unitInvitation.findFirst({
      where: { id, inviteeId: userId },
      include: withDetails,
    })
    return this.respond(found(invitation), action)
  }

  /** Pelo link do e-mail: público, em qualquer status, para o web mostrar "aceito", "vencido"… */
  async findByToken(token: string): Promise<InvitationView> {
    return toView(await this.byToken(token))
  }

  /** Aceitar pelo link não faz login nem verifica o e-mail. */
  async respondByToken(token: string, action: 'accept' | 'reject'): Promise<InvitationView> {
    return this.respond(await this.byToken(token), action)
  }

  private async byToken(token: string) {
    const invitation = await this.database.unitInvitation.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: withDetails,
    })
    return found(invitation)
  }

  /**
   * Aceitar passa por assertWritable e cria o membro (ou soma as flags às de quem já é); recusar
   * é só a resposta de quem foi convidado e não muda a equipe.
   */
  private async respond(invitation: InvitationWithDetails, action: 'accept' | 'reject') {
    assertPending(invitation)
    if (action === 'reject') return this.markResponded(invitation, 'REJECTED')

    const { unit } = invitation
    await this.tenants.assertWritable({
      organization: unit.organization,
      unit,
      isOwner: false,
      membership: null,
      isManager: false,
      isTeacher: false,
    })

    const { unitId, inviteeId: userId, isManager, isTeacher } = invitation
    return this.markResponded(invitation, 'ACCEPTED', (tx) =>
      tx.unitMember.upsert({
        where: { unitId_userId: { unitId, userId } },
        create: { unitId, userId, isManager, isTeacher },
        // true nunca vira false.
        update: { ...(isManager && { isManager: true }), ...(isTeacher && { isTeacher: true }) },
      }),
    )
  }

  /** `status: PENDING` no filtro: duas respostas simultâneas não passam as duas. */
  private async markResponded(
    invitation: InvitationWithDetails,
    status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
    effect?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<InvitationView> {
    const updated = await this.database.$transaction(async (tx) => {
      const { count } = await tx.unitInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status, respondedAt: new Date() },
      })
      if (count === 0) throw new AppException('INVITATION_NOT_PENDING')
      await effect?.(tx)
      return tx.unitInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
        include: withDetails,
      })
    })
    return toView(updated)
  }
}

/** Dono e responsável; convite com isManager, só o dono. */
function assertCanManageInvitation(access: UnitAccess, isManager: boolean) {
  const allowed = access.isOwner || (access.isManager && !isManager)
  if (!allowed) throw new AppException('NOT_ALLOWED')
}

function assertPending(invitation: { status: InvitationStatus; expiresAt: Date }) {
  if (isExpired(invitation)) throw new AppException('INVITATION_EXPIRED')
  if (invitation.status !== 'PENDING') throw new AppException('INVITATION_NOT_PENDING')
}

/** Inexistente, de outra pessoa ou de convidado inativo: o mesmo 404. */
function found(invitation: InvitationWithDetails | null): InvitationWithDetails {
  if (!invitation?.invitee.isActive) throw new AppException('INVITATION_NOT_FOUND')
  return invitation
}

function toView(invitation: InvitationWithDetails): InvitationView {
  const { id, invitee, invitedBy, unit, isManager, isTeacher } = invitation
  return {
    id,
    email: invitee.email,
    name: invitee.name,
    isManager,
    isTeacher,
    status: isExpired(invitation) ? 'EXPIRED' : invitation.status,
    expiresAt: invitation.expiresAt,
    respondedAt: invitation.respondedAt,
    createdAt: invitation.createdAt,
    invitedBy,
    unit: { name: unit.name, slug: unit.slug },
    organization: { name: unit.organization.name, slug: unit.organization.slug },
  }
}
