import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InviteStatus, Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { Env } from '../../config/env'
import { UnitInviteCreatedPayload, UnitInviteEvent } from '../../events/unit-invite.events'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement } from '../units/utils/permissions'
import { CreateInviteInput, ListInvitesQuery } from './dto/create-invite.dto'

const INVITE_LIST = {
  id: true,
  email: true,
  roles: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  resolvedAt: true,
  resentAt: true,
} satisfies Prisma.UnitInviteSelect

@Injectable()
export class InvitesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventEmitter2,
  ) {}

  async create(context: UnitContext, userId: string, input: CreateInviteInput) {
    assertManagement(context)

    const invited = await this.db.user.findUnique({ where: { email: input.email } })

    if (invited) {
      const member = await this.db.unitMember.findUnique({
        where: { userId_unitId: { userId: invited.id, unitId: context.unitId } },
      })

      // Membro inativo pode ser reconvidado — aceitar reativa a linha que já
      // existe. Ativo, não: já está dentro.
      if (member?.isActive) {
        throw new ConflictException('This person is already an active member of this unit')
      }
    }

    const invite = await this.db.unitInvite.create({
      data: {
        unitId: context.unitId,
        email: input.email,
        userId: invited?.id,
        roles: input.roles,
        token: this.newToken(),
        expiresAt: this.newExpiry(),
        invitedById: userId,
      },
    })

    await this.announce(invite.id)

    return this.db.unitInvite.findUniqueOrThrow({ where: { id: invite.id }, select: INVITE_LIST })
  }

  list(context: UnitContext, query: ListInvitesQuery) {
    assertManagement(context)

    return this.db.unitInvite.findMany({
      where: { unitId: context.unitId, ...(query.status ? { status: query.status } : {}) },
      select: INVITE_LIST,
      orderBy: { createdAt: 'desc' },
    })
  }

  // Quem convidou pode revogar o próprio convite mesmo sem ser gestão — foi
  // ele quem abriu a porta.
  async revoke(context: UnitContext, userId: string, inviteId: string) {
    const invite = await this.findPending(context, inviteId)

    if (invite.invitedById !== userId) assertManagement(context)

    return this.db.unitInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.REVOKED, resolvedAt: new Date(), resolvedById: userId },
      select: INVITE_LIST,
    })
  }

  async resend(context: UnitContext, userId: string, inviteId: string) {
    assertManagement(context)

    const invite = await this.findPending(context, inviteId)

    await this.db.unitInvite.update({
      where: { id: invite.id },
      data: {
        token: this.newToken(),
        expiresAt: this.newExpiry(),
        resentAt: new Date(),
        resentById: userId,
      },
    })

    await this.announce(invite.id)

    return this.db.unitInvite.findUniqueOrThrow({ where: { id: invite.id }, select: INVITE_LIST })
  }

  async preview(token: string) {
    const invite = await this.db.unitInvite.findUnique({
      where: { token },
      select: {
        email: true,
        roles: true,
        status: true,
        expiresAt: true,
        unit: { select: { name: true } },
      },
    })

    if (!invite) throw new NotFoundException('Invite not found')

    return invite
  }

  async accept(token: string, userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } })
    const invite = await this.assertAcceptable(token, user)

    // Reconvite de ex-membro reativa a linha existente: criar outra esbarraria
    // no unique de (userId, unitId) e deixaria histórico órfão.
    const [member] = await this.db.$transaction([
      this.db.unitMember.upsert({
        where: { userId_unitId: { userId: user.id, unitId: invite.unitId } },
        create: { userId: user.id, unitId: invite.unitId, roles: invite.roles },
        update: { roles: invite.roles, isActive: true },
      }),
      this.db.unitInvite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.ACCEPTED,
          userId: user.id,
          resolvedAt: new Date(),
          resolvedById: user.id,
        },
      }),
    ])

    return member
  }

  async reject(token: string, userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } })
    const invite = await this.assertAcceptable(token, user)

    await this.db.unitInvite.update({
      where: { id: invite.id },
      data: {
        status: InviteStatus.REJECTED,
        userId: user.id,
        resolvedAt: new Date(),
        resolvedById: user.id,
      },
    })
  }

  // Aceitar e recusar são do convidado: a autorização é o token mais a
  // identidade, não papel na unidade — ele ainda não tem nenhum. O e-mail vem
  // do banco porque o JWT não o carrega, por decisão da 0003.
  private async assertAcceptable(token: string, user: { id: string; email: string }) {
    const invite = await this.db.unitInvite.findUnique({ where: { token } })

    if (!invite) throw new NotFoundException('Invite not found')

    if (invite.userId !== user.id && invite.email !== user.email) {
      throw new ForbiddenException('This invite was addressed to someone else')
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException(`This invite is ${invite.status.toLowerCase()}`)
    }

    if (invite.expiresAt <= new Date()) {
      throw new BadRequestException('This invite has expired')
    }

    return invite
  }

  private async findPending(context: UnitContext, inviteId: string) {
    const invite = await this.db.unitInvite.findFirst({
      where: { id: inviteId, unitId: context.unitId },
    })

    if (!invite) throw new NotFoundException('Invite not found')

    if (invite.status !== InviteStatus.PENDING) {
      throw new ConflictException(`This invite is already ${invite.status.toLowerCase()}`)
    }

    return invite
  }

  private async announce(inviteId: string) {
    const invite = await this.db.unitInvite.findUniqueOrThrow({
      where: { id: inviteId },
      include: { unit: { select: { name: true } } },
    })

    const payload: UnitInviteCreatedPayload = {
      inviteId: invite.id,
      unitId: invite.unitId,
      unitName: invite.unit.name,
      email: invite.email,
      userId: invite.userId,
      roles: invite.roles,
      token: invite.token,
      expiresAt: invite.expiresAt,
    }

    this.events.emit(UnitInviteEvent.Created, payload)
  }

  private newToken() {
    return randomBytes(32).toString('hex')
  }

  private newExpiry() {
    const days = this.config.get('UNIT_INVITE_TTL_DAYS', { infer: true })

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  }
}
