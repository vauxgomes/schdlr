import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { ProjectAccess, ProjectAccessService } from '@modules/projects/project-access.service'
import { teacherName } from '@modules/teachers/teacher-name'

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
  teacher: {
    id: string
    name: string
    user: { id: string; email: string; name: string } | null
  } | null
  slotsCount: number
  weeklyMinutes: number
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
  teacher: {
    select: { id: true, name: true, user: { select: { id: true, email: true, name: true } } },
  },
  // As durações dos horários das células, em todos os quadros: slotsCount e weeklyMinutes (0020).
  boardSlots: { select: { timeSlot: { select: { startTime: true, endTime: true } } } },
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

  /**
   * Define, troca ou tira o professor: trocar a vaga pela pessoa é trocar o Teacher (0021). O
   * mesmo professor em várias ofertas é permitido.
   */
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
    if (teacherId && teacherId !== offering.teacherId) await this.assertTeacher(access, teacherId)

    const updated = await this.database.offering.update({
      where: { id: offering.id },
      data: { teacherId },
      include: withDetails,
    })
    return toView(updated)
  }

  /**
   * Desaloca as células da oferta e a apaga, na mesma transação. Célula que ficaria vazia (sem
   * local) é apagada; a que tem local fica, sem oferta (0020). Quem decide é a aplicação, não a FK.
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
      this.database.boardSlot.deleteMany({ where: { offeringId: offering.id, locationId: null } }),
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

  /**
   * Teacher da organização da unidade (0021); desativado não entra em oferta nova, mas fica nas que
   * já o tinham.
   */
  private async assertTeacher({ unit }: ProjectAccess, teacherId: string) {
    const teacher =
      z.cuid().safeParse(teacherId).success &&
      (await this.database.teacher.findFirst({
        where: { id: teacherId, organizationId: unit.organizationId },
        select: { isActive: true },
      }))
    if (!teacher) throw new AppException('INVALID_TEACHER')
    if (!teacher.isActive) throw new AppException('TEACHER_INACTIVE')
  }
}

function toView({
  id,
  subject,
  teacher,
  boardSlots,
  createdAt,
  updatedAt,
}: OfferingWithDetails): OfferingView {
  const weeklyMinutes = boardSlots.reduce(
    (total, { timeSlot }) => total + timeSlot.endTime - timeSlot.startTime,
    0,
  )
  return {
    id,
    subject,
    teacher: teacher && { ...teacher, name: teacherName(teacher) },
    slotsCount: boardSlots.length,
    weeklyMinutes,
    createdAt,
    updatedAt,
  }
}
