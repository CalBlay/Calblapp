import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { formatDateOnly } from '@/lib/date-format'
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
  onOpenTicket: (ticket: Ticket) => void
  onDelete: (ticket: Ticket) => void
  canDelete: (ticket: Ticket) => boolean
  formatDateTime: (value?: number | string | null) => string
  statusBadgeClasses: Record<TicketStatus, string>
  priorityBadgeClasses: Record<TicketPriority, string>
  statusLabels: Record<TicketStatus, string>
  priorityLabels: Record<TicketPriority, string>
}

type PlanningHistoryEntry = NonNullable<Ticket['planningHistory']>[number]

const SECTION_STYLES: Record<string, { header: string; card: string; expanded: string }> = {
  inbox: {
    header: 'text-amber-900',
    card: 'border-amber-200/80 bg-amber-50/55',
    expanded: 'border-amber-100 bg-amber-50/35',
  },
  planned: {
    header: 'text-sky-900',
    card: 'border-sky-200/80 bg-sky-50/55',
    expanded: 'border-sky-100 bg-sky-50/35',
  },
  active: {
    header: 'text-blue-900',
    card: 'border-blue-200/80 bg-blue-50/55',
    expanded: 'border-blue-100 bg-blue-50/35',
  },
  validation: {
    header: 'text-emerald-900',
    card: 'border-emerald-200/80 bg-emerald-50/55',
    expanded: 'border-emerald-100 bg-emerald-50/35',
  },
  external: {
    header: 'text-violet-900',
    card: 'border-violet-200/80 bg-violet-50/55',
    expanded: 'border-violet-100 bg-violet-50/35',
  },
  closed: {
    header: 'text-slate-900',
    card: 'border-slate-200 bg-slate-50/60',
    expanded: 'border-slate-100 bg-slate-50/40',
  },
}

const DAYS_BADGE_STYLES = {
  hot: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  fresh: 'bg-sky-100 text-sky-700',
  neutral: 'bg-slate-100 text-slate-700',
} as const

const getPrimaryTitle = (ticket: Ticket) =>
  String(ticket.operatorTitle || ticket.description || ticket.machine || ticket.ticketCode || 'Ticket').trim()

const getDaysOpen = (value?: number | string | null) => {
  if (!value && value !== 0) return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, differenceInCalendarDays(new Date(), date))
}

const getTimelineDate = (ticket: Ticket) => {
  const latestStatusAt = (ticket.statusHistory || [])
    .slice()
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at
  return latestStatusAt || ticket.plannedStart || ticket.assignedAt || ticket.createdAt
}

const getPlannedSummary = (ticket: Ticket, formatDateTime: Props['formatDateTime']) => {
  if (!ticket.plannedStart) return ''
  const operators = (ticket.assignedToNames || []).filter(Boolean).join(', ')
  const parts = [formatDateTime(ticket.plannedStart)]
  if (operators) parts.push(operators)
  return parts.join(' - ')
}

const getPlanningActionLabel = (action: PlanningHistoryEntry['action']) => {
  if (action === 'planificat') return 'Planificat'
  if (action === 'replanificat') return 'Replanificat'
  return 'Desplanificat'
}

