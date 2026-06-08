import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TabBar from '@/components/ui/TabBar'
import { UnitSystemProvider } from '@/contexts/UnitSystemContext'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch onboarding status + unit preference in one query
  const { data: profileData } = await supabase
    .from('profiles')
    .select('onboarding_complete, unit_system')
    .maybeSingle() as { data: { onboarding_complete: boolean; unit_system: string | null } | null; error: unknown }

  if (!profileData?.onboarding_complete) redirect('/onboarding')

  const unitSystem = (profileData?.unit_system ?? 'metric') as 'metric' | 'imperial'

  return (
    <UnitSystemProvider initialUnit={unitSystem}>
      <div style={{ position: 'relative', minHeight: '100dvh' }}>
        <main style={{ maxWidth: '390px', margin: '0 auto' }}>{children}</main>
        <TabBar />
      </div>
    </UnitSystemProvider>
  )
}
