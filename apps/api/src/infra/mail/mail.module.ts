import { Module } from '@nestjs/common'
import { MailListener } from './mail.listener'
import { MailService } from './mail.service'

@Module({
  providers: [MailService, MailListener],
  exports: [MailService],
})
export class MailModule {}
