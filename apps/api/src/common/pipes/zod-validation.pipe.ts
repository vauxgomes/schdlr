import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common'
import { ZodType } from 'zod'

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  // `@UsePipes` runs on every handler argument; the schema describes the body.
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') return value

    const result = this.schema.safeParse(value)

    if (!result.success) {
      throw new BadRequestException({
        message: 'Invalid request body',
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    return result.data
  }
}
