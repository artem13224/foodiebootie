/**
 * Weekly macro adherence scoring.
 *
 * Per logged day, each of the 4 targets is scored hit/miss using tolerance bands:
 *   - Calories: within ±5% of target          → hit
 *   - Protein:  ≥ target (meet or exceed)      → hit
 *   - Fat:      within ±15% of target          → hit
 *   - Carbs:    within ±15% of target          → hit
 *
 * Only days with logged food count. Overall adherence = total hits / (4 × days logged).
 */

export interface DailyMacroTotals {
  date: string       // YYYY-MM-DD
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface MacroTargets {
  daily_kcal_target: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface AdherenceResult {
  daysLogged: number
  /** Per-macro hit counts out of daysLogged. */
  caloriesHits: number
  proteinHits: number
  carbsHits: number
  fatHits: number
  /** Overall adherence percentage 0–100, or null when no days logged. */
  overallPct: number | null
}

const CAL_BAND = 0.05
const FAT_BAND = 0.15
const CARB_BAND = 0.15

function withinBand(actual: number, target: number, band: number): boolean {
  if (target <= 0) return false
  const lower = target * (1 - band)
  const upper = target * (1 + band)
  return actual >= lower && actual <= upper
}

/**
 * Score adherence over a set of daily totals against fixed targets.
 * `days` should already be filtered to the week of interest; each entry is one
 * logged day (days with no food should not be passed in).
 */
export function scoreAdherence(
  days: DailyMacroTotals[],
  targets: MacroTargets,
): AdherenceResult {
  const daysLogged = days.length

  if (daysLogged === 0) {
    return {
      daysLogged: 0,
      caloriesHits: 0,
      proteinHits: 0,
      carbsHits: 0,
      fatHits: 0,
      overallPct: null,
    }
  }

  let caloriesHits = 0
  let proteinHits = 0
  let carbsHits = 0
  let fatHits = 0

  for (const d of days) {
    if (withinBand(d.kcal, targets.daily_kcal_target, CAL_BAND)) caloriesHits++
    if (targets.protein_g > 0 && d.protein_g >= targets.protein_g) proteinHits++
    if (withinBand(d.carbs_g, targets.carbs_g, CARB_BAND)) carbsHits++
    if (withinBand(d.fat_g, targets.fat_g, FAT_BAND)) fatHits++
  }

  const totalHits = caloriesHits + proteinHits + carbsHits + fatHits
  const possibleHits = daysLogged * 4
  const overallPct = Math.round((totalHits / possibleHits) * 100)

  return { daysLogged, caloriesHits, proteinHits, carbsHits, fatHits, overallPct }
}

/**
 * Aggregate raw food_logs rows (multiple per day) into per-day macro totals.
 */
export function aggregateDailyTotals(
  rows: { logged_date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[],
): DailyMacroTotals[] {
  const byDate = new Map<string, DailyMacroTotals>()
  for (const r of rows) {
    const existing = byDate.get(r.logged_date)
    if (existing) {
      existing.kcal += Number(r.kcal)
      existing.protein_g += Number(r.protein_g)
      existing.carbs_g += Number(r.carbs_g)
      existing.fat_g += Number(r.fat_g)
    } else {
      byDate.set(r.logged_date, {
        date: r.logged_date,
        kcal: Number(r.kcal),
        protein_g: Number(r.protein_g),
        carbs_g: Number(r.carbs_g),
        fat_g: Number(r.fat_g),
      })
    }
  }
  return Array.from(byDate.values())
}

/**
 * Templated adherence insight string — follows the threshold-triggered pattern
 * used in lib/science/weeklyInsights.ts. Returns null if no days logged.
 */
export function adherenceInsight(result: AdherenceResult): string | null {
  if (result.overallPct === null) return null
  const p = result.overallPct
  if (p >= 85) return `Dialed in — ${p}% macro adherence across ${result.daysLogged} logged day${result.daysLogged === 1 ? '' : 's'}.`
  if (p >= 65) return `Solid week — ${p}% macro adherence across ${result.daysLogged} logged day${result.daysLogged === 1 ? '' : 's'}.`
  if (p >= 40) return `Loose week — ${p}% macro adherence. Tighten up calories and protein first.`
  return `Off track — ${p}% macro adherence this week. Refocus on hitting calorie and protein targets.`
}
