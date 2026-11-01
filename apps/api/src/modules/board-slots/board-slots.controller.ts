import { Body, Controller, Param, Put } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { BoardSlotsService } from './board-slots.service'
import { putBoardSlotSchema, type PutBoardSlotInput } from './schemas/board-slot.schemas'

// A posição da célula (horário e dia) é validada pelo service: fora da grade dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/projects/:projectId/boards/:boardId/slots')
export class BoardSlotsController {
  constructor(private readonly slots: BoardSlotsService) {}

  @Put(':timeSlotId/:weekday')
  put(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('timeSlotId') timeSlotId: string,
    @Param('weekday') weekday: string,
    @Body(new ZodValidationPipe(putBoardSlotSchema)) body: PutBoardSlotInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.slots.put(
      user.sub,
      orgSlug,
      unitSlug,
      projectId,
      boardId,
      timeSlotId,
      weekday,
      body,
    )
  }
}
