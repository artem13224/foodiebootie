/**
 * Supplement timing engine (pure, no I/O).
 *
 * Spaces a user's supplements across the day so they're taken safely rather than
 * all at once — accounting for (a) fat-soluble absorption, (b) mineral
 * competition (iron ↔ calcium/zinc/magnesium), (c) stimulating vs calming
 * effects, and (d) binders (fiber). Defaults deliberately separate the major
 * antagonists into different slots.
 *
 * SCIENCE / SOURCES (per-token, documented inline):
 *  - Fat-soluble vitamins (A, D, E, K) & omega-3 absorb best WITH a fat-
 *    containing meal. (Dawson-Hughes 2015; NIH ODS Vitamin D / Omega-3)
 *  - Iron: empty stomach or with vitamin C; coffee/tea, calcium, zinc and
 *    magnesium reduce absorption — separate by ~2 h. (NIH ODS Iron)
 *  - Calcium: with food, ≤500 mg/dose; keep ≥2 h from iron and thyroid meds.
 *    (NIH ODS Calcium)
 *  - Magnesium: evening supports relaxation/sleep; separate from high-dose
 *    calcium/iron. (NIH ODS Magnesium)
 *  - Zinc: with food to limit nausea; competes with iron/calcium/copper.
 *    (NIH ODS Zinc)
 *  - B-vitamins/B12: morning; can be mildly energizing. (NIH ODS)
 *  - Creatine: any time, daily consistency matters most. (ISSN 2017)
 *  - Melatonin: 30–60 min before bed. (Ferracioli-Oda 2013)
 *  - Ashwagandha: with food; evening suits stress/sleep goals.
 *  - Psyllium fiber: with water, ~1–2 h apart from minerals & medications
 *    (binds). (EFSA/AHA)
 *
 * This is general guidance, not medical advice.
 */

export type SlotKey = 'morning' | 'breakfast' | 'midday' | 'dinner' | 'bedtime'

export interface SlotDef { key: SlotKey; label: string; foodHint: string }

export const SLOTS: SlotDef[] = [
  { key: 'morning',   label: 'MORNING',        foodHint: 'On an empty stomach' },
  { key: 'breakfast', label: 'WITH BREAKFAST', foodHint: 'With a meal (some fat)' },
  { key: 'midday',    label: 'MIDDAY',         foodHint: 'With a light meal' },
  { key: 'dinner',    label: 'WITH DINNER',    foodHint: 'With your evening meal' },
  { key: 'bedtime',   label: 'BEFORE BED',     foodHint: '30–60 min before sleep' },
]

interface TimingRule { slot: SlotKey; note: string; antagonists: string[] }

// token → rule. Antagonists are token names that shouldn't share a slot.
const RULES: Record<string, TimingRule> = {
  iron:         { slot: 'morning',   note: 'Empty stomach with vitamin C; keep coffee, tea & calcium ≥2 h away.', antagonists: ['calcium', 'zinc', 'magnesium', 'multivitamin', 'fiber'] },
  vitamin_c:    { slot: 'morning',   note: 'Pairs with iron to boost absorption.', antagonists: [] },
  b_vitamins:   { slot: 'breakfast', note: 'Mildly energizing — take earlier in the day.', antagonists: [] },
  iodine:       { slot: 'breakfast', note: 'Morning; separate from thyroid medication timing.', antagonists: [] },
  fat_soluble:  { slot: 'breakfast', note: 'Fat-soluble — absorbs best with dietary fat.', antagonists: [] },
  multivitamin: { slot: 'breakfast', note: 'Take with food; contains many nutrients including competing minerals.', antagonists: ['iron'] },
  creatine:     { slot: 'breakfast', note: 'Any time daily — consistency matters most.', antagonists: [] },
  probiotic:    { slot: 'breakfast', note: 'With breakfast (strain-dependent); be consistent.', antagonists: [] },
  collagen:     { slot: 'breakfast', note: 'Any time, with food.', antagonists: [] },
  l_theanine:   { slot: 'morning',   note: 'Calm focus — pairs with morning caffeine.', antagonists: [] },
  zinc:         { slot: 'midday',    note: 'With food; keep apart from iron & calcium.', antagonists: ['iron', 'calcium', 'multivitamin'] },
  fiber:        { slot: 'midday',    note: 'With a full glass of water; ~1–2 h from minerals & medication.', antagonists: ['iron', 'calcium', 'zinc', 'multivitamin'] },
  coq10:        { slot: 'dinner',    note: 'Fat-soluble — take with a meal.', antagonists: [] },
  omega_3:      { slot: 'dinner',    note: 'With a meal; take separately if it repeats on you.', antagonists: [] },
  calcium:      { slot: 'dinner',    note: 'With food, ≤500 mg at once; keep ≥2 h from iron.', antagonists: ['iron', 'zinc', 'multivitamin'] },
  ashwagandha:  { slot: 'bedtime',   note: 'With food; evening suits stress & sleep.', antagonists: [] },
  magnesium:    { slot: 'bedtime',   note: 'Evening supports relaxation and sleep.', antagonists: ['iron', 'calcium'] },
  melatonin:    { slot: 'bedtime',   note: '30–60 min before bed; lowest effective dose.', antagonists: [] },
  general:      { slot: 'breakfast', note: 'With a meal.', antagonists: [] },
}

