'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, FileText, Mail, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import type { IncidentMeetingSession } from '@/lib/incidentMeetingSession'
import { formatDateString } from '@/lib/formatDate'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPickSession: (session: IncidentMeetingSession) => void
  activeSessionId?: string | null
}

function formatDateTime(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function periodLabel(session: IncidentMeetingSession) {
  const from = String(session.incidentFilters.from || '').trim()
  const to = String(session.incidentFilters.to || '').trim()
  if (!from && !to) return 'Sense període'
  const fromLabel = formatDateString(from) ?? from
  const toLabel = formatDateString(to) ?? to
  return from && to ? `${fromLabel} - ${toLabel}` : fromLabel || toLabel
}

function notesPreview(value?: string | null) {
  const normalized = String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()

  if (!normalized) return ''
  return normalized.length > 280 ? `${normalized.slice(0, 280).trim()}...` : normalized
}

export default function MeetingMinutesHistoryDialog({
  open,
  onOpenChange,
  onPickSession,
  activeSessionId,
}: Props) {
  const [sessions, setSessions] = useState<IncidentMeetingSession[]>([])
  const [loading, setLoading] = useState(false)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/incidents/meeting-minutes?history=1&limit=80', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error carregant historial'))
      setSessions(Array.isArray(json.sessions) ? (json.sessions as IncidentMeetingSession[]) : [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadHistory()
  }, [open, loadHistory])

  const groups = useMemo(
    () => [
      {
        id: 'draft',
        label: 'Esborranys',
        items: sessions.filter((session) => session.status === 'draft'),
      },
      {
        id: 'finalized',
        label: 'Finalitzades',
        items: sessions.filter((session) => session.status === 'finalized'),
      },
    ],
    [sessions]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className={cn('flex items-center gap-2', typography('cardTitle'))}>
                <Clock3 className="h-5 w-5 text-slate-600" />
                Historial d'actes
              </DialogTitle>
              <DialogDescription className={typography('bodySm')}>
                Recupera esborranys, consulta actes anteriors i torna-les a obrir per imprimir o reenviar.
              </DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
              Actualitzar
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto pr-1">
          {loading && sessions.length === 0 ? (
            <p className={cn('py-8 text-center text-slate-500', typography('bodySm'))}>Carregant historial...</p>
          ) : sessions.length === 0 ? (
            <p className={cn('py-8 text-center text-slate-500', typography('bodySm'))}>Encara no hi ha actes desades.</p>
          ) : (
            <div className="space-y-5">
              {groups.map((group) =>
                group.items.length ? (
                  <section key={group.id} className="space-y-2">
                    <h3 className={cn(typography('label'), 'text-slate-700')}>{group.label}</h3>
                    <div className="space-y-2">
                      {group.items.map((session) => {
                        const isCurrent = activeSessionId && activeSessionId === session.id
                        const sent = Boolean(session.emailSentAt)
                        const preview = notesPreview(session.notes)
                        return (
                          <article
                            key={session.id}
                            className={cn(
                              'rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
                              isCurrent && 'border-slate-900 ring-1 ring-slate-900/10'
                            )}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                    {periodLabel(session)}
                                  </span>
                                  <span
                                    className={cn(
                                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                      session.status === 'draft'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                    )}
                                  >
                                    {session.status === 'draft' ? 'Esborrany' : 'Finalitzada'}
                                  </span>
                                  <span
                                    className={cn(
                                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                      sent ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
                                    )}
                                  >
                                    {sent ? 'Enviada' : 'Pendent d’enviar'}
                                  </span>
                                  {isCurrent ? (
                                    <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                                      Activa
                                    </span>
                                  ) : null}
                                </div>
                                <div className={cn('grid gap-1 text-slate-600 sm:grid-cols-2', typography('bodySm'))}>
                                  <p>Creada per: {session.createdByName || '-'}</p>
                                  <p>Actualitzada: {formatDateTime(session.updatedAt)}</p>
                                  <p>Finalitzada: {formatDateTime(session.finalizedAt)}</p>
                                  <p>Enviada: {formatDateTime(session.emailSentAt)}</p>
                                </div>
                                {preview ? (
                                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p
                                      className={cn(
                                        typography('bodyXs'),
                                        'mb-1 font-medium uppercase tracking-wide text-slate-500'
                                      )}
                                    >
                                      Anotacions
                                    </p>
                                    <p className={cn('whitespace-pre-wrap text-slate-700', typography('bodySm'))}>
                                      {preview}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    onPickSession(session)
                                    onOpenChange(false)
                                  }}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Obrir acta
                                </Button>
                                {sent ? (
                                  <span className={cn('inline-flex items-center text-slate-500', typography('bodyXs'))}>
                                    <Mail className="mr-1 h-3.5 w-3.5" />
                                    Reenviable des de l'acta
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ) : null
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
