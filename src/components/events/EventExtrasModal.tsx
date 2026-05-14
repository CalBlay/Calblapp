'use client'

import React, { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

type ExtrasResponse = {
  extras?: {
    id?: string
    entries?: Array<{ text?: string }>
    entriesCount?: number
  } | null
}

interface Props {
  open: boolean
  onClose: () => void
  event: {
    id: string
    summary: string
    start: string
    eventCode?: string
    location?: string
  }
  onSaved?: () => void
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(String(json?.error || 'Error carregant extres'))
  return json as ExtrasResponse
}

export default function EventExtrasModal({ open, onClose, event, onSaved }: Props) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const eventId = String(event.id || '')
  const eventDay = String(event.start || '').slice(0, 10)
  const url = useMemo(() => {
    if (!open || !eventId) return null
    const qs = new URLSearchParams({ eventId })
    if (eventDay) qs.set('eventDay', eventDay)
    return `/api/events/extras?${qs.toString()}`
  }, [open, eventId, eventDay])

  const { data, error: swrError, isLoading, mutate } = useSWR<ExtrasResponse>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  })

  useEffect(() => {
    if (!open) {
      setError('')
      setSuccess('')
      return
    }
    if (swrError) {
      setError(swrError instanceof Error ? swrError.message : 'Error carregant extres')
      return
    }
    const entries = Array.isArray(data?.extras?.entries)
      ? data?.extras?.entries
          .map((entry) => String(entry?.text || '').trim())
          .filter(Boolean)
      : []
    setValue(entries.join('\n'))
  }, [open, data, swrError])

  const entriesCount = Array.isArray(data?.extras?.entries)
    ? data?.extras?.entries.filter((entry) => String(entry?.text || '').trim()).length
    : 0

  const save = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res = await fetch('/api/events/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          eventDay,
          eventSummary: event.summary,
          eventCode: event.eventCode || null,
          eventLocation: event.location || null,
          entries: value,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s han pogut guardar els extres'))
      setSuccess('Extres registrats correctament.')
      await mutate()
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardant extres')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[96vw] max-w-lg rounded-2xl p-0 overflow-hidden" lockDismissOnOutside>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Registrar extres</DialogTitle>
          <DialogDescription>
            Escriu un extra per línia. Aquest registre avisarà el comercial intern de l&apos;esdeveniment.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {isLoading ? <p className="text-sm text-slate-500">Carregant extres...</p> : null}

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800">Extres registrats</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {entriesCount}
              </span>
            </div>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={8}
              placeholder={'Ex.: Barra extra\nEx.: Hora extra de personal\nEx.: Decoracio addicional'}
              disabled={saving}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Tanca
            </Button>
            <Button type="button" variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Guardant...' : 'Guardar extres'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
