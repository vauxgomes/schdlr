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
import { CreateLocationSchema } from './dto/create-location.dto'
import { ListLocationsSchema } from './dto/list-locations.dto'
import { UpdateLocationSchema } from './dto/update-location.dto'
import type { CreateLocationInput } from './dto/create-location.dto'
import type { ListLocationsQuery } from './dto/list-locations.dto'
import type { UpdateLocationInput } from './dto/update-location.dto'
import { LocationsService } from './locations.service'

@Controller('units/:unitId/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('select')
  select(@CurrentUnit() context: UnitContext) {
    return this.locationsService.select(context)
  }

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListLocationsSchema, 'query')) query: ListLocationsQuery,
  ) {
    return this.locationsService.list(context, query)
  }

  @Get(':locationId')
  findOne(@CurrentUnit() context: UnitContext, @Param('locationId') locationId: string) {
    return this.locationsService.findOne(context, locationId)
  }

  @Post()
  @Validate(CreateLocationSchema)
  create(@CurrentUnit() context: UnitContext, @Body() input: CreateLocationInput) {
    return this.locationsService.create(context, input)
  }

  @Patch(':locationId')
  @Validate(UpdateLocationSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('locationId') locationId: string,
    @Body() input: UpdateLocationInput,
  ) {
    return this.locationsService.update(context, locationId, input)
  }

  @Delete(':locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUnit() context: UnitContext, @Param('locationId') locationId: string) {
    return this.locationsService.remove(context, locationId)
  }
}
