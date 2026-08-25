import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common'
import { ZodType } from 'zod'

export class ZodValidationPipe implements PipeTransform {
  constructor(
    private readonly schema: ZodType,
    private readonly target: 'body' | 'query' = 'body',
  ) {}

  // `@UsePipes` runs on every handler argument, so the pipe ignores the ones it
  // was not built for. As a param-level pipe it sees a single argument.
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== this.target) return value

    const result = this.schema.safeParse(value)

    if (!result.success) {
      throw new BadRequestException({
        message: `Invalid request ${this.target}`,
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    return result.data
  }
}
