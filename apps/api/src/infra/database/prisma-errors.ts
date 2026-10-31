import { Prisma } from '@prisma/client'

/** Violação de unique (P2002): o banco barrou um registro repetido, em geral numa corrida. */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

/** Violação de FK (P2003): um Restrict barrou o delete, porque ainda há quem aponte para a linha. */
export const isForeignKeyViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
