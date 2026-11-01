import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'

import { generateOfferings } from './generate-offerings'
import { ListOfferingsQuery, UpdateOfferingInput } from './schemas/offering.schemas'

export type OfferingView = {
  id: string
  subject: {
    id: string
    name: string
    code: string
    workload: number
    level: number
    color: string
    isActive: boolean
  }
  teacher: { id: string; email: string; name: string } | null
  slotsCount: number
  createdAt: Date
  updatedAt: Date
}

const withDetails = {
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
      workload: true,
      level: true,
      color: true,
      isActive: true,
    },
  },
  teacher: { select: { id: true, email: true, name: true } },
  _count: { select: { boardSlots: true } },
} satisfies Prisma.OfferingInclude

type OfferingWithDetails = Prisma.OfferingGetPayload<{ include: typeof withDetails }>

// Como a grade da 0013.
const bySubject = [
  { subject: { level: 'asc' } },
  { subject: { code: 'asc' } },
] satisfies Prisma.OfferingOrderByWithRelationInput[]

/**
 * As ofertas de um projeto (spec 0019): uma por disciplina do currículo, a única fonte é a
 * geração. Lê quem vê o projeto; escreve quem a matriz da 0016 deixa editar.
 */
@Injectable()
export class OfferingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectAccessService,
  ) {}

  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    { teacherId, withoutTeacher }: ListOfferingsQuery,
  ): Promise<OfferingView[]> {
    const { project } = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const offerings = await this.database.offering.findMany({
      where: {
        projectId: project.id,
        AND: [teacherId ? { teacherId } : {}, withoutTeacher ? { teacherId: null } : {}],
      },
      include: withDetails,
      orderBy: bySubject,
    })
    return offerings.map(toView)
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    offeringId: string,
  ): Promise<OfferingView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    return toView(await this.findOffering(access, offeringId))
  }

  /** Define ou tira o professor. O mesmo professor em várias ofertas é permitido. */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    offeringId: string,
    { teacherId }: UpdateOfferingInput,
  ): Promise<OfferingView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const offering = await this.findOffering(access, offeringId)
    await this.projects.assertProjectWritable(access)
    if (teacherId) await this.assertTeacher(access, teacherId)

    const updated = await this.database.offering.update({
      where: { id: offering.id },
      data: { teacherId },
      include: withDetails,
    })
    return toView(updated)
  }

  /**
   * Desaloca as células da oferta e a apaga, na mesma transação. As células ficam no quadro, com
   * o local; quem desaloca é a aplicação, não a FK.
   */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    offeringId: string,
  ): Promise<void> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    const offering = await this.findOffering(access, offeringId)
    await this.projects.assertProjectWritable(access)

    await this.database.$transaction([
      this.database.boardSlot.updateMany({
        where: { offeringId: offering.id },
        data: { offeringId: null },
      }),
      this.database.offering.delete({ where: { id: offering.id } }),
    ])
  }

  /** Só acréscimo, das disciplinas ativas; responde com a lista inteira do projeto. */
  async generate(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
  ): Promise<{ created: number; offerings: OfferingView[] }> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    await this.projects.assertProjectWritable(access)

    const created = await generateOfferings(this.database, access.project)
    const offerings = await this.database.offering.findMany({
      where: { projectId: access.project.id },
      include: withDetails,
      orderBy: bySubject,
    })
    return { created, offerings: offerings.map(toView) }
  }

  /** De outro projeto, inexistente ou id fora do formato: 404. */
  private async findOffering({ project }: ProjectAccess, offeringId: string) {
    const offering =
      z.cuid().safeParse(offeringId).success &&
      (await this.database.offering.findFirst({
        where: { id: offeringId, projectId: project.id },
        include: withDetails,
      }))
    if (!offering) throw new AppException('OFFERING_NOT_FOUND')
    return offering
  }

  /** Professor da unidade: membro com isTeacher e usuário ativo (0002). */
  private async assertTeacher({ unit }: ProjectAccess, teacherId: string) {
    const member =
      z.cuid().safeParse(teacherId).success &&
      (await this.database.unitMember.findFirst({
        where: { unitId: unit.id, userId: teacherId, isTeacher: true, user: { isActive: true } },
        select: { id: true },
      }))
    if (!member) throw new AppException('INVALID_TEACHER')
  }
}

function toView({
  id,
  subject,
  teacher,
  _count,
  createdAt,
  updatedAt,
}: OfferingWithDetails): OfferingView {
  return { id, subject, teacher, slotsCount: _count.boardSlots, createdAt, updatedAt }
}
