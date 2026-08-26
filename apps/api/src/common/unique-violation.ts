import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const UNIQUE_VIOLATION = 'P2002'

// O unique do banco é a única checagem que não é corrida: conferir com um
// findFirst antes do insert deixa janela entre a consulta e a escrita. Por
// isso o conflito nasce do catch, e o `message` é o que o módulo sabe dizer
// sobre a coluna que colidiu.
export async function withUniqueConflict<T>(
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      throw new ConflictException(message)
    }

    throw error
  }
}
