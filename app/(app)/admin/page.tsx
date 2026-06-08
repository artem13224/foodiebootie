import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  const profile = data as { is_admin: boolean } | null

  if (!profile?.is_admin) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--color-danger)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: '40px' }}>
          404 — NOT FOUND
        </p>
      </div>
    )
  }

  return (
    <div className="screen">
      <p style={{ color: 'var(--color-text-dim)', fontFamily: "'Barlow Condensed', sans-serif", marginTop: '40px' }}>
        ADMIN — Phase 4
      </p>
    </div>
  )
}
