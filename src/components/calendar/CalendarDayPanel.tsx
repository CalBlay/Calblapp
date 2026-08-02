'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import type { Deal } from '@/hooks/useCalendarData'
import { colorByLN } from '@/lib/colors'
import { dealsForDay } from '@/lib/calendarDealDates'
import { CALENDAR_BADGE_TEXT, CALENDAR_EVENT_TEXT } from '@/lib/calendarTypography'
import CalendarNewEventModal from './CalendarNewEventModal'
import { Button } from '@/components/ui/button'

const codeBadgeFor = (ev: Deal) => {
  const status = ev.codeStatus
  if (!status) return null
  if (status === 'confirmed') {
    return { label: 'C', className: 'border-slate-200 bg-slate-50 text-slate-700' }
  }
  if (status === 'review') {
    return { label: 'R', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  }
  return { label: '-', className: 'border-gray-200 bg-gray-50 text-gray-600' }
}

type Props = {
  dateIso: string
  deals: Deal[]
  showCodeStatus?: boolean
  selectedDealId?: string | null
  onSelectDeal: (deal: Deal) => void
  onClose: () => void
  onCreated?: () => void
}

export default function CalendarDayPanel({
  dateIso,
  deals,
  showCodeStatus,
  selectedDealId,
  onSelectDeal,
  onClose,
  onCreated,
}: Props) {
  const dayEvents = useMemo(() => dealsForDay(deals, dateIso), [deals, dateIso])

  const dayLabel = useMemo(() => {
    try {
      return format(parseISO(dateIso), "EEEE d MMMM yyyy", { locale: es })
    } catch {
      return dateIso
    }
  }, [dateIso])

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Dia seleccionat</p>
          <h2 className="truncate text-base font-semibold capitalize">{dayLabel}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {dayEvents.length} esdeveniment{dayEvents.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Tancar panell del dia"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {dayEvents.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-gray-400">
            Cap esdeveniment aquest dia.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {dayEvents.map((deal) => {
              const badge = showCodeStatus ? codeBadgeFor(deal) : null
              const selected = selectedDealId === deal.id
              const timeLabel =
                deal.HoraInici && deal.HoraFi
                  ? `${deal.HoraInici} – ${deal.HoraFi}`
                  : deal.HoraInici || deal.HoraFi || null

              return (
                <li key={deal.id}>
                  <button
                    type="button"
                    onClick={() => onSelectDeal(deal)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {timeLabel && (
                      <p className="mb-0.5 text-[11px] font-medium text-gray-500">{timeLabel}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${colorByLN(deal.LN)}`}
                      >
                        {deal.LN || '—'}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${CALENDAR_EVENT_TEXT}`}>
                        {deal.NomEvent}
                      </span>
                      {badge && (
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-[1px] ${CALENDAR_BADGE_TEXT} font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {deal.Comercial && (
                      <p className="mt-1 truncate text-xs text-gray-500">{deal.Comercial}</p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t px-4 py-3">
        <CalendarNewEventModal
          date={dateIso}
          onSaved={onCreated}
          trigger={
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <Plus size={14} />
              Nou esdeveniment
            </Button>
          }
        />
      </div>
    </div>
  )
}
