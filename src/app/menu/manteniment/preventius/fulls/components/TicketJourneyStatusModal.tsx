'use client'

import type { JourneyStatus } from '@/lib/maintenanceJourneyStatus'
import { STATUS_LABELS } from '../lib/status'
import type { JourneyTicket } from '../lib/types'
import TicketJourneyModalShell from './ticket-journey/TicketJourneyModalShell'
import TicketJourneyStatusFields from './ticket-journey/TicketJourneyStatusFields'
import { useTicketJourneyForm } from './ticket-journey/useTicketJourneyForm'

type Props = {
  ticket: JourneyTicket
  allowedNext: (status: JourneyStatus) => JourneyStatus[]
  onClose: () => void
  onSaved: () => void
}

export default function TicketJourneyStatusModal({ ticket, allowedNext, onClose, onSaved }: Props) {
  const form = useTicketJourneyForm({ ticket, onSaved })
  const options = allowedNext(form.currentStatus).filter((status) => status !== 'validat')
  const showWorkFieldsByDefault =
    !form.autoStarting && !form.nextStatus && (form.currentStatus === 'en_curs' || form.currentStatus === 'espera')
  const canSaveWithoutChangingStage =
    form.currentStatus === 'en_curs' || form.currentStatus === 'espera'
  const title = ticket.ticketCode || ticket.incidentNumber || 'Ticket'
  const subtitle = [
    `Estat actual: ${STATUS_LABELS[form.currentStatus]}`,
    ticket.location || ticket.workLocation,
  ]
    .filter(Boolean)
    .join(' · ')

  const handleClose = () => {
    if (form.isDirty && !window.confirm('Vols sortir sense guardar el canvi d estat?')) return
    onClose()
  }

  const badgeLabel = (status: JourneyStatus) => {
    if (status === 'espera') return 'En pausa'
    return STATUS_LABELS[status]
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        className="min-h-[48px] w-full rounded-full border border-slate-200 px-5 text-sm font-medium text-gray-600 sm:w-auto"
        onClick={handleClose}
        disabled={form.busy || form.autoStarting}
      >
        Cancel·lar
      </button>
      <button
        type="button"
        className="min-h-[48px] w-full rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        onClick={() => void form.handleSave()}
        disabled={form.busy || form.autoStarting || (!form.nextStatus && !canSaveWithoutChangingStage)}
      >
        {form.autoStarting ? 'Iniciant...' : form.busy ? 'Guardant...' : 'Guardar'}
      </button>
    </div>
  )

  return (
    <TicketJourneyModalShell title={title} subtitle={subtitle} onClose={handleClose} footer={footer}>
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
            {ticket.workLocation ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ubicació</div>
                <div>{ticket.workLocation}</div>
              </div>
            ) : null}
            {ticket.workerName ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Treballador</div>
                <div>{ticket.workerName}</div>
              </div>
            ) : null}
          </div>
        </div>

        {form.existingImages.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Fotos/adjunts del ticket</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {form.existingImages.map((url, index) => (
                <a
                  key={`${url}-${index}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Foto ticket ${index + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {((form.nextStatus && !form.autoStarting) || showWorkFieldsByDefault) ? (
          <TicketJourneyStatusFields
            nextStatus={form.nextStatus || form.currentStatus}
            horaInici={form.horaInici}
            horaFi={form.horaFi}
            openSegmentDateLabel={form.openSegmentDateLabel}
            note={form.note}
            showPhotos
            existingCompletionAttachments={form.existingCompletionAttachments}
            pendingAttachments={form.pendingAttachments}
            imageCount={form.imageCount}
            maxCompletionImages={form.maxCompletionImages}
            imageError={form.imageError}
            onHoraIniciChange={form.setHoraInici}
            onHoraFiChange={form.setHoraFi}
            onNoteChange={form.setNote}
            onImageChange={form.handleImageChange}
            onRemoveImage={form.removeImage}
          />
        ) : null}

        {form.autoStarting ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Obrint ticket i passant-lo a En curs...
          </div>
        ) : options.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {options.map((status) => {
                const selected = form.nextStatus === status
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => (selected ? form.clearStatusSelection() : form.handleSelectStatus(status))}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      selected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {badgeLabel(status)}
                  </button>
                )
              })}
            </div>
            {form.nextStatus ? (
              <div className="text-xs text-slate-500">
                En guardar es marcara com a {badgeLabel(form.nextStatus).toLowerCase()}.
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Si no marques cap etapa, es guardara mantenint {badgeLabel(form.currentStatus).toLowerCase()}.
              </div>
            )}
          </div>
        ) : null}

        {form.formError ? <p className="text-sm text-red-600">{form.formError}</p> : null}
      </div>
    </TicketJourneyModalShell>
  )
}
