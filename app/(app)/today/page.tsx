'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTodayLog } from '@/hooks/useTodayLog'
import { useAdaptiveTDEE } from '@/hooks/useAdaptiveTDEE'
import CalorieHero from '@/components/ui/CalorieHero'
import MacroRing from '@/components/ui/MacroRing'
import MealRow from '@/components/ui/MealRow'
import type { MealType } from '@/types'

const MEALS: { type: MealType; label: string }[] = [
  { type: 'breakfast', label: 'BREAKFAST' },
  { type: 'lunch', label: 'LUNCH' },
  { type: 'dinner', label: 'DINNER' },
  { type: 'snacks', label: 'SNACKS' },
  { type: 'pre_workout', label: 'PRE WORKOUT' },
  { type: 'post_workout', label: 'POST WORKOUT' },
]

export default function TodayPage() {
  const router = useRouter()
  const [animate, setAnimate] = useState(false)
  const [username, setUsername] = useState('')
  const { logs, totals, deleteLog } = useTodayLog()
  const tdee = useAdaptiveTDEE()

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('username').maybeSingle().then(({ data }) => {
      if (data) setUsername((data as { username: string }).username)
    })
  }, [])

  const now = new Date()
  const dateStr = now
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase()
    .replace(',', ' ·')

  const eaten = Math.round(totals.kcal)
  const goal = Math.round(tdee.targetKcal)
  const remaining = goal - eaten

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-2)',
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 'var(--text-label)',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
        }}>
          {dateStr}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}>
            {username}
          </span>
          <div style={{
            width: '28px',
            height: '28px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '14px',
              color: 'var(--color-text)',
            }}>
              {username?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        </div>
      </div>

      {/* Calorie hero */}
      <CalorieHero
        remaining={remaining}
        goal={goal}
        eaten={eaten}
        burned={0}
        adaptiveDataPoints={tdee.dataPoints}
        adaptationDetected={tdee.adaptationDetected}
      />

      {/* Macro rings */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingTop: 'var(--space-8)',
        paddingBottom: 'var(--space-6)',
        borderBottom: '1px solid var(--color-border-soft)',
      }}>
        <MacroRing
          value={totals.protein_g}
          max={tdee.proteinG}
          color="var(--color-macro-protein)"
          label="PROTEIN"
          animate={animate}
        />
        <MacroRing
          value={totals.carbs_g}
          max={tdee.carbsG}
          color="var(--color-macro-carbs)"
          label="CARBS"
          animate={animate}
        />
        <MacroRing
          value={totals.fat_g}
          max={tdee.fatG}
          color="var(--color-macro-fat)"
          label="FAT"
          animate={animate}
        />
      </div>

      {/* Today's log */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 'var(--space-5)',
          paddingBottom: 'var(--space-3)',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'var(--text-label)',
            letterSpacing: 'var(--tracking-loose)',
            textTransform: 'uppercase',
            color: 'var(--color-text)',
          }}>
            TODAY'S LOG
          </span>
          {eaten > 0 && (
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '20px',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-text)',
            }}>
              {eaten} KCAL
            </span>
          )}
        </div>

        {MEALS.map(({ type, label }) => (
          <MealRow
            key={type}
            mealType={type}
            label={label}
            items={logs.filter(l => l.meal_type === type)}
            onAdd={mealType => router.push(`/log?meal=${mealType}`)}
            onDelete={deleteLog}
          />
        ))}
      </div>
    </div>
  )
}
