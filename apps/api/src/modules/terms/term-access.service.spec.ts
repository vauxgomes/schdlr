import { TermStatus } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import { TermAccess, TermAccessService } from './term-access.service'
import { ProjectAction } from './term-policy'

const TERM_ID = 'cmhterm000000000000000001'

const unitAccess = (role: { isOwner?: boolean; isManager?: boolean } = {}) => ({
  organization: { id: 'org-1', ownerId: 'owner', isActive: true },
  unit: { id: 'unit-1', isActive: true },
  membership: null,
  isOwner: false,
  isManager: false,
  isTeacher: false,
  ...role,
})

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AppException)
  return (error as AppException).code
}

describe('TermAccessService', () => {
  let db: { term: { findFirst: jest.Mock } }
  let tenants: Record<'resolveUnit' | 'assertWritable', jest.Mock>
  let service: TermAccessService

  beforeEach(() => {
    db = { term: { findFirst: jest.fn() } }
    tenants = { resolveUnit: jest.fn(), assertWritable: jest.fn() }
    service = new TermAccessService(
      db as unknown as DatabaseService,
      tenants as unknown as TenantAccessService,
    )
  })

  describe('resolveTerm', () => {
    it.each([
      ['dono', { isOwner: true }, true],
      ['responsável', { isManager: true }, true],
      ['outro membro', {}, false],
    ])('%s: procura na unidade, com canManageTerm', async (_label, role, canManageTerm) => {
      tenants.resolveUnit.mockResolvedValue(unitAccess(role))
      db.term.findFirst.mockResolvedValue({ id: TERM_ID })
      await expect(service.resolveTerm('u', 'acme', 'sede', TERM_ID)).resolves.toMatchObject({
        term: { id: TERM_ID },
        canManageTerm,
      })
      expect(db.term.findFirst).toHaveBeenCalledWith({ where: { id: TERM_ID, unitId: 'unit-1' } })
    })

    it('de outra unidade, inexistente ou id fora do formato dá TERM_NOT_FOUND', async () => {
      tenants.resolveUnit.mockResolvedValue(unitAccess())
      db.term.findFirst.mockResolvedValue(null)
      expect(await codeOf(service.resolveTerm('u', 'acme', 'sede', TERM_ID))).toBe('TERM_NOT_FOUND')
      db.term.findFirst.mockClear()
      expect(await codeOf(service.resolveTerm('u', 'acme', 'sede', 'x'))).toBe('TERM_NOT_FOUND')
      expect(db.term.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('assertTermWritable', () => {
    const access = (status: TermStatus) =>
      ({ ...unitAccess(), term: { status }, canManageTerm: true }) as unknown as TermAccess

    it.each(['PLANNING', 'ADJUSTMENTS', 'STARTED'] as const)('%s passa', async (status) => {
      const ok = access(status)
      await expect(service.assertTermWritable(ok)).resolves.toBeUndefined()
      expect(tenants.assertWritable).toHaveBeenCalledWith(ok)
    })

    it.each(['FINISHED', 'CANCELLED'] as const)('%s dá TERM_CLOSED', async (status) => {
      expect(await codeOf(service.assertTermWritable(access(status)))).toBe('TERM_CLOSED')
    })

    it('o 409 da unidade vem antes', async () => {
      tenants.assertWritable.mockRejectedValue(new AppException('UNIT_INACTIVE'))
      expect(await codeOf(service.assertTermWritable(access('FINISHED')))).toBe('UNIT_INACTIVE')
    })
  })

  describe('assertProjectAction: a matriz inteira', () => {
    // A matriz da spec, escrita à mão: '409' = TERM_STATUS_FORBIDS, '403' = NOT_ALLOWED.
    type Outcome = 'ok' | '403' | '409'
    type Who = 'admin' | 'coordinator' | 'other' // dono/responsável, coordenador do curso, demais
    const MATRIX: Record<TermStatus, Record<ProjectAction, Record<Who, Outcome>>> = {
      PLANNING: {
        create: { admin: 'ok', coordinator: 'ok', other: '403' },
        edit: { admin: 'ok', coordinator: 'ok', other: '403' },
        publish: { admin: 'ok', coordinator: 'ok', other: '403' },
        delete: { admin: 'ok', coordinator: 'ok', other: '403' },
      },
      ADJUSTMENTS: {
        create: { admin: '409', coordinator: '409', other: '409' },
        edit: { admin: 'ok', coordinator: 'ok', other: '403' },
        publish: { admin: 'ok', coordinator: 'ok', other: '403' },
        delete: { admin: '409', coordinator: '409', other: '409' },
      },
      STARTED: {
        create: { admin: '409', coordinator: '409', other: '409' },
        edit: { admin: 'ok', coordinator: '403', other: '403' },
        publish: { admin: '409', coordinator: '409', other: '409' },
        delete: { admin: '409', coordinator: '409', other: '409' },
      },
      FINISHED: {
        create: { admin: '409', coordinator: '409', other: '409' },
        edit: { admin: '409', coordinator: '409', other: '409' },
        publish: { admin: '409', coordinator: '409', other: '409' },
        delete: { admin: '409', coordinator: '409', other: '409' },
      },
      CANCELLED: {
        create: { admin: '409', coordinator: '409', other: '409' },
        edit: { admin: '409', coordinator: '409', other: '409' },
        publish: { admin: '409', coordinator: '409', other: '409' },
        delete: { admin: '409', coordinator: '409', other: '409' },
      },
    }
    const ROLES: Record<Who, { canManageTerm: boolean; isProjectManager: boolean }> = {
      admin: { canManageTerm: true, isProjectManager: true },
      coordinator: { canManageTerm: false, isProjectManager: true },
      other: { canManageTerm: false, isProjectManager: false },
    }

    const cases = Object.entries(MATRIX).flatMap(([status, actions]) =>
      Object.entries(actions).flatMap(([action, whos]) =>
        Object.entries(whos).map(([who, outcome]) => [status, action, who, outcome] as const),
      ),
    )

    it('cobre 5 status × 4 ações × 3 papéis', () => expect(cases).toHaveLength(60))

    it.each(cases)('%s, %s, %s → %s', (status, action, who, outcome) => {
      const { canManageTerm, isProjectManager } = ROLES[who as Who]
      const access = { term: { status }, canManageTerm } as unknown as TermAccess
      const run = () =>
        service.assertProjectAction(access, action as ProjectAction, { isProjectManager })

      if (outcome === 'ok') return expect(run).not.toThrow()
      const error = (() => {
        try {
          run()
        } catch (e) {
          return e as AppException
        }
      })()
      expect(error).toBeInstanceOf(AppException)
      if (outcome === '409') {
        expect(error!.code).toBe('TERM_STATUS_FORBIDS')
        expect(error!.params).toEqual({ status, action })
      } else {
        expect(error!.code).toBe('NOT_ALLOWED')
      }
    })
  })
})
