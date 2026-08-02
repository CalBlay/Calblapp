// âœ… file: src/components/spaces/SpaceGrid.tsx
'use client'

import { useState } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'
import { ca } from 'date-fns/locale'
import SpaceCell from './SpaceCell'
import SpaceEventModal from '@/components/spaces/SpaceEventModal'
import type { Stage } from '@/services/spaces/spaces'
import {
  DEFAULT_SPACES_HEADER_RULE,
  evaluateSpacesHeaderRule,
  type SpacesHeaderRuleConfig,
} from '@/lib/spacesHeaderRule'

type SpaceRow = {
  fincaId?: string
  finca: string
  dies: Array<{
    date: string
    events: Array<Record<string, unknown>>
  }>
}

type RawSpaceEvent = Record<string, unknown>

const readString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const readNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const readStage = (value: unknown, fallback: Stage = 'verd'): Stage => {
  if (value === 'verd' || value === 'taronja' || value === 'groc' || value === 'lila') {
    return value
  }
  return fallback
}

/**
 * ðŸ” Adapter
 * - NomÃ©s per pintar la celÂ·la (SpaceCell)
 * - NO sâ€™utilitza per passar dades al modal
 */
function adaptEventForCell(ev: RawSpaceEvent) {
  return {
    NomEvent: readString(ev.NomEvent) || readString(ev.eventName),
    Comercial: readString(ev.Comercial) || readString(ev.commercial),
    NumPax: readNumber(ev.NumPax, Number.NaN),
    StageGroup: readStage(ev.StageGroup, readStage(ev.stage)),
  }
}

interface SpaceGridProps {
  data: SpaceRow[]
  totals?: number[]
  baseDate?: string
  headerRule?: SpacesHeaderRuleConfig
  onEventMutated?: () => void
}

/**
 * ðŸ”¹ SpaceGrid
 * Taula setmanal d'espais amb targetes clicables.
 * El modal rep SEMPRE lâ€™event original (sense perdre camps).
 */
