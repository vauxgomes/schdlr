import { compare, hash } from 'bcrypt'

const BCRYPT_COST = 10

export function hashPassword(plain: string) {
  return hash(plain, BCRYPT_COST)
}

export function verifyPassword(plain: string, passwordHash: string) {
  return compare(plain, passwordHash)
}
