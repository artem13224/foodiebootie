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
  formula_tdee?: number | null  // optional: formula-mode baseline for overlay
}

interface TDEEChartProps {
  data: TDEEHistoryPoint[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }> }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      padding: '8px 12px',
    }}>
      {payload.map(p => (
        <div key={p.dataKey} style={{ marginBottom: '3px' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: p.color, lineHeight: 1 }}>
            {Math.round(p.value)}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '10px', color: 'var(--color-text-dim)', letterSpacing: '0.1em' }}>
            {p.dataKey === 'formula' ? 'FORMULA TDEE' : 'ADAPTIVE TDEE'}
          </div>
        </div>
      ))}
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

  const hasFormula = data.some(p => p.formula_tdee != null)

  const chartData = data.map(p => {
    const d = new Date(p.date)
    return {
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tdee: p.tdee_kcal,
      formula: p.formula_tdee ?? undefined,
    }
  })

  const allVals = chartData.flatMap(d => [d.tdee, d.formula].filter((v): v is number => v != null))
  const yMin = Math.min(...allVals) - 100
  const yMax = Math.max(...allVals) + 100

  return (
    <>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fill: 'var(--color-text-dim)' }}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 3) - 1)}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fill: 'var(--color-text-dim)' }}
            tickLine={false}
            axisLine={false}
            tickCount={3}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip content={<CustomTooltip />} />
          {/* Formula TDEE baseline — dim dashed line, only when data exists */}
          {hasFormula && (
            <Line
              type="monotone"
              dataKey="formula"
              stroke="var(--color-text-dim)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-text-dim)', strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {/* Adaptive TDEE — solid accent line */}
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
      {/* Legend — only shown when both lines are present */}
      {hasFormula && (
        <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '16px', height: '1.5px', background: 'var(--color-text-dim)', display: 'inline-block', opacity: 0.7 }} />
            FORMULA
          </span>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '16px', height: '2px', background: 'var(--color-accent)', display: 'inline-block' }} />
            ADAPTIVE
          </span>
        </div>
      )}
    </>
  )
}
