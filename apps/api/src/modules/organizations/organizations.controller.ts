import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { OrganizationsService } from './organizations.service'
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from './schemas/organization.schemas'

// O :orgSlug é validado pelo TenantAccessService: fora do formato dá 404, não 400.
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizations.create(user.sub, body)
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.organizations.list(user.sub)
  }

  @Get(':orgSlug')
  get(@Param('orgSlug') orgSlug: string, @CurrentUser() user: JwtPayload) {
    return this.organizations.get(user.sub, orgSlug)
  }

  @Patch(':orgSlug')
  update(
    @Param('orgSlug') orgSlug: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizations.update(user.sub, orgSlug, body)
  }
}
