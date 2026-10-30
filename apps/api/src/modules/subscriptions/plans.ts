import { PlanType } from '@prisma/client'

export type Plan = PlanType | 'BASIC' | 'PRO'

export type PlanLimits = {
  organizations: number | null // null = ilimitado
  unitsPerOrganization: number | null
  coursesPerUnit: number | null
}

/**
 * Os limites contam registros desativados: desativar não libera vaga no plano. Curso conta por
 * unidade.
 */
export const PLANS: Record<Plan, { limits: PlanLimits; durationMonths: number | null }> = {
  GRACE: {
    limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 5 },
    durationMonths: null,
  },
  TRIAL: {
    limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 3 },
    durationMonths: 1,
  },
  // v2: ainda não estão no enum PlanType; não podem ser atribuídos.
  BASIC: {
    limits: { organizations: 1, unitsPerOrganization: 5, coursesPerUnit: 5 },
    durationMonths: 1,
  },
  PRO: {
    limits: { organizations: null, unitsPerOrganization: null, coursesPerUnit: null },
    durationMonths: 1,
  },
}

/** Mês de calendário, em UTC: 31/01 + 1 mês = último dia de fevereiro. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}
