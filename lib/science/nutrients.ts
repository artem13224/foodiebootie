/**
 * Nutrient catalog + unit-conversion utility for supplement tracking.
 *
 * ── DATA PROVENANCE ──────────────────────────────────────────────────────────
 * All reference amounts (RDA/AI/UL) are SEEDED into the database from the
 * National Academies / Institute of Medicine Dietary Reference Intakes (DRI)
 * tables — see `scripts/seed-nutrients.mjs`. This file holds only:
 *   1. The canonical nutrient catalog (keys, display names, canonical units).
 *   2. Unit-conversion factors, every one documented with its source.
 *
 * No DRI amounts are hardcoded here.
 */

export type NutrientCategory = 'vitamin' | 'mineral' | 'other'

export interface NutrientDef {
  key: string
  display: string
  /** Unit we store/compare in. Label values are converted to this at read time. */
  canonicalUnit: 'mcg' | 'mg' | 'g'
  category: NutrientCategory
  hasUl: boolean
}

/**
 * Canonical catalog. `key` matches `nutrients.key` in the DB (seeded by
 * scripts/seed-nutrients.mjs — keep the two lists in sync).
 */
export const NUTRIENT_CATALOG: NutrientDef[] = [
  // ── Vitamins ──
  { key: 'vitamin_a',        display: 'Vitamin A',        canonicalUnit: 'mcg', category: 'vitamin', hasUl: true },
  { key: 'vitamin_c',        display: 'Vitamin C',        canonicalUnit: 'mg',  category: 'vitamin', hasUl: true },
  { key: 'vitamin_d',        display: 'Vitamin D',        canonicalUnit: 'mcg', category: 'vitamin', hasUl: true },
  { key: 'vitamin_e',        display: 'Vitamin E',        canonicalUnit: 'mg',  category: 'vitamin', hasUl: true },
  { key: 'vitamin_k',        display: 'Vitamin K',        canonicalUnit: 'mcg', category: 'vitamin', hasUl: false },
  { key: 'thiamin',          display: 'Thiamin (B1)',     canonicalUnit: 'mg',  category: 'vitamin', hasUl: false },
  { key: 'riboflavin',       display: 'Riboflavin (B2)',  canonicalUnit: 'mg',  category: 'vitamin', hasUl: false },
  { key: 'niacin',           display: 'Niacin (B3)',      canonicalUnit: 'mg',  category: 'vitamin', hasUl: true },
  { key: 'vitamin_b6',       display: 'Vitamin B6',       canonicalUnit: 'mg',  category: 'vitamin', hasUl: true },
  { key: 'folate',           display: 'Folate',           canonicalUnit: 'mcg', category: 'vitamin', hasUl: true },
  { key: 'vitamin_b12',      display: 'Vitamin B12',      canonicalUnit: 'mcg', category: 'vitamin', hasUl: false },
  { key: 'pantothenic_acid', display: 'Pantothenic Acid', canonicalUnit: 'mg',  category: 'vitamin', hasUl: false },
  { key: 'biotin',           display: 'Biotin',           canonicalUnit: 'mcg', category: 'vitamin', hasUl: false },
  { key: 'choline',          display: 'Choline',          canonicalUnit: 'mg',  category: 'vitamin', hasUl: true },
  // ── Minerals ──
  { key: 'calcium',          display: 'Calcium',          canonicalUnit: 'mg',  category: 'mineral', hasUl: true },
  { key: 'chromium',         display: 'Chromium',         canonicalUnit: 'mcg', category: 'mineral', hasUl: false },
  { key: 'copper',           display: 'Copper',           canonicalUnit: 'mcg', category: 'mineral', hasUl: true },
  { key: 'iodine',           display: 'Iodine',           canonicalUnit: 'mcg', category: 'mineral', hasUl: true },
  { key: 'iron',             display: 'Iron',             canonicalUnit: 'mg',  category: 'mineral', hasUl: true },
  { key: 'magnesium',        display: 'Magnesium',        canonicalUnit: 'mg',  category: 'mineral', hasUl: true },
  { key: 'manganese',        display: 'Manganese',        canonicalUnit: 'mg',  category: 'mineral', hasUl: true },
  { key: 'molybdenum',       display: 'Molybdenum',       canonicalUnit: 'mcg', category: 'mineral', hasUl: true },
  { key: 'phosphorus',       display: 'Phosphorus',       canonicalUnit: 'mg',  category: 'mineral', hasUl: true },
  { key: 'selenium',         display: 'Selenium',         canonicalUnit: 'mcg', category: 'mineral', hasUl: true },
  { key: 'zinc',             display: 'Zinc',             canonicalUnit: 'mg',  category: 'mineral', hasUl: true },
]

export const NUTRIENT_BY_KEY: Record<string, NutrientDef> = Object.fromEntries(
  NUTRIENT_CATALOG.map(n => [n.key, n]),
)

