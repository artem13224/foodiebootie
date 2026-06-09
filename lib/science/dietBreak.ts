/**
 * Diet-break recommendation.
 *
 * Action layer on top of the EXISTING adaptation detection (lib/science/adaptation.ts).
 * Does NOT re-detect adaptation — it consumes already-computed adaptation output
 * (suppression %, weeks in deficit) and the user's real adaptive TDEE to produce a
 * concrete maintenance-break recommendation.
 *
 * Reference: Rosenbaum M, Leibel RL. Adaptive thermogenesis in humans.
 * Curr Opin Clin Nutr Metab Care. 2010;13(6):685-692.
 */

export interface AdaptationDetail {
  suppression_pct?: number
  deficit_weeks?: number
  adaptation_severity?: 'mild' | 'moderate' | null
}

/**
 * Parse the adaptation detail out of a tdee_estimates.notes JSON string.
 * Returns null if notes is absent or malformed.
 */
export function parseAdaptationDetail(notes: string | null): AdaptationDetail | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes) as AdaptationDetail
    return {
      suppression_pct: parsed.suppression_pct,
      deficit_weeks: parsed.deficit_weeks,
      adaptation_severity: parsed.adaptation_severity ?? null,
    }
  } catch {
    return null
  }
}

export interface DietBreakRecommendation {
  /** Suggested break length in days (longer for more severe suppression). */
  breakDays: number
  /** Maintenance calorie target during the break = the user's real adaptive TDEE. */
  maintenanceKcal: number
  /** Headline string for the card. */
  headline: string
  /** Body string for the card. */
  body: string
}

/**
 * Build the diet-break recommendation from real adaptation output + adaptive TDEE.
 *
 * - 7-day break for mild suppression, 10-day for moderate/severe.
 * - Maintenance number IS the adaptive TDEE (eat at output to restore it).
 */
export function buildDietBreakRecommendation(params: {
  adaptiveTDEE: number
  suppressionPct: number
  deficitWeeks: number
  severity?: 'mild' | 'moderate' | null
}): DietBreakRecommendation {
  const { adaptiveTDEE, suppressionPct, deficitWeeks, severity } = params
  const breakDays = severity === 'moderate' || suppressionPct > 15 ? 10 : 7
  const maintenanceKcal = Math.round(adaptiveTDEE)

  const headline = 'DIET BREAK SUGGESTED'
  const body =
    `TDEE down ${suppressionPct}% over ${deficitWeeks} ` +
    `week${deficitWeeks === 1 ? '' : 's'} of deficit. ` +
    `Consider a ${breakDays}-day maintenance break at ~${maintenanceKcal.toLocaleString()} kcal to restore output.`

  return { breakDays, maintenanceKcal, headline, body }
}
