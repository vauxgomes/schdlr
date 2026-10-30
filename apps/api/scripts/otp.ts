// Emite um código OTP válido e o imprime: no ambiente local o e-mail está desligado, e o banco
// só guarda o hash do código enviado. Uso: pnpm otp [email]
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { Env } from '@config/env.schema'
import { DatabaseService } from '@infra/database/database.service'
import { OtpService } from '@modules/auth/otp.service'

import { AppModule } from '../src/app.module'

class OtpScriptError extends Error {}

async function main(email: string | undefined) {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  try {
    if (app.get<ConfigService<Env, true>>(ConfigService).get('NODE_ENV') !== 'development') {
      throw new OtpScriptError('pnpm otp só roda com NODE_ENV=development.')
    }

    const database = app.get(DatabaseService)
    const otp = app.get(OtpService)

    const target = email
      ? await findByEmail(database, email)
      : await findByLatestCode(otp, database)
    const issued = await otp.issue(target.id, target.purpose)

    const until = issued.expiresAt.toTimeString().slice(0, 5)
    console.log(`${issued.code}  ${target.email}  ${issued.purpose}  vale até ${until}`)
  } finally {
    await app.close()
  }
}

async function findByEmail(database: DatabaseService, email: string) {
  const user = await database.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) throw new OtpScriptError('Usuário não encontrado.')
  return {
    id: user.id,
    email: user.email,
    purpose: user.emailVerifiedAt ? ('SIGN_IN' as const) : ('SIGN_UP' as const),
  }
}

async function findByLatestCode(otp: OtpService, database: DatabaseService) {
  const latest = await otp.findLatestUsable()
  if (!latest) throw new OtpScriptError('Nenhum OTP válido no banco. Passe um e-mail.')
  const user = await database.user.findUniqueOrThrow({ where: { id: latest.userId } })
  return { id: user.id, email: user.email, purpose: latest.purpose }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof OtpScriptError ? error.message : error)
  process.exit(1)
})
