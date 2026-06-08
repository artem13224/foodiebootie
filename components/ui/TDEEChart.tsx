'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export interface TDEEHistoryPoint {
  date: string       // ISO string
  tdee_kcal: number
}

interface TDEEChartProps {
  data: TDEEHistoryPoint[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      padding: '8px 12px',
    }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: 'var(--color-accent)', lineHeight: 1 }}>
        {Math.round(payload[0].value)}
      </div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '10px', color: 'var(--color-text-dim)', letterSpacing: '0.1em', marginTop: '2px' }}>
        KCAL TDEE
      </div>
    </div>
  )
}

export default function TDEEChart({ data }: TDEEChartProps) {
  if (data.length < 2) {
    return (
      <div style={{
        height: '120px',
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
          NOT ENOUGH ESTIMATES YET
        </span>
      </div>
    )
  }

  const chartData = data.map(p => {
    const d = new Date(p.date)
    return {
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tdee: p.tdee_kcal,
    }
  })

  const vals = chartData.map(d => d.tdee)
  const yMin = Math.min(...vals) - 100
  const yMax = Math.max(...vals) + 100

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 9,
            fill: 'var(--color-text-dim)',
          }}
          tickLine={false}
          axisLine={false}
          interval={Math.max(0, Math.floor(chartData.length / 3) - 1)}
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
          tickCount={3}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="tdee"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-accent)', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: 'var(--color-accent)', strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
