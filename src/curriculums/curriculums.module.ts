import { Module } from '@nestjs/common';
import { CurriculumsService } from './curriculums.service';
import { CurriculumsController } from './curriculums.controller';

@Module({
  controllers: [CurriculumsController],
  providers: [CurriculumsService],
})
export class CurriculumsModule {}
