import { NextResponse } from 'next/server'
import { lookupByBarcode } from '@/lib/dsld'

// GET /api/supplements/dsld/barcode?code=300054470607
// Best-effort: DSLD's UPC indexing is unreliable, so a miss is expected and the
// client should fall back to manual entry (with the barcode pre-filled).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = (searchParams.get('code') ?? '').trim()
  if (!code) return NextResponse.json({ found: false })

  try {
    const parsed = await lookupByBarcode(code)
    if (!parsed) return NextResponse.json({ found: false, barcode: code })
    return NextResponse.json({ found: true, supplement: parsed })
  } catch (err) {
    console.error('[supplements/dsld/barcode]', err)
    return NextResponse.json({ found: false, barcode: code, error: 'DSLD lookup failed' }, { status: 502 })
  }
}