export default function SpaceGrid({
  data,
  totals = [],
  baseDate,
  headerRule = DEFAULT_SPACES_HEADER_RULE,
  onEventMutated,
}: SpaceGridProps) {
  void totals
  const [selectedEvent, setSelectedEvent] = useState<RawSpaceEvent | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const openInNewTab = (url: string) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (win) {
      win.opener = null
      win.location.href = url
    } else {
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.position = 'absolute'
      a.style.left = '-9999px'
      document.body.appendChild(a)
      a.click()
      if (document.body.contains(a)) {
        document.body.removeChild(a)
      }
    }
  }

  const handleEventClick = (ev: RawSpaceEvent) => {
    setSelectedEvent(ev)
    setModalOpen(true)
  }

  const start = startOfWeek(baseDate ? new Date(baseDate) : new Date(), {
    weekStartsOn: 1,
  })
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  // ðŸ”Ž Logs de diagnÃ²stic (dev only)
  if (process.env.NODE_ENV === 'development') {
    try {
      const totalEvents = data.reduce(
        (acc, row) =>
          acc +
          (row?.dies ?? []).reduce(
            (a, d) => a + (d?.events?.length ?? 0),
            0
          ),
        0
      )
      console.info(
        'ðŸ§© [SpaceGrid] Finques:',
        data.length,
        '| Events totals:',
        totalEvents
      )
    } catch {}
  }

  return (
    <div className="mt-4 w-full">
      <p className="mb-2 px-2 text-[11px] text-slate-500 sm:px-0 lg:hidden">
        Llisca horizontalment per veure tots els dies de la setmana.
      </p>
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100dvh-14rem)] snap-x scroll-smooth sm:max-h-[72vh] lg:max-h-[calc(100vh-11rem)] xl:max-h-[calc(100vh-10rem)] w-full px-1 sm:px-2 lg:px-0 [-webkit-overflow-scrolling:touch]">
      <table className="min-w-[920px] w-full text-xs sm:text-sm border-collapse text-center">
        <colgroup>
          <col className="w-[128px]" />
          {days.map((_, i) => (
            <col key={`col-${i}`} className="w-[112px]" />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr className="bg-gray-100">
            <th className="p-2 lg:p-3 text-left bg-white sticky left-0 top-0 shadow-sm z-30 min-w-[128px] lg:min-w-[180px]">
              Finca
            </th>

            {days.map((day, i) => {
              const dia = format(day, 'EEE', { locale: ca })
              const dataDia = format(day, 'dd/MM', { locale: ca })
              let totalPaxScoped = 0
              let totalEventsScoped = 0

              for (const row of data) {
                const cell = row?.dies?.[i]
                if (!cell?.events) continue

                const scopedEvents = cell.events.filter((e: RawSpaceEvent) => {
                  const s = String(e.stage ?? e.StageGroup ?? '').toLowerCase()
                  return (
                    (s === 'verd' && headerRule.stages.includes('verd')) ||
                    (s === 'taronja' && headerRule.stages.includes('taronja')) ||
                    (s === 'groc' && headerRule.stages.includes('groc')) ||
                    (s.includes('confirmat') && headerRule.stages.includes('verd'))
                  )
                })

                totalPaxScoped += scopedEvents.reduce(
                  (a: number, e: RawSpaceEvent) => a + Number(e.numPax ?? 0),
                  0
                )
                totalEventsScoped += scopedEvents.length
              }

              const shouldHighlight = evaluateSpacesHeaderRule({
                config: headerRule,
                totalPax: totalPaxScoped,
                totalEvents: totalEventsScoped,
              })

              return (
                <th
                  key={`head-${i}`}
                  className={`p-2 lg:p-3 border transition-colors sticky top-0 z-20 ${
                    shouldHighlight
                      ? 'bg-red-100 text-red-700 font-semibold'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className="flex flex-col items-center leading-tight">
                    <span className="text-xs font-medium capitalize">{dia}</span>
                    <span className="text-[11px] lg:text-xs mb-1">{dataDia}</span>

                    <div
                      className={`hidden sm:flex items-center gap-2 text-[11px] lg:text-xs font-medium ${
                        shouldHighlight
                          ? 'text-red-700'
                          : 'text-green-700'
                      }`}
                    >
                      <span>Pax: {totalPaxScoped}</span>
                      <span className="opacity-40">|</span>
                      <span>Events: {totalEventsScoped}</span>
                    </div>
                    <div
                      className={`sm:hidden text-[10px] font-semibold leading-tight ${
                        shouldHighlight ? 'text-red-700' : 'text-green-700'
                      }`}
                    >
                      {totalPaxScoped}p · {totalEventsScoped}ev
                    </div>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {data.length > 0 ? (
            data.map((row, rIdx) => (
              <tr key={`row-${rIdx}`} className="border-t align-top">
                {/* FINCA */}
                <td className="p-2 lg:p-3 text-left font-semibold sticky left-0 bg-white border-r shadow-sm z-10 min-w-[128px] lg:min-w-[180px] text-xs lg:text-sm">
                  {row.fincaId ? (
                    <a
                      href={`/menu/spaces/info/${row.fincaId}?readonly=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-left"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const url = new URL(
                          `/menu/spaces/info/${row.fincaId}?readonly=1`,
                          window.location.origin
                        ).toString()
                        openInNewTab(url)
                      }}
                    >
                      {row.finca}
                    </a>
                  ) : (
                    <span>{row.finca}</span>
                  )}
                </td>

                {/* CELÂ·LES */}
                {(row.dies ?? []).map((cell, cIdx) => (
                  <td
                    key={`cell-${rIdx}-${cIdx}`}
                    className="min-w-[112px] p-1 lg:p-1.5 space-y-1 align-top"
                  >
                    {(cell?.events ?? []).map((ev: RawSpaceEvent, eIdx: number) => {
                      const cellEvent = adaptEventForCell(ev)

                      return (
                        <div
                          key={`${row.finca}-${cIdx}-${eIdx}`}
                          className="cursor-pointer"
                          onClick={() => handleEventClick(ev)}
                        >
                          <SpaceCell
                            event={{
                              eventName: cellEvent.NomEvent,
                              commercial: cellEvent.Comercial,
                              numPax: Number.isFinite(cellEvent.NumPax) ? cellEvent.NumPax : 0,
                              stage: cellEvent.StageGroup,
                            }}
                          />
                        </div>
                      )
                    })}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="text-center text-gray-400 py-6">
                No hi ha dades disponibles per aquesta setmana.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* MODAL */}
      <SpaceEventModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        event={selectedEvent}
        onMutated={onEventMutated}
      />
    </div>
  )
}
