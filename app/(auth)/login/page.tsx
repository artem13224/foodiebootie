'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/today')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 var(--space-5)',
    }}>
      <div style={{ width: '100%', maxWidth: '390px' }}>
        {/* Wordmark */}
        <div style={{ marginBottom: 'var(--space-10)' }}>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '52px',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--color-text)',
            lineHeight: 1,
          }}>
            FOODIEBOOTIE
          </h1>
          <div style={{
            height: '3px',
            backgroundColor: 'var(--color-accent)',
            marginTop: 'var(--space-2)',
          }} />
          <p style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'var(--text-label)',
            letterSpacing: 'var(--tracking-loose)',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            marginTop: 'var(--space-2)',
          }}>
            Science-forward nutrition
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <input
              type="email"
              placeholder="EMAIL"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
            />

            {error && (
              <p style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 'var(--text-label)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
                color: 'var(--color-danger)',
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: 'var(--space-4)',
                backgroundColor: loading ? 'var(--color-border)' : 'var(--color-accent)',
                color: 'var(--color-text)',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: '18px',
                letterSpacing: 'var(--tracking-loose)',
                textTransform: 'uppercase',
                marginTop: 'var(--space-2)',
              }}
            >
              {loading ? 'LOGGING IN...' : 'LOG IN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-4)',
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 0,
  color: 'var(--color-text)',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: '14px',
  letterSpacing: 'var(--tracking-wide)',
  outline: 'none',
}
