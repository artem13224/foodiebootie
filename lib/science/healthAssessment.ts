/**
 * Health-assessment recommendation engine (pure, no I/O).
 *
 * Maps a user's quiz answers → evidence-graded supplement suggestions, applies
 * a safety layer (contraindications from meds / conditions / pregnancy /
 * lactation EXCLUDE an item with a heads-up), and caps doses at the Tolerable
 * Upper Intake Level. It never invents nutrients or doses — every candidate
 * comes from the seeded `recommendable_supplements` catalog (with citations).
 *
 * This is a decision-support tool, not medical advice; the UI must show a
 * disclaimer and the safety flags this returns.
 */

export interface RecommendableSupplement {
  key: string
  name: string
  category: string
  maps_to_nutrient_key: string | null
  default_dose_low: number | null
  default_dose_high: number | null
  dose_unit: string | null
  evidence_grade: 'strong' | 'moderate' | 'limited'
  evidence_summary: string | null
  citation: string | null
  goals: string[]
  diet_flags: string[]
  sex: string
  contraindications: string[]
  caution: string | null
  ul_nutrient_key: string | null
  sort_order: number
}

export interface AssessmentResponses {
  goals: string[]                 // energy, sleep, stress, immunity, performance, recovery, bone_joint, gut, cognition, skin_hair
  diet: 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian'
  sunExposure: 'low' | 'moderate' | 'high'
  training: 'none' | 'light' | 'regular' | 'intense'
  meds: string[]                  // anticoagulant→warfarin, thyroid_med
  conditions: string[]            // kidney_disease, autoimmune, hemochromatosis
  pregnant?: boolean
  lactating?: boolean
}

export interface Recommendation {
  key: string
  name: string
  category: string
  doseLow: number | null
  doseHigh: number | null
  doseUnit: string | null
  grade: 'strong' | 'moderate' | 'limited'
  summary: string | null
  citation: string | null
  reason: string
  mapsToNutrientKey: string | null
  caution: string | null
  doseCappedByUl: boolean
}

export interface SafetyFlag {
  name: string
  reason: string
}

export interface AssessmentResult {
  recommendations: Recommendation[]
  safetyFlags: SafetyFlag[]
  priorities: string[]            // human-readable summary of what drove the suggestions
}

const GOAL_LABEL: Record<string, string> = {
  energy: 'low energy', sleep: 'sleep', stress: 'stress', immunity: 'immunity',
  performance: 'performance', recovery: 'recovery', bone_joint: 'bone & joint',
  gut: 'gut health', cognition: 'focus', skin_hair: 'skin & hair', general: 'general health',
}

const CONTRA_LABEL: Record<string, string> = {
  warfarin: 'a blood thinner', thyroid_med: 'thyroid medication',
  kidney_disease: 'kidney disease', autoimmune: 'an autoimmune condition',
  hemochromatosis: 'iron overload (hemochromatosis)',
  pregnancy: 'pregnancy', lactation: 'breastfeeding',
}

const GRADE_WEIGHT = { strong: 3, moderate: 2, limited: 1 }

function dietFlags(diet: AssessmentResponses['diet']): string[] {
  if (diet === 'vegan') return ['vegan', 'vegetarian']  // vegan ⊂ vegetarian gaps
  if (diet === 'vegetarian') return ['vegetarian']
  return []
}

export function runAssessment(
  responses: AssessmentResponses,
  demographic: { age: number; sex: 'male' | 'female' },
  catalog: RecommendableSupplement[],
  ulByNutrientKey: Record<string, number> = {},
): AssessmentResult {
  const userGoals = new Set(responses.goals ?? [])
  const userDiet = dietFlags(responses.diet)
  const userDietSet = new Set(userDiet)

  // Build the user's contraindication set from meds / conditions / life stage.
  const contra = new Set<string>([...(responses.meds ?? []), ...(responses.conditions ?? [])])
  if (responses.pregnant) contra.add('pregnancy')
  if (responses.lactating) contra.add('lactation')

  const scored: { rec: Recommendation; score: number }[] = []
  const safetyFlags: SafetyFlag[] = []

  for (const item of catalog) {
    // Sex targeting (e.g. iron / folate emphasised for females).
    if (item.sex !== 'any' && item.sex !== demographic.sex) continue

    const matchedGoals = item.goals.filter(g => userGoals.has(g))
    const dietMatch = item.diet_flags.some(f => userDietSet.has(f))
    const sunBoost = responses.sunExposure === 'low' && item.key === 'vitamin_d3'

    // Relevance gate: must match a goal, a diet gap, or the sun-vitamin-D rule.
    if (matchedGoals.length === 0 && !dietMatch && !sunBoost) continue

    // Safety: any contraindication overlap → exclude + flag.
    const hit = item.contraindications.find(c => contra.has(c))
    if (hit) {
      safetyFlags.push({
        name: item.name,
        reason: `Not suggested because you noted ${CONTRA_LABEL[hit] ?? hit}.`,
      })
      continue
    }

    // Dose, capped at UL where applicable.
    let doseHigh = item.default_dose_high
    let capped = false
    if (item.ul_nutrient_key && ulByNutrientKey[item.ul_nutrient_key] != null && doseHigh != null) {
      const ul = ulByNutrientKey[item.ul_nutrient_key]
      // Only meaningful when dose unit matches the nutrient's canonical unit
      // (mg/mcg). IU-dosed items (e.g. vitamin D) are pre-capped in the catalog.
      if ((item.dose_unit === 'mg' || item.dose_unit === 'mcg') && doseHigh > ul) {
        doseHigh = ul
        capped = true
      }
    }

    // Reason text.
    const parts: string[] = []
    if (matchedGoals.length) parts.push(matchedGoals.map(g => GOAL_LABEL[g] ?? g).join(', '))
    if (dietMatch) parts.push(`your ${responses.diet} diet`)
    if (sunBoost && !matchedGoals.length && !dietMatch) parts.push('limited sun exposure')
    const reason = parts.length ? `For ${parts.join(' + ')}.` : 'General support.'

    const score =
      matchedGoals.length * 2 +
      (dietMatch ? 2 : 0) +
      (sunBoost ? 1 : 0) +
      GRADE_WEIGHT[item.evidence_grade]

    scored.push({
      score,
      rec: {
        key: item.key,
        name: item.name,
        category: item.category,
        doseLow: item.default_dose_low,
        doseHigh,
        doseUnit: item.dose_unit,
        grade: item.evidence_grade,
        summary: item.evidence_summary,
        citation: item.citation,
        reason,
        mapsToNutrientKey: item.maps_to_nutrient_key,
        caution: item.caution,
        doseCappedByUl: capped,
      },
    })
  }

  // Rank: relevance/grade score desc, then catalog sort order.
  const sortOrder = new Map(catalog.map(c => [c.key, c.sort_order]))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (sortOrder.get(a.rec.key) ?? 999) - (sortOrder.get(b.rec.key) ?? 999)
  })
  const recs = scored.map(s => s.rec)

  const priorities = [
    ...Array.from(userGoals).map(g => GOAL_LABEL[g] ?? g),
    ...(responses.diet !== 'omnivore' ? [`${responses.diet} diet`] : []),
    ...(responses.sunExposure === 'low' ? ['limited sun'] : []),
  ]

  return { recommendations: recs.slice(0, 10), safetyFlags, priorities }
}
