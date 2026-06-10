/**
 * Seed `nutrients` and `nutrient_reference_values` from the National Academies /
 * Institute of Medicine Dietary Reference Intakes (DRI) tables.
 *
 * Usage (Node 18+, reads .env.local automatically):
 *   node --env-file=.env.local scripts/seed-nutrients.mjs
 *
 * Requirements in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   ← bypasses RLS
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────────
 * Every RDA / AI / UL value below is transcribed from the official DRI summary
 * tables published by the Food and Nutrition Board, Institute of Medicine,
 * National Academies (accessed via www.nap.edu), specifically:
 *   • DRI Recommended Dietary Allowances and Adequate Intakes, Vitamins
 *   • DRI Recommended Dietary Allowances and Adequate Intakes, Elements
 *   • DRI Tolerable Upper Intake Levels, Vitamins
 *   • DRI Tolerable Upper Intake Levels, Elements
 * incorporating the 2011 update for Calcium & Vitamin D.
 *
 * RDA = Recommended Dietary Allowance (bold in source). AI = Adequate Intake
 * (asterisked in source). UL = Tolerable Upper Intake Level. "ND" in the source
 * (no UL established) → has_ul = false and no UL row value.
 *
 * Potassium, sodium, fluoride are intentionally EXCLUDED: their values were
 * revised in the 2019 Sodium/Potassium DRI report (not transcribed here) and
 * they are not typical micronutrient-supplement targets. Seeding the superseded
 * 2005 figures would be misleading, so they are omitted rather than guessed.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Missing env vars. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Per-report citation strings (the DRI value for each nutrient comes from the
// report that established it).
const SRC = {
  bvit:  'IOM DRI: Thiamin, Riboflavin, Niacin, Vitamin B6, Folate, Vitamin B12, Pantothenic Acid, Biotin, Choline (1998)',
  cesel: 'IOM DRI: Vitamin C, Vitamin E, Selenium, Carotenoids (2000)',
  trace: 'IOM DRI: Vitamin A, Vitamin K, Arsenic, Boron, Chromium, Copper, Iodine, Iron, Manganese, Molybdenum, Nickel, Silicon, Vanadium, Zinc (2001)',
  calp:  'IOM DRI: Calcium, Phosphorus, Magnesium, Vitamin D, Fluoride (1997)',
  cad:   'IOM DRI: Calcium and Vitamin D (2011)',
}

// Life-stage bands (adults). Order used by every value array below:
//   [ m1, m2, m3, m4, f1, f2, f3, f4, preg1, preg2, lact1, lact2 ]
const BANDS = [
  { sex: 'male',   age_min: 19, age_max: 30,  life_stage: 'default'   }, // m1
  { sex: 'male',   age_min: 31, age_max: 50,  life_stage: 'default'   }, // m2
  { sex: 'male',   age_min: 51, age_max: 70,  life_stage: 'default'   }, // m3
  { sex: 'male',   age_min: 71, age_max: 150, life_stage: 'default'   }, // m4
  { sex: 'female', age_min: 19, age_max: 30,  life_stage: 'default'   }, // f1
  { sex: 'female', age_min: 31, age_max: 50,  life_stage: 'default'   }, // f2
  { sex: 'female', age_min: 51, age_max: 70,  life_stage: 'default'   }, // f3
  { sex: 'female', age_min: 71, age_max: 150, life_stage: 'default'   }, // f4
  { sex: 'female', age_min: 19, age_max: 30,  life_stage: 'pregnancy' }, // preg1
  { sex: 'female', age_min: 31, age_max: 50,  life_stage: 'pregnancy' }, // preg2
  { sex: 'female', age_min: 19, age_max: 30,  life_stage: 'lactation' }, // lact1
  { sex: 'female', age_min: 31, age_max: 50,  life_stage: 'lactation' }, // lact2
]

// Constant-across-adult-bands UL (most nutrients). Special cases (calcium,
// phosphorus) override per band via `ulByBand`. `null` UL ⇒ has_ul false.
const C = (v) => [v, v, v, v, v, v, v, v, v, v, v, v]

/**
 * NUTRIENTS: each entry defines catalog metadata + per-band RDA/AI + UL.
 *   type:   'rda' | 'ai'  (which column the recommended value lands in)
 *   rec:    12-length array of recommended values (RDA or AI per `type`)
 *   ul:     12-length array of UL values (null where not determinable)
 *   unit:   canonical unit string stored on each reference row
 */