const FAT_SOLUBLE = new Set(['vitamin_d', 'vitamin_a', 'vitamin_e', 'vitamin_k'])
const B_VITAMINS = new Set(['thiamin', 'riboflavin', 'niacin', 'vitamin_b6', 'folate', 'vitamin_b12', 'pantothenic_acid', 'biotin'])

/** Match a non-DRI supplement by its name. */
function tokenFromName(name: string): string | null {
  const n = name.toLowerCase()
  if (n.includes('creatine')) return 'creatine'
  if (n.includes('omega') || n.includes('fish oil') || n.includes('epa') || n.includes('dha')) return 'omega_3'
  if (n.includes('melatonin')) return 'melatonin'
  if (n.includes('ashwagandha')) return 'ashwagandha'
  if (n.includes('theanine')) return 'l_theanine'
  if (n.includes('probiotic')) return 'probiotic'
  if (n.includes('psyllium') || n.includes('fiber') || n.includes('fibre')) return 'fiber'
  if (n.includes('collagen')) return 'collagen'
  if (n.includes('coq10') || n.includes('ubiquinone') || n.includes('coenzyme')) return 'coq10'
  if (n.includes('magnesium')) return 'magnesium'
  if (n.includes('calcium')) return 'calcium'
  if (n.includes('iron')) return 'iron'
  if (n.includes('zinc')) return 'zinc'
  return null
}

/** Determine the dominant timing token for a supplement. */
export function tokenForSupplement(name: string, nutrientKeys: string[]): string {
  const keys = new Set(nutrientKeys)
  if (keys.size >= 4) return 'multivitamin'
  // Priority: the nutrient whose timing is most constrained wins.
  if (keys.has('iron')) return 'iron'
  if (keys.has('calcium')) return 'calcium'
  if (keys.has('magnesium')) return 'magnesium'
  if (keys.has('zinc')) return 'zinc'
  for (const k of nutrientKeys) if (FAT_SOLUBLE.has(k)) return 'fat_soluble'
  for (const k of nutrientKeys) if (B_VITAMINS.has(k)) return 'b_vitamins'
  if (keys.has('vitamin_c')) return 'vitamin_c'
  if (keys.has('iodine')) return 'iodine'
  // No (or unmapped) nutrient rows → infer from the name.
  return tokenFromName(name) ?? 'general'
}

export interface ScheduleInput { id: string; name: string; nutrientKeys: string[] }
export interface ScheduledItem { id: string; name: string; note: string; token: string }
export interface ScheduledSlot extends SlotDef { items: ScheduledItem[] }
export interface Schedule { slots: ScheduledSlot[]; warnings: string[] }

export function scheduleSupplements(input: ScheduleInput[]): Schedule {
  const bySlot: Record<SlotKey, ScheduledItem[]> = { morning: [], breakfast: [], midday: [], dinner: [], bedtime: [] }
  const placed: { token: string; slot: SlotKey; name: string }[] = []

  for (const s of input) {
    const token = tokenForSupplement(s.name, s.nutrientKeys)
    const rule = RULES[token] ?? RULES.general
    bySlot[rule.slot].push({ id: s.id, name: s.name, note: rule.note, token })
    placed.push({ token, slot: rule.slot, name: s.name })
  }

  // Warn only when antagonists actually land in the same slot.
  const warnings: string[] = []
  const seen = new Set<string>()
  for (const a of placed) {
    const rule = RULES[a.token]
    if (!rule) continue
    for (const b of placed) {
      if (a === b || a.slot !== b.slot) continue
      if (rule.antagonists.includes(b.token)) {
        const pair = [a.name, b.name].sort().join(' | ')
        if (seen.has(pair)) continue
        seen.add(pair)
        warnings.push(`${a.name} and ${b.name} compete for absorption — ideally take them in different slots, ~2 h apart.`)
      }
    }
  }

  const slots = SLOTS.map(def => ({ ...def, items: bySlot[def.key] })).filter(s => s.items.length > 0)
  return { slots, warnings }
}
