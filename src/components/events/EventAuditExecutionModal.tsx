'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Paperclip, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useIncidents } from '@/hooks/useIncidents'
import CreateIncidentModal from '@/components/incidents/CreateIncidentModal'
import { Switch } from '@/components/ui/switch'

type Outcome = 'none' | 'reported'

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
  user: {
    department?: string
    name?: string
  }
}

type ExistingExecution = {
  status?: string
  incidentOutcome?: Outcome | ''
  incidentIds?: string[]
  notes?: string | null
  auditAnswers?: Array<{
    itemId?: string
    blockId?: string | null
    type?: string
    value?: any
    photos?: Array<{ url?: string; path?: string }>
  }>
}

type VisibleTemplate = {
  id: string
  name: string
  blocks: Array<{
    id?: string
    title?: string
    weight?: number
    items?: Array<{ id?: string; label?: string; type?: string }>
  }>
} | null

function normalizeDepartment(raw?: string): string {
  const value = (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'sala') return 'serveis'
  if (value === 'decoracio' || value === 'decoracions') return 'deco'
  return value
}

const MAX_AUDIT_IMAGE_SIZE = 1024 * 1024
const MAX_AUDIT_PHOTOS_TOTAL = 10

async function compressImage(file: File, maxSizeBytes = MAX_AUDIT_IMAGE_SIZE) {
  const img = new Image()
  const tempUrl = URL.createObjectURL(file)
  img.src = tempUrl

  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })

  let maxDim = 1600
  let { width, height } = img

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No s ha pogut preparar la imatge')

  let quality = 0.86
  let blob: Blob | null = null

  while (true) {
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= maxSizeBytes) break
    if (quality > 0.38) {
      quality -= 0.08
      continue
    }
    if (maxDim <= 900) break
    maxDim = Math.max(900, Math.round(maxDim * 0.82))
    quality = 0.74
  }

  URL.revokeObjectURL(tempUrl)
  if (!blob) throw new Error('No s ha pogut comprimir la imatge')

  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'audit-photo'}.jpg`, {
    type: 'image/jpeg',
  })
}

export default function EventAuditExecutionModal({ open, onClose, event, user }: Props) {
  const [hasIncidents, setHasIncidents] = useState(true)
  const [notes, setNotes] = useState('')
  const [loadingExecution, setLoadingExecution] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [visibleTemplate, setVisibleTemplate] = useState<VisibleTemplate>(null)
  const [showCreateIncident, setShowCreateIncident] = useState(false)
  const [incidentsRefresh, setIncidentsRefresh] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { blockId: string; type: string; value: any; photos: Array<{ url: string; path: string }> }>>({})
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [executionStatus, setExecutionStatus] = useState<'draft' | 'completed' | 'validated' | 'rejected'>('draft')

  const department = normalizeDepartment(user.department || '')
  const eventId = String(event.id || '')

  const { incidents, loading: incidentsLoading } = useIncidents({
    eventId,
    refreshKey: incidentsRefresh,
  })

  const incidentIds = useMemo(() => incidents.map((i) => i.id).filter(Boolean), [incidents])
  const canFinalize = !hasIncidents || (hasIncidents && incidentIds.length > 0)
  const isLocked = executionStatus !== 'draft'
  const totalAuditPhotos = useMemo(
    () =>
      Object.values(answers).reduce(
        (sum, answer) => sum + (Array.isArray(answer.photos) ? answer.photos.length : 0),
        0
      ),
    [answers]
  )

  useEffect(() => {
    if (!open || !eventId || !department) return
    let cancelled = false
    const run = async () => {
      setLoadingExecution(true)
      setError('')
      setSuccess('')
      try {
        const qs = new URLSearchParams({ eventId, department })
        const res = await fetch(`/api/auditoria/executions?${qs.toString()}`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar el tancament'))
        if (cancelled) return
        const execution = (json.execution || null) as ExistingExecution | null
        const status = String(execution?.status || '').toLowerCase()
        if (status === 'completed' || status === 'validated' || status === 'rejected') setExecutionStatus(status)
        else setExecutionStatus('draft')
        setHasIncidents((execution?.incidentOutcome || 'reported') === 'reported')
        setNotes(String(execution?.notes || ''))
        setVisibleTemplate((json.visibleTemplate || null) as VisibleTemplate)
        const existingAnswers = Array.isArray(execution?.auditAnswers) ? execution?.auditAnswers : []
        const mapped: Record<string, { blockId: string; type: string; value: any; photos: Array<{ url: string; path: string }> }> = {}
        existingAnswers.forEach((a) => {
          const itemId = String(a?.itemId || '').trim()
          if (!itemId) return
          mapped[itemId] = {
            blockId: String(a?.blockId || ''),
            type: String(a?.type || ''),
            value: a?.value ?? null,
            photos: Array.isArray(a?.photos)
              ? a.photos
                  .map((p) => ({ url: String(p?.url || ''), path: String(p?.path || '') }))
                  .filter((p) => p.url)
              : [],
          }
        })
        setAnswers(mapped)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error carregant dades')
      } finally {
        if (!cancelled) setLoadingExecution(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, eventId, department])

  const submit = async (mode: 'save' | 'finalize') => {
    setError('')
    setSuccess('')
    if (!department) {
      setError('No s ha pogut identificar el departament del responsable.')
      return
    }
    const outcome: Outcome = hasIncidents ? 'reported' : 'none'

    if (mode === 'finalize' && outcome === 'reported' && incidentIds.length === 0) {
      setError('Has indicat incidencies, pero no n hi ha cap creada.')
      return
    }

    const auditAnswers = Object.entries(answers).map(([itemId, a]) => ({
      itemId,
      blockId: a.blockId || null,
      type: a.type || 'checklist',
      value: a.value ?? null,
      photos: a.photos || [],
    }))

    setSaving(true)
    try {
      const res = await fetch('/api/auditoria/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          eventId,
          eventSummary: String(event.summary || '').replace(/#.*$/, '').trim(),
          eventCode: String(event.eventCode || '').trim() || null,
          eventLocation: String(event.location || '').trim() || null,
          eventDay: String(event.start || '').slice(0, 10) || null,
          department,
          incidentOutcome: outcome,
          incidentIds: hasIncidents ? incidentIds : [],
          notes,
          auditAnswers,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut guardar'))
      const newStatus = String(json?.status || (mode === 'save' ? 'draft' : 'completed')).toLowerCase()
      if (newStatus === 'completed' || newStatus === 'validated' || newStatus === 'rejected') setExecutionStatus(newStatus)
      else setExecutionStatus('draft')
      setSuccess(mode === 'save' ? 'Auditoria desada com esborrany.' : 'Auditoria finalitzada correctament.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardant tancament')
    } finally {
      setSaving(false)
    }
  }

  const reopen = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res = await fetch('/api/auditoria/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reopen',
          eventId,
          department,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut reobrir'))
      setExecutionStatus('draft')
      setSuccess('Auditoria reoberta. Ja pots modificar i tornar a finalitzar.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reobrint auditoria')
    } finally {
      setSaving(false)
    }
  }

  const setAnswer = (itemId: string, patch: Partial<{ blockId: string; type: string; value: any; photos: Array<{ url: string; path: string }> }>) => {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: {
        blockId: prev[itemId]?.blockId || '',
        type: prev[itemId]?.type || 'checklist',
        value: prev[itemId]?.value ?? null,
        photos: prev[itemId]?.photos || [],
        ...patch,
      },
    }))
  }

  const uploadPhoto = async (itemId: string, blockId: string, file: File | null) => {
    if (!file) return
    if (totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL) {
      setError(`L'auditoria admet com a maxim ${MAX_AUDIT_PHOTOS_TOTAL} fotos.`)
      return
    }
    setUploadingItemId(itemId)
    setError('')
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Nomes es permeten imatges')
      }
      const optimizedFile = await compressImage(file)
      if (optimizedFile.size > MAX_AUDIT_IMAGE_SIZE) {
        throw new Error('La imatge encara pesa massa despres de comprimir-se')
      }

      const form = new FormData()
      form.append('file', optimizedFile)
      form.append('eventId', eventId)
      form.append('department', department)
      form.append('itemId', itemId)
      const res = await fetch('/api/auditoria/upload-image', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut pujar la imatge'))
      const url = String(json?.url || '')
      const path = String(json?.path || '')
      if (!url) throw new Error('No s ha retornat URL de la imatge')

      setAnswers((prev) => {
        const current = prev[itemId] || { blockId, type: 'photo', value: null, photos: [] as Array<{ url: string; path: string }> }
        return {
          ...prev,
          [itemId]: {
            ...current,
            blockId,
            type: 'photo',
            photos: [...(current.photos || []), { url, path }],
          },
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error pujant imatge')
    } finally {
      setUploadingItemId(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="w-[96vw] max-w-lg rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Tancament operatiu</DialogTitle>
            <DialogDescription>
              Auditoria + incidencies - {event.summary.replace(/#.*$/, '').trim()}
            </DialogDescription>
          </DialogHeader>

          {loadingExecution ? (
            <p className="px-4 pb-4 text-sm text-gray-500">Carregant...</p>
          ) : (
            <div className="px-4 pb-2 max-h-[80vh] overflow-y-auto space-y-4">
              <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  Incidencies
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2">
                  <Switch
                    checked={hasIncidents}
                    onCheckedChange={setHasIncidents}
                    className={hasIncidents ? 'bg-emerald-600' : 'bg-red-500'}
                    disabled={isLocked}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateIncident(true)}
                    disabled={!hasIncidents || isLocked}
                    className="h-11"
                  >
                    Crear incidencia
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-cyan-700" />
                  Auditoria
                  <span className="rounded-full bg-cyan-100 px-2 py-[3px] text-xs font-semibold text-cyan-800">
                    Fotos {totalAuditPhotos}/{MAX_AUDIT_PHOTOS_TOTAL}
                  </span>
                  <span
                    className={[
                      'ml-auto rounded-full px-2 py-[3px] text-xs font-semibold',
                      isLocked ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700',
                    ].join(' ')}
                  >
                    {isLocked ? 'Finalitzada' : 'Esborrany'}
                  </span>
                </div>
                {visibleTemplate ? (
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-2">
                    <div className="mt-2 space-y-2">
                      {(visibleTemplate.blocks || []).map((block, idx) => (
                        <div key={String(block.id || idx)} className="rounded-md border border-cyan-100 bg-white p-2">
                          <div className="text-sm font-medium text-slate-800">
                            {block.title || `Bloc ${idx + 1}`}
                          </div>
                          <div className="mt-2 space-y-2">
                            {(block.items || []).map((item, itemIdx) => {
                              const itemId = String(item.id || `${idx}-${itemIdx}`)
                              const type = String(item.type || 'checklist')
                              const current = answers[itemId]
                              return (
                                <div key={itemId} className="rounded border border-slate-200 p-2 text-xs">
                                  {type !== 'checklist' ? (
                                    <div className="font-medium text-slate-800">
                                      {item.label || `Item ${itemIdx + 1}`}
                                    </div>
                                  ) : null}
                                  {type === 'checklist' && (
                                    <label className="mt-1 inline-flex min-h-10 items-center gap-2 text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(current?.value)}
                                        disabled={isLocked}
                                        onChange={(e) =>
                                          setAnswer(itemId, {
                                            blockId: String(block.id || ''),
                                            type: 'checklist',
                                            value: e.target.checked,
                                          })
                                        }
                                      />
                                      <span>{item.label || `Item ${itemIdx + 1}`}</span>
                                    </label>
                                  )}
                                  {type === 'rating' && (
                                    <select
                                      className="mt-1 h-10 w-full rounded border border-gray-300 px-2 text-sm"
                                      value={String(current?.value ?? '')}
                                      disabled={isLocked}
                                      onChange={(e) =>
                                        setAnswer(itemId, {
                                          blockId: String(block.id || ''),
                                          type: 'rating',
                                          value: Number(e.target.value || 0),
                                        })
                                      }
                                    >
                                      <option value="">Valora 1-10</option>
                                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  {type === 'photo' && (
                                    <div className="mt-1 space-y-1">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <label className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-slate-300 px-2 py-1 cursor-pointer text-sm">
                                          <Camera className="w-3.5 h-3.5" />
                                          Fer foto
                                          <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            disabled={isLocked || totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL}
                                            onChange={(e) => {
                                              void uploadPhoto(
                                                itemId,
                                                String(block.id || ''),
                                                e.currentTarget.files?.[0] || null
                                              )
                                              e.currentTarget.value = ''
                                            }}
                                          />
                                        </label>
                                        <label className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-slate-300 px-2 py-1 cursor-pointer text-sm">
                                          <Paperclip className="w-3.5 h-3.5" />
                                          Afegir fitxer
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            disabled={isLocked || totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL}
                                            onChange={(e) => {
                                              void uploadPhoto(
                                                itemId,
                                                String(block.id || ''),
                                                e.currentTarget.files?.[0] || null
                                              )
                                              e.currentTarget.value = ''
                                            }}
                                          />
                                        </label>
                                      </div>
                                      <div className="text-[11px] text-slate-600">
                                        Fotos: {current?.photos?.length || 0}
                                        {uploadingItemId === itemId ? ' - Pujant...' : ''}
                                        {!isLocked && totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL ? ' - Limit total assolit' : ''}
                                      </div>
                                      {Array.isArray(current?.photos) && current.photos.length > 0 ? (
                                        <div className="grid grid-cols-3 gap-2 pt-1">
                                          {current.photos.map((photo, pIdx) => (
                                            <a
                                              key={`${itemId}-photo-${pIdx}`}
                                              href={photo.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="block overflow-hidden rounded-md border border-slate-200"
                                            >
                                              <img
                                                src={photo.url}
                                                alt={`Foto ${pIdx + 1}`}
                                                className="h-16 w-full object-cover"
                                              />
                                            </a>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                    No hi ha cap plantilla visible pel teu departament.
                  </div>
                )}
                <textarea
                  className="w-full rounded-md border border-gray-300 p-2 text-sm"
                  rows={3}
                  placeholder="Notes finals (opcional)"
                  value={notes}
                  disabled={isLocked}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && (
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {success}
                </p>
              )}

              <div className="sticky bottom-0 bg-white pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
                {!isLocked ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => submit('save')}
                      disabled={saving}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? 'Desant...' : 'Desar'}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      className="h-11"
                      onClick={() => submit('finalize')}
                      disabled={saving || !canFinalize}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {saving ? 'Finalitzant...' : 'Finalitzar'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    onClick={reopen}
                    disabled={saving}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {saving ? 'Reobrint...' : 'Reobrir'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateIncidentModal
        open={showCreateIncident}
        event={event}
        onClose={() => setShowCreateIncident(false)}
        onCreated={() => {
          setShowCreateIncident(false)
          setHasIncidents(true)
          setIncidentsRefresh((n) => n + 1)
        }}
      />
    </>
  )
}
