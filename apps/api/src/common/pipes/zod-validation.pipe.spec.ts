import { ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { ZodValidationPipe } from './zod-validation.pipe'

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(3), age: z.coerce.number().int() })
  const pipe = new ZodValidationPipe(schema)
  const body: ArgumentMetadata = { type: 'body' }
  const param: ArgumentMetadata = { type: 'param' }

  it('returns the parsed value for a valid body', () => {
    expect(pipe.transform({ name: 'vaux', age: '3' }, body)).toEqual({ name: 'vaux', age: 3 })
  })

  it('strips keys the schema does not declare', () => {
    expect(pipe.transform({ name: 'vaux', age: 3, role: 'ADMIN' }, body)).toEqual({
      name: 'vaux',
      age: 3,
    })
  })

  it('throws 400 listing each offending field', () => {
    expect.assertions(2)

    try {
      pipe.transform({ name: 'ab' }, body)
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        issues: { field: string }[]
      }

      expect(error).toBeInstanceOf(BadRequestException)
      expect(response.issues.map((issue) => issue.field).sort()).toEqual(['age', 'name'])
    }
  })

  // `@UsePipes` also reaches @Param and @Query, which the body schema would reject.
  it('leaves arguments other than the body untouched', () => {
    expect(pipe.transform('cme3k1x2', param)).toBe('cme3k1x2')
  })
})
