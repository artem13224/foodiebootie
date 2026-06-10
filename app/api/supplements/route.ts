import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { convertToCanonical } from '@/lib/science/nutrients'
import { z } from 'zod'

/* eslint-disable @typescript-eslint/no-explicit-any */
// The supplement_* tables post-date the generated types in lib/supabase/types.ts,
// so these queries are cast to `any`. RLS still enforces per-user access.

const nutrientInput = z.object({
  key: z.string(),
  amount: z.number().nonnegative(),
  unit: z.string(),
  vitAForm: z.enum(['retinol', 'beta_carotene_food']).optional(),
  vitEForm: z.enum(['natural', 'synthetic']).optional(),
  folateIsFolicAcid: z.boolean().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullable().optional(),
  form: z.string().max(40).nullable().optional(),
  serving_size: z.number().positive().optional(),
  serving_unit: z.string().max(40).optional(),
  barcode: z.string().max(40).nullable().optional(),
  dsld_id: z.string().max(40).nullable().optional(),
  source: z.enum(['manual', 'dsld', 'seeded']).optional(),
  is_shared: z.boolean().optional(),
  nutrients: z.array(nutrientInput).default([]),
})

// ── GET: list the user's supplements + shared library, with nutrients ──────────
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await (supabase as any)
    .from('supplements')
    .select('id, user_id, name, brand, form, serving_size, serving_unit, barcode, dsld_id, source, is_shared, created_at, supplement_nutrients(amount, unit, nutrients(key, display_name, canonical_unit, category, has_ul, sort_order))')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[supplements GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ supplements: data ?? [] })
}

// ── POST: create a supplement + its per-serving nutrient content ──────────────
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', detail: parsed.error.flatten() }, { status: 400 })
  }
  const s = parsed.data

  // 1. Insert the supplement.
  const { data: suppRow, error: suppErr } = await (supabase as any)
    .from('supplements')
    .insert({
      user_id: user.id,
      name: s.name.trim(),
      brand: s.brand?.trim() || null,
      form: s.form ?? null,
      serving_size: s.serving_size ?? 1,
      serving_unit: s.serving_unit ?? 'serving',
      barcode: s.barcode ?? null,
      dsld_id: s.dsld_id ?? null,
      source: s.source ?? 'manual',
      is_shared: s.is_shared ?? false,
    })
    .select('id')
    .single()

  if (suppErr) {
    console.error('[supplements POST] insert supplement', suppErr)
    return NextResponse.json({ error: suppErr.message }, { status: 500 })
  }
  const supplementId = suppRow.id

  // 2. Resolve nutrient keys → ids and convert each amount to canonical units.
  const flagged: string[] = []
  if (s.nutrients.length > 0) {
    const keys = Array.from(new Set(s.nutrients.map(n => n.key)))
    const { data: nutRows } = await (supabase as any)
      .from('nutrients')
      .select('id, key')
      .in('key', keys)
    const idByKey: Record<string, string> = {}
    for (const r of nutRows ?? []) idByKey[r.key] = r.id

    const rows: any[] = []
    const seen = new Set<string>()
    for (const n of s.nutrients) {
      const nutrientId = idByKey[n.key]
      if (!nutrientId) { flagged.push(n.key); continue }
      if (seen.has(nutrientId)) continue // unique(supplement_id, nutrient_id)
      const conv = convertToCanonical(n.key, n.amount, n.unit, {
        vitAForm: n.vitAForm,
        vitEForm: n.vitEForm,
        folateIsFolicAcid: n.folateIsFolicAcid,
      })
      if (!conv) { flagged.push(n.key); continue }
      seen.add(nutrientId)
      rows.push({
        supplement_id: supplementId,
        nutrient_id: nutrientId,
        amount: Math.round(conv.value * 1000) / 1000,
        unit: conv.unit,
      })
    }

    if (rows.length > 0) {
      const { error: nErr } = await (supabase as any).from('supplement_nutrients').insert(rows)
      if (nErr) {
        console.error('[supplements POST] insert nutrients', nErr)
        return NextResponse.json({ error: nErr.message, supplement_id: supplementId }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ id: supplementId, flagged })
}
