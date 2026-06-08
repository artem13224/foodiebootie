'use client'

import { useState, useEffect } from 'react'

export function useCountUp(target: number, duration = 1300, delay = 250) {
  const [val, setVal] = useState(0)

  useEffect(() => {
    setVal(0)
    const t = setTimeout(() => {
      const start = Date.now()
      const tick = () => {
        const p = Math.min((Date.now() - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setVal(Math.round(eased * target))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(t)
  }, [target, duration, delay])

  return val
}
