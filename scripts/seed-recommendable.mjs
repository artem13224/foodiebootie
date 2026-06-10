/**
 * Seed `recommendable_supplements` — the evidence-graded catalog the health
 * assessment draws from.
 *
 * Usage: node --env-file=.env.local scripts/seed-recommendable.mjs
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────────
 * Dose ranges, evidence grades and citations are taken from authoritative
 * sources (NIH Office of Dietary Supplements fact sheets, the ISSN position
 * stand, Cochrane reviews, and peer-reviewed meta-analyses) — never invented.
 * Each row carries its own citation. Evidence grades:
 *   strong   = consistent RCT/meta-analytic support or established requirement
 *   moderate = RCT support with some heterogeneity / condition-specific
 *   limited  = preliminary, mixed, or strain/context-dependent
 *
 * SAFETY: `contraindications` are matched against the user's quiz answers
 * (meds / conditions / pregnancy / lactation) and EXCLUDE a suggestion with a
 * heads-up. `ul_nutrient_key` ties a dose to a Tolerable Upper Intake Level so
 * suggested doses stay capped. `maps_to_nutrient_key` lets an accepted item be
 * tracked in the DRI/UL nutrient engine.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// goals taxonomy: energy, sleep, stress, immunity, performance, recovery,
//                 bone_joint, gut, cognition, skin_hair, general
// diet_flags:     vegan, vegetarian
// contraindications: warfarin, pregnancy, lactation, kidney_disease,
//                    thyroid_med, autoimmune, hemochromatosis

const ITEMS = [
  // ── Micronutrients (map to DRI engine + UL caps) ──
  {
    key: 'vitamin_d3', name: 'Vitamin D3', category: 'vitamin', maps_to_nutrient_key: 'vitamin_d',
    default_dose_low: 1000, default_dose_high: 2000, dose_unit: 'IU',
    evidence_grade: 'strong',
    evidence_summary: 'Raises serum 25(OH)D; deficiency is common with limited sun exposure.',
    citation: 'NIH ODS Vitamin D Fact Sheet; IOM DRI Calcium & Vitamin D (2011)',
    goals: ['bone_joint', 'immunity', 'energy', 'general'], diet_flags: [], sex: 'any',
    contraindications: [], caution: 'Keep total intake under the 100 mcg/4000 IU upper limit.',
    ul_nutrient_key: 'vitamin_d', sort_order: 1,
  },
  {
    key: 'vitamin_b12', name: 'Vitamin B12', category: 'vitamin', maps_to_nutrient_key: 'vitamin_b12',
    default_dose_low: 250, default_dose_high: 500, dose_unit: 'mcg',
    evidence_grade: 'strong',
    evidence_summary: 'Plant-based diets lack B12; supplementation reliably restores status.',
    citation: 'NIH ODS Vitamin B12 Fact Sheet',
    goals: ['energy', 'cognition', 'general'], diet_flags: ['vegan', 'vegetarian'], sex: 'any',
    contraindications: [], caution: null, ul_nutrient_key: null, sort_order: 2,
  },
  {
    key: 'iron', name: 'Iron', category: 'mineral', maps_to_nutrient_key: 'iron',
    default_dose_low: 18, default_dose_high: 27, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: 'Corrects iron-deficiency fatigue — but only supplement with a confirmed low level.',
    citation: 'NIH ODS Iron Fact Sheet',
    goals: ['energy'], diet_flags: ['vegan', 'vegetarian'], sex: 'female',
    contraindications: ['hemochromatosis'],
    caution: 'Do not supplement iron without a blood test confirming low iron. Keep under 45 mg/day.',
    ul_nutrient_key: 'iron', sort_order: 3,
  },
  {
    key: 'magnesium_glycinate', name: 'Magnesium Glycinate', category: 'mineral', maps_to_nutrient_key: 'magnesium',
    default_dose_low: 200, default_dose_high: 350, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: 'Supports sleep quality and muscle relaxation; glycinate is well tolerated.',
    citation: 'NIH ODS Magnesium Fact Sheet',
    goals: ['sleep', 'stress', 'performance', 'recovery'], diet_flags: [], sex: 'any',
    contraindications: ['kidney_disease'],
    caution: 'Supplemental magnesium upper limit is 350 mg/day; higher can cause diarrhea.',
    ul_nutrient_key: 'magnesium', sort_order: 4,
  },
  {
    key: 'zinc', name: 'Zinc', category: 'mineral', maps_to_nutrient_key: 'zinc',
    default_dose_low: 15, default_dose_high: 30, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: 'May shorten common-cold duration; supports immune function.',
    citation: 'NIH ODS Zinc Fact Sheet; Cochrane review (zinc for the common cold)',
    goals: ['immunity'], diet_flags: ['vegan', 'vegetarian'], sex: 'any',
    contraindications: [], caution: 'Keep under 40 mg/day; chronic excess depletes copper.',
    ul_nutrient_key: 'zinc', sort_order: 5,
  },
  {
    key: 'vitamin_c', name: 'Vitamin C', category: 'vitamin', maps_to_nutrient_key: 'vitamin_c',
    default_dose_low: 200, default_dose_high: 500, dose_unit: 'mg',
    evidence_grade: 'limited',
    evidence_summary: 'Does not prevent colds in general population but may modestly reduce duration.',
    citation: 'Cochrane review (Hemilä & Chalker 2013); NIH ODS Vitamin C Fact Sheet',
    goals: ['immunity', 'skin_hair'], diet_flags: [], sex: 'any',
    contraindications: [], caution: 'Upper limit 2000 mg/day.', ul_nutrient_key: 'vitamin_c', sort_order: 6,
  },
  {
    key: 'folate', name: 'Folate', category: 'vitamin', maps_to_nutrient_key: 'folate',
    default_dose_low: 400, default_dose_high: 400, dose_unit: 'mcg',
    evidence_grade: 'strong',
    evidence_summary: 'Reduces neural-tube-defect risk; advised for anyone who could become pregnant.',
    citation: 'NIH ODS Folate Fact Sheet',
    goals: ['general'], diet_flags: [], sex: 'female',
    contraindications: [], caution: 'High folic acid can mask B12 deficiency. Upper limit 1000 mcg.',
    ul_nutrient_key: 'folate', sort_order: 7,
  },
  {
    key: 'calcium', name: 'Calcium', category: 'mineral', maps_to_nutrient_key: 'calcium',
    default_dose_low: 500, default_dose_high: 1000, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: 'Supports bone density when dietary intake is low, especially post-menopause.',
    citation: 'NIH ODS Calcium Fact Sheet; IOM DRI (2011)',
    goals: ['bone_joint'], diet_flags: ['vegan'], sex: 'female',
    contraindications: [], caution: 'Split doses ≤500 mg. Keep total under 2000–2500 mg/day.',
    ul_nutrient_key: 'calcium', sort_order: 8,
  },
  {
    key: 'iodine', name: 'Iodine', category: 'mineral', maps_to_nutrient_key: 'iodine',
    default_dose_low: 150, default_dose_high: 150, dose_unit: 'mcg',
    evidence_grade: 'moderate',
    evidence_summary: 'Thyroid hormone needs iodine; plant diets without iodized salt/dairy fall short.',
    citation: 'NIH ODS Iodine Fact Sheet',
    goals: ['general', 'energy'], diet_flags: ['vegan'], sex: 'any',
    contraindications: ['thyroid_med'], caution: 'If you have thyroid disease, check with your clinician. Upper limit 1100 mcg.',
    ul_nutrient_key: 'iodine', sort_order: 9,
  },
  {
    key: 'vitamin_k2', name: 'Vitamin K2 (MK-7)', category: 'vitamin', maps_to_nutrient_key: 'vitamin_k',
    default_dose_low: 90, default_dose_high: 180, dose_unit: 'mcg',
    evidence_grade: 'moderate',
    evidence_summary: 'Directs calcium to bone; often paired with vitamin D for bone health.',
    citation: 'NIH ODS Vitamin K Fact Sheet',
    goals: ['bone_joint'], diet_flags: [], sex: 'any',
    contraindications: ['warfarin'],
    caution: 'Vitamin K counteracts warfarin and other anticoagulants — do not use if you take one.',
    ul_nutrient_key: null, sort_order: 10,
  },

  // ── Popular non-DRI supplements (tracked in adherence only) ──
  {
    key: 'omega_3', name: 'Omega-3 (EPA/DHA)', category: 'omega', maps_to_nutrient_key: null,
    default_dose_low: 250, default_dose_high: 1000, dose_unit: 'mg EPA+DHA',
    evidence_grade: 'moderate',
    evidence_summary: '250–500 mg EPA+DHA/day supports heart, brain and mood; higher for triglycerides.',
    citation: 'NIH ODS Omega-3 Fatty Acids Fact Sheet',
    goals: ['cognition', 'bone_joint', 'stress', 'general'], diet_flags: [], sex: 'any',
    contraindications: ['warfarin'],
    caution: 'High doses (>3 g) can thin blood — caution with anticoagulants. Vegans: use algal oil.',
    ul_nutrient_key: null, sort_order: 11,
  },
  {
    key: 'creatine', name: 'Creatine Monohydrate', category: 'amino', maps_to_nutrient_key: null,
    default_dose_low: 3, default_dose_high: 5, dose_unit: 'g',
    evidence_grade: 'strong',
    evidence_summary: '3–5 g/day reliably increases strength, power and lean mass; also studied for cognition.',
    citation: 'ISSN Position Stand — Kreider RB et al., J Int Soc Sports Nutr. 2017;14:18',
    goals: ['performance', 'recovery', 'cognition'], diet_flags: ['vegan', 'vegetarian'], sex: 'any',
    contraindications: ['kidney_disease'],
    caution: 'Safe in healthy people up to 30 g/day; check with a clinician if you have kidney disease.',
    ul_nutrient_key: null, sort_order: 12,
  },
  {
    key: 'melatonin', name: 'Melatonin', category: 'other', maps_to_nutrient_key: null,
    default_dose_low: 0.5, default_dose_high: 3, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: 'Shortens time to fall asleep; low doses (0.5–3 mg) before bed are effective.',
    citation: 'Ferracioli-Oda E et al., PLoS One. 2013 (meta-analysis); J Pineal Res. 2024 dose-response',
    goals: ['sleep'], diet_flags: [], sex: 'any',
    contraindications: ['pregnancy', 'lactation'],
    caution: 'Can cause next-morning grogginess. Start at the lowest dose; not for long-term nightly use.',
    ul_nutrient_key: null, sort_order: 13,
  },
  {
    key: 'ashwagandha', name: 'Ashwagandha (KSM-66)', category: 'herb', maps_to_nutrient_key: null,
    default_dose_low: 300, default_dose_high: 600, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: '300–600 mg/day of root extract reduces perceived stress and cortisol in RCTs.',
    citation: 'Akhgarjand C et al., Phytother Res. 2022 (meta-analysis); WFSBP/CANMAT 2022',
    goals: ['stress', 'sleep'], diet_flags: [], sex: 'any',
    contraindications: ['pregnancy', 'lactation', 'autoimmune', 'thyroid_med'],
    caution: 'Avoid in pregnancy and with thyroid or autoimmune conditions/medications; rare liver reports.',
    ul_nutrient_key: null, sort_order: 14,
  },
  {
    key: 'l_theanine', name: 'L-Theanine', category: 'amino', maps_to_nutrient_key: null,
    default_dose_low: 100, default_dose_high: 200, dose_unit: 'mg',
    evidence_grade: 'moderate',
    evidence_summary: 'Promotes calm focus without sedation; synergises with caffeine for attention.',
    citation: 'Hidese S et al., Nutrients. 2019 (RCT); review of theanine & stress',
    goals: ['stress', 'cognition'], diet_flags: [], sex: 'any',
    contraindications: [], caution: null, ul_nutrient_key: null, sort_order: 15,
  },
  {
    key: 'probiotic', name: 'Probiotic', category: 'probiotic', maps_to_nutrient_key: null,
    default_dose_low: 1, default_dose_high: 10, dose_unit: 'billion CFU',
    evidence_grade: 'limited',
    evidence_summary: 'Benefits are strain- and condition-specific; may help digestion and antibiotic recovery.',
    citation: 'Hill C et al., Nat Rev Gastroenterol Hepatol. 2014 (ISAPP consensus)',
    goals: ['gut', 'immunity'], diet_flags: [], sex: 'any',
    contraindications: [], caution: 'Choose a strain matched to your goal; effects do not generalise across products.',
    ul_nutrient_key: null, sort_order: 16,
  },
  {
    key: 'psyllium_fiber', name: 'Psyllium Fiber', category: 'fiber', maps_to_nutrient_key: null,
    default_dose_low: 5, default_dose_high: 10, dose_unit: 'g',
    evidence_grade: 'moderate',
    evidence_summary: 'Improves regularity and modestly lowers LDL cholesterol.',
    citation: 'EFSA & AHA reviews of soluble fiber / psyllium',
    goals: ['gut'], diet_flags: [], sex: 'any',
    contraindications: [], caution: 'Take with plenty of water; start low to limit bloating.',
    ul_nutrient_key: null, sort_order: 17,
  },
  {
    key: 'coq10', name: 'CoQ10 (Ubiquinone)', category: 'other', maps_to_nutrient_key: null,
    default_dose_low: 100, default_dose_high: 200, dose_unit: 'mg',
    evidence_grade: 'limited',
    evidence_summary: 'Mixed evidence; sometimes used for statin-associated muscle aches and fatigue.',
    citation: 'Mortensen SA et al., JACC Heart Fail. 2014 (Q-SYMBIO); evidence mixed overall',
    goals: ['energy'], diet_flags: [], sex: 'any',
    contraindications: ['warfarin'], caution: 'May reduce warfarin effect — caution with anticoagulants.',
    ul_nutrient_key: null, sort_order: 18,
  },
  {
    key: 'collagen', name: 'Collagen Peptides', category: 'other', maps_to_nutrient_key: null,
    default_dose_low: 2.5, default_dose_high: 10, dose_unit: 'g',
    evidence_grade: 'limited',
    evidence_summary: 'Early RCTs suggest improved skin elasticity and joint comfort; not vegan.',
    citation: 'Choi FD et al., J Drugs Dermatol. 2019 (review)',
    goals: ['skin_hair', 'bone_joint'], diet_flags: [], sex: 'any',
    contraindications: [], caution: 'Animal-derived (not vegan/vegetarian).', ul_nutrient_key: null, sort_order: 19,
  },
]

async function main() {
  console.log('\n🌱  Seeding recommendable_supplements (evidence-graded)…\n')
  let n = 0
  for (const it of ITEMS) {
    const { error } = await supabase.from('recommendable_supplements').upsert(it, { onConflict: 'key' })
    if (error) { console.error(`❌ ${it.key}: ${error.message}`); continue }
    n++
    console.log(`  ✓  ${it.name.padEnd(24)} ${it.evidence_grade.toUpperCase()}`)
  }
  console.log(`\n✅  Done — ${n}/${ITEMS.length} recommendable supplements seeded.\n`)
}

main().catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
