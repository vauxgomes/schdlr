import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AuthenticatedUser } from './jwt.strategy'

// O que o JwtStrategy devolveu no validate(). Só existe em rota fechada:
// numa rota @Public() o guard nem roda e `request.user` vem indefinido.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
)
