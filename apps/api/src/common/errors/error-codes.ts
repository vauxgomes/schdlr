import { HttpStatus } from '@nestjs/common'

/**
 * Catálogo de erros da API. O `code` é contrato com o web (que traduz por ele); a `message` é só
 * para log e curl. Trocar ou remover um código pede spec (0008).
 */
export const ERRORS = {
  // Genéricos: o filtro também os usa para as exceções do Nest, pelo status.
  BAD_REQUEST: { status: HttpStatus.BAD_REQUEST, message: 'Bad request' },
  VALIDATION_FAILED: { status: HttpStatus.BAD_REQUEST, message: 'Validation failed' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, message: 'Forbidden' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Not found' },
  TOO_MANY_REQUESTS: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests' },
  // Outro 4xx do Nest: a resposta mantém o status original; o daqui é só o padrão.
  HTTP_ERROR: { status: HttpStatus.BAD_REQUEST, message: 'Request failed' },
  INTERNAL_ERROR: { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },

  // Auth (0004)
  INVALID_OR_EXPIRED_CODE: { status: HttpStatus.UNAUTHORIZED, message: 'Invalid or expired code' },
  EMAIL_ALREADY_REGISTERED: { status: HttpStatus.CONFLICT, message: 'Email already registered' },
  OTP_COOLDOWN: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Wait before requesting a new code',
  },
  EMAIL_SEND_FAILED: { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Could not send email' },

  // Assinaturas e papel do sistema (0006)
  USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'User not found' },
  SUBSCRIPTION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Subscription not found' },
  PLAN_DOES_NOT_EXPIRE: { status: HttpStatus.CONFLICT, message: 'Plan does not expire' },
  CANNOT_CHANGE_MASTER: { status: HttpStatus.CONFLICT, message: 'Cannot change the master' },
  PLAN_EXPIRED: { status: HttpStatus.FORBIDDEN, message: 'Plan expired' },

  // Organização e unidade (0009)
  ORGANIZATION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Organization not found' },
  UNIT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Unit not found' },
  NOT_ALLOWED: { status: HttpStatus.FORBIDDEN, message: 'Not allowed' },
  ORGANIZATION_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Organization is inactive' },
  UNIT_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Unit is inactive' },
  SUBSCRIPTION_REQUIRED: { status: HttpStatus.FORBIDDEN, message: 'Subscription required' },
  PLAN_LIMIT_REACHED: { status: HttpStatus.FORBIDDEN, message: 'Plan limit reached' },
  SLUG_ALREADY_IN_USE: { status: HttpStatus.CONFLICT, message: 'Slug already in use' },

  // Membros e convites (0010)
  MEMBER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Member not found' },
  USER_INACTIVE: { status: HttpStatus.CONFLICT, message: 'User is inactive' },
  ALREADY_A_MEMBER: { status: HttpStatus.CONFLICT, message: 'Already a member' },
  INVITATION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Invitation not found' },
  INVITATION_EXPIRED: { status: HttpStatus.GONE, message: 'Invitation expired' },
  INVITATION_NOT_PENDING: { status: HttpStatus.CONFLICT, message: 'Invitation is not pending' },

  // Cursos (0011)
  COURSE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Course not found' },
  COURSE_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Course is inactive' },
  COURSE_CODE_IN_USE: { status: HttpStatus.CONFLICT, message: 'Course code already in use' },
  COORDINATOR_NOT_A_MEMBER: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Coordinator is not a member',
  },

  // Currículos (0012)
  CURRICULUM_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Curriculum not found' },
  CURRICULUM_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Curriculum is inactive' },
  CURRICULUM_CODE_IN_USE: {
    status: HttpStatus.CONFLICT,
    message: 'Curriculum code already in use',
  },
  CURRICULUM_IN_USE: { status: HttpStatus.CONFLICT, message: 'Curriculum is used by a project' },

  // Disciplinas (0013)
  SUBJECT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Subject not found' },
  SUBJECT_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Subject is inactive' },
  SUBJECT_CODE_IN_USE: { status: HttpStatus.CONFLICT, message: 'Subject code already in use' },
  SUBJECT_IN_USE: { status: HttpStatus.CONFLICT, message: 'Subject is used by an offering' },

  // Locais (0015)
  LOCATION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Location not found' },
  LOCATION_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Location is inactive' },
  LOCATION_NAME_IN_USE: { status: HttpStatus.CONFLICT, message: 'Location name already in use' },
  LOCATION_IN_USE: { status: HttpStatus.CONFLICT, message: 'Location is used by a board slot' },

  // Semestres (0016)
  TERM_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Term not found' },
  TERM_NAME_IN_USE: { status: HttpStatus.CONFLICT, message: 'Term name already in use' },
  TERM_CLOSED: { status: HttpStatus.CONFLICT, message: 'Term is closed' },
  INVALID_TERM_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Invalid term status transition',
  },
  TERM_IN_USE: { status: HttpStatus.CONFLICT, message: 'Term has projects' },
  // Lançado pelo TermAccessService.assertProjectAction, que a spec de projeto usa.
  TERM_STATUS_FORBIDS: {
    status: HttpStatus.CONFLICT,
    message: 'Term status does not allow this action',
  },

  // Blocos de horários (0017)
  TIME_TABLE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Time table not found' },
  TIME_TABLE_NAME_IN_USE: {
    status: HttpStatus.CONFLICT,
    message: 'Time table name already in use',
  },
  TIME_TABLE_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Time table is inactive' },
  TIME_TABLE_IN_USE: { status: HttpStatus.CONFLICT, message: 'Time table is used by a board' },
  TIME_TABLE_FULL: { status: HttpStatus.CONFLICT, message: 'Time table has too many slots' },
  TIME_SLOT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Time slot not found' },
  TIME_SLOT_NAME_IN_USE: { status: HttpStatus.CONFLICT, message: 'Time slot name already in use' },
  TIME_SLOT_OVERLAP: { status: HttpStatus.CONFLICT, message: 'Time slot overlaps another' },
  TIME_SLOT_IN_USE: {
    status: HttpStatus.CONFLICT,
    message: 'Time slot is used by a board slot',
  },
} as const satisfies Record<string, { status: HttpStatus; message: string }>

export type ErrorCode = keyof typeof ERRORS
