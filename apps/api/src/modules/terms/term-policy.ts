import { ProjectStatus, TermStatus } from '@prisma/client'

// O ciclo do semestre e o que cada status permite com os projetos dele (spec 0016). Dado puro,
// sem banco: a spec de projeto aplica, pelo TermAccessService.assertProjectAction.

export type ProjectAction = 'create' | 'edit' | 'publish' | 'delete'

/** Quem edita os projetos: gestores | ninguém. */
export type ProjectEditors = 'MANAGERS' | 'NOBODY'

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

/**
 * Apagar projeto segue `create`. Gestores veem todos os projetos em qualquer status. Em STARTED,
 * nada dentro dos projetos se edita: mudar é voltar o semestre a ADJUSTMENTS (0021).
 */
export const TERM_PROJECT_POLICY: Record<
  TermStatus,
  { create: boolean; edit: ProjectEditors; publish: boolean; othersSee: ProjectVisibility }
> = {
  PLANNING: { create: true, edit: 'MANAGERS', publish: true, othersSee: 'NONE' },
  ADJUSTMENTS: { create: false, edit: 'MANAGERS', publish: true, othersSee: 'PUBLISHED' },
  STARTED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'PUBLISHED' },
  FINISHED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'PUBLISHED' },
  CANCELLED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'NONE' },
}

export const canTransition = (from: TermStatus, to: TermStatus) =>
  TERM_TRANSITIONS[from].includes(to)

/** Fechado: só leitura, sem volta. */
export const isTermClosed = (status: TermStatus) => TERM_TRANSITIONS[status].length === 0

/** O papel de quem age num projeto: gestor dele. */
export type ProjectRoles = { isProjectManager: boolean }

/** A ação existe neste status do semestre, para alguém. Apagar segue `create`. */
export const isProjectActionOpen = (status: TermStatus, action: ProjectAction) => {
  const policy = TERM_PROJECT_POLICY[status]
  if (action === 'edit') return policy.edit !== 'NOBODY'
  if (action === 'publish') return policy.publish
  return policy.create
}

/**
 * A matriz "status × projetos" inteira, sem lançar: a ação existe no status e o papel basta. O
 * papel é sempre o de gestor do projeto (0016, 0018, 0021).
 */
export const isProjectActionAllowed = (
  status: TermStatus,
  action: ProjectAction,
  { isProjectManager }: ProjectRoles,
) => isProjectActionOpen(status, action) && isProjectManager

/** Gestor do projeto vê sempre; os demais, só o publicado, e só se o status do semestre deixa. */
export const isProjectVisible = (
  termStatus: TermStatus,
  projectStatus: ProjectStatus,
  isProjectManager: boolean,
) =>
  isProjectManager ||
  (TERM_PROJECT_POLICY[termStatus].othersSee === 'PUBLISHED' && projectStatus === 'PUBLISHED')
