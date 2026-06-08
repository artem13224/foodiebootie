import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { z } from 'zod'

type WeightLogRow = Database['public']['Tables']['weight_logs']['Row']

const createSchema = z.object({
  weight_kg: z.number().positive().max(500),
  logged_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).optional(),
})

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('weight_logs')
    .select('id, logged_at, weight_kg, note, created_at')
    .order('logged_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { weight_kg, logged_at, note } = parsed.data

  // Upsert — if a log already exists for this date, update it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('weight_logs') as any)
    .upsert(
      { user_id: user.id, logged_at, weight_kg, note: note ?? null },
      { onConflict: 'user_id,logged_at' }
    )
    .select()
    .single() as { data: WeightLogRow | null; error: { message: string } | null }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Count total logs — if 7+, trigger adaptive TDEE recalculation
  const { count } = await supabase
    .from('weight_logs')
    .select('id', { count: 'exact', head: true })

  const shouldRecalculate = (count ?? 0) >= 7

  // Return shouldRecalculate flag so the client can POST /api/tdee/calculate if needed
  return NextResponse.json({ log: data, shouldRecalculate })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('weight_logs')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