const NUTRIENTS = [
  // ── Vitamins ──────────────────────────────────────────────────────────────
  { key: 'vitamin_a', display_name: 'Vitamin A', canonical_unit: 'mcg', category: 'vitamin', sort: 1,
    type: 'rda', source: SRC.trace, unit: 'mcg',
    rec: [900,900,900,900, 700,700,700,700, 770,770, 1300,1300],
    ul:  C(3000) }, // UL as preformed vitamin A

  { key: 'vitamin_c', display_name: 'Vitamin C', canonical_unit: 'mg', category: 'vitamin', sort: 2,
    type: 'rda', source: SRC.cesel, unit: 'mg',
    rec: [90,90,90,90, 75,75,75,75, 85,85, 120,120],
    ul:  C(2000) },

  { key: 'vitamin_d', display_name: 'Vitamin D', canonical_unit: 'mcg', category: 'vitamin', sort: 3,
    type: 'rda', source: SRC.cad, unit: 'mcg',
    rec: [15,15,15,20, 15,15,15,20, 15,15, 15,15],
    ul:  C(100) },

  { key: 'vitamin_e', display_name: 'Vitamin E', canonical_unit: 'mg', category: 'vitamin', sort: 4,
    type: 'rda', source: SRC.cesel, unit: 'mg',
    rec: [15,15,15,15, 15,15,15,15, 15,15, 19,19],
    ul:  C(1000) }, // UL as supplemental α-tocopherol

  { key: 'vitamin_k', display_name: 'Vitamin K', canonical_unit: 'mcg', category: 'vitamin', sort: 5,
    type: 'ai', source: SRC.trace, unit: 'mcg',
    rec: [120,120,120,120, 90,90,90,90, 90,90, 90,90],
    ul:  C(null) },

  { key: 'thiamin', display_name: 'Thiamin (B1)', canonical_unit: 'mg', category: 'vitamin', sort: 6,
    type: 'rda', source: SRC.bvit, unit: 'mg',
    rec: [1.2,1.2,1.2,1.2, 1.1,1.1,1.1,1.1, 1.4,1.4, 1.4,1.4],
    ul:  C(null) },

  { key: 'riboflavin', display_name: 'Riboflavin (B2)', canonical_unit: 'mg', category: 'vitamin', sort: 7,
    type: 'rda', source: SRC.bvit, unit: 'mg',
    rec: [1.3,1.3,1.3,1.3, 1.1,1.1,1.1,1.1, 1.4,1.4, 1.6,1.6],
    ul:  C(null) },

  { key: 'niacin', display_name: 'Niacin (B3)', canonical_unit: 'mg', category: 'vitamin', sort: 8,
    type: 'rda', source: SRC.bvit, unit: 'mg',
    rec: [16,16,16,16, 14,14,14,14, 18,18, 17,17],
    ul:  C(35) }, // UL applies to synthetic/fortified niacin

  { key: 'vitamin_b6', display_name: 'Vitamin B6', canonical_unit: 'mg', category: 'vitamin', sort: 9,
    type: 'rda', source: SRC.bvit, unit: 'mg',
    rec: [1.3,1.3,1.7,1.7, 1.3,1.3,1.5,1.5, 1.9,1.9, 2.0,2.0],
    ul:  C(100) },

  { key: 'folate', display_name: 'Folate', canonical_unit: 'mcg', category: 'vitamin', sort: 10,
    type: 'rda', source: SRC.bvit, unit: 'mcg', // mcg DFE
    rec: [400,400,400,400, 400,400,400,400, 600,600, 500,500],
    ul:  C(1000) }, // UL applies to synthetic folic acid

  { key: 'vitamin_b12', display_name: 'Vitamin B12', canonical_unit: 'mcg', category: 'vitamin', sort: 11,
    type: 'rda', source: SRC.bvit, unit: 'mcg',
    rec: [2.4,2.4,2.4,2.4, 2.4,2.4,2.4,2.4, 2.6,2.6, 2.8,2.8],
    ul:  C(null) },

  { key: 'pantothenic_acid', display_name: 'Pantothenic Acid', canonical_unit: 'mg', category: 'vitamin', sort: 12,
    type: 'ai', source: SRC.bvit, unit: 'mg',
    rec: [5,5,5,5, 5,5,5,5, 6,6, 7,7],
    ul:  C(null) },

  { key: 'biotin', display_name: 'Biotin', canonical_unit: 'mcg', category: 'vitamin', sort: 13,
    type: 'ai', source: SRC.bvit, unit: 'mcg',
    rec: [30,30,30,30, 30,30,30,30, 30,30, 35,35],
    ul:  C(null) },

  { key: 'choline', display_name: 'Choline', canonical_unit: 'mg', category: 'vitamin', sort: 14,
    type: 'ai', source: SRC.bvit, unit: 'mg',
    rec: [550,550,550,550, 425,425,425,425, 450,450, 550,550],
    ul:  C(3500) }, // UL 3.5 g/d = 3500 mg/d

  // ── Minerals ────────────────────────────────────────────────────────────────
  { key: 'calcium', display_name: 'Calcium', canonical_unit: 'mg', category: 'mineral', sort: 20,
    type: 'rda', source: SRC.cad, unit: 'mg',
    rec: [1000,1000,1000,1200, 1000,1000,1200,1200, 1000,1000, 1000,1000],
    // UL 2500 mg (19–50), 2000 mg (51+); pregnancy/lactation 19–50 → 2500
    ul:  [2500,2500,2000,2000, 2500,2500,2000,2000, 2500,2500, 2500,2500] },

  { key: 'chromium', display_name: 'Chromium', canonical_unit: 'mcg', category: 'mineral', sort: 21,
    type: 'ai', source: SRC.trace, unit: 'mcg',
    rec: [35,35,30,30, 25,25,20,20, 30,30, 45,45],
    ul:  C(null) },

  { key: 'copper', display_name: 'Copper', canonical_unit: 'mcg', category: 'mineral', sort: 22,
    type: 'rda', source: SRC.trace, unit: 'mcg',
    rec: [900,900,900,900, 900,900,900,900, 1000,1000, 1300,1300],
    ul:  C(10000) },

  { key: 'iodine', display_name: 'Iodine', canonical_unit: 'mcg', category: 'mineral', sort: 23,
    type: 'rda', source: SRC.trace, unit: 'mcg',
    rec: [150,150,150,150, 150,150,150,150, 220,220, 290,290],
    ul:  C(1100) },

  { key: 'iron', display_name: 'Iron', canonical_unit: 'mg', category: 'mineral', sort: 24,
    type: 'rda', source: SRC.trace, unit: 'mg',
    rec: [8,8,8,8, 18,18,8,8, 27,27, 9,9],
    ul:  C(45) },

  { key: 'magnesium', display_name: 'Magnesium', canonical_unit: 'mg', category: 'mineral', sort: 25,
    type: 'rda', source: SRC.calp, unit: 'mg',
    rec: [400,420,420,420, 310,320,320,320, 350,360, 310,320],
    ul:  C(350) }, // UL = supplemental magnesium only (pharmacological), not food

  { key: 'manganese', display_name: 'Manganese', canonical_unit: 'mg', category: 'mineral', sort: 26,
    type: 'ai', source: SRC.trace, unit: 'mg',
    rec: [2.3,2.3,2.3,2.3, 1.8,1.8,1.8,1.8, 2.0,2.0, 2.6,2.6],
    ul:  C(11) },

  { key: 'molybdenum', display_name: 'Molybdenum', canonical_unit: 'mcg', category: 'mineral', sort: 27,
    type: 'rda', source: SRC.trace, unit: 'mcg',
    rec: [45,45,45,45, 45,45,45,45, 50,50, 50,50],
    ul:  C(2000) },

  { key: 'phosphorus', display_name: 'Phosphorus', canonical_unit: 'mg', category: 'mineral', sort: 28,
    type: 'rda', source: SRC.calp, unit: 'mg',
    rec: [700,700,700,700, 700,700,700,700, 700,700, 700,700],
    // UL 4000 mg (19–70), 3000 mg (>70); pregnancy 3500; lactation 4000
    ul:  [4000,4000,4000,3000, 4000,4000,4000,3000, 3500,3500, 4000,4000] },

  { key: 'selenium', display_name: 'Selenium', canonical_unit: 'mcg', category: 'mineral', sort: 29,
    type: 'rda', source: SRC.cesel, unit: 'mcg',
    rec: [55,55,55,55, 55,55,55,55, 60,60, 70,70],
    ul:  C(400) },

  { key: 'zinc', display_name: 'Zinc', canonical_unit: 'mg', category: 'mineral', sort: 30,
    type: 'rda', source: SRC.trace, unit: 'mg',
    rec: [11,11,11,11, 8,8,8,8, 11,11, 12,12],
    ul:  C(40) },
]

