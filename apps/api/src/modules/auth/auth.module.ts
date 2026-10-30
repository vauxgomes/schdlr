import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtSignOptions } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { Env } from '@config/env.schema'

import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          // O formato já foi validado pelo envSchema.
          expiresIn: config.get<JwtSignOptions['expiresIn']>('JWT_EXPIRES_IN'),
        },
      }),
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
