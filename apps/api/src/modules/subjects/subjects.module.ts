import { Module } from '@nestjs/common'

import { CurriculaModule } from '@modules/curricula/curricula.module'

import { SubjectsController } from './subjects.controller'
import { SubjectsService } from './subjects.service'

/** Disciplinas de um currículo (spec 0013). */
@Module({
  imports: [CurriculaModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
