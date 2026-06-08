import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronUp, MessageCircle, Trash2 } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { formatDateOnly } from '@/lib/date-format'
import { typography } from '@/lib/typography'
import { isTicketStaleAlert, STALE_TICKET_CARD_CLASS } from '@/lib/maintenanceTicketAlerts'
import { getExternalReporterTicketBucket } from '@/lib/maintenanceTicketCreators'
import { resolveOpsChannelByLocationName } from '@/lib/opsMessagingChannels'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

type TicketSection = {
  key: string
  title: string
  note: string
  items: Ticket[]
}

type Props = {
  groupedTickets: TicketSection[]
  onResolve: (ticket: Ticket) => void
  onPlanify: (ticket: Ticket) => void
  canResolveDirectly: (ticket: Ticket) => boolean
  canPlanifyDirectly: (ticket: Ticket) => boolean
  onDelete: (ticket: Ticket) => void
  canDelete: (ticket: Ticket) => boolean
  formatDateTime: (value?: number | string | null) => string
  statusBadgeClasses: Record<TicketStatus, string>
  priorityBadgeClasses: Record<TicketPriority, string>
  statusLabels: Record<TicketStatus, string>
  priorityLabels: Record<TicketPriority, string>
  externalReporterView?: boolean
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
  assigned: {
    header: 'text-blue-900',
    card: 'border-blue-200/80 bg-blue-50/55',
    expanded: 'border-blue-100 bg-blue-50/35',
  },
  resolved: {
    header: 'text-emerald-900',
    card: 'border-emerald-200/80 bg-emerald-50/55',
    expanded: 'border-emerald-100 bg-emerald-50/35',
  },
  nou: {
    header: 'text-amber-900',
    card: 'border-amber-200/80 bg-amber-50/55',
    expanded: 'border-amber-100 bg-amber-50/35',
  },
  assignat: {
    header: 'text-blue-900',
    card: 'border-blue-200/80 bg-blue-50/55',
    expanded: 'border-blue-100 bg-blue-50/35',
  },
  fet: {
    header: 'text-emerald-900',
    card: 'border-emerald-200/80 bg-emerald-50/55',
    expanded: 'border-emerald-100 bg-emerald-50/35',
  },
  externalitzat: {
    header: 'text-violet-900',
    card: 'border-violet-200/80 bg-violet-50/55',
    expanded: 'border-violet-100 bg-violet-50/35',
  },
}

const DAYS_BADGE_STYLES = {
  hot: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  fresh: 'bg-sky-100 text-sky-700',
  neutral: 'bg-slate-100 text-slate-700',
} as const

const getCardTitle = (ticket: Ticket) =>
  String(ticket.machine || ticket.operatorTitle || ticket.ticketCode || 'Ticket').trim()

const getCardDescription = (ticket: Ticket) => {
  const description = String(ticket.description || '').trim()
  const title = getCardTitle(ticket)
  if (!description || normalizeText(description) === normalizeText(title)) return ''
  return description
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const getOpsAccessLink = (ticket: Ticket) => {
  const location = String(ticket.location || ticket.workLocation || '').trim()
  let channelId = String(ticket.sourceChannelId || '').trim()
  let intake = String(ticket.intakeChannel || '').toLowerCase()

  if (!channelId) {
    const resolved = resolveOpsChannelByLocationName(location)
    if (resolved) {
      channelId = resolved.channelId
      if (!intake || intake === 'manual_tickets') intake = resolved.intakeChannel
    }
  }

  if (!channelId) return null

  const href = `/menu/missatgeria?channel=${encodeURIComponent(channelId)}`
  const isRestaurant =
    intake === 'restaurant' || channelId.startsWith('restaurants_')
  const isFinca =
    intake === 'finca' ||
    intake === 'ops' ||
    channelId.startsWith('finques_')

  const ariaLabel = isRestaurant
    ? location
      ? `Obrir OPS restaurant · ${location}`
      : 'Obrir OPS restaurant'
    : isFinca
      ? location
        ? `Obrir OPS finca · ${location}`
        : 'Obrir OPS finca'
      : location
        ? `Obrir OPS · ${location}`
        : 'Obrir OPS'

  if (isRestaurant || isFinca || ticket.source === 'whatsblapp') {
    return { href, ariaLabel }
  }

  return null
}

const getDaysOpen = (value?: number | string | null) => {
  if (!value && value !== 0) return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, differenceInCalendarDays(new Date(), date))
}

