/**
 * What-if goal projection modeling — with hard guardrails.
 *
 * Projections are only meaningful once the adaptive TDEE has converged and
 * enough real intake/weight history exists. The eligibility gate below MUST be
 * checked before any scenario is rendered — otherwise the numbers mislead.
 *
 * All projections are grounded in the REAL adaptive TDEE and the user's REAL
 * observed rate of weight change — never the formula estimate. They are clearly
 * labeled as estimates and intentionally limited to 1–2 scenarios.
 *
 * Reference: Hall KD et al. Quantification of the effect of energy imbalance on
 * bodyweight. Lancet. 2011;378(9793):826-837.
 */

const KCAL_PER_KG = 7700

export interface WhatIfEligibility {
  eligible: boolean
  reason?: string
}

/**
 * Guardrail gate. Eligible only when TDEE confidence is medium/high AND at
 * least 3 weeks of data exist.
 */
export function checkWhatIfEligibility(params: {
  confidence: 'low' | 'medium' | 'high' | null
  weeksOfData: number
}): WhatIfEligibility {
  const { confidence, weeksOfData } = params
  if (confidence !== 'medium' && confidence !== 'high') {
    return { eligible: false, reason: 'Need more data for projections' }
  }
  if (weeksOfData < 3) {
    return { eligible: false, reason: 'Need more data for projections' }
  }
  return { eligible: true }
}

export interface WhatIfProjection {
  /** Remaining weight to goal, kg (absolute). */
  remainingKg: number
  /** Baseline: observed rate (kg/week, absolute) and ETA. null if rate ≈ 0 / wrong direction. */
  baselineRateKgPerWeek: number | null
  baselineETA: Date | null
  /** Scenario: projected rate at the target adherence + ETA. */
  scenarioRateKgPerWeek: number
  scenarioETA: Date
  /** Adherence % the scenario assumes. */
  targetAdherencePct: number
  /** Whole weeks sooner (positive) or later (negative) vs baseline. null if no baseline. */
  weeksDelta: number | null
}

/**
 * Build a single what-if scenario.
 *
 * - `plannedRate` = (adaptiveTDEE − dailyTarget) × 7 / 7700 — the rate you'd
 *   achieve eating exactly at target every day.
 * - Scenario assumes you realize `targetAdherencePct`% of that planned deficit.
 * - Baseline uses the user's REAL observed rate from weight logs.
 *
 * Caller must have already confirmed eligibility via checkWhatIfEligibility().
 */
export function projectWhatIf(params: {
  adaptiveTDEE: number
  dailyKcalTarget: number
  currentWeightKg: number
  goalWeightKg: number
  observedRateKgPerWeek: number | null  // signed magnitude toward goal; absolute used
  targetAdherencePct: number            // e.g. 90
}): WhatIfProjection {
  const {
    adaptiveTDEE, dailyKcalTarget, currentWeightKg, goalWeightKg,
    observedRateKgPerWeek, targetAdherencePct,
  } = params

  const remainingKg = Math.abs(currentWeightKg - goalWeightKg)

  // Planned daily energy gap → planned weekly rate (absolute kg/week).
  const plannedDailyGap = Math.abs(adaptiveTDEE - dailyKcalTarget)
  const plannedRate = (plannedDailyGap * 7) / KCAL_PER_KG

  // Scenario realizes targetAdherence% of the planned rate.
  const scenarioRate = Math.max(0.01, plannedRate * (targetAdherencePct / 100))
  const scenarioWeeks = remainingKg / scenarioRate
  const scenarioETA = addWeeks(scenarioWeeks)

  // Baseline from real observed rate.
  const obsAbs = observedRateKgPerWeek != null ? Math.abs(observedRateKgPerWeek) : null
  let baselineRateKgPerWeek: number | null = null
  let baselineETA: Date | null = null
  let weeksDelta: number | null = null

  if (obsAbs != null && obsAbs > 0.01) {
    baselineRateKgPerWeek = obsAbs
    const baselineWeeks = remainingKg / obsAbs
    baselineETA = addWeeks(baselineWeeks)
    weeksDelta = Math.round(baselineWeeks - scenarioWeeks)
  }

  return {
    remainingKg,
    baselineRateKgPerWeek,
    baselineETA,
    scenarioRateKgPerWeek: scenarioRate,
    scenarioETA,
    targetAdherencePct,
    weeksDelta,
  }
}

function addWeeks(weeks: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + Math.round(weeks * 7))
  return d
}
