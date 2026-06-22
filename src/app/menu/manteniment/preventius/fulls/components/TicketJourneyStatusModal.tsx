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
  const options = allowedNext(form.currentStatus)
  const title = ticket.ticketCode || ticket.incidentNumber || 'Ticket'
  const subtitle = [
    `Estat actual: ${STATUS_LABELS[form.currentStatus]}`,
    ticket.location,
    ticket.machine,
  ]
    .filter(Boolean)
    .join(' · ')

  const handleClose = () => {
    if (form.isDirty && !window.confirm('Vols sortir sense guardar el canvi d estat?')) return
    onClose()
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        className="min-h-[48px] w-full rounded-full border border-slate-200 px-5 text-sm font-medium text-gray-600 sm:w-auto"
        onClick={handleClose}
        disabled={form.busy}
      >
        Cancel·lar
      </button>
      <button
        type="button"
        className="min-h-[48px] w-full rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        onClick={() => void form.handleSave()}
        disabled={form.busy || !form.nextStatus}
      >
        {form.busy ? 'Guardant...' : 'Guardar canvi'}
      </button>
    </div>
  )

  return (
    <TicketJourneyModalShell title={title} subtitle={subtitle} onClose={handleClose} footer={footer}>
      <div className="space-y-5">
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

        <div>
          <div className="text-sm font-medium text-gray-700">Nou estat</div>

          {!form.nextStatus ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {options.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => form.handleSelectStatus(status)}
                  className="min-h-[52px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 touch-manipulation active:bg-slate-50"
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex min-h-[52px] items-center rounded-2xl border border-emerald-600 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
                {STATUS_LABELS[form.nextStatus]}
              </div>
              <button
                type="button"
                className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline"
                onClick={form.clearStatusSelection}
              >
                Canviar estat
              </button>
            </div>
          )}
        </div>

        {form.nextStatus ? (
          <TicketJourneyStatusFields
            nextStatus={form.nextStatus}
            horaInici={form.horaInici}
            horaFi={form.horaFi}
            note={form.note}
            showPhotos={form.showPhotos}
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

        {form.formError ? <p className="text-sm text-red-600">{form.formError}</p> : null}
      </div>
    </TicketJourneyModalShell>
  )
}
