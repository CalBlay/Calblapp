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
    const isManual =
      ev.isManual === true ||
      readString(ev.stage).toLowerCase() === 'lila'

    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768
      const targetCode = readString(ev.code) || readString(ev.Code) || readString(ev.id)

      // En mÃ²bil obrim en una finestra nova per no tapar la graella
      if (isMobile && targetCode && !isManual) {
        const url = `/menu/events/${targetCode}`
        window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
    }

    // Desktop o sense identificador: modal in-place
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
    <div className="overflow-x-auto overflow-y-auto max-h-[80vh] snap-x scroll-smooth mt-4 w-full">
      <table className="min-w-full md:min-w-[960px] lg:min-w-[1200px] text-[10px] sm:text-xs border-collapse text-center w-full table-fixed">
        <colgroup>
          <col className="w-[160px]" />
          {days.map((_, i) => (
            <col key={`col-${i}`} className="w-[150px]" />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr className="bg-gray-100">
            <th className="p-2 text-left bg-white sticky left-0 top-0 shadow-sm z-30 w-[160px] min-w-[160px] max-w-[160px]">
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
                  className={`p-2 border transition-colors sticky top-0 z-20 w-[150px] min-w-[150px] max-w-[150px] ${
                    shouldHighlight
                      ? 'bg-red-100 text-red-700 font-semibold'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className="flex flex-col items-center leading-tight">
                    <span className="text-xs font-medium">{dia}</span>
                    <span className="text-[11px] mb-1">{dataDia}</span>

                    <div
                      className={`flex items-center gap-2 text-[11px] font-medium ${
                        shouldHighlight
                          ? 'text-red-700'
                          : 'text-green-700'
                      }`}
                    >
                      <span>Pax: {totalPaxScoped}</span>
                      <span className="opacity-40">|</span>
                      <span>Events: {totalEventsScoped}</span>
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
                <td className="p-2 text-left font-semibold sticky left-0 bg-white border-r shadow-sm z-10 w-[160px] min-w-[160px] max-w-[160px]">
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
                    className="p-1 space-y-1 w-[150px] min-w-[150px] max-w-[150px]"
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
