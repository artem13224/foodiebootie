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

// Fallback defaults used before onboarding is complete or on first load
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

      const { data: rawEstimate } = await supabase
        .from('tdee_estimates')
        .select('tdee_kcal, data_points, adaptation_flag, protein_g, fat_g, carbs_g, daily_kcal_target')
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!rawEstimate) {
        setData({ ...DEFAULTS, loading: false })
        return
      }

      type EstimateRow = {
        tdee_kcal: number
        data_points: number
        adaptation_flag: boolean
        protein_g: number | null
        fat_g: number | null
        carbs_g: number | null
        daily_kcal_target: number | null
      }
      const estimate = rawEstimate as EstimateRow

      // Use stored macro columns if available (post-migration rows),
      // otherwise fall back to calculating from TDEE (pre-migration compatibility)
      const targetKcal = Number(estimate.daily_kcal_target ?? estimate.tdee_kcal)
      const proteinG = estimate.protein_g != null ? Number(estimate.protein_g) : 150
      const fatG = estimate.fat_g != null ? Number(estimate.fat_g) : 65
      const carbsG = estimate.carbs_g != null
        ? Number(estimate.carbs_g)
        : Math.max(0, (targetKcal - proteinG * 4 - fatG * 9) / 4)

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
