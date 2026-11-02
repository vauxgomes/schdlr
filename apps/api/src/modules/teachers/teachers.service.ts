import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import { OrganizationAccess, TenantAccessService } from '@modules/tenancy/tenant-access.service'

import {
  CreateTeacherInput,
  isTeacherReactivation,
  ListTeachersQuery,
  UpdateTeacherInput,
} from './schemas/teacher.schemas'
import { teacherName } from './teacher-name'

export type TeacherView = {
  id: string
  name: string
  area: string | null
  notes: string | null
  isActive: boolean
  user: { id: string; email: string; name: string } | null
  offeringsCount: number
  createdAt: Date
  updatedAt: Date
  access: { canManage: boolean }
}

const withDetails = {
  user: { select: { id: true, email: true, name: true } },
  _count: { select: { offerings: true } },
} satisfies Prisma.TeacherInclude

type TeacherWithDetails = Prisma.TeacherGetPayload<{ include: typeof withDetails }>

type TeacherAccess = OrganizationAccess & { canManage: boolean }

/**
 * Professores da organização (spec 0021): um professor dá aula em qualquer unidade dela. Sem
 * usuário, é uma vaga a contratar; o usuário é definido só na criação e nunca muda.
 */
@Injectable()
export class TeachersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  /** Todo membro lê: é desta lista que se escolhe o professor da oferta. */
  async list(
    userId: string,
    orgSlug: string,
    { q, active, linked }: ListTeachersQuery,
  ): Promise<TeacherView[]> {
    const access = await this.resolve(userId, orgSlug)
    const teachers = await this.database.teacher.findMany({
      where: {
        organizationId: access.organization.id,
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { user: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }),
        ...(active !== undefined && { isActive: active }),
        ...(linked !== undefined && { userId: linked ? { not: null } : null }),
      },
      include: withDetails,
    })
    // Pelo nome devolvido, que no professor com usuário é o do usuário: a ordem sai em memória.
    return teachers
      .map((teacher) => toView(teacher, access))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  async get(userId: string, orgSlug: string, teacherId: string): Promise<TeacherView> {
    const access = await this.resolve(userId, orgSlug)
    return toView(await this.findTeacher(access, teacherId), access)
  }

  /** Sem userId, uma vaga; com userId, a pessoa, que tem de ser membro ativo da organização. */
  async create(
    userId: string,
    orgSlug: string,
    { userId: teacherUserId, ...body }: CreateTeacherInput,
  ): Promise<TeacherView> {
    const access = await this.resolve(userId, orgSlug)
    if (!access.canManage) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const organizationId = access.organization.id
    if (teacherUserId) await this.assertUserFree(organizationId, teacherUserId)
    await this.assertNameFree(organizationId, body.name)

    try {
      const teacher = await this.database.teacher.create({
        data: { ...body, organizationId, userId: teacherUserId ?? null },
        include: withDetails,
      })
      return toView(teacher, access)
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Uma corrida: o usuário virou professor, ou o nome foi tomado, entre a leitura e o create.
        if (teacherUserId) await this.assertUserFree(organizationId, teacherUserId)
        throw new AppException('TEACHER_NAME_IN_USE')
      }
      throw error
    }
  }

  async update(
    userId: string,
    orgSlug: string,
    teacherId: string,
    body: UpdateTeacherInput,
  ): Promise<TeacherView> {
    const access = await this.resolve(userId, orgSlug)
    const teacher = await this.findTeacher(access, teacherId)
    if (!access.canManage) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    if (!teacher.isActive && !isTeacherReactivation(body)) {
      throw new AppException('TEACHER_INACTIVE')
    }

    if (body.name) await this.assertNameFree(access.organization.id, body.name, teacher.id)

    try {
      const updated = await this.database.teacher.update({
        where: { id: teacher.id },
        data: body,
        include: withDetails,
      })
      return toView(updated, access)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('TEACHER_NAME_IN_USE')
      throw error
    }
  }

  /**
   * Só a vaga que não pesa na grade: sem usuário e sem oferta alocada em célula. As ofertas dele
   * que não estão alocadas ficam sem professor, na mesma transação; quem solta é a aplicação.
   */
  async remove(userId: string, orgSlug: string, teacherId: string): Promise<void> {
    const access = await this.resolve(userId, orgSlug)
    const teacher = await this.findTeacher(access, teacherId)
    if (!access.canManage) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    if (teacher.userId) throw new AppException('TEACHER_HAS_USER')
    const allocated = await this.database.offering.count({
      where: { teacherId: teacher.id, boardSlots: { some: {} } },
    })
    if (allocated > 0) throw new AppException('TEACHER_IN_USE')

    try {
      await this.database.$transaction([
        this.database.offering.updateMany({
          where: { teacherId: teacher.id, boardSlots: { none: {} } },
          data: { teacherId: null },
        }),
        this.database.teacher.delete({ where: { id: teacher.id } }),
      ])
    } catch (error) {
      // Uma oferta alocada entre a leitura e o delete: o Restrict de Offering.teacherId barra.
      if (isForeignKeyViolation(error)) throw new AppException('TEACHER_IN_USE')
      throw error
    }
  }

  /** Escreve o dono ou o responsável por alguma unidade ativa: os gestores de unidade. */
  private async resolve(userId: string, orgSlug: string): Promise<TeacherAccess> {
    const access = await this.tenants.resolveOrganization(userId, orgSlug)
    if (access.isOwner) return { ...access, canManage: true }

    const manager = await this.database.unitMember.findFirst({
      where: {
        userId,
        isManager: true,
        unit: { organizationId: access.organization.id, isActive: true },
      },
      select: { id: true },
    })
    return { ...access, canManage: !!manager }
  }

  /** De outra organização, inexistente ou com id fora do formato: 404. */
  private async findTeacher({ organization }: OrganizationAccess, teacherId: string) {
    const teacher =
      z.cuid().safeParse(teacherId).success &&
      (await this.database.teacher.findFirst({
        where: { id: teacherId, organizationId: organization.id },
        include: withDetails,
      }))
    if (!teacher) throw new AppException('TEACHER_NOT_FOUND')
    return teacher
  }

  /** Membro de alguma unidade ativa da organização, usuário ativo, e ainda não professor nela. */
  private async assertUserFree(organizationId: string, userId: string) {
    const member =
      z.cuid().safeParse(userId).success &&
      (await this.database.unitMember.findFirst({
        where: { userId, unit: { organizationId, isActive: true }, user: { isActive: true } },
        select: { id: true },
      }))
    if (!member) throw new AppException('INVALID_TEACHER_USER')

    const teacher = await this.database.teacher.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true },
    })
    if (teacher) throw new AppException('USER_ALREADY_TEACHER')
  }

  /** Nome único na organização. */
  private async assertNameFree(organizationId: string, name: string, teacherId?: string) {
    const taken = await this.database.teacher.findUnique({
      where: { organizationId_name: { organizationId, name } },
      select: { id: true },
    })
    if (taken && taken.id !== teacherId) throw new AppException('TEACHER_NAME_IN_USE')
  }
}

function toView(
  { id, name, area, notes, isActive, user, _count, createdAt, updatedAt }: TeacherWithDetails,
  { canManage }: TeacherAccess,
): TeacherView {
  return {
    id,
    name: teacherName({ name, user }),
    area,
    notes,
    isActive,
    user,
    offeringsCount: _count.offerings,
    createdAt,
    updatedAt,
    access: { canManage },
  }
}
