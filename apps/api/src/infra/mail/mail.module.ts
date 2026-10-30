import { Global, Module } from '@nestjs/common'

import { MailService } from './mail.service'
import { mailTransportProvider } from './mail.transport'

@Global()
@Module({
  providers: [mailTransportProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
