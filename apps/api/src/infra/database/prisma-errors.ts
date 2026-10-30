import { Prisma } from '@prisma/client'

/** Violação de unique (P2002): o banco barrou um registro repetido, em geral numa corrida. */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
