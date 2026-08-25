import { createHash } from 'node:crypto'

// Refresh token e token de recuperação vão para o banco assim: o valor em
// claro só existe no cookie ou no e-mail, nunca em linha de tabela.
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
