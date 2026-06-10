import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/* eslint-disable @typescript-eslint/no-explicit-any */
// supplement_logs / supplement_stack_items post-date generated types.

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// GET: today's logged supplement ids + recent logged dates (for streaks).
//   /api/supplements/log?date=YYYY-MM-DD
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || todayStr()

  const since = new Date()
  since.setDate(since.getDate() - 90)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await (supabase as any)
    .from('supplement_logs')
    .select('supplement_id, logged_at')
    .gte('logged_at', sinceStr)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const todayIds: string[] = []
  const dateSet = new Set<string>()
  for (const r of data ?? []) {
    dateSet.add(r.logged_at)
    if (r.logged_at === date) todayIds.push(r.supplement_id)
  }
  return NextResponse.json({ date, todayIds, loggedDates: Array.from(dateSet).sort() })
}

const postSchema = z.object({
  supplement_id: z.string().uuid().optional(),
  stack_id: z.string().uuid().optional(),
  logged_at: z.string().optional(),
  servings: z.number().positive().max(99).optional(),
  taken_at: z.string().optional(), // ISO timestamp, optional time-of-day
}).refine(d => d.supplement_id || d.stack_id, { message: 'supplement_id or stack_id required' })

// POST: take a supplement (or log every item in a stack) for a day.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { supplement_id, stack_id, servings, taken_at } = parsed.data
  const logged_at = parsed.data.logged_at || todayStr()

  let rows: any[] = []
  if (stack_id) {
    const { data: items, error: itemsErr } = await (supabase as any)
      .from('supplement_stack_items')
      .select('supplement_id, servings')
      .eq('stack_id', stack_id)
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    rows = (items ?? []).map((it: any) => ({
      user_id: user.id,
      supplement_id: it.supplement_id,
      logged_at,
      servings: it.servings ?? 1,
      taken_at: taken_at ?? null,
    }))
  } else {
    rows = [{
      user_id: user.id,
      supplement_id,
      logged_at,
      servings: servings ?? 1,
      taken_at: taken_at ?? null,
    }]
  }

  if (rows.length === 0) return NextResponse.json({ logged: 0 })

  const { error } = await (supabase as any).from('supplement_logs').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logged: rows.length })
}

// DELETE: untake a supplement for a day (removes that day's log rows).
//   /api/supplements/log?supplement_id=...&logged_at=YYYY-MM-DD
export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const supplementId = searchParams.get('supplement_id')
  const loggedAt = searchParams.get('logged_at') || todayStr()
  if (!supplementId) return NextResponse.json({ error: 'supplement_id required' }, { status: 400 })

  const { error } = await (supabase as any)
    .from('supplement_logs')
    .delete()
    .eq('supplement_id', supplementId)
    .eq('logged_at', loggedAt)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
