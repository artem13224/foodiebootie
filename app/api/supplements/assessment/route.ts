import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAgeFromDOB } from '@/lib/science/rmr'
import { runAssessment, type AssessmentResponses, type RecommendableSupplement } from '@/lib/science/healthAssessment'
import { z } from 'zod'

/* eslint-disable @typescript-eslint/no-explicit-any */
// recommendable_supplements / health_assessments post-date generated types.

const responsesSchema = z.object({
  goals: z.array(z.string()).default([]),
  diet: z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian']).default('omnivore'),
  sunExposure: z.enum(['low', 'moderate', 'high']).default('moderate'),
  training: z.enum(['none', 'light', 'regular', 'intense']).default('none'),
  meds: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  pregnant: z.boolean().optional(),
  lactating: z.boolean().optional(),
})

// GET: latest saved assessment (or null).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await (supabase as any)
    .from('health_assessments')
    .select('id, responses, recommendations, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ assessment: data ?? null })
}

// POST: run the assessment, save it, return recommendations + safety flags.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = responsesSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const responses = parsed.data as AssessmentResponses

  // Demographic from profile.
  const { data: profile } = await (supabase as any)
    .from('profiles').select('sex, date_of_birth').maybeSingle()
  const sex = (profile?.sex === 'female' ? 'female' : 'male') as 'male' | 'female'
  let age = 30
  if (profile?.date_of_birth) { try { age = getAgeFromDOB(new Date(profile.date_of_birth)) } catch { /* default */ } }

  // Recommendable catalog.
  const { data: catalog, error: catErr } = await (supabase as any)
    .from('recommendable_supplements').select('*')
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 })

  // Personalized UL map (for dose caps), matched by sex + age.
  const ulByNutrientKey: Record<string, number> = {}
  const { data: refRows } = await (supabase as any)
    .from('nutrient_reference_values')
    .select('ul, nutrients(key)')
    .eq('sex', sex).eq('life_stage', 'default').lte('age_min', age).gte('age_max', age)
  for (const r of refRows ?? []) {
    if (r.nutrients?.key && r.ul != null) ulByNutrientKey[r.nutrients.key] = Number(r.ul)
  }

  const result = runAssessment(responses, { age, sex }, (catalog ?? []) as RecommendableSupplement[], ulByNutrientKey)

  // Persist the assessment (history + latest).
  const { error: saveErr } = await (supabase as any)
    .from('health_assessments')
    .insert({ user_id: user.id, responses, recommendations: result.recommendations })
  if (saveErr) console.error('[assessment] save failed:', saveErr.message) // non-fatal

  return NextResponse.json({ ...result, demographic: { age, sex } })
}
