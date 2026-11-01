import { Injectable } from '@nestjs/common'
import { Course, Curriculum, Project } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'
import { TermAccess, TermAccessService } from '@modules/terms/term-access.service'
import { isProjectVisible, ProjectAction } from '@modules/terms/term-policy'

export type ProjectAccess = TermAccess & {
  project: Project
  curriculum: Curriculum
  course: Course
  isProjectManager: boolean // dono, responsável ou coordenador do curso do currículo
}

/** Gestor do projeto: dono da organização, responsável pela unidade ou coordenador do curso. */
export const isProjectManagerOf = (
  access: UnitAccess,
  course: Pick<Course, 'coordinatorId'>,
  userId: string,
) => access.isOwner || access.isManager || course.coordinatorId === userId

/**
 * O projeto de uma unidade que o usuário enxerga, e se ele pode ser escrito agora (spec 0018).
 * Aplica a visibilidade da matriz da 0016; o papel é lido do banco a cada requisição.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly terms: TermAccessService,
  ) {}

  /**
   * Projeto de outra unidade, inexistente, com id fora do formato ou que o usuário não vê: 404,
   * para quem não vê não descobrir que existe. Não checa a ação.
   */
  async resolveProject(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    projectId: string,
  ): Promise<ProjectAccess> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)

    const found =
      z.cuid().safeParse(projectId).success &&
      (await this.database.project.findFirst({
        where: { id: projectId, unitId: access.unit.id },
        include: { term: true, curriculum: { include: { course: true } } },
      }))
    if (!found) throw new AppException('PROJECT_NOT_FOUND')

    const {
      term,
      curriculum: { course, ...curriculum },
      ...project
    } = found
    const isProjectManager = isProjectManagerOf(access, course, userId)
    if (!isProjectVisible(term.status, project.status, isProjectManager)) {
      throw new AppException('PROJECT_NOT_FOUND')
    }

    return {
      ...access,
      term,
      canManageTerm: access.isOwner || access.isManager,
      project,
      curriculum,
      course,
      isProjectManager,
    }
  }

  /**
   * Toda escrita em projeto, oferta, quadro e célula: o assertWritable da unidade e, depois, a
   * matriz da 0016 (status do semestre 409, papel 403). Oferta, quadro e célula usam `edit`.
   */
  async assertProjectWritable(
    access: ProjectAccess,
    action: ProjectAction = 'edit',
  ): Promise<void> {
    await this.tenants.assertWritable(access)
    this.terms.assertProjectAction(access, action, { isProjectManager: access.isProjectManager })
  }
}
