import type { ActivityLevel } from '@/types'

// ─── Age helper ───────────────────────────────────────────────────────────────

/** Calculate age in whole years from date of birth. */
export function getAgeFromDOB(dob: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1
  }
  return age
}

// ─── RMR Formulas ─────────────────────────────────────────────────────────────

/**
 * Mifflin-St Jeor equation for Resting Metabolic Rate.
 * Best general-population accuracy without body composition data.
 *
 * Reference: Mifflin MD et al. A new predictive equation for resting energy
 * expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.
 */
export function calculateMifflin(p: {
  weight_kg: number
  height_cm: number
  age: number
  sex: 'male' | 'female' | 'other'
}): number {
  const base = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age
  if (p.sex === 'male') return base + 5
  if (p.sex === 'female') return base - 161
  // 'other': average of male and female as a reasonable neutral estimate
  return base + (5 + -161) / 2   // base - 78
}

/**
 * Katch-McArdle equation — more accurate when lean body mass is known.
 *
 * Reference: McArdle WD, Katch FI, Katch VL.
 * Exercise Physiology: Energy, Nutrition and Human Performance. 1996.
 */
export function calculateKatchMcArdle(lean_mass_kg: number): number {
  return 370 + 21.6 * lean_mass_kg
}

/**
 * Cunningham equation — best for athletes and highly active individuals.
 *
 * Reference: Cunningham JJ. A reanalysis of the factors influencing basal
 * metabolic rate in normal adults. Am J Clin Nutr. 1980;33(11):2372-2374.
 */
export function calculateCunningham(lean_mass_kg: number): number {
  return 500 + 22 * lean_mass_kg
}

// ─── Activity Multipliers ─────────────────────────────────────────────────────

/**
 * Harris-Benedict activity factors.
 * Reference: Build Guide §9.2 / standard Harris-Benedict revision.
 */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:        1.2,    // Desk job, no exercise
  lightly_active:   1.375,  // Light exercise 1–3 days/week
  moderately_active: 1.55,  // Moderate exercise 3–5 days/week
  very_active:      1.725,  // Hard exercise 6–7 days/week
  extra_active:     1.9,    // Physical job + hard daily training
}

export function getActivityMultiplier(level: ActivityLevel): number {
  return ACTIVITY_MULTIPLIERS[level]
}

// ─── Ensemble ─────────────────────────────────────────────────────────────────

export interface RMREnsembleResult {
  /** Ensemble RMR (before activity multiplier). */
  rmr: number
  /** TDEE = rmr × activity multiplier. */
  tdee: number
  mifflin: number
  katch: number | null
  cunningham: number | null
}

/**
 * Weighted RMR ensemble per Build Guide §9.1.
 *
 * Without body composition data: uses Mifflin only.
 * With body composition data:
 *   Active (very_active / extra_active):
 *     mifflin×0.2 + katch×0.3 + cunningham×0.5
 *   Other:
 *     mifflin×0.3 + katch×0.4 + cunningham×0.3
 */
export function getRMREnsemble(
  profile: {
    weight_kg: number
    height_cm: number
    age: number
    sex: string
    activity_level: ActivityLevel
  },
  bodyComp: { lean_mass_kg: number } | null,
): RMREnsembleResult {
  const sex = profile.sex as 'male' | 'female' | 'other'
  const mifflin = calculateMifflin({
    weight_kg: profile.weight_kg,
    height_cm: profile.height_cm,
    age: profile.age,
    sex,
  })

  const multiplier = getActivityMultiplier(profile.activity_level)

  if (!bodyComp) {
    return {
      rmr: mifflin,
      tdee: mifflin * multiplier,
      mifflin,
      katch: null,
      cunningham: null,
    }
  }

  const katch = calculateKatchMcArdle(bodyComp.lean_mass_kg)
  const cunningham = calculateCunningham(bodyComp.lean_mass_kg)

  const isActive =
    profile.activity_level === 'very_active' ||
    profile.activity_level === 'extra_active'

  const rmr = isActive
    ? mifflin * 0.2 + katch * 0.3 + cunningham * 0.5
    : mifflin * 0.3 + katch * 0.4 + cunningham * 0.3

  return {
    rmr,
    tdee: rmr * multiplier,
    mifflin,
    katch,
    cunningham,
  }
}
