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

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { LocationsService } from './locations.service'
import {
  createLocationSchema,
  listLocationsQuerySchema,
  updateLocationSchema,
  type CreateLocationInput,
  type ListLocationsQuery,
  type UpdateLocationInput,
} from './schemas/location.schemas'

// Slugs e locationId do caminho são validados pelo service: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(createLocationSchema)) body: CreateLocationInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.locations.create(user.sub, orgSlug, unitSlug, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Query(new ZodValidationPipe(listLocationsQuerySchema)) query: ListLocationsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.locations.list(user.sub, orgSlug, unitSlug, query)
  }

  @Get(':locationId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('locationId') locationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.locations.get(user.sub, orgSlug, unitSlug, locationId)
  }

  @Patch(':locationId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('locationId') locationId: string,
    @Body(new ZodValidationPipe(updateLocationSchema)) body: UpdateLocationInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.locations.update(user.sub, orgSlug, unitSlug, locationId, body)
  }

  @Delete(':locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('locationId') locationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.locations.remove(user.sub, orgSlug, unitSlug, locationId)
  }
}