async function main() {
  console.log('\n🌱  Seeding nutrient reference data (IOM/National Academies DRIs)…\n')

  let nUpserted = 0
  let rvInserted = 0

  for (const n of NUTRIENTS) {
    const hasUl = n.ul.some(v => v != null)

    // 1. Upsert the nutrient row (idempotent on unique key).
    const { data: nutRow, error: nutErr } = await supabase
      .from('nutrients')
      .upsert(
        {
          key: n.key,
          display_name: n.display_name,
          canonical_unit: n.canonical_unit,
          category: n.category,
          has_ul: hasUl,
          sort_order: n.sort,
        },
        { onConflict: 'key' },
      )
      .select('id')
      .single()

    if (nutErr) {
      console.error(`❌  nutrient ${n.key}: ${nutErr.message}`)
      continue
    }
    nUpserted++
    const nutrientId = nutRow.id

    // 2. Replace this nutrient's reference values (clean re-seed each run).
    await supabase.from('nutrient_reference_values').delete().eq('nutrient_id', nutrientId)

    const rows = BANDS.map((b, i) => ({
      nutrient_id: nutrientId,
      sex: b.sex,
      age_min: b.age_min,
      age_max: b.age_max,
      life_stage: b.life_stage,
      rda: n.type === 'rda' ? n.rec[i] : null,
      ai:  n.type === 'ai'  ? n.rec[i] : null,
      ul:  n.ul[i],
      unit: n.unit,
      source: n.source,
    }))

    const { error: rvErr } = await supabase.from('nutrient_reference_values').insert(rows)
    if (rvErr) {
      console.error(`❌  reference values ${n.key}: ${rvErr.message}`)
      continue
    }
    rvInserted += rows.length
    console.log(`  ✓  ${n.display_name.padEnd(20)} — ${rows.length} reference rows${hasUl ? ' (UL set)' : ''}`)
  }

  console.log(`\n✅  Done — ${nUpserted} nutrients, ${rvInserted} reference-value rows.\n`)
}

main().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
