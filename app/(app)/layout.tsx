import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TabBar from '@/components/ui/TabBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div style={{ position: 'relative', minHeight: '100dvh' }}>
      <main style={{ maxWidth: '390px', margin: '0 auto' }}>{children}</main>
      <TabBar />
    </div>
  )
}
