/**
 * Supplement nutrient-intake + Tolerable-Upper-Intake-Level (UL) safety engine.
 *
 * Pure functions only — no DB, no I/O. The API route feeds it today's logged
 * supplement nutrients (already in canonical units) plus the user's personalized
 * DRI reference values (matched by age + sex + life_stage), and gets back a
 * per-nutrient summary with % of RDA/AI and UL-safety status.
 *
 * UL is THE defining safety feature: a nutrient is only ever UL-evaluated when a
 * UL exists for it (has_ul / ul != null). We never invent a ceiling.
 */

export interface LoggedNutrientContribution {
  key: string
  /** canonical amount PER SERVING of the supplement */
  amountPerServing: number
  /** servings taken (logged) */
  servings: number
  supplementName: string
}

export interface NutrientReference {
  display: string
  category: 'vitamin' | 'mineral' | 'other'
  canonicalUnit: 'mcg' | 'mg' | 'g'
  hasUl: boolean
  sortOrder: number
  rda: number | null
  ai: number | null
  ul: number | null
}

export type UlStatus = 'ok' | 'approaching' | 'exceeded'

export interface NutrientIntakeResult {
  key: string
  display: string
  category: 'vitamin' | 'mineral' | 'other'
  canonicalUnit: 'mcg' | 'mg' | 'g'
  total: number
  target: number | null
  targetType: 'rda' | 'ai' | null
  pctOfTarget: number | null
  hasUl: boolean
  ul: number | null
  ulPct: number | null
  ulStatus: UlStatus | null
  contributors: string[]
}

/** UL is "approaching" at ≥80% and "exceeded" at ≥100% of the limit. */
export const UL_APPROACHING = 0.8

export function computeSupplementIntake(
  contributions: LoggedNutrientContribution[],
  references: Record<string, NutrientReference>,
): NutrientIntakeResult[] {
  // Sum canonical totals per nutrient key, tracking contributing supplements.
  const totals: Record<string, number> = {}
  const contributors: Record<string, Set<string>> = {}

  for (const c of contributions) {
    const add = c.amountPerServing * c.servings
    if (!isFinite(add)) continue
    totals[c.key] = (totals[c.key] ?? 0) + add
    ;(contributors[c.key] ??= new Set()).add(c.supplementName)
  }

  const results: NutrientIntakeResult[] = []
  for (const [key, total] of Object.entries(totals)) {
    const ref = references[key]
    if (!ref) continue // no reference seeded — skip rather than guess

    const target = ref.rda ?? ref.ai ?? null
    const targetType: 'rda' | 'ai' | null = ref.rda != null ? 'rda' : ref.ai != null ? 'ai' : null
    const pctOfTarget = target && target > 0 ? (total / target) * 100 : null

    let ulPct: number | null = null
    let ulStatus: UlStatus | null = null
    if (ref.hasUl && ref.ul != null && ref.ul > 0) {
      ulPct = (total / ref.ul) * 100
      ulStatus = total >= ref.ul ? 'exceeded' : total >= ref.ul * UL_APPROACHING ? 'approaching' : 'ok'
    }

    results.push({
      key,
      display: ref.display,
      category: ref.category,
      canonicalUnit: ref.canonicalUnit,
      total: Math.round(total * 1000) / 1000,
      target,
      targetType,
      pctOfTarget: pctOfTarget != null ? Math.round(pctOfTarget) : null,
      hasUl: ref.hasUl,
      ul: ref.ul,
      ulPct: ulPct != null ? Math.round(ulPct) : null,
      ulStatus,
      contributors: Array.from(contributors[key] ?? []),
    })
  }

  // Surface UL risks first, then by catalog sort order.
  const rank = (r: NutrientIntakeResult) =>
    r.ulStatus === 'exceeded' ? 0 : r.ulStatus === 'approaching' ? 1 : 2
  results.sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    return (references[a.key]?.sortOrder ?? 999) - (references[b.key]?.sortOrder ?? 999)
  })
  return results
}
