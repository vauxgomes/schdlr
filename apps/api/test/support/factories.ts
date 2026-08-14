import { MemberRole, Organization, Unit, UnitMember, User } from '@prisma/client'
import { DatabaseService } from '../../src/infra/database/database.service'

// Hash fixo de 'secret', para as factories não pagarem bcrypt a cada linha.
const PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.z7VfQrmZ9pRAqmMS2W1cGDKMYYzm'

let sequence = 0

const next = () => ++sequence

export function createUser(db: DatabaseService, overrides: Partial<User> = {}) {
  const id = next()

  return db.user.create({
    data: {
      email: `user${id}@schdlr.test`,
      name: `User ${id}`,
      passwordHash: PASSWORD_HASH,
      ...overrides,
    },
  })
}

export async function createOrganization(
  db: DatabaseService,
  overrides: Partial<Organization> = {},
) {
  const id = next()
  const ownerId = overrides.ownerId ?? (await createUser(db)).id

  return db.organization.create({
    data: { name: `Organization ${id}`, slug: `organization-${id}`, ...overrides, ownerId },
  })
}

export async function createUnit(db: DatabaseService, overrides: Partial<Unit> = {}) {
  const id = next()
  const organizationId = overrides.organizationId ?? (await createOrganization(db)).id

  return db.unit.create({
    data: { name: `Unit ${id}`, slug: `unit-${id}`, ...overrides, organizationId },
  })
}

export async function createMember(
  db: DatabaseService,
  overrides: Partial<UnitMember> & { roles?: MemberRole[] } = {},
) {
  const userId = overrides.userId ?? (await createUser(db)).id
  const unitId = overrides.unitId ?? (await createUnit(db)).id

  return db.unitMember.create({
    data: { ...overrides, roles: overrides.roles ?? [MemberRole.TEACHER], userId, unitId },
  })
}
