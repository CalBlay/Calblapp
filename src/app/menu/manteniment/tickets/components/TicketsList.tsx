import React from 'react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

type Props = {
  groupedTickets: [string, Ticket[]][]
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
  return (
    <div className="space-y-4">
      {groupedTickets.map(([day, items]) => (
        <div key={day} className="space-y-3">
          <div className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {format(parseISO(day), 'dd-MM-yyyy')}
          </div>
          <div className="space-y-3">
            {items.map((ticket) => (
              <div
                key={ticket.id}
                className="cursor-pointer rounded-2xl border bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 md:px-5"
                onClick={() => onSelect(ticket)}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="text-base font-semibold text-gray-900">
                      {ticket.machine} · {ticket.description}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <span className="min-w-0">
                        {ticket.ticketCode || ticket.incidentNumber || 'TIC'} · {ticket.location} · Creat per{' '}
                        {ticket.createdByName || '—'} · {formatDateTime(ticket.createdAt)}
                      </span>
                      {ticket.source === 'whatsblapp' && ticket.sourceChannelId && (
                        <Link
                          href={`/menu/missatgeria?channel=${ticket.sourceChannelId}`}
                          className="rounded-full border border-emerald-200 px-3 py-1 text-sm font-medium text-emerald-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Ops
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
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
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
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
