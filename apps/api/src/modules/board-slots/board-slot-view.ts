import { LocationType, Prisma } from '@prisma/client'

// O formato de uma célula da grade (spec 0020), usado pelo GET do quadro e pelo PUT da célula.

export type CellView = {
  weekday: number
  isBlocked: boolean
  offering: {
    id: string
    subject: { id: string; name: string; code: string; color: string; isActive: boolean }
    teacher: { id: string; name: string } | null
  } | null
  location: { id: string; name: string; type: LocationType; isActive: boolean } | null
}

export const withCellDetails = {
  offering: {
    select: {
      id: true,
      subject: { select: { id: true, name: true, code: true, color: true, isActive: true } },
      teacher: { select: { id: true, name: true } },
    },
  },
  location: { select: { id: true, name: true, type: true, isActive: true } },
} satisfies Prisma.BoardSlotInclude

type SlotWithDetails = Prisma.BoardSlotGetPayload<{ include: typeof withCellDetails }>

/** Célula sem linha no banco: vazia (0020, célula existe só com conteúdo). */
export const emptyCell = (weekday: number): CellView => ({
  weekday,
  isBlocked: false,
  offering: null,
  location: null,
})

export const toCellView = ({
  weekday,
  isBlocked,
  offering,
  location,
}: SlotWithDetails): CellView => ({ weekday, isBlocked, offering, location })
