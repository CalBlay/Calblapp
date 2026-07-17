'use client'

import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TicketAttachmentTile from '@/components/maintenance/TicketAttachmentTile'
import { maintenanceStatusBadge } from '@/lib/colors'
import { getMaintenanceTicketValidationSummary } from '@/lib/maintenanceTicketValidation'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import {
  formatDateTime,
  getTicketTrackedMinutes,
  formatTrackedHours,
  getDaysBadge,
  getDaysOpen,
  getPlannedMinutes,
  getTicketCompletionAttachments,
  isMediaAttachment,
  normalizeMachineLabel,
  normalizeStatus,
  parseDate,
  STATUS_LABELS,
  PRIORITY_BADGES,
} from '../utils'

type Props = {
  ticket: Ticket
  expanded: boolean
  machineNameMap: Map<string, string>
  canValidateTickets: boolean
  validatingTicketId: string | null
  onOpen: (ticket: Ticket) => void
  onToggleExpanded: (id: string) => void
  onValidate: (ticket: Ticket) => Promise<void>
  onReassign: (ticket: Ticket) => void
}

function TicketHistory({ ticket }: { ticket: Ticket }) {
  const history = (ticket.statusHistory || [])
    .slice()
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
        Aquest ticket encara no te historial de canvis.
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {history.map((item, index) => (
        <div
          key={`${item.status}-${item.at}-${index}`}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
        >
          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-[120px_140px_120px_minmax(0,1fr)_160px_160px]">
            <div>
              <div className="font-medium text-slate-500">Estat</div>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${maintenanceStatusBadge(item.status)}`}
              >
                {STATUS_LABELS[normalizeStatus(item.status)]}
              </span>
            </div>
            <div>
              <div className="font-medium text-slate-500">Operari</div>
              <div>{item.byName || '-'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Hora tram</div>
              <div>
                {item.startTime || item.endTime
                  ? `${item.startTime || '--:--'}-${item.endTime || '--:--'}`
                  : '-'}
              </div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Observacions</div>
              <div className="text-[14px] leading-5 text-slate-700">{item.note || '-'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Registre real</div>
              <div>{formatDateTime(item.at)}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Dia tram</div>
              <div>{parseDate(item.at) ? format(parseDate(item.at) as Date, 'dd/MM/yyyy') : '-'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TicketCompletionAttachments({ ticket }: { ticket: Ticket }) {
  const attachments = getTicketCompletionAttachments(ticket)
  if (attachments.length === 0) return null

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Adjunts de resolucio
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Fotos o fitxers pujats per l&apos;operari quan ha tancat el ticket.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {attachments.map((item, index) => {
          const url = String(item?.url || '').trim()
          const mimeType = String(item?.meta?.type || '').trim() || null
          const name = String(item?.meta?.name || `Adjunt ${index + 1}`)
          if (!url) return null

          if (isMediaAttachment(mimeType)) {
            return (
              <a
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-slate-200 bg-slate-50 p-2 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <div className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl bg-white">
                  <TicketAttachmentTile
                    url={url}
                    mimeType={mimeType}
                    alt={name}
                    className="max-h-36 w-full object-contain"
                  />
                </div>
                <div className="mt-2 truncate text-sm font-medium text-slate-700">{name}</div>
              </a>
            )
          }

          return (
            <a
              key={`${url}-${index}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[88px] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{name}</div>
                <div className="mt-1 text-xs text-slate-500">{mimeType || 'Fitxer adjunt'}</div>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-500">Obrir</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

function TicketValidationBox({
  ticket,
  canValidateTickets,
  validatingTicketId,
  onValidate,
}: {
  ticket: Ticket
  canValidateTickets: boolean
  validatingTicketId: string | null
  onValidate: (ticket: Ticket) => Promise<void>
}) {
  const validationSummary = getMaintenanceTicketValidationSummary(ticket)
  const canDirectValidate =
    canValidateTickets &&
    validationSummary.pendingCap &&
    normalizeStatus(ticket.status) !== 'validat'

  const creatorIsPending =
    validationSummary.requiresCreatorValidation && validationSummary.pendingCreator
  const creatorDone =
    validationSummary.requiresCreatorValidation && validationSummary.creatorDone

  if (!canDirectValidate && !creatorIsPending && !creatorDone) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Validacio del ticket
        </div>
        <div className="text-sm text-amber-900">
          {creatorIsPending
            ? 'Pendent de validacio del creador i de manteniment.'
            : creatorDone
              ? 'El creador ja ha validat. Falta la validacio de manteniment.'
              : 'Pendent de validacio de manteniment.'}
        </div>
      </div>
      {canDirectValidate ? (
        <Button
          type="button"
          variant="default"
          className="rounded-full"
          disabled={validatingTicketId === ticket.id}
          onClick={() => void onValidate(ticket)}
        >
          {validatingTicketId === ticket.id ? 'Validant...' : 'Validar ticket'}
        </Button>
      ) : null}
    </div>
  )
}

export default function SeguimentTicketRow({
  ticket,
  expanded,
  machineNameMap,
  canValidateTickets,
  validatingTicketId,
  onOpen,
  onToggleExpanded,
  onValidate,
  onReassign,
}: Props) {
  const days = getDaysOpen(ticket.createdAt)
  const trackedMinutes = getTicketTrackedMinutes(ticket)
  const plannedMinutes = getPlannedMinutes(
    parseDate(ticket.plannedStart) ? format(parseDate(ticket.plannedStart) as Date, 'HH:mm') : null,
    parseDate(ticket.plannedEnd) ? format(parseDate(ticket.plannedEnd) as Date, 'HH:mm') : null,
    ticket.estimatedMinutes || null
  )
  const lastMovement =
    (ticket.statusHistory || [])
      .slice()
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at ||
    ticket.assignedAt ||
    ticket.createdAt

  const validationSummary = getMaintenanceTicketValidationSummary(ticket)
  const canDirectValidate =
    canValidateTickets &&
    validationSummary.pendingCap &&
    normalizeStatus(ticket.status) !== 'validat'
  const canReassign =
    normalizeStatus(ticket.status) === 'no_fet' || normalizeStatus(ticket.status) === 'reassignat'
  const title =
    ticket.description ||
    normalizeMachineLabel(ticket.machine, machineNameMap) ||
    ticket.location ||
    ticket.ticketCode ||
    ticket.id
  const detailsDescription =
    String(ticket.description || '').trim() &&
    String(ticket.description || '').trim() !== String(title).trim()
      ? String(ticket.description || '').trim()
      : ''
  const codeLabel = ticket.ticketCode || ticket.incidentNumber || `#${ticket.id}`
  const operatorLabel = (ticket.assignedToNames || []).join(', ') || '-'

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50/40">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {codeLabel}
              </span>
              <button
                type="button"
                onClick={() => onOpen(ticket)}
                className="min-w-0 text-left text-[15px] font-semibold leading-5 text-slate-900 hover:underline"
              >
                <span className="line-clamp-1">{title}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${maintenanceStatusBadge(ticket.status)}`}
              >
                {STATUS_LABELS[normalizeStatus(ticket.status)]}
              </span>
              {days !== null ? (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getDaysBadge(days)}`}>
                  {days} dies
                </span>
              ) : null}
              {validationSummary.pendingCap ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  Pendent de validar
                </span>
              ) : null}
              {ticket.externalized ? (
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                  Proveidor
                </span>
              ) : null}
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_BADGES[ticket.priority || 'normal'] || PRIORITY_BADGES.normal}`}
              >
                {ticket.priority || 'normal'}
              </span>
            </div>

            <div className="line-clamp-1 text-[11px] text-slate-500">
              <span>Ubicacio: {ticket.location || '-'}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>Maquina: {normalizeMachineLabel(ticket.machine, machineNameMap)}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>Operari: {operatorLabel}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>Planificat: {formatTrackedHours(plannedMinutes)}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>Real: {formatTrackedHours(trackedMinutes)}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>Ultim moviment: {formatDateTime(lastMovement)}</span>
            </div>

            {detailsDescription ? (
              <p className="line-clamp-1 text-[13px] text-slate-600">{detailsDescription}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            {canDirectValidate ? (
              <Button
                type="button"
                variant="default"
                className="h-8 rounded-full px-3 text-xs"
                disabled={validatingTicketId === ticket.id}
                onClick={() => void onValidate(ticket)}
              >
                {validatingTicketId === ticket.id ? 'Validant...' : 'Validar'}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => onToggleExpanded(ticket.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-slate-200 bg-slate-50/50 px-3 py-3 text-sm text-slate-600">
            <div className="space-y-4">
              <TicketValidationBox
                ticket={ticket}
                canValidateTickets={canValidateTickets}
                validatingTicketId={validatingTicketId}
                onValidate={onValidate}
              />
              {canReassign ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => onReassign(ticket)}
                  >
                    Reassignar ticket
                  </Button>
                </div>
              ) : null}
              <TicketCompletionAttachments ticket={ticket} />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</div>
                <TicketHistory ticket={ticket} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}
