import { getDailyTarget } from './tdee'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MacroTargetResult {
  protein_g: number
  fat_g: number
  carbs_g: number
  daily_kcal_target: number
  deficit_or_surplus_kcal: number
}

// ─── Macro calculation ────────────────────────────────────────────────────────

/**
 * Priority-order macro split: protein first, fat floor second, carbs fill.
 *
 * Reference (protein): Morton RW et al. A systematic review, meta-analysis and
 * meta-regression of the effect of protein supplementation on resistance
 * training-induced gains in muscle mass and strength in healthy adults.
 * Br J Sports Med. 2018;52(6):376-384.
 *
 * Reference (protein athletes): Helms ER et al. Evidence-based recommendations
 * for natural bodybuilding contest preparation: nutrition and supplementation.
 * Int J Sport Nutr Exerc Metab. 2014.
 * (2.3–3.1 g/kg LBM range for lean athletes)
 *
 * Reference (fat minimum): Hamalainen E et al. Diet and serum sex hormones in
 * healthy men. J Steroid Biochem. 1984;20(1):459-464.
 * (fat minimum for hormonal health, especially testosterone maintenance)
 */
export function getMacroTargets(p: {
  tdee_kcal: number
  body_weight_kg: number
  lean_mass_kg: number | null
  protein_g_per_kg_lbm: number  // user preference, default 2.4
  goal_rate_kg_per_week: number
}): MacroTargetResult {
  // 1. Protein — use LBM if available, else body weight × 1.8
  const protein_g = Math.round(
    p.lean_mass_kg !== null
      ? p.lean_mass_kg * p.protein_g_per_kg_lbm
      : p.body_weight_kg * 1.8
  )

  // 2. Fat floor — max(body_weight × 0.7g/kg, 40g minimum)
  const fat_g = Math.round(Math.max(p.body_weight_kg * 0.7, 40))

  // 3. Daily target from TDEE and goal rate
  const daily_kcal_target = getDailyTarget(p.tdee_kcal, p.goal_rate_kg_per_week)

  // 4. Carbs fill remaining kcal
  const carb_kcal = daily_kcal_target - protein_g * 4 - fat_g * 9
  const carbs_g = Math.max(0, Math.round(carb_kcal / 4))

  // 5. Surplus/deficit for display
  const deficit_or_surplus_kcal = daily_kcal_target - p.tdee_kcal

  return {
    protein_g,
    fat_g,
    carbs_g,
    daily_kcal_target,
    deficit_or_surplus_kcal,
  }
}
