import { Module } from '@nestjs/common';
import { TermsService } from './terms.service';
import { TermsController } from './terms.controller';

@Module({
  controllers: [TermsController],
  providers: [TermsService],
})
export class TermsModule {}
