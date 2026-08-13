import { UsePipes } from '@nestjs/common'
import { ZodType } from 'zod'
import { ZodValidationPipe } from '../pipes/zod-validation.pipe'

export const Validate = (schema: ZodType) => UsePipes(new ZodValidationPipe(schema))
