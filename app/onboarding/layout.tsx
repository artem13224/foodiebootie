import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Must be logged in to onboard
  if (!user) redirect('/login')

  // If already complete, send to the app
  const { data: profileData } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .maybeSingle() as { data: { onboarding_complete: boolean } | null; error: unknown }

  if (profileData?.onboarding_complete) redirect('/today')

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text)',
    }}>
      {children}
    </div>
  )
}
