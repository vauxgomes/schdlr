import { z } from 'zod'

import { AppException } from '../errors/app.exception'
import { ZodValidationPipe } from './zod-validation.pipe'

function errorsOf(schema: z.ZodType, value: unknown) {
  try {
    new ZodValidationPipe(schema).transform(value)
  } catch (error) {
    expect(error).toBeInstanceOf(AppException)
    return (error as AppException).getBody().errors ?? []
  }
  throw new Error('deveria ter lançado')
}

describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.email(), address: z.object({ city: z.string() }) })

  it('devolve o valor parseado quando é válido', () => {
    const value = { email: 'a@b.dev', address: { city: 'Fortaleza' } }
    expect(new ZodValidationPipe(schema).transform(value)).toEqual(value)
  })

  it('lança VALIDATION_FAILED com o corpo do contrato quando é inválido', () => {
    try {
      new ZodValidationPipe(schema).transform({ email: 'não-é-email', address: {} })
      fail('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(AppException)
      const exception = error as AppException
      expect(exception.getStatus()).toBe(400)
      const body = exception.getBody()
      expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' })
      expect(body.message).toBe('Validation failed')
      expect(body.errors?.map((e) => e.path)).toEqual(['email', 'address.city'])
      body.errors?.forEach((e) => expect(typeof e.message).toBe('string'))
    }
  })

  it.each([
    ['too_small', z.string().min(2), 'a', { origin: 'string', minimum: 2, inclusive: true }],
    ['too_big', z.number().max(10), 11, { origin: 'number', maximum: 10, inclusive: true }],
    ['too_big', z.bigint().lt(5n), 7n, { origin: 'bigint', maximum: 5, inclusive: false }],
    ['invalid_type', z.string(), 1, { expected: 'string' }],
    ['invalid_format', z.email(), 'x', { format: 'email' }],
    ['invalid_value', z.enum(['A', 'B']), 'C', { values: ['A', 'B'] }],
    ['unrecognized_keys', z.strictObject({}), { x: 1 }, { keys: ['x'] }],
  ])('%s leva só os params da frase', (code, itemSchema, value, params) => {
    expect(errorsOf(itemSchema, value)).toEqual([
      { path: '', code, message: expect.any(String) as string, params },
    ])
  })

  it('código sem params na tabela sai sem params', () => {
    expect(errorsOf(z.number().multipleOf(3), 4)).toEqual([
      { path: '', code: 'not_multiple_of', message: expect.any(String) as string },
    ])
  })

  it('custom com params.code sai com esse código e o resto de params', () => {
    const custom = z.string().superRefine((_, ctx) => {
      ctx.addIssue({ code: 'custom', message: 'm', params: { code: 'MY_RULE', max: 3 } })
      ctx.addIssue({ code: 'custom', message: 'm', params: { code: 'OTHER_RULE' } })
    })
    expect(errorsOf(custom, 'x')).toEqual([
      { path: '', code: 'MY_RULE', message: 'm', params: { max: 3 } },
      { path: '', code: 'OTHER_RULE', message: 'm' },
    ])
  })

  it('custom sem params.code sai como custom', () => {
    const custom = z.string().refine(() => false, 'm')
    expect(errorsOf(custom, 'x')).toEqual([{ path: '', code: 'custom', message: 'm' }])
  })
})
