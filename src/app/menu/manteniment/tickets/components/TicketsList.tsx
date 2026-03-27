import React from 'react'
import Link from 'next/link'
import { typography } from '@/lib/typography'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

type TicketSection = {
  key: string
  title: string
  note: string
  items: Ticket[]
}

type Props = {
  groupedTickets: TicketSection[]
  onSelect: (ticket: Ticket) => void
  onDelete: (ticket: Ticket) => void
  canDelete: (ticket: Ticket) => boolean
  formatDateTime: (value?: number | string | null) => string
  statusBadgeClasses: Record<TicketStatus, string>
  priorityBadgeClasses: Record<TicketPriority, string>
  statusLabels: Record<TicketStatus, string>
  priorityLabels: Record<TicketPriority, string>
}

export default function TicketsList({
  groupedTickets,
  onSelect,
  onDelete,
  canDelete,
  formatDateTime,
  statusBadgeClasses,
  priorityBadgeClasses,
  statusLabels,
  priorityLabels,
}: Props) {
  const renderPrimaryTitle = (ticket: Ticket) => {
    const machine = String(ticket.machine || '').trim()
    const description = String(ticket.operatorTitle || ticket.description || '').trim()
    if (machine && description) return `${machine} · ${description}`
    return machine || description || ticket.ticketCode || ticket.incidentNumber || 'Ticket'
  }

  const getSourceLabel = (source?: Ticket['source']) => {
    if (source === 'whatsblapp') return 'Missatgeria'
    if (source === 'incidencia') return 'Incidencia'
    return 'Manual'
  }

  return (
    <div className="space-y-5">
      {groupedTickets.map((section) => (
        <div key={section.key} className="space-y-3">
          <div className="px-1">
            <div className={typography('sectionTitle')}>{section.title}</div>
            <div className={`mt-1 ${typography('bodyXs')}`}>
              {section.note} · {section.items.length} tickets
            </div>
          </div>

          <div className="space-y-3">
            {section.items.map((ticket) => (
              <div
                key={ticket.id}
                className="cursor-pointer rounded-2xl border bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 md:px-5"
                onClick={() => onSelect(ticket)}
              >
                <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,2.2fr)_minmax(340px,1.4fr)_auto] xl:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={typography('cardTitle')}>{renderPrimaryTitle(ticket)}</div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {ticket.ticketCode || ticket.incidentNumber || 'TIC'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
                      <span>Origen: {ticket.location || '—'}</span>
                      {ticket.workLocation ? <span>Feina a: {ticket.workLocation}</span> : null}
                      <span>Creat per: {ticket.createdByName || '—'}</span>
                      <span>Data: {formatDateTime(ticket.createdAt)}</span>
                      {ticket.assignedToNames && ticket.assignedToNames.length > 0 ? (
                        <span>Assignat a: {ticket.assignedToNames.join(', ')}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className={typography('eyebrow')}>Entrada</div>
                      <div className="mt-1">{getSourceLabel(ticket.source)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className={typography('eyebrow')}>Feina</div>
                      <div className="mt-1">{ticket.machine || 'Sense maquinaria'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className={typography('eyebrow')}>Planificacio</div>
                      <div className="mt-1">{ticket.plannedStart ? formatDateTime(ticket.plannedStart) : 'Pendent'}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:flex-col xl:items-end">
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusBadgeClasses[ticket.status]}`}
                      >
                        {statusLabels[ticket.status]}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${priorityBadgeClasses[ticket.priority]}`}
                      >
                        {priorityLabels[ticket.priority]}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {ticket.source === 'whatsblapp' && ticket.sourceChannelId && (
                        <Link
                          href={`/menu/missatgeria?channel=${ticket.sourceChannelId}`}
                          className="rounded-full border border-emerald-200 px-3 py-1 text-sm font-medium text-emerald-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Obrir xat
                        </Link>
                      )}
                      {canDelete(ticket) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(ticket)
                          }}
                          className="min-h-[40px] rounded-full border border-red-200 px-3 text-sm font-medium text-red-600"
                          title="Eliminar"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
