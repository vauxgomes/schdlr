import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CurrentUnit } from '../units/decorators/unit-context.decorator'
import type { UnitContext } from '../units/unit-context'
import {
  ListMembersSchema,
  UpdateMemberRolesSchema,
  UpdateMemberStatusSchema,
} from './dto/update-member.dto'
import type {
  ListMembersQuery,
  UpdateMemberRolesInput,
  UpdateMemberStatusInput,
} from './dto/update-member.dto'
import { MembersService } from './members.service'

@Controller('units/:unitId/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // Antes de qualquer rota com parâmetro, pelo mesmo motivo de sempre.
  @Get('select')
  select(@CurrentUnit() context: UnitContext) {
    return this.membersService.select(context)
  }

  // Pipe no parâmetro, e não `@Validate`: aquele decorator ocupa o `UsePipes`
  // do handler, que é um só — corpo e query brigariam pelo mesmo lugar.
  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListMembersSchema, 'query')) query: ListMembersQuery,
  ) {
    return this.membersService.list(context, query)
  }

  @Patch(':memberId/roles')
  @Validate(UpdateMemberRolesSchema)
  updateRoles(
    @CurrentUnit() context: UnitContext,
    @Param('memberId') memberId: string,
    @Body() input: UpdateMemberRolesInput,
  ) {
    return this.membersService.updateRoles(context, memberId, input.roles)
  }

  @Patch(':memberId/status')
  @Validate(UpdateMemberStatusSchema)
  updateStatus(
    @CurrentUnit() context: UnitContext,
    @Param('memberId') memberId: string,
    @Body() input: UpdateMemberStatusInput,
  ) {
    return this.membersService.updateStatus(context, memberId, input.isActive)
  }
}
