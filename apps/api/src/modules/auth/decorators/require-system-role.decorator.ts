import { SetMetadata } from '@nestjs/common'
import { SystemRole } from '@prisma/client'

export const REQUIRED_SYSTEM_ROLE_KEY = 'requiredSystemRole'

/** Papel mínimo para a rota: `USER < SUPPORT < MASTER`, então 'SUPPORT' também aceita o master. */
export const RequireSystemRole = (role: Exclude<SystemRole, 'USER'>) =>
  SetMetadata(REQUIRED_SYSTEM_ROLE_KEY, role)
