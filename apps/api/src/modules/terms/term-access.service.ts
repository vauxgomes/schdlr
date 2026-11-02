import { Injectable } from '@nestjs/common'
import { Term } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

import {
  isProjectActionAllowed,
  isProjectActionOpen,
  isTermClosed,
  ProjectAction,
} from './term-policy'

export type TermAccess = UnitAccess & {
  term: Term
  canManageTerm: boolean // dono ou responsável
}

/**
 * O semestre de uma unidade que o usuário enxerga, e o que o status dele permite (spec 0016). O
 * papel é lido do banco a cada requisição; quem chama decide se basta.
 */
@Injectable()
export class TermAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  /** Semestre de outra unidade, inexistente ou com id fora do formato: 404. Não checa papel. */
  async resolveTerm(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    termId: string,
  ): Promise<TermAccess> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)

    const term =
      z.cuid().safeParse(termId).success &&
      (await this.database.term.findFirst({ where: { id: termId, unitId: access.unit.id } }))
    if (!term) throw new AppException('TERM_NOT_FOUND')

    return { ...access, term, canManageTerm: access.isOwner || access.isManager }
  }

  /** Escrita no próprio semestre: o assertWritable da unidade e, depois, semestre não fechado. */
  async assertTermWritable(access: TermAccess): Promise<void> {
    await this.tenants.assertWritable(access)
    if (isTermClosed(access.term.status)) throw new AppException('TERM_CLOSED')
  }

  /**
   * A matriz "status × projetos": primeiro o status (409), depois o papel (403). Não chama
   * assertWritable: a spec de projeto chama os dois. `isProjectManager` é o gestor deste projeto
   * (dono, responsável ou coordenador do curso), calculado pela spec de projeto.
   */
  assertProjectAction(
    { term }: TermAccess,
    action: ProjectAction,
    { isProjectManager }: { isProjectManager: boolean },
  ): void {
    if (!isProjectActionOpen(term.status, action)) {
      throw new AppException('TERM_STATUS_FORBIDS', { status: term.status, action })
    }
    if (!isProjectActionAllowed(term.status, action, { isProjectManager })) {
      throw new AppException('NOT_ALLOWED')
    }
  }
}
