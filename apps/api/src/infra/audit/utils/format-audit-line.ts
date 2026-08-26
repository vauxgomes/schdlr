import { AuditEntry } from '../audit-entry'

// Gramática de campo fixo, documentada na spec 0022. Ordem e presença dos
// campos são contrato: consumidor lê por regex, e campo que some desloca tudo
// à direita. `data` fica por último por ser o único de tamanho livre.
const NULL_FIELD = '-'

// O nome é o único campo com espaço, então vai entre aspas — e aspas dentro
// dele quebrariam o casamento, por isso viram apóstrofo.
function quoteName(name: string) {
  return `"${name.replace(/["\r\n]/g, "'")}"`
}

export function formatAuditLine(entry: AuditEntry) {
  return [
    entry.timestamp.toISOString(),
    'audit/1',
    `outcome=${entry.outcome}`,
    `actor=${entry.actorId}`,
    `actor.name=${quoteName(entry.actorName)}`,
    `member=${entry.memberId ?? NULL_FIELD}`,
    `unit=${entry.unitId ?? NULL_FIELD}`,
    `action=${entry.action}`,
    `subject=${entry.subjectType}:${entry.subjectId}`,
    `req=${entry.requestId}`,
    `data=${JSON.stringify(entry.data)}`,
  ].join(' ')
}
