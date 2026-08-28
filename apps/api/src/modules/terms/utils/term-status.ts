import { TermStatus } from '@prisma/client'

// A máquina de estado do período, num lugar só. A ordem é a vida do período:
// planejar, ajustar, rodar, encerrar. Cancelar interrompe em qualquer ponto
// antes do encerramento — depois de FINISHED não há o que interromper, e um
// período cancelado não volta: o caminho é criar outro.
const TRANSITIONS: Record<TermStatus, TermStatus[]> = {
  [TermStatus.PLANNING]: [TermStatus.ADJUSTMENTS, TermStatus.CANCELLED],
  [TermStatus.ADJUSTMENTS]: [TermStatus.STARTED, TermStatus.CANCELLED],
  [TermStatus.STARTED]: [TermStatus.FINISHED, TermStatus.CANCELLED],
  [TermStatus.FINISHED]: [],
  [TermStatus.CANCELLED]: [],
}

export function canTransition(from: TermStatus, to: TermStatus) {
  return TRANSITIONS[from].includes(to)
}
