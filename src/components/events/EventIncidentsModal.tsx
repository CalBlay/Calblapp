'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useIncidents } from '@/hooks/useIncidents'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  eventId: string
  eventSummary?: string
}

function importanceColor(level: string) {
  const norm = (level || '').toLowerCase()
  if (norm === 'alta') return 'bg-red-50 text-red-700 border border-red-200'
  if (norm === 'mitjana') return 'bg-orange-50 text-orange-700 border border-orange-200'
  if (norm === 'baixa') return 'bg-green-50 text-green-700 border border-green-200'
  return 'bg-gray-50 text-gray-600 border border-gray-200'
}

function parseEventTitle(summary: string) {
  if (!summary) return { name: '', ln: '', code: '' }

  const parts = summary.split('-').map((p) => p.trim())

  let ln = ''
  if (summary.startsWith('E-') || summary.startsWith('E -')) ln = 'Empresa'
  else if (summary.startsWith('C-') || summary.startsWith('C -')) ln = 'Casaments'
  else if (summary.startsWith('F-') || summary.startsWith('F -')) ln = 'Foodlovers'
  else if (summary.startsWith('PM')) ln = 'Agenda'
  else ln = 'Altres'

  const name = parts.length > 1 ? parts[1] : summary
  const match = summary.match(/#\s*([A-Z]\d+)/)
  const code = match ? match[1] : ''

  return { name, ln, code }
}

export default function EventIncidentsModal({ open, onClose, eventId, eventSummary = '' }: Props) {
  const { incidents, loading, error } = useIncidents({
    eventId,
    light: false,
    limit: 80,
  })
  const { name, ln, code } = parseEventTitle(eventSummary)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className={typography('cardTitle')}>
            {name} - {ln}
          </DialogTitle>
          <div className={typography('bodySm')}>Llistat d'incidencies</div>
          {code && <div className={typography('bodyXs')}>Codi: {code}</div>}
        </DialogHeader>

        {loading && <p className={typography('bodySm')}>Carregant incidencies...</p>}
        {error && <p className={cn(typography('bodySm'), 'text-red-600')}>{error}</p>}

        {!loading && !error && incidents.length === 0 && (
          <p className={typography('bodySm')}>No hi ha incidencies per aquest esdeveniment.</p>
        )}

        {!loading && incidents.length > 0 && (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
            {incidents.map((incident) => (
              <div
                key={incident.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className={cn('mb-1 font-medium', typography('bodyMd'))}>{incident.description}</div>

                {Array.isArray(incident.images) && incident.images.length > 0 && (
                  <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {incident.images.map((image, index) =>
                      image?.url ? (
                        <a
                          key={`${incident.id}-image-${index}`}
                          href={image.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-xl border border-slate-200"
                        >
                          <img
                            src={image.url}
                            alt={`Incidencia ${index + 1}`}
                            className="h-32 w-full object-cover"
                          />
                        </a>
                      ) : null
                    )}
                  </div>
                )}

                {incident.createdBy && (
                  <div className={cn('mb-2', typography('bodyXs'), 'text-slate-600')}>
                    Usuari: <span className="font-semibold">{incident.createdBy}</span>
                  </div>
                )}

                <div className={cn('mb-2 flex flex-wrap gap-2', typography('bodyXs'))}>
                  {incident.department && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                      {incident.department}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${importanceColor(
                      incident.importance
                    )}`}
                  >
                    {incident.importance}
                  </span>
                  {incident.category && (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
                      {incident.category.id} - {incident.category.label}
                    </span>
                  )}
                </div>

                <div className={typography('bodyXs')}>
                  {new Date(incident.createdAt).toLocaleString('ca-ES')}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
