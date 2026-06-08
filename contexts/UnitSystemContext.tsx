'use client'

import { createContext, useContext } from 'react'
import { kgToLbs, cmToFtIn } from '@/lib/science/utils'

type UnitSystem = 'metric' | 'imperial'

interface UnitSystemContextValue {
  unitSystem: UnitSystem
  /** The weight unit string — 'kg' or 'lbs' */
  weightUnit: 'kg' | 'lbs'
  /** Format a kg value for display: "70.0 KG" or "154.3 LBS" */
  displayWeight: (kg: number) => string
  /** Format a cm value for display: "170 CM" or "5'7\"" */
  displayHeight: (cm: number) => string
  /** Convert kg to the display unit value (number only, no label) */
  toDisplayWeight: (kg: number) => number
}

const UnitSystemContext = createContext<UnitSystemContextValue>({
  unitSystem: 'metric',
  weightUnit: 'kg',
  displayWeight: (kg) => `${kg.toFixed(1)} KG`,
  displayHeight: (cm) => `${Math.round(cm)} CM`,
  toDisplayWeight: (kg) => Math.round(kg * 10) / 10,
})

export function UnitSystemProvider({
  children,
  initialUnit,
}: {
  children: React.ReactNode
  initialUnit: 'metric' | 'imperial'
}) {
  const isImperial = initialUnit === 'imperial'

  const value: UnitSystemContextValue = {
    unitSystem: initialUnit,
    weightUnit: isImperial ? 'lbs' : 'kg',
    displayWeight: (kg) => {
      if (isImperial) return `${kgToLbs(kg)} LBS`
      return `${kg.toFixed(1)} KG`
    },
    displayHeight: (cm) => {
      if (isImperial) {
        const { feet, inches } = cmToFtIn(cm)
        return `${feet}'${inches}"`
      }
      return `${Math.round(cm)} CM`
    },
    toDisplayWeight: (kg) => {
      if (isImperial) return kgToLbs(kg)
      return Math.round(kg * 10) / 10
    },
  }

  return (
    <UnitSystemContext.Provider value={value}>
      {children}
    </UnitSystemContext.Provider>
  )
}

export function useUnitSystem(): UnitSystemContextValue {
  return useContext(UnitSystemContext)
}
