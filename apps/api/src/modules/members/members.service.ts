import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

import { UpdateMemberInput } from './schemas/member.schemas'

export type MemberView = {
  userId: string
  email: string
  name: string
  isManager: boolean
  isTeacher: boolean
  createdAt: Date
}

const withUser = {
  user: { select: { email: true, name: true } },
} satisfies Prisma.UnitMemberInclude

type MemberWithUser = Prisma.UnitMemberGetPayload<{ include: typeof withUser }>

/** Só o dono cria, promove ou remove responsável; o responsável cuida do resto da equipe. */
@Injectable()
export class MembersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  /** Qualquer um que enxerga a unidade. */
  async list(userId: string, orgSlug: string, unitSlug: string): Promise<MemberView[]> {
    const { unit } = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const members = await this.database.unitMember.findMany({
      where: { unitId: unit.id },
      include: withUser,
      orderBy: { user: { name: 'asc' } },
    })
    return members.map(toView)
  }

  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    targetId: string,
    body: UpdateMemberInput,
  ): Promise<MemberView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const target = await this.findMember(access, targetId)

    // isManager só o dono, mesmo que o valor não mude.
    const allowed = access.isOwner || (access.isManager && body.isManager === undefined)
    if (!allowed) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const updated = await this.database.unitMember.update({
      where: { id: target.id },
      data: body,
      include: withUser,
    })
    return toView(updated)
  }

  /**
   * Remove o membro, ou o próprio sai. Apaga a linha: UnitMember não tem isActive. Quem sai deixa
   * de coordenar os cursos da unidade (0011).
   */
  async remove(userId: string, orgSlug: string, unitSlug: string, targetId: string): Promise<void> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const target = await this.findMember(access, targetId)

    const leaving = targetId === userId
    const allowed = leaving || access.isOwner || (access.isManager && !target.isManager)
    if (!allowed) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    await this.database.$transaction([
      this.database.course.updateMany({
        where: { unitId: access.unit.id, coordinatorId: targetId },
        data: { coordinatorId: null },
      }),
      this.database.unitMember.delete({ where: { id: target.id } }),
    ])
  }

  private async findMember({ unit }: UnitAccess, userId: string) {
    const member = await this.database.unitMember.findUnique({
      where: { unitId_userId: { unitId: unit.id, userId } },
    })
    if (!member) throw new AppException('MEMBER_NOT_FOUND')
    return member
  }
}

function toView({ userId, user, isManager, isTeacher, createdAt }: MemberWithUser): MemberView {
  return { userId, email: user.email, name: user.name, isManager, isTeacher, createdAt }
}
