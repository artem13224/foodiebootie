import { NextResponse } from 'next/server'
import { searchSupplements } from '@/lib/dsld'

// GET /api/supplements/dsld/search?q=centrum
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  try {
    const results = await searchSupplements(q, 20)
    return NextResponse.json({ results })
  } catch (err) {
    console.error('[supplements/dsld/search]', err)
    return NextResponse.json({ results: [], error: 'DSLD search failed' }, { status: 502 })
  }
}