/**
 * Map a free-text nutrient label (e.g. a DSLD `ingredientGroup`, or a label
 * line typed by the user) to a catalog key. Returns null when there is no
 * confident match — the caller must then FLAG the row, never silently drop or
 * guess it. Conservative on purpose: only well-known synonyms are accepted.
 */
const NAME_SYNONYMS: Record<string, string> = {
  'vitamin a': 'vitamin_a', 'retinol': 'vitamin_a', 'beta-carotene': 'vitamin_a', 'beta carotene': 'vitamin_a',
  'vitamin c': 'vitamin_c', 'ascorbic acid': 'vitamin_c',
  'vitamin d': 'vitamin_d', 'vitamin d3': 'vitamin_d', 'vitamin d2': 'vitamin_d', 'cholecalciferol': 'vitamin_d', 'ergocalciferol': 'vitamin_d',
  'vitamin e': 'vitamin_e', 'alpha-tocopherol': 'vitamin_e', 'tocopherol': 'vitamin_e',
  'vitamin k': 'vitamin_k', 'vitamin k1': 'vitamin_k', 'vitamin k2': 'vitamin_k', 'phylloquinone': 'vitamin_k', 'menaquinone': 'vitamin_k',
  'thiamin': 'thiamin', 'thiamine': 'thiamin', 'vitamin b1': 'thiamin', 'b1': 'thiamin',
  'riboflavin': 'riboflavin', 'vitamin b2': 'riboflavin', 'b2': 'riboflavin',
  'niacin': 'niacin', 'niacinamide': 'niacin', 'nicotinic acid': 'niacin', 'vitamin b3': 'niacin', 'b3': 'niacin',
  'vitamin b6': 'vitamin_b6', 'pyridoxine': 'vitamin_b6', 'b6': 'vitamin_b6',
  'folate': 'folate', 'folic acid': 'folate', 'folacin': 'folate', 'methylfolate': 'folate', 'l-methylfolate': 'folate',
  'vitamin b12': 'vitamin_b12', 'cobalamin': 'vitamin_b12', 'cyanocobalamin': 'vitamin_b12', 'methylcobalamin': 'vitamin_b12', 'b12': 'vitamin_b12',
  'pantothenic acid': 'pantothenic_acid', 'pantothenate': 'pantothenic_acid', 'vitamin b5': 'pantothenic_acid', 'b5': 'pantothenic_acid',
  'biotin': 'biotin', 'vitamin b7': 'biotin', 'vitamin h': 'biotin',
  'choline': 'choline',
  'calcium': 'calcium', 'chromium': 'chromium', 'copper': 'copper', 'iodine': 'iodine',
  'iron': 'iron', 'magnesium': 'magnesium', 'manganese': 'manganese', 'molybdenum': 'molybdenum',
  'phosphorus': 'phosphorus', 'phosphorous': 'phosphorus', 'selenium': 'selenium', 'zinc': 'zinc',
}

export function matchNutrientKey(label: string | null | undefined): string | null {
  if (!label) return null
  const raw = label.toLowerCase().trim()
  if (NUTRIENT_BY_KEY[raw]) return raw                 // already a key
  if (NAME_SYNONYMS[raw]) return NAME_SYNONYMS[raw]     // exact synonym
  // strip parenthetical form notes, e.g. "Vitamin A (as Beta-Carotene)"
  const base = raw.replace(/\(.*?\)/g, '').replace(/\s+as\s+.*$/, '').trim()
  if (NAME_SYNONYMS[base]) return NAME_SYNONYMS[base]
  // longest-synonym containment (handles "vitamin d (d3)" → vitamin d)
  let best: string | null = null
  let bestLen = 0
  for (const [syn, key] of Object.entries(NAME_SYNONYMS)) {
    if (base.includes(syn) && syn.length > bestLen) { best = key; bestLen = syn.length }
  }
  return best
}

