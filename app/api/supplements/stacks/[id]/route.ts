import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/* eslint-disable @typescript-eslint/no-explicit-any */

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  // When provided, replaces the stack's item set entirely.
  items: z.array(z.object({
    supplement_id: z.string().uuid(),
    servings: z.number().positive().max(99).optional(),
  })).optional(),
})

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  if (parsed.data.name) {
    const { error } = await (supabase as any)
      .from('supplement_stacks').update({ name: parsed.data.name.trim() }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (parsed.data.items) {
    // Replace the item set (RLS confines this to the owner's stack).
    await (supabase as any).from('supplement_stack_items').delete().eq('stack_id', params.id)
    if (parsed.data.items.length > 0) {
      const seen = new Set<string>()
      const rows = parsed.data.items
        .filter(i => !seen.has(i.supplement_id) && seen.add(i.supplement_id))
        .map(i => ({ stack_id: params.id, supplement_id: i.supplement_id, servings: i.servings ?? 1 }))
      const { error } = await (supabase as any).from('supplement_stack_items').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // stack_items cascade on stack delete.
  const { error } = await (supabase as any).from('supplement_stacks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
