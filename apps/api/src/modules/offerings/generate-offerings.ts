import { Prisma } from '@prisma/client'

import { DatabaseService } from '@infra/database/database.service'

type Tx = Prisma.TransactionClient | DatabaseService

/**
 * Uma oferta sem professor para cada disciplina ativa do currículo que ainda não tem oferta no
 * projeto (spec 0019). Só acréscimo: não apaga, não troca professor, não mexe em célula. Função
 * solta, e não service, para o ProjectsService chamar dentro da transação do create sem o
 * ProjectsModule depender do OfferingsModule, que depende dele.
 *
 * O skipDuplicates, apoiado no unique (projectId, subjectId), segura duas gerações simultâneas;
 * o que volta é quantas esta chamada de fato criou.
 */
export async function generateOfferings(
  tx: Tx,
  project: { id: string; curriculumId: string },
): Promise<number> {
  const missing = await tx.subject.findMany({
    where: {
      curriculumId: project.curriculumId,
      isActive: true,
      offerings: { none: { projectId: project.id } },
    },
    select: { id: true },
  })
  if (missing.length === 0) return 0

  const { count } = await tx.offering.createMany({
    data: missing.map(({ id }) => ({ projectId: project.id, subjectId: id })),
    skipDuplicates: true,
  })
  return count
}
