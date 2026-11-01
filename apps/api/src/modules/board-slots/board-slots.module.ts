import { Module } from '@nestjs/common'

import { BoardsModule } from '@modules/boards/boards.module'
import { ProjectsModule } from '@modules/projects/projects.module'

import { BoardSlotsController } from './board-slots.controller'
import { BoardSlotsService } from './board-slots.service'

/** As células de um quadro (spec 0020). */
@Module({
  imports: [ProjectsModule, BoardsModule],
  controllers: [BoardSlotsController],
  providers: [BoardSlotsService],
})
export class BoardSlotsModule {}
