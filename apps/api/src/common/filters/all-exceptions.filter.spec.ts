import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter()
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  it('drops the `error` key Nest adds by default', () => {
    filter.catch(new NotFoundException('Course not found'), host)

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ statusCode: 404, message: 'Course not found' })
  })

  it('keeps the issues the validation pipe attaches', () => {
    const issues = [{ field: 'name', message: 'Too small' }]

    filter.catch(new BadRequestException({ message: 'Invalid request body', issues }), host)

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ statusCode: 400, message: 'Invalid request body', issues })
  })

  it('hides the cause of an unexpected error behind a 500', () => {
    filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5434'), host)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' })
  })
})
