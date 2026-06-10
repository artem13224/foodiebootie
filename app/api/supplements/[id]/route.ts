import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/* eslint-disable @typescript-eslint/no-explicit-any */
// supplement_* tables post-date generated types; cast to any. RLS enforces that
// only the owner (user_id = auth.uid()) can update/delete.

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(200).nullable().optional(),
  form: z.string().max(40).nullable().optional(),
  serving_size: z.number().positive().optional(),
  serving_unit: z.string().max(40).optional(),
  is_shared: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { error } = await (supabase as any)
    .from('supplements')
    .update(parsed.data)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // supplement_logs use ON DELETE RESTRICT, so a logged supplement can't be
  // deleted while its history rows exist. Clear the user's own logs for this
  // supplement first (RLS confines this to their rows), then delete the
  // supplement. supplement_nutrients + stack_items cascade automatically.
  await (supabase as any).from('supplement_logs').delete().eq('supplement_id', params.id)

  const { error } = await (supabase as any)
    .from('supplements')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
