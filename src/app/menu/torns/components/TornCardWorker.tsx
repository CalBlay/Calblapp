// filename: src/app/menu/torns/components/TornCardWorker.tsx
'use client'

import React from 'react'
import { MapPin, Tag, Info, MessageCircle } from 'lucide-react'
import { TornCardItem } from './TornCard'

/* Helpers */
function shortLocation(s?: string) {
  if (!s) return ''
  return s.split(',')[0]?.trim() || s
}

function detectLN(code?: string): string {
  if (!code) return 'altres'
  const prefix = code.trim().charAt(0).toUpperCase()
  switch (prefix) {
    case 'C': return 'casaments'
    case 'E': return 'empresa'
    case 'F': return 'foodlovers'
    case 'A': return 'agenda'
    default:  return 'altres'
  }
}

function cleanEventName(s?: string) {
  if (!s) return ''
  const t = s.replace(/^\s*[A-Z]\s*-\s*/i, '').trim()
  const STOP = [
    'FC',
    'SOPAR',
    'DINAR',
    'BRUNCH',
    'CERIMONIA',
    'CERIM�NIA',
    'BANQUET',
    'COCTEL',
    'C�CTEL',
    'PAX',
  ]
  const parts = t.split(/\s-\s/).map(p => p.trim())
  const out: string[] = []
  for (const p of parts) {
    const up = p.toUpperCase()
    if (
      STOP.some(w => up.startsWith(w)) ||
      /\d{1,2}:\d{2}h/i.test(p) ||
      /\d+\s*pax/i.test(p)
    ) break
    out.push(p)
  }
  return out.join(' - ').trim() || t
}

/* UI Pills */
function RolePill({ role }: { role: TornCardItem['workerRole'] }) {
  const r = (role ?? '').toLowerCase().trim()

  const label =
    r === 'responsable' ? 'Responsable'
    : r === 'conductor' ? 'Conductor'
    : 'Treballador'

  const cls =
    r === 'responsable'
      ? 'bg-orange-100 text-orange-800 border-orange-200'
      : r === 'conductor'
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : 'bg-green-100 text-green-800 border-green-200'

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {label}
    </span>
  )
}

function LnBadge({ ln }: { ln: string }) {
  const cls =
    ln === 'empresa'
      ? 'bg-blue-100 text-blue-700'
      : ln === 'casaments'
      ? 'bg-orange-100 text-orange-700'
      : ln === 'foodlovers'
      ? 'bg-green-100 text-green-700'
      : ln === 'agenda'
      ? 'bg-gray-100 text-gray-700'
      : 'bg-slate-100 text-slate-700'
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {ln}
    </span>
  )
}

function NotePill({ note }: { note?: string }) {
  if (!note) return null
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full border font-medium bg-amber-100 text-amber-800 border-amber-200">
      {note}
    </span>
  )
}

function PhasePill({ label }: { label?: string }) {
  if (!label) return null
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full border font-medium bg-orange-100 text-orange-800 border-orange-200">
      {label}
    </span>
  )
}

function normalizeLabel(value?: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function shouldShowDayNote(note?: string, phaseLabel?: string) {
  if (!note) return false
  if (!phaseLabel) return true
  return normalizeLabel(note) !== normalizeLabel(phaseLabel)
}

type Props = {
  item: TornCardItem
  onClick?: () => void
  onEventClick?: () => void
  onAvisosClick?: () => void
  onChatClick?: () => void
}

export default function TornCardWorker({ item, onClick, onEventClick, onAvisosClick, onChatClick }: Props) {
  if (!item) return null

  const ln = detectLN(item.code)
  const eventClean = cleanEventName(item.eventName)
  const placeShort = shortLocation(item.location)
  const plate =
    item.workerRole === 'conductor'
      ? (
          item.workerPlate ||
          item.__rawWorkers?.find(
            (w) => w.name === item.workerName && w.role === 'conductor'
          )?.plate ||
          ''
        ).trim()
      : ''

  const mapsUrl =
    item.mapsUrl ||
    (item.location ? `https://www.google.com/maps?q=${encodeURIComponent(item.location)}` : null)

  return (
    <article
      className="rounded-2xl border border-border p-4 shadow-sm bg-white cursor-pointer hover:shadow-md transition"
      onClick={onClick}
    >
      {/* Header compacte */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-2">
          <RolePill role={item.workerRole} />
          <LnBadge ln={ln} />
          <PhasePill label={item.phaseLabel} />
          {shouldShowDayNote(item.dayNote, item.phaseLabel) && (
            <NotePill note={item.dayNote} />
          )}
        </div>
        {onAvisosClick && (
          <button
            type="button"
            aria-label="Obrir avisos de producci�"
            onClick={(e) => {
              e.stopPropagation()
              onAvisosClick()
            }}
            className="text-gray-400 hover:text-blue-600"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
        {onChatClick && (item.eventId || item.code) && (
          <button
            type="button"
            aria-label="Obrir xat de l'esdeveniment"
            onClick={(e) => {
              e.stopPropagation()
              onChatClick()
            }}
            className="text-gray-400 hover:text-amber-600"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nom treballador + Hora + Meeting point */}
      <div className="text-base font-semibold text-gray-900 mb-2 flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold text-gray-800">{item.workerName}</span>
        {plate && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {plate}
          </span>
        )}
        {item.startTime && item.endTime && (
          <span className="text-lg text-gray-900">
            {item.startTime} - {item.endTime}
          </span>
        )}
        {item.meetingPoint && (
          <span className="uppercase tracking-wide text-blue-700">
            Punt: {item.meetingPoint}
          </span>
        )}
      </div>

      {/* Ubicaci� curta amb enlla� */}
      {item.location && (
        <div className="text-sm text-gray-700 mb-2 flex items-center gap-1">
          <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:no-underline truncate"
              title="Obrir a Google Maps"
              onClick={(e) => e.stopPropagation()}
            >
              {placeShort}
            </a>
          ) : (
            <span className="truncate">{placeShort}</span>
          )}
        </div>
      )}

      {/* Nom esdeveniment + Codi */}
      {eventClean && (
        <div className="mt-1 flex items-center justify-between">
          {onEventClick ? (
            <button
              type="button"
              className="text-sm font-medium text-gray-900 truncate text-left hover:text-blue-600"
              title={eventClean}
              onClick={(e) => {
                e.stopPropagation()
                onEventClick()
              }}
            >
              {eventClean}
            </button>
          ) : (
            <div className="text-sm font-medium text-gray-900 truncate" title={eventClean}>
              {eventClean}
            </div>
          )}
          {item.code && (
            <div className="text-xs text-gray-400 flex items-center gap-1 ml-2 shrink-0">
              <Tag className="w-3 h-3" />
              {item.code}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

