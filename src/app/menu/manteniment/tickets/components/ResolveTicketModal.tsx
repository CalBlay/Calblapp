'use client'

import { useEffect, useState } from 'react'
import type { Ticket } from '../types'

type Props = {
  ticket: Ticket
  busy?: boolean
  onClose: () => void
  onSubmit: (payload: { category: string; note: string }) => void | Promise<void>
}

export default function ResolveTicketModal({ ticket, busy = false, onClose, onSubmit }: Props) {
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setCategory(String(ticket.resolutionCategory || '').trim())
    setNote(String(ticket.resolutionNote || '').trim())
  }, [ticket])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
      <div className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-6">
          <div>
            <div className="text-lg font-semibold text-slate-900">Resoldre ticket</div>
            <div className="mt-1 text-sm text-slate-500">
              {ticket.ticketCode || ticket.incidentNumber || 'TIC'} · {ticket.operatorTitle || ticket.description || ticket.location || 'Ticket'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
          >
            Tancar
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 md:px-6">
          <label className="block space-y-2 text-sm text-slate-700">
            <span className="font-medium">Categoria de resolució</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex.: consulta resolta, ajust intern, incidència menor..."
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900"
            />
          </label>

          <label className="block space-y-2 text-sm text-slate-700">
            <span className="font-medium">Com s'ha resolt</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explica breument què s'ha fet per tancar el ticket."
              rows={5}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700"
          >
            Cancel·lar
          </button>
          <button
            type="button"
            disabled={busy || !category.trim() || !note.trim()}
            onClick={() => void onSubmit({ category: category.trim(), note: note.trim() })}
            className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Resolent...' : 'Resoldre ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
