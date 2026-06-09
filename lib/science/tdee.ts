import type { TDEEConfidence } from '@/types'
import { daysBetween } from './utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeightLogEntry {
  logged_at: string   // YYYY-MM-DD
  weight_kg: number
}

export interface FoodLogEntry {
  logged_date: string  // YYYY-MM-DD
  kcal: number
}

export interface RollingPoint {
  date: string
  raw_weight: number
  rolling_avg: number
}

export interface TDEEResult {
  tdee_kcal: number
  confidence: TDEEConfidence
  data_points: number
  method: 'formula' | 'adaptive_regression'
  adaptation_flag: boolean
  // Debug intermediates returned from API for transparency
  weekly_tdees?: number[]
  regression_weights?: number[]
  formula_tdee?: number
  weekly_variances?: number[]
}

// ─── EWMA Trend Weight ────────────────────────────────────────────────────────

/**
 * Exponentially Weighted Moving Average (EWMA) trend weight.
 *
 * Replaces the plain rolling-average approach with a true EWMA, which is
 * more responsive to sustained changes while still suppressing day-to-day
 * glycogen and water-retention noise.
 *
 * Smoothing factor: α = 0.1
 * Effective half-life: t½ = ln(0.5) / ln(1 − α) ≈ 6.6 days.
 * This matches the convention used by MacroFactor and is grounded in the
 * Thomas et al. 2014 weight-change model — short-term fluctuations decay
 * within ~2 weeks while real fat-mass trends accumulate.
 *
 * Seeded from the first observation; no warm-up period needed because
 * physiological outliers are rare and self-correct within ~3 readings.
 *
 * The field name `rolling_avg` is kept for backward compatibility with all
 * downstream consumers (WeightChart, adaptive TDEE, profile page, etc.).
 *
 * Reference: Thomas DM et al. A mathematical model of weight change with
 * adaptation. Int J Obes. 2014;38(12):1565-1570.
 */
export function getRollingAverage(
  logs: WeightLogEntry[],
): RollingPoint[] {
  const sorted = [...logs].sort((a, b) =>
    a.logged_at < b.logged_at ? -1 : a.logged_at > b.logged_at ? 1 : 0
  )

  if (sorted.length === 0) return []

  const ALPHA = 0.1  // ~6.6-day half-life; chosen to match MacroFactor's EWMA approach
  let ewma = sorted[0].weight_kg

  return sorted.map((entry, i) => {
    if (i > 0) {
      ewma = ALPHA * entry.weight_kg + (1 - ALPHA) * ewma
    }
    return {
      date: entry.logged_at,
      raw_weight: entry.weight_kg,
      rolling_avg: Math.round(ewma * 100) / 100,
    }
  })
}

// ─── Adaptive TDEE ────────────────────────────────────────────────────────────

/**
 * Weighted regression adaptive TDEE from actual intake vs. weight change.
 *
 * Core principle: intake - (weight_change_kg × 7700 kcal/kg) = TDEE.
 * More recent weeks are weighted more heavily. Noisy weeks (high variance)
 * and luteal phase weeks (if cycle tracking enabled) are downweighted.
 *
 * Minimum 7 weight logs required before switching from formula estimate.
 *
 * Reference: Hall KD et al. Quantification of the effect of energy imbalance
 * on bodyweight. Lancet. 2011;378(9793):826-837.
 * Reference: Thomas DM et al. Int J Obes. 2014;38(12):1565-1570.
 */
