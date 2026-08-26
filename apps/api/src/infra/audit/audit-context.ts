import { AsyncLocalStorage } from 'node:async_hooks'

export type AuditSubjectRef = {
  type: string
  id: string
}

// `recordDenied` viaja no contexto de propósito: os `assert*` são funções
// puras e não podem injetar service. Em vez de um singleton mutável, o
// interceptor entrega a capacidade junto com os dados da requisição.
export type AuditContext = {
  userId: string
  memberId: string | null
  unitId: string | null
  requestId: string
  route: string
  recordDenied: (subject: AuditSubjectRef, data?: Record<string, unknown>) => void
}

export const auditStorage = new AsyncLocalStorage<AuditContext>()

export function currentAuditContext() {
  return auditStorage.getStore()
}
