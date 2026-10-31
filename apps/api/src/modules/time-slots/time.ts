// Hora na API (spec 0017): HH:MM de 00:00 a 23:59; no banco, minutos desde 0h (0002). Também usado
// pelas specs de quadro e de choque.

/** `07:50` → 470. Espera o formato já validado por `hhmmSchema`. */
export const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

/** 470 → `07:50`. */
export const toHHMM = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export type Interval = { startTime: number; endTime: number }

/** Intervalos semiabertos, `[start, end)`: os que só encostam não se sobrepõem (0002). */
export const overlaps = (a: Interval, b: Interval) =>
  a.startTime < b.endTime && b.startTime < a.endTime
