import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { Env } from '@config/env.schema'

import type { JwtPayload } from '../jwt-payload'

// Só confere assinatura e expiração; não há User para consultar ainda.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    })
  }

  validate(payload: JwtPayload): JwtPayload {
    return { sub: payload.sub }
  }
}
