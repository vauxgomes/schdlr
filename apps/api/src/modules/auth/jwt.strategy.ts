import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { StaffRole } from '@prisma/client'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { Env } from '../../config/env'

export type JwtPayload = {
  sub: string
  staffRole: StaffRole | null
}

export type AuthenticatedUser = {
  userId: string
  staffRole: StaffRole | null
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    })
  }

  // O retorno vira `request.user`. Nada de unidade entra aqui: contexto de
  // tenant é resolvido por request a partir do unitId da rota (spec 0008).
  validate(payload: JwtPayload): AuthenticatedUser {
    return { userId: payload.sub, staffRole: payload.staffRole }
  }
}
