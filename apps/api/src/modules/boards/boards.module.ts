import { Module } from '@nestjs/common'

import { ProjectsModule } from '@modules/projects/projects.module'
import { TimeTablesModule } from '@modules/time-tables/time-tables.module'

import { BoardsController } from './boards.controller'
import { BoardsService } from './boards.service'

/** Os quadros de um projeto (spec 0020). Exporta o service para as células do quadro. */
@Module({
  imports: [ProjectsModule, TimeTablesModule],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}
