export type Range = { startTime: number; endTime: number }

// Intervalo meio-aberto `[startTime, endTime)`: uma faixa que termina às 9h00
// e outra que começa às 9h00 se tocam, não se sobrepõem — é o caso normal de
// aulas seguidas.
export function overlaps(a: Range, b: Range) {
  return a.startTime < b.endTime && b.startTime < a.endTime
}
