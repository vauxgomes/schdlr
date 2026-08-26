import { Logger } from '@nestjs/common'
import { createWriteStream, mkdirSync, WriteStream } from 'node:fs'
import { join } from 'node:path'
import { AuditEntry } from '../audit-entry'
import { AuditSink } from './audit-sink'
import { formatAuditLine } from '../utils/format-audit-line'

export class FileAuditSink implements AuditSink {
  private readonly logger = new Logger(FileAuditSink.name)
  private stream: WriteStream | null = null
  private day = ''

  constructor(private readonly directory: string) {
    mkdirSync(this.directory, { recursive: true })
  }

  write(entry: AuditEntry) {
    this.streamFor(entry.timestamp).write(`${formatAuditLine(entry)}\n`)
  }

  // Um arquivo por dia: dá fatiamento sem logrotate, e grep por data vira grep
  // num arquivo só.
  private streamFor(at: Date) {
    const day = at.toISOString().slice(0, 10)

    if (this.stream && this.day === day) return this.stream

    this.stream?.end()
    this.day = day
    this.stream = createWriteStream(join(this.directory, `audit-${day}.log`), { flags: 'a' })

    // Sem handler, disco cheio ou EPIPE derruba o processo — a auditoria
    // viraria a causa da queda que deveria registrar.
    this.stream.on('error', (error) => this.logger.error('Audit sink failed', error))

    return this.stream
  }
}
