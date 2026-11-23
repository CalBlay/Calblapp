'use client'

import React, { useMemo } from 'react'
import { addMonths, endOfMonth, parseISO, startOfMonth } from 'date-fns'
import type { Deal } from '@/hooks/useCalendarData'
import { colorByLN } from '@/lib/colors'

type CalendarRangeViewProps = {
  deals: Deal[]
  start?: string
  months: number
}

type MonthRange = {
  start: Date
  end: Date
  label: string
}

type Row = {
  key: string
  label: string
  counts: number[]
}

const LN_ORDER: { key: string; label: string }[] = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'casaments', label: 'Casaments' },
  { key: 'grups restaurants', label: 'Grups Restaurants' },
  { key: 'green vita', label: 'Green Vita' },
  { key: 'foodlovers', label: 'Foodlovers' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'altres', label: 'Altres' },
]

const normalize = (v = '') =>
  v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const normalizeLn = (ln?: string) => {
  const n = normalize(ln || '')
  if (n === 'restaurants' || n === 'restauracio') return 'grups restaurants'
  return n
}

const getDealRange = (deal: Deal) => {
  const startIso = deal.DataInici || ''
  if (!startIso) return null
  const endIso = deal.DataFi || startIso
  const startDate = parseISO(startIso)
  const endDate = parseISO(endIso)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }
  return { startDate, endDate }
}

export default function CalendarRangeView({
  deals,
  start,
  months,
}: CalendarRangeViewProps) {
  const { monthRanges, rows } = useMemo(() => {
    const base = start ? parseISO(start) : new Date()
    const rangeStart = startOfMonth(base)
    const safeMonths = Math.max(1, months)

    const monthRanges: MonthRange[] = Array.from({ length: safeMonths }, (_, i) => {
      const monthStart = startOfMonth(addMonths(rangeStart, i))
      const monthEnd = endOfMonth(monthStart)
      const label = monthStart.toLocaleDateString('ca-ES', {
        month: 'short',
        year: 'numeric',
      })
      return { start: monthStart, end: monthEnd, label }
    })

    const labelByKey = new Map(LN_ORDER.map((ln) => [ln.key, ln.label]))
    const rowsByKey = new Map<string, Row>()

    LN_ORDER.forEach((ln) => {
      rowsByKey.set(ln.key, {
        key: ln.key,
        label: ln.label,
        counts: Array(monthRanges.length).fill(0),
      })
    })

    deals.forEach((deal) => {
      const lnKey = normalizeLn(deal.LN || 'altres') || 'altres'
      const label = labelByKey.get(lnKey) || String(deal.LN || lnKey || 'Altres').trim()

      if (!rowsByKey.has(lnKey)) {
        rowsByKey.set(lnKey, {
          key: lnKey,
          label,
          counts: Array(monthRanges.length).fill(0),
        })
      }

      const range = getDealRange(deal)
      if (!range) return

      monthRanges.forEach((month, idx) => {
        if (range.startDate <= month.end && range.endDate >= month.start) {
          rowsByKey.get(lnKey)!.counts[idx] += 1
        }
      })
    })

    const knownKeys = new Set(LN_ORDER.map((ln) => ln.key))
    const baseRows = LN_ORDER.map((ln) => rowsByKey.get(ln.key)).filter(Boolean) as Row[]
    const extraRows = Array.from(rowsByKey.values())
      .filter((row) => !knownKeys.has(row.key))
      .sort((a, b) => a.label.localeCompare(b.label, 'ca'))

    return { monthRanges, rows: [...baseRows, ...extraRows] }
  }, [deals, start, months])

  const gridCols = `minmax(160px, 220px) repeat(${monthRanges.length}, minmax(86px, 1fr))`

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-max rounded-xl border border-slate-200 bg-white shadow-sm">
        <div
          className="grid border-b bg-slate-50 text-[11px] text-gray-600 sm:text-xs"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-3 py-2 font-medium">LN</div>
          {monthRanges.map((month) => (
            <div key={month.label} className="px-2 py-2 text-center font-medium capitalize">
              {month.label}
            </div>
          ))}
        </div>

        {rows.map((row) => (
          <div
            key={row.key}
            className="grid border-b last:border-b-0"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="px-3 py-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${colorByLN(row.key)}`}>
                {row.label}
              </span>
            </div>

            {row.counts.map((count, idx) => (
              <div key={`${row.key}-${idx}`} className="flex items-center justify-center px-2 py-2">
                {count > 0 ? (
                  <span className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs ${colorByLN(row.key)}`}>
                    {count}
                  </span>
                ) : (
                  <span className="inline-flex min-w-[2.25rem] items-center justify-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-400">
                    -
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
