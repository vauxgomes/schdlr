import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from './zod-validation.pipe'

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({ email: z.email(), address: z.object({ city: z.string() }) }),
  )

  it('devolve o valor parseado quando é válido', () => {
    const value = { email: 'a@b.dev', address: { city: 'Fortaleza' } }
    expect(pipe.transform(value)).toEqual(value)
  })

  it('lança 400 com o corpo do contrato quando é inválido', () => {
    try {
      pipe.transform({ email: 'não-é-email', address: {} })
      fail('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException)
      const exception = error as BadRequestException
      expect(exception.getStatus()).toBe(400)
      const body = exception.getResponse() as {
        statusCode: number
        message: string
        errors: { path: string; message: string }[]
      }
      expect(body.statusCode).toBe(400)
      expect(body.message).toBe('Validation failed')
      expect(body.errors.map((e) => e.path)).toEqual(['email', 'address.city'])
      body.errors.forEach((e) => expect(typeof e.message).toBe('string'))
    }
  })
})