export default function TicketsList({
  groupedTickets,
  onSelect,
  onOpenTicket,
  onDelete,
  canDelete,
  formatDateTime,
  statusBadgeClasses,
  priorityBadgeClasses,
  statusLabels,
  priorityLabels,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const codeLabelById = useMemo(
    () =>
      new Map(
        groupedTickets.flatMap((section) =>
          section.items.map((ticket) => [
            ticket.id,
            ticket.ticketCode || ticket.incidentNumber || 'TIC',
          ])
        )
      ),
    [groupedTickets]
  )

  const getDaysBadgeClass = (days: number | null) => {
    if (days === null) return DAYS_BADGE_STYLES.neutral
    if (days >= 8) return DAYS_BADGE_STYLES.hot
    if (days >= 4) return DAYS_BADGE_STYLES.medium
    return DAYS_BADGE_STYLES.fresh
  }

  return (
    <div className="space-y-5">
      {groupedTickets.map((section) => {
        const sectionStyle = SECTION_STYLES[section.key] || SECTION_STYLES.closed
        const isCollapsed =
          collapsedSections[section.key] ?? (section.key === 'inbox' ? false : true)

        return (
          <section key={section.key} className="space-y-3">
            <header className="px-1">
              <button
                type="button"
                onClick={() =>
                  setCollapsedSections((prev) => ({
                    ...prev,
                    [section.key]: !isCollapsed,
                  }))
                }
                className="flex w-full items-start justify-between gap-3 rounded-2xl px-2 py-1 text-left transition hover:bg-slate-50/70"
              >
                <div className="min-w-0">
                  <div className={`${typography('sectionTitle')} ${sectionStyle.header}`}>{section.title}</div>
                  <div className={`mt-1 ${typography('bodyXs')} text-slate-500`}>
                    {section.note} - {section.items.length} tickets
                  </div>
                </div>
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </span>
              </button>
            </header>

            {!isCollapsed ? <div className="space-y-2">
              {section.items.map((ticket) => {
                const expanded = expandedId === ticket.id
                const codeLabel = codeLabelById.get(ticket.id) || 'TIC'
                const daysOpen = getDaysOpen(ticket.createdAt)
                const eventLabel = String(ticket.sourceEventTitle || '').trim()
                const creatorLabel = String(ticket.createdByName || '').trim() || 'Sense usuari'
                const locationLabel = String(ticket.workLocation || ticket.location || '').trim() || 'Sense ubicacio'
                const machineLabel = String(ticket.machine || '').trim() || 'Sense maquinaria'
                const plannedSummary = getPlannedSummary(ticket, formatDateTime)
                const history = (ticket.statusHistory || []).slice().sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
                const planningHistory = (ticket.planningHistory || [])
                  .slice()
                  .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))

                return (
                  <article
                    key={ticket.id}
                    className={`overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md ${sectionStyle.card}`}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/70 bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                            {codeLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => onSelect(ticket)}
                            className={`min-w-0 text-left ${typography('cardTitle')} hover:underline`}
                          >
                            {getPrimaryTitle(ticket)}
                          </button>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses[ticket.status]}`}>
                            {statusLabels[ticket.status]}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityBadgeClasses[ticket.priority]}`}>
                            {priorityLabels[ticket.priority]}
                          </span>
                          {daysOpen !== null ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getDaysBadgeClass(daysOpen)}`}>
                              {daysOpen} dies
                            </span>
                          ) : null}
                          {ticket.externalized ? (
                            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                              Proveidor
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span>Creat per: {creatorLabel}</span>
                          <span>Ubicacio: {locationLabel}</span>
                          <span>Maquina: {machineLabel}</span>
                          {eventLabel ? <span>Esdeveniment: {eventLabel}</span> : null}
                        </div>

                        {plannedSummary ? (
                          <div className="inline-flex rounded-full bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                            Planificat: {plannedSummary}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId((prev) => (prev === ticket.id ? null : ticket.id))}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/85 text-slate-500 shadow-sm transition hover:bg-white"
                          title={expanded ? 'Plegar' : 'Desplegar'}
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className={`border-t px-4 py-4 ${sectionStyle.expanded}`}>
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className={typography('eyebrow')}>Context</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Creat per</div>
                                  <div className="mt-1 text-sm text-slate-800">
                                    {creatorLabel} - {formatDateOnly(ticket.createdAt)}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Ultim moviment</div>
                                  <div className="mt-1 text-sm text-slate-800">{formatDateTime(getTimelineDate(ticket))}</div>
                                </div>
                                {eventLabel ? (
                                  <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm sm:col-span-2">
                                    <div className={typography('eyebrow')}>Esdeveniment</div>
                                    <div className="mt-1 text-sm text-slate-800">
                                      {eventLabel}
                                      {ticket.sourceEventDate ? ` - ${formatDateOnly(ticket.sourceEventDate)}` : ''}
                                    </div>
                                  </div>
                                ) : null}
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm sm:col-span-2">
                                  <div className={typography('eyebrow')}>Descripcio origen</div>
                                  <div className="mt-1 text-sm text-slate-800">{ticket.description || '-'}</div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className={typography('eyebrow')}>Dades de la feina</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Titol operatiu</div>
                                  <div className="mt-1 text-sm text-slate-800">{ticket.operatorTitle || '-'}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Maquinaria</div>
                                  <div className="mt-1 text-sm text-slate-800">{machineLabel}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Ubicacio origen</div>
                                  <div className="mt-1 text-sm text-slate-800">{ticket.location || '-'}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Ubicacio feina</div>
                                  <div className="mt-1 text-sm text-slate-800">{ticket.workLocation || ticket.location || '-'}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className={typography('eyebrow')}>Planificacio</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Franja</div>
                                  <div className="mt-1 text-sm text-slate-800">{plannedSummary || 'Pendent de planificar'}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Operaris</div>
                                  <div className="mt-1 text-sm text-slate-800">
                                    {(ticket.assignedToNames || []).filter(Boolean).join(', ') || '-'}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Vehicle</div>
                                  <div className="mt-1 text-sm text-slate-800">{ticket.vehiclePlate || ticket.vehicleType || '-'}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Proveidor</div>
                                  <div className="mt-1 text-sm text-slate-800">{ticket.supplierName || '-'}</div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                            <div className={typography('eyebrow')}>Historial</div>
                            <div className="space-y-2">
                                {history.length === 0 && planningHistory.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-3 text-sm text-slate-500">
                                    Aquest ticket encara no te historial de canvis.
                                  </div>
                                ) : (
                                  [...history.map((entry, index) => ({
                                    key: `status-${entry.status}-${entry.at}-${index}`,
                                    at: Number(entry.at || 0),
                                    content: (
                                      <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses[entry.status]}`}>
                                            {statusLabels[entry.status]}
                                          </span>
                                          <span className="text-xs text-slate-500">{formatDateTime(entry.at)}</span>
                                          {entry.byName ? <span className="text-xs text-slate-500">- {entry.byName}</span> : null}
                                        </div>
                                        {entry.note ? <div className="mt-1 text-sm text-slate-700">{entry.note}</div> : null}
                                      </div>
                                    ),
                                  })), ...planningHistory.map((entry, index) => {
                                    const nextSlot =
                                      entry.plannedStart && entry.plannedEnd
                                        ? `${formatDateTime(entry.plannedStart)} - ${formatDateTime(entry.plannedEnd)}`
                                        : 'Sense franja'
                                    const previousSlot =
                                      entry.previousPlannedStart && entry.previousPlannedEnd
                                        ? `${formatDateTime(entry.previousPlannedStart)} - ${formatDateTime(entry.previousPlannedEnd)}`
                                        : ''
                                    return {
                                      key: `planning-${entry.action}-${entry.at}-${index}`,
                                      at: Number(entry.at || 0),
                                      content: (
                                        <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                              {getPlanningActionLabel(entry.action)}
                                            </span>
                                            <span className="text-xs text-slate-500">{formatDateTime(entry.at)}</span>
                                            {entry.byName ? <span className="text-xs text-slate-500">- {entry.byName}</span> : null}
                                          </div>
                                          <div className="mt-1 text-sm text-slate-700">
                                            {entry.action === 'desplanificat' ? (
                                              <>Franja anterior: {previousSlot || nextSlot}</>
                                            ) : entry.action === 'replanificat' ? (
                                              <>Nova franja: {nextSlot}{previousSlot ? ` - Abans: ${previousSlot}` : ''}</>
                                            ) : (
                                              <>Franja: {nextSlot}</>
                                            )}
                                          </div>
                                          {entry.assignedToNames && entry.assignedToNames.length > 0 ? (
                                            <div className="mt-1 text-sm text-slate-500">
                                              Operaris: {entry.assignedToNames.join(', ')}
                                            </div>
                                          ) : null}
                                        </div>
                                      ),
                                    }
                                  })]
                                    .sort((a, b) => b.at - a.at)
                                    .map((entry) => <React.Fragment key={entry.key}>{entry.content}</React.Fragment>)
                                )}
                            </div>
                          </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                              {ticket.source === 'whatsblapp' && ticket.sourceChannelId ? (
                                <Link
                                  href={`/menu/missatgeria?channel=${ticket.sourceChannelId}`}
                                  className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-emerald-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Obrir xat OPS
                                </Link>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => onOpenTicket(ticket)}
                                className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-sm font-medium text-slate-700"
                              >
                                Obrir ticket
                              </button>
                              {canDelete(ticket) ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete(ticket)
                                  }}
                                  className="rounded-full border border-rose-200 bg-white/85 px-3 py-1.5 text-sm font-medium text-rose-600"
                                  title="Eliminar"
                                >
                                  Eliminar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div> : null}
          </section>
        )
      })}
    </div>
  )
}
