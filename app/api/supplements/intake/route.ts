import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAgeFromDOB } from '@/lib/science/rmr'
import {
  computeSupplementIntake,
  type LoggedNutrientContribution,
  type NutrientReference,
} from '@/lib/science/supplementIntake'

/* eslint-disable @typescript-eslint/no-explicit-any */
// supplement_* tables post-date generated types; cast to any.

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// GET /api/supplements/intake?date=YYYY-MM-DD
// Sums today's logged supplement nutrients and compares to the user's
// personalized RDA/AI + UL (matched by age + sex).
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || todayStr()

  // ── 1. Profile → age + sex (personalizes the DRI match) ──
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('sex, date_of_birth')
    .maybeSingle()

  const sexRaw = (profile?.sex as string | null) ?? 'male'
  // No DRI series exists for 'other'; fall back to male values (documented).
  const sexForDri = sexRaw === 'female' ? 'female' : 'male'
  let age = 30
  if (profile?.date_of_birth) {
    try { age = getAgeFromDOB(new Date(profile.date_of_birth)) } catch { /* default */ }
  }
  const lifeStage = 'default' // profile schema has no pregnancy/lactation flag

  // ── 2. Today's logged supplements → nutrient contributions ──
  const { data: logs, error: logErr } = await (supabase as any)
    .from('supplement_logs')
    .select('servings, supplements(name, supplement_nutrients(amount, nutrients(key)))')
    .eq('logged_at', date)
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  const contributions: LoggedNutrientContribution[] = []
  for (const log of logs ?? []) {
    const supp = log.supplements
    if (!supp) continue
    const servings = Number(log.servings ?? 1)
    for (const sn of supp.supplement_nutrients ?? []) {
      const key = sn.nutrients?.key
      if (!key) continue
      contributions.push({
        key,
        amountPerServing: Number(sn.amount),
        servings,
        supplementName: supp.name,
      })
    }
  }

  // ── 3. Personalized reference values (RDA/AI/UL) for this demographic ──
  const { data: refRows, error: refErr } = await (supabase as any)
    .from('nutrient_reference_values')
    .select('rda, ai, ul, nutrients(key, display_name, canonical_unit, category, has_ul, sort_order)')
    .eq('sex', sexForDri)
    .eq('life_stage', lifeStage)
    .lte('age_min', age)
    .gte('age_max', age)
  if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 })

  const references: Record<string, NutrientReference> = {}
  for (const r of refRows ?? []) {
    const n = r.nutrients
    if (!n?.key) continue
    references[n.key] = {
      display: n.display_name,
      category: n.category ?? 'other',
      canonicalUnit: n.canonical_unit,
      hasUl: !!n.has_ul,
      sortOrder: n.sort_order ?? 999,
      rda: r.rda != null ? Number(r.rda) : null,
      ai: r.ai != null ? Number(r.ai) : null,
      ul: r.ul != null ? Number(r.ul) : null,
    }
  }

  const nutrients = computeSupplementIntake(contributions, references)
  const warnings = nutrients.filter(n => n.ulStatus === 'exceeded' || n.ulStatus === 'approaching')

  return NextResponse.json({
    date,
    demographic: { age, sex: sexForDri, sexActual: sexRaw, lifeStage },
    nutrients,
    warnings,
    source: 'supplements', // totals are from supplements only, not total diet
  })
}
