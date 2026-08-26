import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { Env } from '../../config/env'
import { AUDIT_SINKS, AuditSink } from './audit-sink'
import { AuditContextInterceptor } from './audit.interceptor'
import { AuditService } from './audit.service'
import { FileAuditSink } from './file-audit.sink'

// Global porque quase todo service de domínio registra. Importar em cada
// módulo seria ruído, pelo mesmo motivo do DatabaseModule.
@Global()
@Module({
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
    {
      provide: AUDIT_SINKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): AuditSink[] => {
        const directory = config.get('AUDIT_LOG_PATH', { infer: true })

        return directory ? [new FileAuditSink(directory)] : []
      },
    },
  ],
  exports: [AuditService, AUDIT_SINKS],
})
export class AuditModule {}
