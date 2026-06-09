import { NextResponse } from 'next/server'
import { searchFatSecret, lookupBarcodeFatSecret } from '@/lib/fatsecret'

/**
 * GET /api/food/fatsecret
 *
 * ?q=chicken breast      → text search, returns { results: FatSecretResult[] }
 * ?barcode=0123456789    → barcode lookup, returns { food: FatSecretResult | null }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barcode = searchParams.get('barcode')?.trim()
  const q       = searchParams.get('q')?.trim()

  if (barcode) {
    const food = await lookupBarcodeFatSecret(barcode)
    return NextResponse.json({ food })
  }

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const results = await searchFatSecret(q)
  return NextResponse.json({ results })
}