/** True when a nutrient label/notes string indicates synthetic folic acid (DFE conversion). */
export function looksLikeFolicAcid(...parts: (string | null | undefined)[]): boolean {
  const s = parts.filter(Boolean).join(' ').toLowerCase()
  return s.includes('folic acid')
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT CONVERSION
// Every factor below is sourced from NIH Office of Dietary Supplements (ODS)
// fact sheets and the IOM DRI report footnotes. Do not change a factor without
// citing the source.
// ─────────────────────────────────────────────────────────────────────────────

/** Mass-unit scaling to a common base (mcg). 1 mg = 1000 mcg, 1 g = 1e6 mcg. */
const MASS_TO_MCG: Record<string, number> = { g: 1_000_000, mg: 1000, mcg: 1, ug: 1, µg: 1 }

/** Scale a mass amount between metric mass units (g / mg / mcg). */
export function scaleMass(amount: number, from: string, to: 'mcg' | 'mg' | 'g'): number {
  const inMcg = amount * (MASS_TO_MCG[from] ?? 1)
  return inMcg / (MASS_TO_MCG[to] ?? 1)
}

/**
 * Vitamin D: 1 mcg cholecalciferol = 40 IU.
 * Source: IOM DRI for Calcium and Vitamin D (2011), table footnote;
 *         NIH ODS Vitamin D fact sheet ("1 mcg = 40 IU").
 */
export function iuToMcgVitaminD(iu: number): number {
  return iu / 40
}

/**
 * Vitamin A: convert IU → mcg RAE. The factor depends on the source form
 * declared on the label (supplements are usually retinyl ester / palmitate).
 *   • Retinol / retinyl esters (supplements): 1 IU = 0.3 mcg RAE
 *   • Beta-carotene from supplements:         1 IU = 0.3 mcg RAE  (≈0.15 mcg, but
 *       ODS uses 0.3 for supplemental β-carotene label conversion)
 *   • Beta-carotene from food:                1 IU = 0.05 mcg RAE
 * We default to the retinol/supplement factor (0.3) because that is what the
 * vast majority of supplement labels use.
 * Source: NIH ODS Vitamin A & Carotenoids fact sheet, "International units (IU)"
 *         conversion section.
 */
export function iuToMcgRAEVitaminA(iu: number, form: 'retinol' | 'beta_carotene_food' = 'retinol'): number {
  return form === 'beta_carotene_food' ? iu * 0.05 : iu * 0.3
}

/**
 * Vitamin E: convert IU → mg α-tocopherol. Factor depends on natural vs synthetic.
 *   • Natural (RRR-α-tocopherol, "d-"):     1 IU = 0.67 mg
 *   • Synthetic (all-rac, "dl-"):           1 IU = 0.45 mg
 * Default to natural (0.67); most label IU declarations reference the natural
 * conversion. Synthetic should be passed explicitly when the label says "dl-".
 * Source: NIH ODS Vitamin E fact sheet, "Forms of vitamin E in supplements"
 *         (1 mg = 1.49 IU natural / 2.22 IU synthetic → inverse factors above).
 */
export function iuToMgVitaminE(iu: number, form: 'natural' | 'synthetic' = 'natural'): number {
  return form === 'synthetic' ? iu * 0.45 : iu * 0.67
}

/**
 * Folate: convert mcg of folic acid (synthetic, from supplements) → mcg DFE.
 *   1 mcg folic acid (supplement, with food)        = 1.7 mcg DFE
 * Source: IOM DRI Folate footnote / NIH ODS Folate fact sheet
 *         ("mcg DFE = mcg food folate + 1.7 × mcg folic acid").
 * Note: a supplement taken on an empty stomach is 2.0 mcg DFE per mcg folic acid;
 * we use the conservative 1.7 (with-food) factor.
 */
export function folicAcidToDFE(mcgFolicAcid: number): number {
  return mcgFolicAcid * 1.7
}

/**
 * Convert a label-declared nutrient amount to its canonical unit for summing
 * and DRI/UL comparison.
 *
 * @param key      nutrient catalog key
 * @param amount   numeric amount as printed on the label
 * @param unit     label unit, e.g. 'mg', 'mcg', 'g', 'IU'
 * @param opts     optional form hints for IU/folic-acid conversions
 * @returns        { value, unit }  in the nutrient's canonical unit, or null if
 *                 the nutrient is unknown / the unit cannot be converted (caller
 *                 should then flag the row rather than guess).
 */
export function convertToCanonical(
  key: string,
  amount: number,
  unit: string,
  opts?: {
    vitAForm?: 'retinol' | 'beta_carotene_food'
    vitEForm?: 'natural' | 'synthetic'
    folateIsFolicAcid?: boolean
  },
): { value: number; unit: 'mcg' | 'mg' | 'g' } | null {
  const def = NUTRIENT_BY_KEY[key]
  if (!def) return null
  if (!isFinite(amount)) return null

  const u = unit.trim().toLowerCase().replace('µ', 'u') // normalize µg → ug

  // ── International Units: only meaningful for A, D, E ──
  if (u === 'iu') {
    let mcgOrMg: number
    if (key === 'vitamin_d') {
      mcgOrMg = iuToMcgVitaminD(amount)          // → mcg (canonical)
    } else if (key === 'vitamin_a') {
      mcgOrMg = iuToMcgRAEVitaminA(amount, opts?.vitAForm) // → mcg RAE (canonical)
    } else if (key === 'vitamin_e') {
      mcgOrMg = iuToMgVitaminE(amount, opts?.vitEForm)     // → mg (canonical)
    } else {
      return null // IU not interpretable for this nutrient
    }
    return { value: mcgOrMg, unit: def.canonicalUnit }
  }

  // ── Folate declared as folic acid → DFE (canonical is mcg DFE) ──
  if (key === 'folate' && opts?.folateIsFolicAcid) {
    const mcg = scaleMass(amount, u, 'mcg')
    return { value: folicAcidToDFE(mcg), unit: 'mcg' }
  }

  // ── Plain mass conversion (g / mg / mcg / ug) ──
  if (u in MASS_TO_MCG) {
    return { value: scaleMass(amount, u, def.canonicalUnit), unit: def.canonicalUnit }
  }

  return null // unrecognized unit — caller should flag, not guess
}
