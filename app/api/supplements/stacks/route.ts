import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/* eslint-disable @typescript-eslint/no-explicit-any */

const createSchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(z.object({
    supplement_id: z.string().uuid(),
    servings: z.number().positive().max(99).optional(),
  })).default([]),
})

// GET: list the user's stacks with their items.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await (supabase as any)
    .from('supplement_stacks')
    .select('id, name, created_at, supplement_stack_items(supplement_id, servings, supplements(name, brand))')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stacks: data ?? [] })
}

// POST: create a stack + its items.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { data: stackRow, error: stackErr } = await (supabase as any)
    .from('supplement_stacks')
    .insert({ user_id: user.id, name: parsed.data.name.trim() })
    .select('id')
    .single()
  if (stackErr) return NextResponse.json({ error: stackErr.message }, { status: 500 })

  const items = parsed.data.items
  if (items.length > 0) {
    const seen = new Set<string>()
    const rows = items.filter(i => !seen.has(i.supplement_id) && seen.add(i.supplement_id))
      .map(i => ({ stack_id: stackRow.id, supplement_id: i.supplement_id, servings: i.servings ?? 1 }))
    const { error: itemsErr } = await (supabase as any).from('supplement_stack_items').insert(rows)
    if (itemsErr) return NextResponse.json({ error: itemsErr.message, id: stackRow.id }, { status: 500 })
  }

  return NextResponse.json({ id: stackRow.id })
}
