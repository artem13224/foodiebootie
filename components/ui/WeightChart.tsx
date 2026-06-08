'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { RollingPoint } from '@/lib/science/tdee'

interface ChartDataPoint {
  label: string
  raw: number
  avg: number | null
}

interface WeightChartProps {
  rollingPoints: RollingPoint[]
  unit?: 'kg' | 'lbs'
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }> }) {
  if (!active || !payload?.length) return null
  const avg = payload.find(p => p.dataKey === 'avg')?.value
  const raw = payload.find(p => p.dataKey === 'raw')?.value
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      padding: '8px 12px',
    }}>
      {avg != null && (
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: 'var(--color-accent)', lineHeight: 1 }}>
          {avg.toFixed(1)}
        </div>
      )}
      {raw != null && (
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '10px', color: 'var(--color-text-dim)', letterSpacing: '0.1em', marginTop: '2px' }}>
          RAW {raw.toFixed(1)}
        </div>
      )}
    </div>
  )
}

export default function WeightChart({ rollingPoints, unit = 'kg' }: WeightChartProps) {
  if (rollingPoints.length === 0) {
    return (
      <div style={{
        height: '160px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}>
          NO WEIGHT DATA YET
        </span>
      </div>
    )
  }

  // Take last 28 points
  const last28 = rollingPoints.slice(-28)

  const data: ChartDataPoint[] = last28.map((p, i) => {
    const date = new Date(p.date + 'T12:00:00')
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const multiplier = unit === 'lbs' ? 2.20462 : 1
    return {
      label,
      raw: Math.round(p.raw_weight * multiplier * 10) / 10,
      avg: Math.round(p.rolling_avg * multiplier * 10) / 10,
    }
  })

  // Y-axis domain with 0.5kg (or 1 lb) padding
  const allValues = data.flatMap(d => [d.raw, d.avg ?? d.raw])
  const padding = unit === 'lbs' ? 2 : 0.5
  const yMin = Math.min(...allValues) - padding
  const yMax = Math.max(...allValues) + padding

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 9,
            fill: 'var(--color-text-dim)',
            letterSpacing: '0.05em',
          }}
          tickLine={false}
          axisLine={false}
          interval={Math.floor(data.length / 4)}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 9,
            fill: 'var(--color-text-dim)',
          }}
          tickLine={false}
          axisLine={false}
          tickCount={4}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={<CustomTooltip />} />
        {/* Raw weight — faint dots, no line */}
        <Line
          type="monotone"
          dataKey="raw"
          stroke="transparent"
          dot={{ r: 3, fill: 'var(--color-text-dim)', opacity: 0.35, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: 'var(--color-text-dim)', opacity: 0.7, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        {/* Rolling average — solid accent line */}
        <Line
          type="monotone"
          dataKey="avg"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--color-accent)', strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
