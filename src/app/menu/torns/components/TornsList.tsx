// filename: src/app/menu/torns/components/TornsList.tsx
'use client'

import React from 'react'
import TornCard, { TornCardItem } from './TornCard'
import TornCardWorker from './TornCardWorker'
import { Users, Calendar } from 'lucide-react'

type Props = {
  items?: TornCardItem[]
  onTornClick?: (t: TornCardItem) => void
  onEventClick?: (t: TornCardItem) => void
  onAvisosClick?: (t: TornCardItem) => void
  onChatClick?: (t: TornCardItem) => void
  groupByEvent?: boolean
  role?: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
  filters?: {
    workerName?: string | null
    roleType?: string | null
  }
}

const formatDate = (iso: string) => {
  if (!iso || iso.length < 10) return iso || ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const weekdayLong = (iso: string) => {
  const d = new Date(iso)
  const arr = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds']
  return isNaN(d.getTime()) ? '' : arr[d.getDay()]
}

function mergeGroup(arr: TornCardItem[]): TornCardItem {
  const base = arr[0]
  const baseId = (base.id || '').split(':')[0] || base.id

  type MergeWorker = {
    id?: string
    name: string
    role: 'responsable' | 'conductor' | 'treballador'
    startTime?: string
    endTime?: string
    meetingPoint?: string
    department?: string
    plate?: string
  }

  const byKey = new Map<string, MergeWorker>()

  const pushWorker = (w?: any) => {
    if (!w) return
    const key = w.id ? String(w.id) : (w.name ? w.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') : '')
    if (!key) return

    const roleNorm = (w.role || 'treballador') as MergeWorker['role']
    const nw: MergeWorker = {
      id: w.id,
      name: w.name,
      role: roleNorm,
      startTime: w.startTime,
      endTime: w.endTime,
      meetingPoint: w.meetingPoint,
      department: w.department,
      plate: w.plate,
    }

    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, nw)
    } else {
      const priority = { responsable: 3, conductor: 2, treballador: 1 }
      const takeNewRole = priority[nw.role] > priority[existing.role]
      const keepPlate = existing.plate || nw.plate
      if (takeNewRole) {
        byKey.set(key, { ...nw, plate: keepPlate })
      } else if (!existing.plate && nw.plate) {
        byKey.set(key, { ...existing, plate: nw.plate })
      }
    }
  }

  for (const t of arr) {
    if (Array.isArray(t.__rawWorkers) && t.__rawWorkers.length) {
      t.__rawWorkers.forEach(pushWorker)
    } else if (t.workerName) {
      pushWorker({
        id: undefined,
        name: t.workerName,
        role: t.workerRole ?? 'treballador',
        meetingPoint: t.meetingPoint,
        department: t.department,
      })
    }
  }

  const workers = Array.from(byKey.values())

  const parseStart = (s?: string) => (s || '').split('-')[0]?.trim() || ''
  const parseEnd = (s?: string) => (s || '').split('-')[1]?.trim() || ''

  const starts = arr.map((t) => parseStart(t.time)).filter(Boolean).sort()
  const ends = arr.map((t) => parseEnd(t.time)).filter(Boolean).sort()

  const aggTime =
    starts.length && ends.length ? `${starts[0]} - ${ends[ends.length - 1]}` : base.time

  const noteSet = new Set<string>()
  const phaseSet = new Set<string>()
  const vestimentSet = new Set<string>()
  arr.forEach((t) => {
    if (t.dayNote) noteSet.add(t.dayNote)
    if ((t as any).phaseLabel) phaseSet.add((t as any).phaseLabel)
    const vm = String((t as any).vestimentModel || '').trim()
    if (vm) vestimentSet.add(vm)
  })
  const dayNote =
    noteSet.size > 0 ? Array.from(noteSet).slice(0, 3).join(' · ') : undefined
  const phaseLabel =
    phaseSet.size > 0 ? Array.from(phaseSet).slice(0, 3).join(' · ') : undefined
  const vestimentModel =
    vestimentSet.size === 1
      ? Array.from(vestimentSet)[0]
      : vestimentSet.size > 1
        ? Array.from(vestimentSet).slice(0, 3).join(' · ')
        : undefined

  return {
    ...base,
    id: baseId,
    time: aggTime,
    dayNote,
    phaseLabel,
    vestimentModel,
    workerName: workers.length === 1 ? workers[0].name : undefined,
    workerRole: workers.length === 1 ? workers[0].role : null,
    __rawWorkers: workers,
  }
}

export default function TornsList({
  items = [],
  onTornClick,
  onEventClick,
  onAvisosClick,
  onChatClick,
  groupByEvent = false,
  role = 'Treballador',
  filters,
}: Props) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, TornCardItem[]>()

    for (const it of items) {
      const k = (it.date || '').slice(0, 10)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.time || '').localeCompare(b.time || ''))

      if (groupByEvent) {
        const byEvent = new Map<string, TornCardItem[]>()

        for (const t of arr) {
          const key =
            (t as any).eventId || `${t.code || ''}|${t.eventName || ''}|${t.location || ''}`

          if (!byEvent.has(key)) byEvent.set(key, [])
          byEvent.get(key)!.push(t)
        }

        const merged = Array.from(byEvent.values()).map(mergeGroup)
        map.set(k, merged)
      }
    }

    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items, groupByEvent])

  if (!items.length) {
    return (
      <p className="text-center py-12 text-gray-400">
        No tens torns en aquest rang.
      </p>
    )
  }

  return (
    <div className="space-y-5 sm:space-y-6 pb-2">
      {grouped.map(([dayIso, dayItems]) => {
        const total = dayItems.length
        return (
          <section key={dayIso} className="mb-4 sm:mb-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 bg-green-50 p-3 sm:p-3 rounded-xl shadow-sm">
              <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex flex-wrap items-center gap-2 min-w-0">
                <span className="tabular-nums">
                  {weekdayLong(dayIso)} {formatDate(dayIso)}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {total} torn{total !== 1 && 's'}
                </span>
              </h2>
              <span className="flex items-center gap-1.5 text-pink-600 font-bold text-sm sm:text-base shrink-0">
                <Users className="w-4 h-4 shrink-0" />
                {total}
              </span>
            </header>

            <div className="flex flex-col gap-3 sm:gap-3">
         {dayItems.map((t, index) => {
  const showWorkerView =
    role === 'Treballador' ||
    (!!filters?.workerName && filters?.workerName !== '__all__') ||
    (!!filters?.roleType && filters?.roleType !== 'all')

  const safeKey = `${t.id || 'torn'}-${index}`

  return (
    <div
      key={safeKey}
      className="relative"
      onClick={() => onTornClick?.(t)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onTornClick?.(t)
        }
      }}
      role="button"
      tabIndex={0}
    >
{showWorkerView ? (
  <>
    <TornCardWorker
      item={t}
      onEventClick={onEventClick ? () => onEventClick(t) : undefined}
      onAvisosClick={onAvisosClick ? () => onAvisosClick(t) : undefined}
      onChatClick={onChatClick ? () => onChatClick(t) : undefined}
    />
  </>
) : (
  <>
    <TornCard
      item={t}
      onEventClick={onEventClick ? () => onEventClick(t) : undefined}
      onAvisosClick={onAvisosClick ? () => onAvisosClick(t) : undefined}
      onChatClick={onChatClick ? () => onChatClick(t) : undefined}
    />
  </>
)}



    </div>
  )
})}

            </div>
          </section>
        )
      })}
    </div>
  )
}



