import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UNIT_CONTEXT, UnitContext } from '../unit-context'

// Só existe em rota com :unitId — é o guard que preenche.
export const CurrentUnit = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UnitContext =>
    context.switchToHttp().getRequest<Record<string, UnitContext>>()[UNIT_CONTEXT],
)
