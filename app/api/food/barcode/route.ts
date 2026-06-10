import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'
import { lookupBarcodeFatSecret, fatSecretToFoodResult } from '@/lib/fatsecret'
import { createClient } from '@/lib/supabase/server'

// ── 0. Shared/own custom-food library ─────────────────────────────────────────
// A manually-added food that someone shared (or your own private one) should be
// recognised on the next scan — before we ever hit an external database.
// custom_foods is world-readable under RLS, so we restrict to shared + own.
async function tryCustomLibrary(variants: string[]): Promise<FoodResult | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase as any)
      .from('custom_foods')
      .select('id,name,brand,serving_g,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g')
      .in('barcode', variants)
      .limit(1)
    q = user ? q.or(`is_shared.eq.true,created_by.eq.${user.id}`) : q.eq('is_shared', true)
    const { data } = await q.maybeSingle()
    if (!data) return null
    return {
      id: data.id,
      source: 'custom',
      name: data.name,
      brand: data.brand ?? undefined,
      kcalPer100g: Number(data.kcal_per_100g),
      proteinPer100g: Number(data.protein_per_100g),
      carbsPer100g: Number(data.carbs_per_100g),
      fatPer100g: Number(data.fat_per_100g),
      fiberPer100g: Number(data.fiber_per_100g ?? 0),
      servingG: Number(data.serving_g),
      customFoodId: data.id,
    }
  } catch {
    return null
  }
}

function parseServingG(raw: string | undefined): number {
  if (!raw) return 100
  const m = raw.match(/(\d+(\.\d+)?)/)
  return m ? parseFloat(m[1]) : 100
}

function getNutrient(
  nutrients: Array<{ nutrientId: number; value: number }>,
  id: number,
): number {
  return nutrients.find(n => n.nutrientId === id)?.value ?? 0
}

// ── 1. Open Food Facts ────────────────────────────────────────────────────────
// world.openfoodfacts.org contains ALL products from all countries including
// Canada — regional mirrors (ca., fr., etc.) are UI-only and don't add coverage.
// iOS BarcodeDetector sometimes strips the leading zero from EAN-13 codes
// (reads 12 digits instead of 13), so we try both forms.

async function tryOFF(barcode: string): Promise<FoodResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return null
    const data = await res.json()

    // OFF v3 uses status:'success'; v0 legacy uses status:1 — accept either
    const found = data.status === 'success' || data.status === 1
    if (!found || !data.product) return null

    const p = data.product
    const n = p.nutriments ?? {}
    const kcal: number =
      n['energy-kcal_100g'] ??
      (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0)

    if (kcal <= 0) return null

    return {
      id:             barcode,
      source:         'off',
      name:           p.product_name || p.product_name_en || 'Unknown product',
      brand:          p.brands ?? undefined,
      kcalPer100g:    kcal,
      proteinPer100g: n['proteins_100g']      ?? 0,
      carbsPer100g:   n['carbohydrates_100g'] ?? 0,
      fatPer100g:     n['fat_100g']           ?? 0,
      fiberPer100g:   n['fiber_100g']         ?? 0,
      servingG:       parseServingG(p.serving_size),
    }
  } catch {
    return null
  }
}

// ── 3. USDA Branded Foods ─────────────────────────────────────────────────────
// Best coverage of US retail brands.
// Free API key from api.data.gov — set USDA_API_KEY in .env.local.

async function tryUSDA(code: string): Promise<FoodResult | null> {
  try {
    const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'
    const usdaRes = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5&api_key=${apiKey}`,
      { next: { revalidate: 86400 } },
    )
    if (!usdaRes.ok) return null

    const data = await usdaRes.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foods: any[] = data.foods ?? []

    // USDA may omit the leading zero on EAN-13 barcodes (UPC-A vs EAN-13)
    const codeStripped = code.replace(/^0+/, '')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const food = foods.find((f: any) =>
      f.gtinUpc === code ||
      f.gtinUpc === codeStripped ||
      '0' + f.gtinUpc === code,
    )
    if (!food) return null

    const nutrients: Array<{ nutrientId: number; value: number }> =
      food.foodNutrients ?? []
    const kcal = getNutrient(nutrients, 1008)
    if (kcal <= 0) return null

    return {
      id:             String(food.fdcId),
      source:         'usda',
      name:           food.description,
      brand:          food.brandOwner ?? food.brandName ?? undefined,
      kcalPer100g:    kcal,
      proteinPer100g: getNutrient(nutrients, 1003),
      carbsPer100g:   getNutrient(nutrients, 1005),
      fatPer100g:     getNutrient(nutrients, 1004),
      fiberPer100g:   getNutrient(nutrients, 1079),
      servingG:
        food.servingSize && food.servingSizeUnit === 'g' ? food.servingSize : 100,
    }
  } catch {
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.trim()

  if (!code) {
    return NextResponse.json({ food: null, error: 'Missing barcode' }, { status: 400 })
  }

  // Normalise to EAN-13: iOS BarcodeDetector strips leading zero (12 → 13 digits)
  const codeEan = code.length === 12 ? '0' + code : code
  const variants = Array.from(new Set([code, codeEan, code.replace(/^0+/, '')]))

  // ── 0. Shared/own custom-food library (recognise manual + shared entries) ────
  const libResult = await tryCustomLibrary(variants)
  if (libResult) return NextResponse.json({ food: libResult })

  // ── 1. Open Food Facts ──────────────────────────────────────────────────────
  const offResult =
    (await tryOFF(codeEan)) ??
    (code !== codeEan ? await tryOFF(code) : null)

  if (offResult) return NextResponse.json({ food: offResult })

  // ── 2. FatSecret ────────────────────────────────────────────────────────────
  const fsRaw =
    (await lookupBarcodeFatSecret(codeEan)) ??
    (code !== codeEan ? await lookupBarcodeFatSecret(code) : null)

  if (fsRaw) return NextResponse.json({ food: fatSecretToFoodResult(fsRaw) })

  // ── 3. USDA Branded Foods ───────────────────────────────────────────────────
  const usdaResult = await tryUSDA(codeEan)
  if (usdaResult) return NextResponse.json({ food: usdaResult })

  // ── All sources exhausted ───────────────────────────────────────────────────
  return NextResponse.json(
    { food: null, error: 'Food not found', suggestion: 'Add it manually' },
    { status: 404 },
  )
}
