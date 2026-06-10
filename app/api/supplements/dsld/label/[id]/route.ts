import { NextResponse } from 'next/server'
import { fetchAndParseLabel } from '@/lib/dsld'

// GET /api/supplements/dsld/label/19155 → parsed Supplement Facts
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const parsed = await fetchAndParseLabel(params.id)
    if (!parsed) return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    return NextResponse.json({ supplement: parsed })
  } catch (err) {
    console.error('[supplements/dsld/label]', err)
    return NextResponse.json({ error: 'DSLD label fetch failed' }, { status: 502 })
  }
}
