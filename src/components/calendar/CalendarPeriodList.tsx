'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import type { Deal } from '@/hooks/useCalendarData'
import { colorByLN } from '@/lib/colors'
import { CALENDAR_EVENT_TEXT } from '@/lib/calendarTypography'

type Props = {
  deals: Deal[]
  showCodeStatus?: boolean
  selectedDealId?: string | null
  onSelectDeal?: (deal: Deal) => void
}

const codeLabel = (status?: string) => {
  if (status === 'confirmed') return 'C'
  if (status === 'review') return 'R'
  if (status === 'missing') return '-'
  return ''
}

const codeBadgeClass = (status?: string) => {
  if (status === 'confirmed') return 'border-slate-200 bg-slate-50 text-slate-700'
  if (status === 'review') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-gray-200 bg-gray-50 text-gray-600'
}

export default function CalendarPeriodList({
  deals,
  showCodeStatus,
  selectedDealId,
  onSelectDeal,
}: Props) {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...deals].sort((a, b) => {
      const da = a.DataInici || ''
      const db = b.DataInici || ''
      return da.localeCompare(db) || (a.NomEvent || '').localeCompare(b.NomEvent || '', 'ca')
    })
    if (!q) return sorted
    return sorted.filter((d) => {
      const haystack = [
        d.NomEvent,
        d.Comercial,
        d.LN,
        d.Servei,
        d.Ubicacio,
        d.code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [deals, query])

  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    try {
      return format(parseISO(iso.slice(0, 10)), 'd MMM yyyy', { locale: es })
    } catch {
      return iso
    }
  }

  const formatDateShort = (iso?: string) => {
    if (!iso) return '—'
    try {
      return format(parseISO(iso.slice(0, 10)), 'd MMM', { locale: es })
    } catch {
      return iso
    }
  }

  const timeLabel = (deal: Deal) => {
    if (deal.HoraInici && deal.HoraFi) return `${deal.HoraInici} – ${deal.HoraFi}`
    return deal.HoraInici || deal.HoraFi || null
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-slate-50 px-3 py-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cercar per nom, comercial, LN..."
          className="h-11 bg-white text-base sm:h-9 sm:text-sm"
        />
        <p className="mt-1.5 text-xs text-gray-500">
          {rows.length} esdeveniment{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Targetes mòbil */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:hidden">
        <ul className="space-y-2 p-3">
          {rows.map((deal) => {
            const selected = selectedDealId === deal.id
            const time = timeLabel(deal)
            return (
              <li key={deal.id}>
                <button
                  type="button"
                  onClick={() => onSelectDeal?.(deal)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors active:bg-slate-50 ${
                    selected
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white shadow-sm'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {formatDateShort(deal.DataInici)}
                      {deal.DataFi && deal.DataFi !== deal.DataInici
                        ? ` – ${formatDateShort(deal.DataFi)}`
                        : ''}
                    </span>
                    {showCodeStatus && deal.codeStatus && (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${codeBadgeClass(deal.codeStatus)}`}
                      >
                        {codeLabel(deal.codeStatus)}
                      </span>
                    )}
                  </div>
                  <p className={`line-clamp-2 ${CALENDAR_EVENT_TEXT}`}>{deal.NomEvent || '—'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${colorByLN(deal.LN)}`}
                    >
                      {deal.LN || '—'}
                    </span>
                    {time && <span className="text-[11px] text-gray-500">{time}</span>}
                  </div>
                  {deal.Comercial && (
                    <p className="mt-1 truncate text-xs text-gray-500">{deal.Comercial}</p>
                  )}
                  {deal.Ubicacio && (
                    <p className="mt-0.5 truncate text-[11px] text-gray-400">{deal.Ubicacio}</p>
                  )}
                </button>
              </li>
            )
          })}
          {!rows.length && (
            <li className="py-10 text-center text-sm text-gray-400">
              Cap esdeveniment coincideix amb la cerca.
            </li>
          )}
        </ul>
      </div>

      {/* Taula desktop / tablet */}
      <div className="hidden min-h-0 flex-1 overflow-y-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b bg-white text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Inici</th>
              <th className="px-3 py-2 font-medium">Fi</th>
              <th className="px-3 py-2 font-medium">Esdeveniment</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">LN</th>
              <th className="hidden px-3 py-2 font-medium xl:table-cell">Comercial</th>
              {showCodeStatus && <th className="px-3 py-2 font-medium">Codi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((deal) => {
              const selected = selectedDealId === deal.id
              return (
                <tr
                  key={deal.id}
                  onClick={() => onSelectDeal?.(deal)}
                  className={`cursor-pointer border-b transition-colors hover:bg-slate-50 ${
                    selected ? 'bg-blue-50 hover:bg-blue-50' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                    {formatDate(deal.DataInici)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                    {formatDate(deal.DataFi || deal.DataInici)}
                  </td>
                  <td className={`px-3 py-2 ${CALENDAR_EVENT_TEXT}`}>{deal.NomEvent || '—'}</td>
                  <td className="hidden px-3 py-2 lg:table-cell">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${colorByLN(deal.LN)}`}
                    >
                      {deal.LN || '—'}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-gray-700 xl:table-cell">
                    {deal.Comercial || '—'}
                  </td>
                  {showCodeStatus && (
                    <td className="px-3 py-2 text-xs font-semibold text-gray-600">
                      {codeLabel(deal.codeStatus)}
                    </td>
                  )}
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td
                  colSpan={showCodeStatus ? 6 : 5}
                  className="px-3 py-8 text-center text-sm text-gray-400"
                >
                  Cap esdeveniment coincideix amb la cerca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
