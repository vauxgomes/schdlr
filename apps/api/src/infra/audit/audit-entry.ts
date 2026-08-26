import { AuditAction } from './audit-actions'

// A forma do registro, separada do vocabulário: um diz o que aconteceu, o
// outro diz como se guarda o que aconteceu.
export type AuditEntry = {
  timestamp: Date
  outcome: 'ok' | 'denied'
  actorId: string
  actorName: string
  memberId: string | null
  unitId: string | null
  action: AuditAction
  subjectType: string
  subjectId: string
  requestId: string
  data: Record<string, unknown>
}
