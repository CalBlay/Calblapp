//file: src/components/events/EventCard.tsx
'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { MapPin, Users, Tag, Info, Clock, MessageCircle, UserRound, ClipboardList } from 'lucide-react'
import type { EventComandaStatus, WarehouseComandaEventBatchChip } from '@/lib/eventComanda/types'
import { eventComandaIconClass } from '@/lib/eventComanda/ui'
import EventComandaEventBatchMarkers from '@/components/events/EventComandaEventBatchMarkers'
import { colorByLN } from '@/lib/colors'
import { cn } from '@/lib/utils'

interface LastAviso {
  content: string
  department: string
  createdAt: string
}

interface EventData {
  id: string
  summary: string
  NomEvent?: string
  pax?: number | string
  start: string
  end: string | null
  location?: string
  Ubicacio?: string
  eventCode?: string | null
  codeConfirmed?: boolean
  LN?: string
  lnKey?: string
  lnLabel?: string
  lastAviso?: LastAviso | null
  avisosUnread?: number
  chatUnread?: number
  canChat?: boolean
  horaInici?: string
  commercial?: string | null
  responsableName?: string
  locationShort?: string
  warehouseBatches?: WarehouseComandaEventBatchChip[]
}

interface Props {
  event: EventData
  onOpenMenu?: () => void
  onOpenAvisos?: () => void
  onOpenChat?: () => void
  onOpenComanda?: () => void
  comandaStatus?: EventComandaStatus | null
  showChat?: boolean
  variant?: 'list' | 'grid'
  comandaOnly?: boolean
}

