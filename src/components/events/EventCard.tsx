//file: src/components/events/EventCard.tsx
'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { MapPin, Users, Tag, Info, Clock, MessageCircle } from 'lucide-react'
import { colorByLN } from '@/lib/colors'

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
}

interface Props {
  event: EventData
  onOpenMenu: () => void
  onOpenAvisos: () => void
  onOpenChat?: () => void
  showChat?: boolean
}

function cleanEventName(s?: string) {
  if (!s) return ''
  let t = s.replace(/^\s*[A-Z]\s*-\s*/i, '').trim()
  const stopIndex = t.search(/#|code/i)
  if (stopIndex > -1) t = t.substring(0, stopIndex).trim()
  return t
}

export default function EventCard({ event, onOpenMenu, onOpenAvisos, onOpenChat, showChat }: Props) {
  const name = event.NomEvent || event.summary || ''
  const displaySummary = cleanEventName(name)
  const isCodeUnconfirmed = event.codeConfirmed === false

  const ln = event.LN || event.lnKey || event.lnLabel || 'altres'
  const lnColor = colorByLN(ln)

  const location = event.Ubicacio || event.location || ''
  const mapsUrl = location
    ? `https://www.google.com/maps?q=${encodeURIComponent(location)}`
    : null

  const hasAviso = Boolean(event.lastAviso)

  return (
    <Card
      onClick={onOpenMenu}
      className="flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:shadow-md sm:py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3
              className="line-clamp-1 text-[13px] font-semibold leading-snug text-gray-900"
              title={displaySummary}
            >
              {displaySummary}
            </h3>

            {ln && (
              <span className={`rounded-full px-2 py-[3px] text-[10px] font-semibold ${lnColor}`}>
                {ln.charAt(0).toUpperCase() + ln.slice(1)}
              </span>
            )}
          </div>

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
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pl-1">
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
              <MessageCircle className="h-4 w-4 text-amber-600" />
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
              onOpenAvisos()
            }}
          >
            <Info className={hasAviso ? 'h-4 w-4 text-blue-600' : 'h-4 w-4 text-gray-300'} />
          </button>

          {event.pax && (
            <span className="flex items-center gap-1 rounded-full border border-pink-100 bg-pink-50 px-2 py-[3px] text-[11px] font-semibold text-pink-700">
              <Users className="h-3 w-3" />
              {Number(event.pax)}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
