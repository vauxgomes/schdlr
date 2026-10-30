import { createHash, randomBytes } from 'node:crypto'

/**
 * Token opaco de 256 bits (refresh token, convite). O valor só existe com quem o recebe; no banco
 * vai o SHA-256, que basta para um valor aleatório desse tamanho.
 */
export const generateOpaqueToken = () => randomBytes(32).toString('base64url')

export const hashOpaqueToken = (token: string) => createHash('sha256').update(token).digest('hex')