function cleanEventName(s?: string) {
  if (!s) return ''
  let t = s.replace(/^\s*[A-Z]\s*-\s*/i, '').trim()
  const stopIndex = t.search(/#|code/i)
  if (stopIndex > -1) t = t.substring(0, stopIndex).trim()
  return t
}

export default function EventCard({
  event,
  onOpenMenu,
  onOpenAvisos,
  onOpenChat,
  onOpenComanda,
  comandaStatus,
  showChat,
  variant = 'grid',
  comandaOnly = false,
}: Props) {
  const name = event.NomEvent || event.summary || ''
  const displaySummary = cleanEventName(name)
  const isCodeUnconfirmed = event.codeConfirmed === false

  const ln = event.LN || event.lnKey || event.lnLabel || 'altres'
  const lnColor = colorByLN(ln)

  const location = event.Ubicacio || event.location || ''
  const locationDisplay = event.locationShort || location
  const mapsUrl = location
    ? `https://www.google.com/maps?q=${encodeURIComponent(location)}`
    : null

  const hasAviso = Boolean(event.lastAviso)

  if (comandaOnly) {
    return (
      <Card
        onClick={() => onOpenComanda?.()}
        className="flex h-full w-full cursor-pointer flex-col rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-md sm:px-4 sm:py-3.5"
      >
        <div className="flex items-start justify-between gap-2">
          <h3
            className="line-clamp-2 min-h-[2.75rem] flex-1 text-[15px] font-semibold leading-snug text-slate-800 sm:line-clamp-1 sm:min-h-0 sm:text-base"
            title={displaySummary}
          >
            {displaySummary}
          </h3>
          <EventComandaEventBatchMarkers batches={event.warehouseBatches} />
        </div>

        <div className="mt-2 space-y-1 text-xs text-slate-600 sm:text-sm">
          {event.horaInici ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{event.horaInici}</span>
            </div>
          ) : null}
          {locationDisplay ? (
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{locationDisplay}</span>
            </div>
          ) : null}
        </div>
      </Card>
    )
  }

  const actionButtons = (
    <>
      {onOpenComanda && (
        <button
          type="button"
          aria-label="Obrir comanda de l'esdeveniment"
          className="relative"
          onClick={(e) => {
            e.stopPropagation()
            onOpenComanda()
          }}
        >
          <ClipboardList
            className={cn('h-4 w-4 lg:h-[18px] lg:w-[18px]', eventComandaIconClass(comandaStatus))}
          />
        </button>
      )}
      {showChat && onOpenChat && (
        <button
          type="button"
          aria-label="Obrir xat de l'esdeveniment"
          className="relative"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChat()
          }}
        >
          <MessageCircle className="h-4 w-4 text-amber-600 lg:h-[18px] lg:w-[18px]" />
          {Number(event.chatUnread || 0) > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center">
              {Number(event.chatUnread) > 99 ? '99+' : Number(event.chatUnread)}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        aria-label="Obrir avisos de produccio"
        onClick={(e) => {
          e.stopPropagation()
          onOpenAvisos?.()
        }}
      >
        <Info className={hasAviso ? 'h-4 w-4 text-blue-600 lg:h-[18px] lg:w-[18px]' : 'h-4 w-4 text-gray-300 lg:h-[18px] lg:w-[18px]'} />
      </button>
    </>
  )

  if (variant === 'list') {
    return (
      <Card
        onClick={() => onOpenMenu?.()}
        className="flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:shadow-md sm:py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3
                className="min-w-0 text-[13px] font-semibold leading-snug text-gray-900 line-clamp-2"
                title={displaySummary}
              >
                {displaySummary}
              </h3>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
              {event.eventCode && (
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3 text-gray-400" />
                  <span className={isCodeUnconfirmed ? 'text-red-600 font-semibold' : ''}>
                    {event.eventCode}
                  </span>
                </span>
              )}

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[11px] text-gray-600 underline-offset-2 hover:text-blue-600 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{location}</span>
                </a>
              )}

              {event.horaInici && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span>{event.horaInici}</span>
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                {actionButtons}
                {ln ? (
                  <span className={`rounded-full px-2 py-[3px] text-[10px] font-semibold ${lnColor}`}>
                    {ln.charAt(0).toUpperCase() + ln.slice(1)}
                  </span>
                ) : null}
              </div>
              {event.pax ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-pink-100 bg-pink-50 px-2 py-[3px] text-[11px] font-semibold text-pink-700">
                  <Users className="h-3 w-3" />
                  {Number(event.pax)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card
      onClick={() => onOpenMenu?.()}
      className="flex h-full w-full cursor-pointer flex-col rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-md sm:px-4 sm:py-3.5 lg:px-3.5 lg:py-3"
    >
      <h3
          className="line-clamp-2 min-h-[2.75rem] text-[15px] font-semibold leading-snug text-slate-800 sm:line-clamp-1 sm:min-h-0 sm:text-base lg:text-[17px]"
          title={displaySummary}
        >
          {displaySummary}
        </h3>

      <div className="mt-2.5 flex-1 space-y-1.5 text-xs text-slate-600 sm:mt-2 sm:text-sm lg:mt-2 lg:flex lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-1.5 lg:space-y-0">
        {event.eventCode && (
          <div className="flex items-center gap-1.5 lg:inline-flex">
            <Tag className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className={isCodeUnconfirmed ? 'font-semibold text-red-600' : ''}>
              {event.eventCode}
            </span>
          </div>
        )}

        {event.horaInici && (
          <div className="flex items-center gap-1.5 lg:inline-flex">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{event.horaInici}</span>
          </div>
        )}

        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-start gap-1.5 text-slate-600 underline-offset-2 hover:text-blue-600 hover:underline lg:inline-flex lg:items-center"
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 lg:mt-0" />
            <span className="line-clamp-2 lg:line-clamp-1">{locationDisplay}</span>
          </a>
        ) : locationDisplay ? (
          <div className="flex items-start gap-1.5 lg:inline-flex lg:items-center">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 lg:mt-0" />
            <span className="line-clamp-2 lg:line-clamp-1">{locationDisplay}</span>
          </div>
        ) : null}

        {event.commercial && (
          <div className="flex items-center gap-1.5 text-slate-600 sm:inline-flex lg:max-w-[10rem] lg:truncate xl:max-w-none">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="line-clamp-1">{event.commercial}</span>
          </div>
        )}

        {event.responsableName && (
          <div className="hidden items-center gap-1.5 text-slate-600 lg:inline-flex xl:max-w-[11rem] xl:truncate 2xl:max-w-none">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="line-clamp-1">{event.responsableName}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 lg:mt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {actionButtons}
          {ln ? (
            <span className={`rounded-full px-2 py-[3px] text-xs font-semibold ${lnColor}`}>
              {ln.charAt(0).toUpperCase() + ln.slice(1)}
            </span>
          ) : null}
        </div>
        {event.pax ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-pink-100 bg-pink-50 px-2.5 py-1 text-xs font-semibold text-pink-700 sm:text-sm">
            <Users className="h-3.5 w-3.5" />
            {Number(event.pax)}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-slate-400 sm:text-sm">Sense pax</span>
        )}
      </div>
    </Card>
  )
}
