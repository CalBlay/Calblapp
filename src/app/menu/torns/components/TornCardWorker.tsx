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
    case 'C':
      return 'casaments'
    case 'E':
      return 'empresa'
    case 'F':
      return 'foodlovers'
    case 'A':
      return 'agenda'
    default:
      return 'altres'
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
    'CERIMÒNIA',
    'BANQUET',
    'COCTEL',
    'CÒCTEL',
    'PAX',
  ]
  const parts = t.split(/\s-\s/).map((p) => p.trim())
  const out: string[] = []
  for (const p of parts) {
    const up = p.toUpperCase()
    if (
      STOP.some((w) => up.startsWith(w)) ||
      /\d{1,2}:\d{2}h/i.test(p) ||
      /\d+\s*pax/i.test(p)
    )
      break
    out.push(p)
  }
  return out.join(' - ').trim() || t
}

/* UI Pills */
function RolePill({ role }: { role: TornCardItem['workerRole'] }) {
  const r = (role ?? '').toLowerCase().trim()

  const label =
    r === 'responsable' ? 'Responsable' : r === 'conductor' ? 'Conductor' : 'Treballador'

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

export default function TornCardWorker({
  item,
  onClick,
  onEventClick,
  onAvisosClick,
  onChatClick,
}: Props) {
  if (!item) return null

  const ln = detectLN(item.code)
  const eventClean = cleanEventName(item.eventName)
  const placeShort = shortLocation(item.location)
  const plate =
    item.workerRole === 'conductor'
      ? (
          item.workerPlate ||
          item.__rawWorkers?.find((w) => w.name === item.workerName && w.role === 'conductor')
            ?.plate ||
          ''
        ).trim()
      : ''

  const mapsUrl =
    item.mapsUrl ||
    (item.location ? `https://www.google.com/maps?q=${encodeURIComponent(item.location)}` : null)

  return (
    <article
      className="cursor-pointer rounded-[28px] border border-slate-200/90 bg-white p-4 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.28)] transition hover:shadow-[0_20px_48px_-26px_rgba(15,23,42,0.34)] active:bg-slate-50/90 touch-manipulation sm:p-5"
      onClick={onClick}
    >
      {/* Header compacte */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 items-center min-w-0">
          <RolePill role={item.workerRole} />
          <LnBadge ln={ln} />
          <PhasePill label={item.phaseLabel} />
          {shouldShowDayNote(item.dayNote, item.phaseLabel) && <NotePill note={item.dayNote} />}
        </div>
      </div>

      {/* Nom treballador + Hora + Meeting point */}
      <div className="mb-3 flex flex-col gap-2 text-base font-semibold text-gray-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <span className="break-words text-[1.3rem] font-semibold leading-tight text-slate-900 sm:text-[1.45rem]">
              {item.workerName}
            </span>
            {plate && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                {plate}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onAvisosClick && (
              <button
                type="button"
                aria-label="Obrir avisos de producció"
                onClick={(e) => {
                  e.stopPropagation()
                  onAvisosClick()
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 sm:h-9 sm:w-9"
              >
                <Info className="h-5 w-5 sm:h-4 sm:w-4" />
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 hover:border-amber-200 hover:text-amber-600 hover:bg-amber-50 active:bg-amber-100 sm:h-9 sm:w-9"
              >
                <MessageCircle className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.startTime && item.endTime && (
            <span className="rounded-2xl bg-slate-900 px-3 py-1.5 text-[1rem] font-semibold tabular-nums text-white sm:text-[1.05rem]">
              {item.startTime} - {item.endTime}
            </span>
          )}
          {item.meetingPoint && (
            <span className="break-words rounded-2xl bg-blue-50 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-blue-700">
              Punt: {item.meetingPoint}
            </span>
          )}
        </div>
      </div>

      <div className="mb-3 h-px w-full bg-gradient-to-r from-slate-200 via-slate-100 to-transparent" />

      {/* Ubicació curta amb enllaç */}
      {item.location && (
        <div className="mb-2 flex items-start gap-2 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 break-words font-medium text-blue-600 underline underline-offset-2 hover:no-underline"
              title="Obrir a Google Maps"
              onClick={(e) => e.stopPropagation()}
            >
              {placeShort}
            </a>
          ) : (
            <span className="break-words min-w-0">{placeShort}</span>
          )}
        </div>
      )}

      {/* Nom esdeveniment + Codi */}
      {eventClean && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          {onEventClick ? (
            <button
              type="button"
              className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:text-blue-600 break-words sm:bg-transparent sm:px-0 sm:py-0"
              title={eventClean}
              onClick={(e) => {
                e.stopPropagation()
                onEventClick()
              }}
            >
              {eventClean}
            </button>
          ) : (
            <div className="min-w-0 break-words text-sm font-medium text-slate-800" title={eventClean}>
              {eventClean}
            </div>
          )}
          {item.code && (
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500 sm:ml-2">
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span className="tabular-nums">{item.code}</span>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
