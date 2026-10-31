import { Module } from '@nestjs/common'

import { CoursesModule } from '@modules/courses/courses.module'

import { CurriculaController } from './curricula.controller'
import { CurriculaService } from './curricula.service'
import { CurriculumAccessService } from './curriculum-access.service'

/** Currículos de um curso e o acesso a um currículo (spec 0012), para disciplinas e duplicação. */
@Module({
  imports: [CoursesModule],
  controllers: [CurriculaController],
  providers: [CurriculaService, CurriculumAccessService],
  exports: [CurriculumAccessService],
})
export class CurriculaModule {}