const getTicketImages = (ticket: Ticket) =>
  Array.from(
    new Set(
      [...(Array.isArray(ticket.imageUrls) ? ticket.imageUrls : []), ticket.imageUrl || '']
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 3)

const getPlannedSummary = (ticket: Ticket, formatDateTime: Props['formatDateTime']) => {
  if (!ticket.plannedStart) return ''
  const operators = (ticket.assignedToNames || []).filter(Boolean).join(', ')
  const parts = [formatDateTime(ticket.plannedStart)]
  if (operators) parts.push(operators)
  return parts.join(' - ')
}

const getExternalReporterStatusSummary = (
  ticket: Ticket,
  formatDateTime: Props['formatDateTime']
): string | null => {
  const bucket = getExternalReporterTicketBucket(ticket)

  if (bucket === 'externalitzat') {
    const supplier = String(ticket.supplierName || '').trim()
    return supplier ? `Externalitzat: ${supplier}` : 'Externalitzat'
  }

  if (bucket === 'fet') {
    const resolvedAt = (ticket.statusHistory || [])
      .filter((entry) => entry.status === 'resolut' || entry.status === 'validat')
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at
    const label = ticket.status === 'validat' ? 'Validat' : 'Resolt'
    return resolvedAt ? `${label}: ${formatDateTime(resolvedAt)}` : label
  }

  if (bucket !== 'assignat') return null

  const operators = (ticket.assignedToNames || []).filter(Boolean).join(', ')
  const planned = ticket.plannedStart ? formatDateTime(ticket.plannedStart) : ''
  const segments: string[] = []
  if (operators) segments.push(`Operari ${operators}`)
  if (planned) segments.push(`Previst ${planned}`)
  if (!segments.length) return 'Assignat'
  return `Assignat: ${segments.join(' · ')}`
}

const getPlanningActionLabel = (action: PlanningHistoryEntry['action']) => {
  if (action === 'planificat') return 'Planificat'
  if (action === 'replanificat') return 'Replanificat'
  return 'Desplanificat'
}

export default function TicketsList({
  groupedTickets,
  onResolve,
  onPlanify,
  canResolveDirectly,
  canPlanifyDirectly,
  onDelete,
  canDelete,
  formatDateTime,
  statusBadgeClasses,
  priorityBadgeClasses,
  statusLabels,
  priorityLabels,
  externalReporterView = false,
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

  const getDaysBadgeClass = (days: number | null, stale = false) => {
    if (stale) return DAYS_BADGE_STYLES.hot
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
          collapsedSections[section.key] ?? (groupedTickets.length === 1 ? false : section.key === 'inbox' ? false : true)

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

            {!isCollapsed ? (
              <div className="space-y-2">
                {section.items.map((ticket) => {
                  const expanded = expandedId === ticket.id
                  const codeLabel = codeLabelById.get(ticket.id) || 'TIC'
                  const daysOpen = getDaysOpen(ticket.createdAt)
                  const eventLabel = String(ticket.sourceEventTitle || '').trim()
                  const creatorLabel = String(ticket.createdByName || '').trim() || 'Sense usuari'
                  const locationLabel =
                    String(ticket.workLocation || ticket.location || '').trim() || 'Sense ubicacio'
                  const machineLabel = String(ticket.machine || '').trim() || 'Sense maquinaria'
                  const plannedSummary = getPlannedSummary(ticket, formatDateTime)
                  const externalStatusSummary = externalReporterView
                    ? getExternalReporterStatusSummary(ticket, formatDateTime)
                    : null
                  const assignmentSummary = externalStatusSummary
                  const history = (ticket.statusHistory || [])
                    .slice()
                    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
                  const planningHistory = (ticket.planningHistory || [])
                    .slice()
                    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
                  const isStale = isTicketStaleAlert(ticket)
                  const ticketImages = getTicketImages(ticket)
                  const cardTitle = getCardTitle(ticket)
                  const cardDescription = getCardDescription(ticket)
                  const opsAccessLink = getOpsAccessLink(ticket)

                  return (
                    <article
                      key={ticket.id}
                      className={`overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md ${
                        isStale ? STALE_TICKET_CARD_CLASS : sectionStyle.card
                      }`}
                    >
                      <div className="flex items-start gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/70 bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                              {codeLabel}
                            </span>
                            <span className={`min-w-0 ${typography('cardTitle')}`}>{cardTitle}</span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses[ticket.status]}`}
                            >
                              {statusLabels[ticket.status]}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityBadgeClasses[ticket.priority]}`}
                            >
                              {priorityLabels[ticket.priority]}
                            </span>
                            {!externalReporterView && daysOpen !== null ? (
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getDaysBadgeClass(daysOpen, isStale)}`}
                              >
                                {daysOpen} dies
                              </span>
                            ) : null}
                            {!externalReporterView && ticket.externalized ? (
                              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                                Proveidor
                              </span>
                            ) : null}
                          </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          {!externalReporterView ? <span>Creat per: {creatorLabel}</span> : null}
                          <span>Ubicacio: {locationLabel}</span>
                          {!externalReporterView && eventLabel ? (
                            <span>Esdeveniment: {eventLabel}</span>
                          ) : null}
                        </div>
                        {cardDescription ? (
                          <div className="mt-1 rounded-xl border border-white/80 bg-white/90 px-3.5 py-2.5 shadow-sm">
                            <p className="line-clamp-3 text-base font-medium leading-relaxed text-slate-900 md:text-[17px]">
                              {cardDescription}
                            </p>
                          </div>
                        ) : null}

                          {externalReporterView && assignmentSummary ? (
                            <div className="rounded-2xl border border-blue-100 bg-white/90 px-3 py-2 text-sm font-medium text-blue-950 shadow-sm">
                              {assignmentSummary}
                            </div>
                          ) : null}
                          {!externalReporterView && plannedSummary ? (
                            <div className="inline-flex rounded-full bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                              Planificat: {plannedSummary}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {!externalReporterView && canResolveDirectly(ticket) ? (
                            <button
                              type="button"
                              onClick={() => onResolve(ticket)}
                              className="rounded-full border border-emerald-300 bg-white/85 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-white"
                            >
                              Resoldre
                            </button>
                          ) : null}
                          {!externalReporterView && canPlanifyDirectly(ticket) ? (
                            <button
                              type="button"
                              onClick={() => onPlanify(ticket)}
                              className="rounded-full border border-sky-300 bg-white/85 px-3 py-2 text-xs font-semibold text-sky-700 shadow-sm hover:bg-white"
                            >
                              Planificar
                            </button>
                          ) : null}
                          {!externalReporterView && canDelete(ticket) ? (
                            <button
                              type="button"
                              title="Eliminar ticket"
                              aria-label="Eliminar ticket"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDelete(ticket)
                              }}
                              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-300 bg-white/85 text-red-600 shadow-sm transition hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
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
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className={typography('eyebrow')}>Context</div>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Creat</div>
                                  <div className="mt-1 text-sm text-slate-800">
                                    {creatorLabel} · {formatDateTime(ticket.createdAt)}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Ubicacio</div>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <span className="min-w-0 text-sm text-slate-800">{locationLabel}</span>
                                    {opsAccessLink ? (
                                      <a
                                        href={opsAccessLink.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={opsAccessLink.ariaLabel}
                                        title={opsAccessLink.ariaLabel}
                                        className="inline-flex shrink-0 rounded-lg p-1 text-amber-600 transition hover:bg-amber-50"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MessageCircle className="h-4 w-4" />
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Maquinaria</div>
                                  <div className="mt-1 text-sm text-slate-800">{machineLabel}</div>
                                </div>
                              </div>
                              {eventLabel ? (
                                <div className="rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                                  <div className={typography('eyebrow')}>Esdeveniment</div>
                                  <div className="mt-1 text-sm text-slate-800">
                                    {eventLabel}
                                    {ticket.sourceEventDate
                                      ? ` - ${formatDateOnly(ticket.sourceEventDate)}`
                                      : ''}
                                  </div>
                                </div>
                              ) : null}
                              <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
                                <div className={typography('eyebrow')}>Descripcio</div>
                                <div className="mt-2 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-900 md:text-lg">
                                  {String(ticket.description || '').trim() || '-'}
                                </div>
                              </div>
                            </div>

                            {ticketImages.length > 0 ? (
                              <div className="space-y-2">
                                <div className={typography('eyebrow')}>Imatges adjuntes</div>
                                <div
                                  className={`grid gap-3 ${ticketImages.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}
                                >
                                  {ticketImages.map((imageUrl, index) => (
                                    <a
                                      key={`${imageUrl}-${index}`}
                                      href={imageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex max-h-40 items-center justify-center overflow-hidden rounded-2xl border border-white/80 bg-slate-100/90 p-2 shadow-sm"
                                    >
                                      <Image
                                        src={imageUrl}
                                        alt={`Imatge del ticket ${index + 1}`}
                                        width={640}
                                        height={360}
                                        className="max-h-36 w-auto max-w-full object-contain"
                                        unoptimized
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {externalReporterView ? (
                              <div className="space-y-2">
                                <div className={typography('eyebrow')}>Seguiment</div>
                                <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-3 text-sm text-slate-800 shadow-sm">
                                  {externalStatusSummary ||
                                    'Pendent de gestio. Rebràs una notificacio quan manteniment assigni el ticket.'}
                                </div>
                              </div>
                            ) : null}

                            {!externalReporterView ? (
                            <div className="space-y-2">
                              <div className={typography('eyebrow')}>Historial</div>
                              <div className="space-y-2">
                                {history.length === 0 && planningHistory.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-3 text-sm text-slate-500">
                                    Aquest ticket encara no te historial de canvis.
                                  </div>
                                ) : (
                                  [
                                    ...history.map((entry, index) => ({
                                      key: `status-${entry.status}-${entry.at}-${index}`,
                                      at: Number(entry.at || 0),
                                      content: (
                                        <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span
                                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses[entry.status]}`}
                                            >
                                              {statusLabels[entry.status]}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                              {formatDateTime(entry.at)}
                                            </span>
                                            {entry.byName ? (
                                              <span className="text-xs text-slate-500">- {entry.byName}</span>
                                            ) : null}
                                          </div>
                                          {entry.note ? (
                                            <div className="mt-1 text-sm text-slate-700">{entry.note}</div>
                                          ) : null}
                                        </div>
                                      ),
                                    })),
                                    ...planningHistory.map((entry, index) => {
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
                                              <span className="text-xs text-slate-500">
                                                {formatDateTime(entry.at)}
                                              </span>
                                              {entry.byName ? (
                                                <span className="text-xs text-slate-500">- {entry.byName}</span>
                                              ) : null}
                                            </div>
                                            <div className="mt-1 text-sm text-slate-700">
                                              {entry.action === 'desplanificat' ? (
                                                <>Franja anterior: {previousSlot || nextSlot}</>
                                              ) : entry.action === 'replanificat' ? (
                                                <>
                                                  Nova franja: {nextSlot}
                                                  {previousSlot ? ` - Abans: ${previousSlot}` : ''}
                                                </>
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
                                    }),
                                  ]
                                    .sort((a, b) => b.at - a.at)
                                    .map((entry) => (
                                      <React.Fragment key={entry.key}>{entry.content}</React.Fragment>
                                    ))
                                )}
                              </div>
                            </div>
                            ) : null}

                          </div>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
