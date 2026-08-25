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
} from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthenticatedUser } from '../auth/jwt.strategy'
import { CreateOrganizationSchema } from './dto/create-organization.dto'
import { UpdateOrganizationSchema } from './dto/update-organization.dto'
import type { CreateOrganizationInput } from './dto/create-organization.dto'
import type { UpdateOrganizationInput } from './dto/update-organization.dto'
import { OrganizationsService } from './organizations.service'

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @Validate(CreateOrganizationSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateOrganizationInput) {
    return this.organizationsService.create(user.userId, input)
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.list(user.userId)
  }

  // Antes de @Get(':id'), senão 'select' é lido como um id.
  @Get('select')
  select(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.select(user.userId)
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.findOne(user.userId, id)
  }

  @Patch(':id')
  @Validate(UpdateOrganizationSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: UpdateOrganizationInput,
  ) {
    return this.organizationsService.update(user.userId, id, input)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.remove(user.userId, id)
  }
}
