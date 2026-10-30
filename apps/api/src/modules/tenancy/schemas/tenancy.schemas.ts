import { z } from 'zod'

// Formato da 0002, para organização e unidade. Também valida os :orgSlug/:unitSlug do caminho
// (TenantAccessService).
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
