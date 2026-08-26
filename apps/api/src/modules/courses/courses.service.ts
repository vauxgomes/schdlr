import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Course } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateCourseInput } from './dto/create-course.dto'
import { ListCoursesQuery } from './dto/list-courses.dto'
import { UpdateCourseInput } from './dto/update-course.dto'

const CODE_TAKEN = 'A course with this code already exists in this unit'

@Injectable()
export class CoursesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(context: UnitContext, input: CreateCourseInput) {
    assertManagement(context)

    const course = await withUniqueConflict(CODE_TAKEN, () =>
      this.db.course.create({ data: { unitId: context.unitId, ...input } }),
    )

    this.audit.record(AuditAction.CourseCreated, { type: 'course', id: course.id }, { ...input })

    return course
  }

  // Paginada desde o começo: o catálogo de uma unidade grande não cabe numa
  // resposta só, e trocar a forma depois quebraria todo consumidor.
  async list(context: UnitContext, query: ListCoursesQuery) {
    assertMemberOrOwnership(context)

    const where = { unitId: context.unitId, isActive: query.active }

    const [items, total] = await this.db.$transaction([
      this.db.course.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.course.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  // O essencial para preencher um combo, sem paginar: quem escolhe um curso
  // precisa da lista inteira, e só dos ativos.
  select(context: UnitContext) {
    assertMemberOrOwnership(context)

    return this.db.course.findMany({
      where: { unitId: context.unitId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    })
  }

  findOne(context: UnitContext, courseId: string) {
    assertMemberOrOwnership(context)

    return this.findInUnit(context, courseId)
  }

  async update(context: UnitContext, courseId: string, input: UpdateCourseInput) {
    assertManagement(context)

    await this.findInUnit(context, courseId)

    const course = await withUniqueConflict(CODE_TAKEN, () =>
      this.db.course.update({ where: { id: courseId }, data: input }),
    )

    this.audit.record(AuditAction.CourseUpdated, { type: 'course', id: course.id }, { ...input })

    return course
  }

  // Aposentar curso é `isActive: false`; o delete existe para o que nasceu
  // errado e nunca foi usado. Currículo vinculado é história de verdade, e
  // apagá-lo em cascata levaria junto os projetos que dependem dele.
  async remove(context: UnitContext, courseId: string) {
    assertManagement(context)

    await this.findInUnit(context, courseId)

    const curricula = await this.db.curriculum.count({ where: { courseId } })

    if (curricula > 0) {
      throw new ConflictException('Cannot delete a course that still has curricula')
    }

    await this.db.course.delete({ where: { id: courseId } })

    this.audit.record(AuditAction.CourseDeleted, { type: 'course', id: courseId })
  }

  // O unitId no where é o que impede alcançar curso do vizinho com um id
  // válido de lá: sem ele, a resposta viria 200 com dado de outra unidade.
  private async findInUnit(context: UnitContext, courseId: string): Promise<Course> {
    const course = await this.db.course.findFirst({
      where: { id: courseId, unitId: context.unitId },
    })

    if (!course) throw new NotFoundException('Course not found')

    return course
  }
}
