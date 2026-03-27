'use client'

import React from 'react'
import type { DueTemplate, ScheduledItem, TicketCard } from '../types'
import { formatTicketCreatedAt, getAgeBadgeClass, getAgeLabel } from '../utils'

type Props = {
  tab: 'preventius' | 'tickets'
  visibleItems: DueTemplate[] | TicketCard[]
  scheduledItems: ScheduledItem[]
  desktop?: boolean
  onOpenPendingItem: (
    item:
      | {
          kind: 'preventiu'
          id: string
          title: string
          minutes: number
          location?: string
          priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
        }
      | {
          kind: 'ticket'
          id: string
          title: string
          minutes: number
          priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
          location?: string
          machine?: string
          createdAt?: string | number | null
        }
  ) => void
  onReturnToPending?: (data: string) => void
}

export default function PlannerSidebar({
  tab,
  visibleItems,
  scheduledItems,
  desktop = false,
  onOpenPendingItem,
  onReturnToPending,
}: Props) {
  const wrapperClass = desktop
    ? 'flex h-full min-h-0 flex-col rounded-2xl border bg-white p-3'
    : 'rounded-2xl border bg-white p-4'
  const titleClass = desktop ? 'text-xs font-semibold text-gray-900' : 'text-sm font-semibold text-gray-900'
  const listClass = desktop ? 'mt-3 space-y-2' : 'mt-3 space-y-3'

  return (
    <div
      className={[wrapperClass, desktop && onReturnToPending ? 'min-h-[220px]' : ''].join(' ')}
      onDragOver={
        desktop
          ? (e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }
          : undefined
      }
      onDrop={
        desktop && onReturnToPending
          ? (e) => {
              e.preventDefault()
              onReturnToPending(e.dataTransfer.getData('text/plain'))
            }
          : undefined
      }
    >
      <div className={titleClass}>
        {tab === 'preventius' ? 'Preventius pendents' : 'Tickets pendents'}
      </div>
      <div className={[listClass, desktop ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''].join(' ')}>
        {tab === 'preventius' &&
          (visibleItems as DueTemplate[]).map((item) => {
            const alreadyPlanned = scheduledItems.some(
              (scheduled) => scheduled.kind === 'preventiu' && scheduled.templateId === item.id
            )

            if (desktop) {
              return (
                <div
                  key={item.id}
                  className={[
                    'rounded-lg border px-2 py-2 text-[11px] bg-white',
                    alreadyPlanned ? 'opacity-40 cursor-not-allowed' : 'cursor-grab hover:bg-slate-50',
                  ].join(' ')}
                  draggable={!alreadyPlanned}
                  title={alreadyPlanned ? 'Ja planificat' : 'Arrossega al calendari'}
                  onClick={() => {
                    if (alreadyPlanned) return
                    onOpenPendingItem({
                      kind: 'preventiu',
                      id: item.id,
                      title: item.name,
                      minutes: 60,
                      location: item.location || '',
                      priority: item.dueState === 'overdue' ? 'alta' : 'normal',
                    })
                  }}
                  onDragStart={(e) => {
                    if (alreadyPlanned) return
                    e.dataTransfer.setData(
                      'text/plain',
                      JSON.stringify({
                        type: 'card',
                        kind: 'preventiu',
                        templateId: item.id,
                        title: item.name,
                        minutes: 60,
                        location: item.location || '',
                        priority: item.dueState === 'overdue' ? 'alta' : 'normal',
                      })
                    )
                  }}
                >
                  <div className="font-semibold text-gray-900 leading-snug">{item.name}</div>
                  {item.location && <div className="text-[10px] text-gray-600">{item.location}</div>}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
                    <span>{item.periodicity || '—'}</span>
                    {item.dueState === 'overdue' ? (
                      <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5">Atenció</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                        Aquesta setmana
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className={`rounded-2xl border px-4 py-3 ${alreadyPlanned ? 'opacity-50' : ''}`}
              >
                <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                {item.location && <div className="mt-1 text-sm text-gray-500">{item.location}</div>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.dueState === 'overdue'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.dueState === 'overdue' ? 'Atenció' : 'Aquesta setmana'}
                  </span>
                  <button
                    type="button"
                    disabled={alreadyPlanned}
                    onClick={() =>
                      onOpenPendingItem({
                        kind: 'preventiu',
                        id: item.id,
                        title: item.name,
                        minutes: 60,
                        location: item.location || '',
                        priority: item.dueState === 'overdue' ? 'alta' : 'normal',
                      })
                    }
                    className="min-h-[44px] rounded-full border px-4 text-sm font-medium disabled:cursor-not-allowed"
                  >
                    {alreadyPlanned ? 'Ja planificat' : 'Planificar'}
                  </button>
                </div>
              </div>
            )
          })}

        {tab === 'tickets' &&
          (visibleItems as TicketCard[]).map((item) => {
            const alreadyPlanned = scheduledItems.some(
              (scheduled) => scheduled.kind === 'ticket' && (scheduled.ticketId || scheduled.id) === item.id
            )

            if (desktop) {
              return (
                <div
                  key={item.id}
                  className={[
                    'rounded-lg border px-2 py-2 text-[11px] bg-white',
                    alreadyPlanned ? 'opacity-40 cursor-not-allowed' : 'cursor-grab hover:bg-slate-50',
                  ].join(' ')}
                  draggable={!alreadyPlanned}
                  title={alreadyPlanned ? 'Ja planificat' : 'Arrossega al calendari'}
                  onClick={() => {
                    if (alreadyPlanned) return
                    onOpenPendingItem({
                      kind: 'ticket',
                      id: item.id,
                      title: `${item.code} - ${item.title}`.trim(),
                      minutes: item.minutes,
                      priority: item.priority,
                      location: item.location || '',
                      machine: item.machine || '',
                      createdAt: item.createdAt || null,
                    })
                  }}
                  onDragStart={(e) => {
                    if (alreadyPlanned) return
                    e.dataTransfer.setData(
                      'text/plain',
                      JSON.stringify({
                        type: 'card',
                        kind: 'ticket',
                        ticketId: item.id,
                        title: `${item.code} - ${item.title}`.trim(),
                        minutes: item.minutes,
                        priority: item.priority,
                        location: item.location || '',
                        machine: item.machine || '',
                        createdAt: item.createdAt || null,
                      })
                    )
                  }}
                >
                  <div className="font-semibold text-gray-900 leading-snug">
                    {item.code} · {item.title}
                  </div>
                  {(item.location || item.createdAt) && (
                    <div className="mt-1 text-[10px] text-gray-600 leading-snug">
                      {item.location ? `Ubicació: ${item.location}` : ''}
                      {item.location && item.createdAt ? ' · ' : ''}
                      {item.createdAt ? `Creat: ${formatTicketCreatedAt(item.createdAt)}` : ''}
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-gray-600">
                    <span>{item.minutes} min</span>
                    <span className={`rounded-full px-2 py-0.5 ${getAgeBadgeClass(item.ageBucket)}`}>
                      {getAgeLabel(item.ageDays)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-end text-[10px] text-gray-600">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5">{item.priority}</span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className={`rounded-2xl border px-4 py-3 ${alreadyPlanned ? 'opacity-50' : ''}`}
              >
                <div className="text-sm font-semibold text-gray-900">
                  {item.code} · {item.title}
                </div>
                {(item.location || item.createdAt) && (
                  <div className="mt-1 text-sm text-gray-500">
                    {item.location ? `Ubicació: ${item.location}` : ''}
                    {item.location && item.createdAt ? ' · ' : ''}
                    {item.createdAt ? `Creat: ${formatTicketCreatedAt(item.createdAt)}` : ''}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgeBadgeClass(item.ageBucket)}`}
                    >
                      {getAgeLabel(item.ageDays)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                      {item.priority}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyPlanned}
                    onClick={() =>
                      onOpenPendingItem({
                      kind: 'ticket',
                      id: item.id,
                      title: `${item.code} - ${item.title}`.trim(),
                      minutes: item.minutes,
                      priority: item.priority,
                      location: item.location || '',
                      machine: item.machine || '',
                      createdAt: item.createdAt || null,
                    })
                  }
                    className="min-h-[44px] rounded-full border px-4 text-sm font-medium disabled:cursor-not-allowed"
                  >
                    {alreadyPlanned ? 'Ja planificat' : 'Planificar'}
                  </button>
                </div>
              </div>
            )
          })}
      </div>
      {desktop && (
        <div className="mt-3 shrink-0 text-[11px] text-gray-500">
          Arrossega cards al calendari i edita hora inici/fi i operari.
        </div>
      )}
    </div>
  )
}
