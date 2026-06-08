'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TDEEData {
  targetKcal: number
  proteinG: number
  carbsG: number
  fatG: number
  dataPoints: number
  adaptationDetected: boolean
  loading: boolean
}

const DEFAULTS: TDEEData = {
  targetKcal: 2000,
  proteinG: 150,
  carbsG: 206,
  fatG: 65,
  dataPoints: 0,
  adaptationDetected: false,
  loading: true,
}

export function useAdaptiveTDEE(): TDEEData {
  const [data, setData] = useState<TDEEData>(DEFAULTS)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [{ data: rawEstimate }, { data: rawProfile }] = await Promise.all([
        supabase
          .from('tdee_estimates')
          .select('tdee_kcal, data_points, adaptation_flag')
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('protein_g_per_kg_lbm, goal_rate_kg_per_week, goal_type')
          .maybeSingle(),
      ])

      type EstimateRow = { tdee_kcal: number; data_points: number; adaptation_flag: boolean }
      const estimate = rawEstimate as EstimateRow | null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const profile = rawProfile

      if (!estimate) {
        setData({ ...DEFAULTS, loading: false })
        return
      }

      const targetKcal = Number(estimate.tdee_kcal)
      const proteinG = 150
      const fatG = 65
      const carbsG = Math.max(0, (targetKcal - proteinG * 4 - fatG * 9) / 4)

      setData({
        targetKcal,
        proteinG,
        carbsG,
        fatG,
        dataPoints: estimate.data_points,
        adaptationDetected: estimate.adaptation_flag,
        loading: false,
      })
    }

    load()
  }, [])

  return data
}
