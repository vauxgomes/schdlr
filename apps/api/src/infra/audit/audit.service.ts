import { Inject, Injectable, Logger } from '@nestjs/common'
import { AuditAction, AuditEntry } from './audit-actions'
import { AuditSubjectRef, currentAuditContext } from './audit-context'
import { AUDIT_SINKS, AuditSink } from './audit-sink'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(
    @Inject(AUDIT_SINKS) private readonly sinks: AuditSink[],
    private readonly db: DatabaseService,
  ) {}

  // Fail open: a spec 0022 registra que a trilha é melhor-esforço. Derrubar
  // uma operação que já deu certo por causa do registro dela seria pior.
  record(action: AuditAction, subject: AuditSubjectRef, data: Record<string, unknown> = {}) {
    void this.emit('ok', action, subject, data)
  }

  recordDenied(subject: AuditSubjectRef, data: Record<string, unknown> = {}) {
    void this.emit('denied', AuditAction.AccessDenied, subject, data)
  }

  private async emit(
    outcome: AuditEntry['outcome'],
    action: AuditAction,
    subject: AuditSubjectRef,
    data: Record<string, unknown>,
  ) {
    if (this.sinks.length === 0) return

    const context = currentAuditContext()

    if (!context) return

    try {
      // O nome é resolvido aqui, e não no interceptor: só os caminhos
      // auditados pagam a consulta, em vez de toda requisição.
      const actor = await this.db.user.findUniqueOrThrow({
        where: { id: context.userId },
        select: { name: true },
      })

      const entry: AuditEntry = {
        timestamp: new Date(),
        outcome,
        actorId: context.userId,
        actorName: actor.name,
        memberId: context.memberId,
        unitId: context.unitId,
        action,
        subjectType: subject.type,
        subjectId: subject.id,
        requestId: context.requestId,
        data,
      }

      // O `async` embrulha sinks síncronos — o de arquivo escreve direto no
      // stream, um futuro de banco devolveria promise.
      await Promise.all(this.sinks.map(async (sink) => sink.write(entry)))
    } catch (error) {
      this.logger.error(`Failed to record ${action}`, error)
    }
  }
}
