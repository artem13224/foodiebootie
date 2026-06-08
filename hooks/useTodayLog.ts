'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import type { MacroTotals } from '@/types'

type FoodLog = Database['public']['Tables']['food_logs']['Row']

interface UseTodayLogResult {
  logs: FoodLog[]
  totals: MacroTotals
  loading: boolean
  deleteLog: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useTodayLog(): UseTodayLogResult {
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const fetchLogs = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('food_logs')
      .select('*')
      .eq('logged_date', today)
      .order('created_at', { ascending: true })
    setLogs(data ?? [])
    setLoading(false)
  }, [today])

  useEffect(() => {
    fetchLogs()

    const supabase = createClient()
    const channel = supabase
      .channel(`food_logs_${today}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'food_logs',
      }, () => { fetchLogs() })
      .subscribe()

    const handleFocus = () => fetchLogs()
    window.addEventListener('focus', handleFocus)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchLogs, today])

  const deleteLog = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('food_logs').delete().eq('id', id)
    await fetchLogs()
  }, [fetchLogs])

  const totals: MacroTotals = logs.reduce(
    (acc, log) => ({
      kcal: acc.kcal + log.kcal,
      protein_g: acc.protein_g + log.protein_g,
      carbs_g: acc.carbs_g + log.carbs_g,
      fat_g: acc.fat_g + log.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  return { logs, totals, loading, deleteLog, refetch: fetchLogs }
}
