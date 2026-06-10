import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  username: z.string().min(1).max(50).optional(),
  sex: z.enum(['male', 'female', 'other']).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  height_cm: z.number().positive().max(300).optional().nullable(),
  activity_level: z.enum([
    'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active',
  ]).optional().nullable(),
  protein_g_per_kg_lbm: z.number().min(1).max(4).optional(),
  unit_system: z.enum(['metric', 'imperial']).optional(),
  // Goal fields — set via the goal-change flow. Additive; all optional so existing
  // profile edits (which omit them) are unaffected.
  goal_type: z.enum(['cut', 'maintain', 'bulk', 'recomp', 'performance']).optional().nullable(),
  goal_weight_kg: z.number().positive().max(500).optional().nullable(),
  goal_rate_kg_per_week: z.number().min(0).max(2).optional().nullable(),
  goal_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export async function PATCH(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const fields = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('profiles')
    .update(fields as never)
    .eq('id', user.id as never)

  if (error) {
    console.error('[profile/update] update failed:', error)
    return NextResponse.json(
      { error: `Profile update failed: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
