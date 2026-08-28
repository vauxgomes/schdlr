import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CurrentUnit } from '../units/decorators/unit-context.decorator'
import type { UnitContext } from '../units/unit-context'
import { CreateTermSchema } from './dto/create-term.dto'
import { ListTermsSchema } from './dto/list-terms.dto'
import { UpdateTermStatusSchema } from './dto/update-term-status.dto'
import { UpdateTermSchema } from './dto/update-term.dto'
import type { CreateTermInput } from './dto/create-term.dto'
import type { ListTermsQuery } from './dto/list-terms.dto'
import type { UpdateTermStatusInput } from './dto/update-term-status.dto'
import type { UpdateTermInput } from './dto/update-term.dto'
import { TermsService } from './terms.service'

@Controller('units/:unitId/terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get('select')
  select(@CurrentUnit() context: UnitContext) {
    return this.termsService.select(context)
  }

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListTermsSchema, 'query')) query: ListTermsQuery,
  ) {
    return this.termsService.list(context, query)
  }

  @Get(':termId')
  findOne(@CurrentUnit() context: UnitContext, @Param('termId') termId: string) {
    return this.termsService.findOne(context, termId)
  }

  @Post()
  @Validate(CreateTermSchema)
  create(@CurrentUnit() context: UnitContext, @Body() input: CreateTermInput) {
    return this.termsService.create(context, input)
  }

  @Patch(':termId')
  @Validate(UpdateTermSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('termId') termId: string,
    @Body() input: UpdateTermInput,
  ) {
    return this.termsService.update(context, termId, input)
  }

  // Transição de máquina de estado, e não campo do update: por isso rota
  // própria, com o seu 409 quando o salto não existe.
  @Patch(':termId/status')
  @Validate(UpdateTermStatusSchema)
  updateStatus(
    @CurrentUnit() context: UnitContext,
    @Param('termId') termId: string,
    @Body() input: UpdateTermStatusInput,
  ) {
    return this.termsService.updateStatus(context, termId, input.status)
  }

  @Delete(':termId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUnit() context: UnitContext, @Param('termId') termId: string) {
    return this.termsService.remove(context, termId)
  }
}
