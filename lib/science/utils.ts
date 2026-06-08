/** Clamp a value between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Round to a given number of decimal places. */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/** Convert kg to lbs. */
export function kgToLbs(kg: number): number {
  return roundTo(kg * 2.20462, 1)
}

/** Convert lbs to kg. */
export function lbsToKg(lbs: number): number {
  return roundTo(lbs / 2.20462, 2)
}

/** Convert cm to feet and inches: returns { feet, inches }. */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = roundTo(totalInches % 12, 1)
  return { feet, inches }
}

/** Convert feet + inches to cm. */
export function ftInToCm(feet: number, inches: number): number {
  return roundTo((feet * 12 + inches) * 2.54, 1)
}

/** Return YYYY-MM-DD for today in local timezone. */
export function localDateStr(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

/** Parse YYYY-MM-DD safely in local timezone (avoids UTC midnight shift). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Number of days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / msPerDay)
}
