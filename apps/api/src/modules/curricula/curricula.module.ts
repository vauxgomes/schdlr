import { Module } from '@nestjs/common'
import { CurriculaController, CurriculumDisciplinesController } from './curricula.controller'
import { CurriculaService } from './curricula.service'
import { CurriculumDisciplinesService } from './curriculum-disciplines.service'

@Module({
  controllers: [CurriculaController, CurriculumDisciplinesController],
  providers: [CurriculaService, CurriculumDisciplinesService],
})
export class CurriculaModule {}
