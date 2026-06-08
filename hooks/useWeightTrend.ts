'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getRollingAverage } from '@/lib/science/tdee'
import type { WeightLogEntry, RollingPoint } from '@/lib/science/tdee'

interface UseWeightTrendResult {
  logs: WeightLogEntry[]
  rollingPoints: RollingPoint[]
  loading: boolean
  refetch: () => void
}

export function useWeightTrend(): UseWeightTrendResult {
  const [logs, setLogs] = useState<WeightLogEntry[]>([])
  const [rollingPoints, setRollingPoints] = useState<RollingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await (supabase
        .from('weight_logs')
        .select('logged_at, weight_kg')
        .order('logged_at', { ascending: true }) as unknown as Promise<{
          data: { logged_at: string; weight_kg: number }[] | null
          error: unknown
        }>)

      if (cancelled) return

      const entries: WeightLogEntry[] = (data ?? []).map(r => ({
        logged_at: r.logged_at,
        weight_kg: Number(r.weight_kg),
      }))

      setLogs(entries)
      setRollingPoints(getRollingAverage(entries))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [tick])

  return {
    logs,
    rollingPoints,
    loading,
    refetch: () => setTick(t => t + 1),
  }
}
