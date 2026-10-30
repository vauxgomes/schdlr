import { SystemRole, User } from '@prisma/client'

/** O usuário autenticado como sai da API, em `sign-in` e `me`. */
export type AuthUser = { id: string; email: string; name: string; systemRole: SystemRole }

export function toAuthUser({ id, email, name, systemRole }: User): AuthUser {
  return { id, email, name, systemRole }
}
