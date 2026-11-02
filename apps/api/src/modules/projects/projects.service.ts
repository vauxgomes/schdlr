import { Injectable } from '@nestjs/common'
import { Prisma, ProjectStatus, TermStatus } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isUniqueViolation } from '@infra/database/prisma-errors'
import { generateOfferings } from '@modules/offerings/generate-offerings'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'
import { TermAccessService } from '@modules/terms/term-access.service'
import { isProjectActionAllowed, isProjectVisible } from '@modules/terms/term-policy'

import { isProjectManagerOf, ProjectAccessService } from './project-access.service'
import {
  ChangeProjectStatusInput,
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from './schemas/project.schemas'

export type ProjectView = {
  id: string
  name: string
  status: ProjectStatus
  workingDays: number
  createdAt: Date
  updatedAt: Date
  term: { id: string; name: string; status: TermStatus }
  course: { id: string; name: string; code: string | null }
  curriculum: { id: string; name: string; code: string }
  createdBy: { id: string; email: string; name: string }
  access: { isProjectManager: boolean; canEdit: boolean; canPublish: boolean; canDelete: boolean }
}

const withDetails = {
  term: { select: { id: true, name: true, status: true } },
  curriculum: {
    select: {
      id: true,
      name: true,
      code: true,
      course: { select: { id: true, name: true, code: true, coordinatorId: true } },
    },
  },
  createdBy: { select: { id: true, email: true, name: true } },
} satisfies Prisma.ProjectInclude

type ProjectWithDetails = Prisma.ProjectGetPayload<{ include: typeof withDetails }>

/** Sábado é o dia 6 (0002). */
const SATURDAY = 6

/**
 * Projetos de horários da unidade (spec 0018): a grade de um curso, pelo currículo, num semestre.
 * O que se pode fazer e quem vê segue a matriz "status do semestre × projetos" da 0016.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly terms: TermAccessService,
    private readonly projects: ProjectAccessService,
  ) {}

  /** Só os que o usuário vê, projeto a projeto; semestres mais recentes primeiro. */
  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { termId, status }: ListProjectsQuery,
  ): Promise<ProjectView[]> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const projects = await this.database.project.findMany({
      where: { unitId: access.unit.id, ...(termId && { termId }), ...(status && { status }) },
      include: withDetails,
      orderBy: [{ term: { startDate: 'desc' } }, { name: 'asc' }],
    })
    return projects
      .map((project) => toView(project, access, userId))
      .filter((view) =>
        isProjectVisible(view.term.status, view.status, view.access.isProjectManager),
      )
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
  ): Promise<ProjectView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    return this.view(access.project.id, access, userId)
  }

  /**
   * Nasce PUBLISHED, criado por quem chamou: só se cria em PLANNING, onde os demais não veem
   * projeto nenhum, e despublicar é opcional (0018). O gestor é calculado pelo curso do currículo
   * escolhido: o coordenador cria só para o curso que coordena. Já nasce com as ofertas (0019).
   */
  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { name, termId, curriculumId, workingDays }: CreateProjectInput,
  ): Promise<ProjectView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)

    const term =
      z.cuid().safeParse(termId).success &&
      (await this.database.term.findFirst({ where: { id: termId, unitId: access.unit.id } }))
    if (!term) throw new AppException('TERM_NOT_FOUND')

    const curriculum =
      z.cuid().safeParse(curriculumId).success &&
      (await this.database.curriculum.findFirst({
        where: { id: curriculumId, course: { unitId: access.unit.id } },
        include: { course: true },
      }))
    if (!curriculum) throw new AppException('CURRICULUM_NOT_FOUND')

    const isProjectManager = isProjectManagerOf(access, curriculum.course, userId)
    await this.tenants.assertWritable(access)
    this.terms.assertProjectAction(
      { ...access, term, canManageTerm: access.isOwner || access.isManager },
      'create',
      { isProjectManager },
    )
    // Desativar curso ou currículo é "não usar em projeto novo" (0011, 0012).
    if (!curriculum.course.isActive) throw new AppException('COURSE_INACTIVE')
    if (!curriculum.isActive) throw new AppException('CURRICULUM_INACTIVE')
    await this.assertNameFree(term.id, name)

    try {
      // As ofertas nascem com o projeto, na mesma transação (0019).
      const project = await this.database.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            name,
            workingDays,
            unitId: access.unit.id,
            termId: term.id,
            curriculumId: curriculum.id,
            createdById: userId,
            // Não o default DRAFT do schema (0002).
            status: 'PUBLISHED',
          },
          include: withDetails,
        })
        await generateOfferings(tx, created)
        return created
      })
      return toView(project, access, userId)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('PROJECT_NAME_IN_USE')
      throw error
    }
  }

  /** Nome e dias letivos; semestre, currículo e status são fixos aqui. */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    body: UpdateProjectInput,
  ): Promise<ProjectView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    await this.projects.assertProjectWritable(access, 'edit')

    const { project } = access
    if (body.workingDays === 5 && project.workingDays === 6) {
      const saturdaySlots = await this.database.boardSlot.count({
        where: { board: { projectId: project.id }, weekday: SATURDAY },
      })
      if (saturdaySlots > 0) throw new AppException('WORKING_DAYS_IN_USE')
    }
    if (body.name) await this.assertNameFree(project.termId, body.name, project.id)

    try {
      await this.database.project.update({ where: { id: project.id }, data: body })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('PROJECT_NAME_IN_USE')
      throw error
    }
    return this.view(project.id, access, userId)
  }

  /** Publicar e despublicar são a ação `publish` da matriz. */
  async changeStatus(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
    { status }: ChangeProjectStatusInput,
  ): Promise<ProjectView> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    await this.projects.assertProjectWritable(access, 'publish')

    const from = access.project.status
    if (from === status) {
      throw new AppException('INVALID_PROJECT_TRANSITION', { from, to: status })
    }

    await this.database.project.update({ where: { id: access.project.id }, data: { status } })
    return this.view(access.project.id, access, userId)
  }

  /** Só em PLANNING; leva ofertas, quadros e células em cascata (0002). */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
  ): Promise<void> {
    const access = await this.projects.resolveProject(userId, orgSlug, unitSlug, projectId)
    await this.projects.assertProjectWritable(access, 'delete')
    await this.database.project.delete({ where: { id: access.project.id } })
  }

  private async view(projectId: string, access: UnitAccess, userId: string) {
    const project = await this.database.project.findUniqueOrThrow({
      where: { id: projectId },
      include: withDetails,
    })
    return toView(project, access, userId)
  }

  /** Nome único no semestre. */
  private async assertNameFree(termId: string, name: string, projectId?: string) {
    const taken = await this.database.project.findUnique({
      where: { termId_name: { termId, name } },
      select: { id: true },
    })
    if (taken && taken.id !== projectId) throw new AppException('PROJECT_NAME_IN_USE')
  }
}

/**
 * `access` é o que a matriz deixa a quem chamou, pelo status do semestre e o papel; organização
 * inativa e plano valem para a unidade inteira e ficam de fora.
 */
function toView(
  {
    id,
    name,
    status,
    workingDays,
    createdAt,
    updatedAt,
    term,
    curriculum: { course, ...curriculum },
    createdBy,
  }: ProjectWithDetails,
  access: UnitAccess,
  userId: string,
): ProjectView {
  const isProjectManager = isProjectManagerOf(access, course, userId)
  const roles = { isProjectManager }
  return {
    id,
    name,
    status,
    workingDays,
    createdAt,
    updatedAt,
    term,
    course: { id: course.id, name: course.name, code: course.code },
    curriculum,
    createdBy,
    access: {
      isProjectManager,
      canEdit: isProjectActionAllowed(term.status, 'edit', roles),
      canPublish: isProjectActionAllowed(term.status, 'publish', roles),
      canDelete: isProjectActionAllowed(term.status, 'delete', roles),
    },
  }
}
