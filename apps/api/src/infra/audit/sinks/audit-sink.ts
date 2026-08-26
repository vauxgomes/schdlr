import { AuditEntry } from '../audit-entry'

export const AUDIT_SINKS = Symbol('AUDIT_SINKS')

// O ponto de extensão da spec 0022: destino novo é uma classe que implementa
// isto e uma linha no módulo. Nenhum service muda.
export interface AuditSink {
  write(entry: AuditEntry): void | Promise<void>
}
