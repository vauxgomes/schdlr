import { TermStatus } from '@prisma/client'

// O ciclo do semestre e o que cada status permite com os projetos dele (spec 0016). Dado puro,
// sem banco: a spec de projeto aplica, pelo TermAccessService.assertProjectAction.

export type ProjectAction = 'create' | 'edit' | 'publish' | 'delete'

/** Quem edita os projetos: gestores | dono e responsável | ninguém. */
export type ProjectEditors = 'MANAGERS' | 'UNIT_ADMINS' | 'NOBODY'

/** O que os demais membros (não gestores) veem dos projetos. Rascunho, nunca. */
export type ProjectVisibility = 'NONE' | 'PUBLISHED'

/** Transições permitidas. FINISHED e CANCELLED são finais. */
export const TERM_TRANSITIONS: Record<TermStatus, readonly TermStatus[]> = {
  PLANNING: ['ADJUSTMENTS', 'CANCELLED'],
  ADJUSTMENTS: ['PLANNING', 'STARTED', 'CANCELLED'],
  STARTED: ['ADJUSTMENTS', 'FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
}

/** Apagar projeto segue `create`. Gestores veem todos os projetos em qualquer status. */
export const TERM_PROJECT_POLICY: Record<
  TermStatus,
  { create: boolean; edit: ProjectEditors; publish: boolean; othersSee: ProjectVisibility }
> = {
  PLANNING: { create: true, edit: 'MANAGERS', publish: true, othersSee: 'NONE' },
  ADJUSTMENTS: { create: false, edit: 'MANAGERS', publish: true, othersSee: 'PUBLISHED' },
  STARTED: { create: false, edit: 'UNIT_ADMINS', publish: false, othersSee: 'PUBLISHED' },
  FINISHED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'PUBLISHED' },
  CANCELLED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'NONE' },
}

export const canTransition = (from: TermStatus, to: TermStatus) =>
  TERM_TRANSITIONS[from].includes(to)

/** Fechado: só leitura, sem volta. */
export const isTermClosed = (status: TermStatus) => TERM_TRANSITIONS[status].length === 0