export function getAdaptiveTDEE(
  weightLogs: WeightLogEntry[],
  foodLogs: FoodLogEntry[],
  formulaTDEE: number,
  cycleTrackingEnabled = false,
  lastPeriodStart?: string,
  avgCycleLength = 28,
): TDEEResult {
  const dataPoints = weightLogs.length

  // Not enough data — fall back to formula
  if (dataPoints < 7) {
    return {
      tdee_kcal: Math.round(formulaTDEE),
      confidence: 'low',
      data_points: dataPoints,
      method: 'formula',
      adaptation_flag: false,
      formula_tdee: Math.round(formulaTDEE),
    }
  }

  const rollingPoints = getRollingAverage(weightLogs)

  // Sort all food logs by date
  const foodByDate = new Map<string, number>()
  for (const log of foodLogs) {
    const prev = foodByDate.get(log.logged_date) ?? 0
    foodByDate.set(log.logged_date, prev + log.kcal)
  }

  // Group rolling points into 4 most-recent calendar weeks (7-day buckets)
  const sorted = [...rollingPoints].sort((a, b) =>
    a.date > b.date ? -1 : a.date < b.date ? 1 : 0
  )
  const latestDate = sorted[0]?.date
  if (!latestDate) {
    return {
      tdee_kcal: Math.round(formulaTDEE),
      confidence: 'low',
      data_points: dataPoints,
      method: 'formula',
      adaptation_flag: false,
      formula_tdee: Math.round(formulaTDEE),
    }
  }

  // Build 4 weekly buckets, most recent first
  interface WeekBucket {
    points: RollingPoint[]
    foodKcals: number[]
    startDate: string
    endDate: string
  }

  const weeks: WeekBucket[] = []
  for (let w = 0; w < 4; w++) {
    const endDate = sorted.find(p => daysBetween(p.date, latestDate) >= w * 7)
    if (!endDate) continue

    const weekEndStr = sorted.find(p => daysBetween(p.date, latestDate) >= w * 7)?.date
    const weekStartStr = sorted.find(p => daysBetween(p.date, latestDate) >= (w + 1) * 7)?.date

    // Collect points in this week
    const weekPoints = sorted.filter(p => {
      const d = daysBetween(p.date, latestDate)
      return d >= w * 7 && d < (w + 1) * 7
    })

    if (weekPoints.length < 2) continue  // need at least 2 points per week for delta

    const weekFoodKcals = weekPoints
      .map(p => foodByDate.get(p.date) ?? null)
      .filter((v): v is number => v !== null)

    weeks.push({
      points: weekPoints,
      foodKcals: weekFoodKcals,
      startDate: weekStartStr ?? weekPoints[weekPoints.length - 1].date,
      endDate: weekEndStr ?? weekPoints[0].date,
    })
  }

  if (weeks.length < 2) {
    // Not enough weekly data yet
    return {
      tdee_kcal: Math.round(formulaTDEE),
      confidence: dataPoints >= 7 ? 'low' : 'low',
      data_points: dataPoints,
      method: 'formula',
      adaptation_flag: false,
      formula_tdee: Math.round(formulaTDEE),
    }
  }

  // For each consecutive week pair, compute implied TDEE
  // weeks[0] = most recent week, weeks[1] = week before, etc.
  // We need weekly pairs: week[i] and week[i+1] for weight delta
  const REGRESSION_WEIGHTS = [0.10, 0.20, 0.30, 0.40]  // oldest → newest

  const weeklyTDEEs: number[] = []
  const weeklyVariances: number[] = []
  const usedWeights: number[] = []

  for (let i = 0; i < weeks.length - 1; i++) {
    const newerWeek = weeks[i]
    const olderWeek = weeks[i + 1]

    // Rolling average at start and end of the pair
    const startAvgWeight = olderWeek.points[olderWeek.points.length - 1].rolling_avg
    const endAvgWeight = newerWeek.points[0].rolling_avg

    const deltaWeightKg = endAvgWeight - startAvgWeight
    const daysSpanned = daysBetween(
      olderWeek.points[olderWeek.points.length - 1].date,
      newerWeek.points[0].date,
    )
    if (daysSpanned <= 0) continue

    // Average daily intake for the newer week
    const avgDailyIntake =
      newerWeek.foodKcals.length > 0
        ? newerWeek.foodKcals.reduce((s, v) => s + v, 0) / newerWeek.foodKcals.length
        : null

    if (avgDailyIntake === null) continue

    // TDEE = intake - (weight_change_kg_per_day × 7700)
    const weightChangePerDay = deltaWeightKg / daysSpanned
    const impliedTDEE = avgDailyIntake - weightChangePerDay * 7700

    if (impliedTDEE <= 0 || impliedTDEE > 8000) continue  // reject physiologically impossible values

    // Weight variance within the week (noise indicator)
    const rawWeights = newerWeek.points.map(p => p.raw_weight)
    const mean = rawWeights.reduce((s, v) => s + v, 0) / rawWeights.length
    const variance = Math.max(...rawWeights.map(v => Math.abs(v - mean)))
    weeklyVariances.push(variance)

    // Base regression weight: index i=0 is most recent pair → highest weight
    // With 4 weeks, pairs are: [0,1], [1,2], [2,3] → 3 pairs
    // Map: pair 0 (most recent) → weight[3], pair 1 → weight[2], pair 2 → weight[1]
    const pairCount = Math.min(weeks.length - 1, 4)
    const baseWeightIdx = REGRESSION_WEIGHTS.length - 1 - i  // most recent pair gets highest weight
    let regWeight = REGRESSION_WEIGHTS[Math.max(0, baseWeightIdx)]

    // Bayesian noise filter: high variance week → downweight by 50%
    if (variance > 1.5) {
      regWeight *= 0.5
    }

    // Cycle tracking: luteal phase downweight by 30%
    if (cycleTrackingEnabled && lastPeriodStart) {
      const weekMidpoint = newerWeek.points[Math.floor(newerWeek.points.length / 2)].date
      const daysSincePeriod = daysBetween(lastPeriodStart, weekMidpoint) % avgCycleLength
      if (daysSincePeriod >= 14 && daysSincePeriod <= 28) {
        regWeight *= 0.7
      }
    }

    weeklyTDEEs.push(impliedTDEE)
    usedWeights.push(regWeight)
  }

  if (weeklyTDEEs.length === 0) {
    return {
      tdee_kcal: Math.round(formulaTDEE),
      confidence: 'low',
      data_points: dataPoints,
      method: 'formula',
      adaptation_flag: false,
      formula_tdee: Math.round(formulaTDEE),
    }
  }

  // Weighted average TDEE
  const totalWeight = usedWeights.reduce((s, w) => s + w, 0)
  const weightedTDEE =
    weeklyTDEEs.reduce((sum, tdee, i) => sum + tdee * usedWeights[i], 0) / totalWeight

  const confidence: TDEEConfidence =
    dataPoints >= 14 ? 'high' : dataPoints >= 7 ? 'medium' : 'low'

  return {
    tdee_kcal: Math.round(weightedTDEE),
    confidence,
    data_points: dataPoints,
    method: 'adaptive_regression',
    adaptation_flag: false,  // set by detectAdaptation separately
    weekly_tdees: weeklyTDEEs.map(v => Math.round(v)),
    regression_weights: usedWeights,
    formula_tdee: Math.round(formulaTDEE),
    weekly_variances: weeklyVariances,
  }
}

// ─── Goal helpers ─────────────────────────────────────────────────────────────

/**
 * Daily calorie target from TDEE and desired rate of change.
 *
 * Reference: Build Guide §9.7
 * weekly_kcal_change = rate_kg_per_week × 7700 kcal/kg body tissue
 */
export function getDailyTarget(
  tdee_kcal: number,
  rate_kg_per_week: number,
): number {
  const weeklyKcalChange = rate_kg_per_week * 7700
  const dailyKcalChange = weeklyKcalChange / 7
  return Math.round(tdee_kcal - dailyKcalChange)
}

/**
 * Estimated date to reach goal weight at the given rate.
 *
 * Reference: Build Guide §9.7
 */
export function getGoalETA(
  current_weight_kg: number,
  goal_weight_kg: number,
  rate_kg_per_week: number,
): Date {
  if (rate_kg_per_week <= 0) {
    // Maintenance — no ETA
    const far = new Date()
    far.setFullYear(far.getFullYear() + 99)
    return far
  }
  const weeks = Math.abs(current_weight_kg - goal_weight_kg) / rate_kg_per_week
  const eta = new Date()
  eta.setDate(eta.getDate() + Math.round(weeks * 7))
  return eta
}
