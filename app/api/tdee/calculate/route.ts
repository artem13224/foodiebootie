import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRMREnsemble, getAgeFromDOB } from '@/lib/science/rmr'
import { getAdaptiveTDEE } from '@/lib/science/tdee'
import { getMacroTargets } from '@/lib/science/macros'
import { detectAdaptation, countDeficitWeeks } from '@/lib/science/adaptation'
import type { ActivityLevel, GoalType } from '@/types'
import type { Database } from '@/lib/supabase/types'
import { z } from 'zod'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type WeightLogRow = Database['public']['Tables']['weight_logs']['Row']
type FoodLogRow = Database['public']['Tables']['food_logs']['Row']
type BodyMeasRow = Database['public']['Tables']['body_measurements']['Row']

// ── Optional onboarding payload (used on first run before profile is saved) ──
const onboardingSchema = z.object({
  sex: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: z.string().optional(),
  height_cm: z.number().positive().optional(),
  current_weight_kg: z.number().positive().optional(),
  activity_level: z.enum([
    'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active',
  ]).optional(),
  goal_type: z.enum(['cut', 'maintain', 'bulk', 'recomp', 'performance']).optional(),
  goal_weight_kg: z.number().positive().optional(),
  goal_rate_kg_per_week: z.number().min(0).max(2).optional(),
  protein_g_per_kg_lbm: z.number().min(1).max(4).optional(),
  // Onboarding flag: save profile + first weight log + tdee row
  save_profile: z.boolean().optional(),
  username: z.string().optional(),
}).optional()

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse optional onboarding payload
  let onboardingPayload: z.infer<typeof onboardingSchema> = undefined
  try {
    const body = await request.json().catch(() => null)
    if (body) {
      const parsed = onboardingSchema.safeParse(body)
      if (parsed.success) onboardingPayload = parsed.data
    }
  } catch {
    // no body is fine
  }

  // ── 1. Fetch profile ──────────────────────────────────────────────────────
  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .maybeSingle() as { data: ProfileRow | null; error: unknown }

  // Merge onboarding payload over DB profile (onboarding: profile not yet saved)
  const profile = {
    sex: onboardingPayload?.sex ?? (profileRaw?.sex as string | null) ?? 'male',
    date_of_birth: onboardingPayload?.date_of_birth ?? profileRaw?.date_of_birth ?? null,
    height_cm: onboardingPayload?.height_cm ?? Number(profileRaw?.height_cm ?? 170),
    activity_level: (onboardingPayload?.activity_level ?? profileRaw?.activity_level ?? 'sedentary') as ActivityLevel,
    goal_type: (onboardingPayload?.goal_type ?? profileRaw?.goal_type ?? 'maintain') as GoalType,
    goal_weight_kg: onboardingPayload?.goal_weight_kg ?? Number(profileRaw?.goal_weight_kg ?? 0),
    goal_rate_kg_per_week: onboardingPayload?.goal_rate_kg_per_week ?? Number(profileRaw?.goal_rate_kg_per_week ?? 0),
    protein_g_per_kg_lbm: onboardingPayload?.protein_g_per_kg_lbm ?? Number(profileRaw?.protein_g_per_kg_lbm ?? 2.4),
    cycle_tracking_enabled: profileRaw?.cycle_tracking_enabled ?? false,
    last_period_start: profileRaw?.last_period_start ?? undefined,
    avg_cycle_length_days: profileRaw?.avg_cycle_length_days ?? 28,
  }

  // ── 2. Fetch weight logs ──────────────────────────────────────────────────
  const { data: weightLogsRaw } = await supabase
    .from('weight_logs')
    .select('logged_at, weight_kg')
    .order('logged_at', { ascending: true }) as { data: Pick<WeightLogRow, 'logged_at' | 'weight_kg'>[] | null; error: unknown }

  const weightLogs = (weightLogsRaw ?? []).map(r => ({
    logged_at: r.logged_at as string,
    weight_kg: Number(r.weight_kg),
  }))

  // On onboarding: current_weight_kg comes from payload, not DB yet
  const currentWeightKg =
    onboardingPayload?.current_weight_kg ??
    (weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : 70)

  // ── 3. Fetch food logs (last 28 days) ─────────────────────────────────────
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const { data: foodLogsRaw } = await supabase
    .from('food_logs')
    .select('logged_date, kcal')
    .gte('logged_date', cutoffStr) as { data: Pick<FoodLogRow, 'logged_date' | 'kcal'>[] | null; error: unknown }

  const foodLogs = (foodLogsRaw ?? []).map(r => ({
    logged_date: r.logged_date as string,
    kcal: Number(r.kcal),
  }))

  // ── 4. Fetch latest body measurements ────────────────────────────────────
  const { data: bodyMeasRaw } = await supabase
    .from('body_measurements')
    .select('lean_mass_kg')
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: Pick<BodyMeasRow, 'lean_mass_kg'> | null; error: unknown }

  const bodyComp = bodyMeasRaw?.lean_mass_kg
    ? { lean_mass_kg: Number(bodyMeasRaw.lean_mass_kg) }
    : null

  // ── 5. Compute age ────────────────────────────────────────────────────────
  let age = 30  // default
  if (profile.date_of_birth) {
    try {
      const dob = new Date(profile.date_of_birth)
      age = getAgeFromDOB(dob)
    } catch { /* use default */ }
  }

  // ── 6. RMR ensemble → formula TDEE ───────────────────────────────────────
  const ensembleResult = getRMREnsemble(
    {
      weight_kg: currentWeightKg,
      height_cm: profile.height_cm,
      age,
      sex: profile.sex,
      activity_level: profile.activity_level,
    },
    bodyComp,
  )
  const formulaTDEE = ensembleResult.tdee

  // ── 7. Adaptive TDEE ─────────────────────────────────────────────────────
  const tdeeResult = getAdaptiveTDEE(
    weightLogs,
    foodLogs,
    formulaTDEE,
    profile.cycle_tracking_enabled,
    profile.last_period_start ?? undefined,
    profile.avg_cycle_length_days,
  )

  // ── 8. Macro targets ─────────────────────────────────────────────────────
  const macros = getMacroTargets({
    tdee_kcal: tdeeResult.tdee_kcal,
    body_weight_kg: currentWeightKg,
    lean_mass_kg: bodyComp?.lean_mass_kg ?? null,
    protein_g_per_kg_lbm: profile.protein_g_per_kg_lbm,
    goal_rate_kg_per_week: profile.goal_rate_kg_per_week,
  })

  // ── 9. Adaptation detection ───────────────────────────────────────────────
  let adaptationFlag = false
  if (tdeeResult.method === 'adaptive_regression') {
    // Compute weekly avg intakes for deficit week counter
    const weeklyIntakes: number[] = []
    for (let w = 3; w >= 0; w--) {
      const weekLogs = foodLogs.filter(log => {
        const daysAgo = Math.floor(
          (Date.now() - new Date(log.logged_date).getTime()) / 86400000
        )
        return daysAgo >= w * 7 && daysAgo < (w + 1) * 7
      })
      if (weekLogs.length > 0) {
        const avgIntake = weekLogs.reduce((s, l) => s + l.kcal, 0) / weekLogs.length
        weeklyIntakes.push(avgIntake)
      }
    }
    const deficitWeeks = countDeficitWeeks(weeklyIntakes, formulaTDEE)
    const adaptation = detectAdaptation(tdeeResult.tdee_kcal, formulaTDEE, deficitWeeks)
    adaptationFlag = adaptation.flag
  }

  // ── 10. If onboarding: save profile + first weight log ───────────────────
  if (onboardingPayload?.save_profile) {
    const today = new Date().toISOString().split('T')[0]

    // UPDATE the existing profile row (created by the auth trigger on signup).
    // We use .update().eq() rather than .upsert() to stay within RLS policies
    // that allow users to update their own row but not insert a new one.
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        sex: profile.sex as 'male' | 'female' | 'other',
        date_of_birth: profile.date_of_birth ?? null,
        height_cm: profile.height_cm,
        activity_level: profile.activity_level,
        goal_type: profile.goal_type,
        goal_weight_kg: profile.goal_weight_kg || null,
        goal_rate_kg_per_week: profile.goal_rate_kg_per_week || null,
        protein_g_per_kg_lbm: profile.protein_g_per_kg_lbm,
        goal_start_date: today,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', user.id as never)

    if (profileUpdateError) {
      console.error('[tdee/calculate] profile update failed:', profileUpdateError)
      return NextResponse.json(
        { error: `Profile save failed: ${profileUpdateError.message}` },
        { status: 500 }
      )
    }

    // Insert first weight log (if not already exists for today)
    if (currentWeightKg > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: weightError } = await (supabase.from('weight_logs') as any)
        .upsert(
          { user_id: user.id, logged_at: today, weight_kg: currentWeightKg },
          { onConflict: 'user_id,logged_at' }
        )
      if (weightError) {
        console.error('[tdee/calculate] weight log upsert failed:', weightError)
        // Non-fatal — continue without blocking onboarding
      }
    }
  }

  // ── 11. Insert TDEE estimate row ──────────────────────────────────────────
  const insertPayload = {
    user_id: user.id,
    tdee_kcal: tdeeResult.tdee_kcal,
    method: tdeeResult.method,
    data_points: tdeeResult.data_points,
    confidence: tdeeResult.confidence,
    adaptation_flag: adaptationFlag,
    protein_g: macros.protein_g,
    fat_g: macros.fat_g,
    carbs_g: macros.carbs_g,
    daily_kcal_target: macros.daily_kcal_target,
    notes: JSON.stringify({
      formula_tdee: tdeeResult.formula_tdee,
      weekly_tdees: tdeeResult.weekly_tdees,
      regression_weights: tdeeResult.regression_weights,
      weekly_variances: tdeeResult.weekly_variances,
      ensemble: {
        mifflin: Math.round(ensembleResult.mifflin),
        katch: ensembleResult.katch ? Math.round(ensembleResult.katch) : null,
        cunningham: ensembleResult.cunningham ? Math.round(ensembleResult.cunningham) : null,
      },
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newEstimate, error: insertError } = await (supabase.from('tdee_estimates') as any)
    .insert(insertPayload)
    .select()
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (insertError) {
    console.error('[tdee/calculate] insert failed:', insertError)
    return NextResponse.json(
      { error: `TDEE estimate save failed: ${insertError.message}` },
      { status: 500 }
    )
  }

  // ── 12. Return full result ────────────────────────────────────────────────
  return NextResponse.json({
    tdee: {
      tdee_kcal: tdeeResult.tdee_kcal,
      daily_kcal_target: macros.daily_kcal_target,
      method: tdeeResult.method,
      confidence: tdeeResult.confidence,
      data_points: tdeeResult.data_points,
      adaptation_flag: adaptationFlag,
      deficit_or_surplus_kcal: macros.deficit_or_surplus_kcal,
    },
    macros: {
      protein_g: macros.protein_g,
      fat_g: macros.fat_g,
      carbs_g: macros.carbs_g,
    },
    debug: {
      formula_tdee: Math.round(formulaTDEE),
      ensemble: {
        mifflin: Math.round(ensembleResult.mifflin),
        katch: ensembleResult.katch ? Math.round(ensembleResult.katch) : null,
        cunningham: ensembleResult.cunningham ? Math.round(ensembleResult.cunningham) : null,
      },
      weekly_tdees: tdeeResult.weekly_tdees,
      regression_weights: tdeeResult.regression_weights,
      weekly_variances: tdeeResult.weekly_variances,
    },
    estimate_id: newEstimate?.id ?? null,
  })
}
