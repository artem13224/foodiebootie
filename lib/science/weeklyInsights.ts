/**
 * Weekly reflection insight strings.
 *
 * Pre-written, threshold-triggered strings — no AI, no dynamic generation.
 * Shared between app/(app)/profile/page.tsx and app/(app)/weekly-checkin/page.tsx.
 */

export interface WeightLogMin {
  logged_at: string
  weight_kg: number
}

export interface WeeklyInsightInputs {
  /** Number of days this week (Mon–Sun) that have ≥1 food log entry. */
  weekFoodDays: number
  /** Weight log entries that fall within this Mon–Sun week. */
  weekWeightLogs: WeightLogMin[]
  /** EWMA delta for the week (end − start). Positive = gained, negative = lost. */
  weeklyWeightTrendKg: number | null
  /** Days this week where logged protein ≥ daily target. null = no target set, skip insight. */
  weekProteinDays: number | null
  /** User's preferred unit system. */
  unitSystem: 'metric' | 'imperial'
}

export interface WeeklyInsights {
  /** Always present — logging consistency. */
  loggingInsight: string
  /** Always present — weight trend (may be "log more" message if < 2 weigh-ins). */
  weightInsight: string
  /** null = no protein target configured; omit entirely from UI. */
  proteinInsight: string | null
}

export function computeWeeklyInsights(inputs: WeeklyInsightInputs): WeeklyInsights {
  const { weekFoodDays, weekWeightLogs, weeklyWeightTrendKg, weekProteinDays, unitSystem } = inputs

  // ── Logging consistency ───────────────────────────────────────────────────
  const loggingInsight = (() => {
    const n = weekFoodDays
    if (n === 7) return 'Perfect logging week — every day tracked.'
    if (n >= 5) return `Strong week — ${n} of 7 days logged.`
    if (n >= 3) return 'Partial week — data may be less reliable.'
    return 'Not enough logged this week to draw conclusions.'
  })()

  // ── Weight trend ──────────────────────────────────────────────────────────
  const weightInsight = (() => {
    if (weekWeightLogs.length < 2) return 'Log more weigh-ins for a reliable trend.'
    if (weeklyWeightTrendKg == null) return 'Log more weigh-ins for a reliable trend.'
    const unitStr = unitSystem === 'imperial' ? 'lbs' : 'kg'
    const delta = unitSystem === 'imperial'
      ? Math.abs(Math.round(weeklyWeightTrendKg * 2.20462 * 10) / 10)
      : Math.abs(Math.round(weeklyWeightTrendKg * 10) / 10)
    if (Math.abs(weeklyWeightTrendKg) < 0.1) return 'Trend weight holding steady.'
    if (weeklyWeightTrendKg < -0.05) return `Trend weight down ${delta} ${unitStr} this week.`
    if (weeklyWeightTrendKg > 0.05) return `Trend weight up ${delta} ${unitStr} this week.`
    return 'Trend weight holding steady.'
  })()

  // ── Protein adherence (skip entirely if no target) ────────────────────────
  const proteinInsight = (() => {
    if (weekProteinDays === null) return null
    const n = weekProteinDays
    if (n >= Math.round(7 * 0.8)) return `Protein on point — hit target ${n} of 7 days.`
    if (n >= Math.round(7 * 0.5)) return `Protein inconsistent — ${n} of 7 days on target.`
    return `Protein low this week — ${n} of 7 days on target.`
  })()

  return { loggingInsight, weightInsight, proteinInsight }
}
