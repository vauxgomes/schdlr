import { PipeTransform } from '@nestjs/common'
import { core, ZodType } from 'zod'

import { AppException, ErrorParams, ValidationErrorItem } from '../errors/app.exception'

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new AppException('VALIDATION_FAILED', undefined, result.error.issues.map(toItem))
    }
    return result.data
  }
}

const toNumber = (value: number | bigint) => Number(value)

/** Só o que a frase do web precisa; o valor recebido (`input`) nunca vai no corpo. */
function paramsOf(issue: core.$ZodIssue): ErrorParams | undefined {
  switch (issue.code) {
    case 'too_small':
      return { origin: issue.origin, minimum: toNumber(issue.minimum), inclusive: issue.inclusive }
    case 'too_big':
      return { origin: issue.origin, maximum: toNumber(issue.maximum), inclusive: issue.inclusive }
    case 'invalid_type':
      return { expected: issue.expected }
    case 'invalid_format':
      return { format: issue.format }
    case 'invalid_value':
      return { values: issue.values.map((v) => (typeof v === 'bigint' ? Number(v) : v)) }
    case 'unrecognized_keys':
      return { keys: issue.keys }
    default:
      return undefined
  }
}

function toItem(issue: core.$ZodIssue): ValidationErrorItem {
  const item = { path: issue.path.join('.'), message: issue.message }

  // Regra própria: quem cria o issue dá o código em params.code (ex.: GRACE_DOES_NOT_EXPIRE).
  if (issue.code === 'custom') {
    const { code, ...rest } = (issue.params ?? {}) as ErrorParams
    if (typeof code !== 'string') return { ...item, code: 'custom' }
    return { ...item, code, ...(Object.keys(rest).length > 0 && { params: rest }) }
  }

  const params = paramsOf(issue)
  return { ...item, code: issue.code, ...(params && { params }) }
}
