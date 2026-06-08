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
