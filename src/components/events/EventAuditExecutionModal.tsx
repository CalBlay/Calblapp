'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  Gift,
  Paperclip,
  RotateCcw,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIncidents } from '@/hooks/useIncidents'
import CreateIncidentModal from '@/components/incidents/CreateIncidentModal'
import { Switch } from '@/components/ui/switch'
import {
  afterMobileFilePicker,
  prepareAuditImageUpload,
} from '@/lib/media/prepareAuditImageUpload'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'
import { cn } from '@/lib/utils'
import ClientErrorBoundary from '@/components/ui/ClientErrorBoundary'
import EventExtrasModal from './EventExtrasModal'

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
    lnKey?: 'empresa' | 'casaments' | 'foodlovers' | 'agenda' | 'altres'
  }
  user: {
    department?: string
    role?: string
    name?: string
  }
}

type ExistingExecution = {
  status?: string
  incidentOutcome?: Outcome | ''
  incidentIds?: string[]
  extraOutcome?: Outcome | ''
  notes?: string | null
  auditAnswers?: Array<{
    itemId?: string
    blockId?: string | null
    type?: string
    value?: unknown
    photos?: Array<{ url?: string; path?: string; size?: number; type?: string }>
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

const MAX_AUDIT_PHOTOS_TOTAL = 10

type AuditExecutionPayload = {
  execution?: ExistingExecution | null
  visibleTemplate?: VisibleTemplate
}

type ExtrasPayload = {
  extras?: {
    id?: string
    entries?: Array<{ text?: string }>
    entriesCount?: number
  } | null
  required?: boolean
}

type AnswersSnapshot = Record<
  string,
  { blockId: string; type: string; value: unknown; photos: Array<{ url: string; path: string; size?: number; type?: string }> }
>

const nextChecklistValue = (current: unknown) => {
  if (current === true) return false
  if (current === false) return null
  return true
}

export default function EventAuditExecutionModal({ open, onClose, event, user }: Props) {
  const [hasIncidents, setHasIncidents] = useState(true)
  const [localIncidentIds, setLocalIncidentIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [visibleTemplate, setVisibleTemplate] = useState<VisibleTemplate>(null)
  const [showCreateIncident, setShowCreateIncident] = useState(false)
  const [incidentsRefresh, setIncidentsRefresh] = useState(0)
  const [hasExtras, setHasExtras] = useState(false)
  const [showExtrasModal, setShowExtrasModal] = useState(false)
  const [answers, setAnswers] = useState<
    Record<
      string,
      { blockId: string; type: string; value: unknown; photos: Array<{ url: string; path: string; size?: number; type?: string }> }
    >
  >({})
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [executionStatus, setExecutionStatus] = useState<'draft' | 'completed' | 'validated' | 'rejected'>('draft')
  const [portalReady, setPortalReady] = useState(false)

  const mountedRef = useRef(true)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const pendingPhotoTargetRef = useRef<{ itemId: string; blockId: string; source: 'camera' | 'gallery' } | null>(
    null
  )

  const userRole = String(user.role || '').trim().toLowerCase()
  const department =
    userRole === 'comercial'
      ? 'comercial'
      : resolveAuditDepartmentForUser(user.department || '') || ''
  const eventId = String(event.id || '')
  const eventDay = String(event.start || '').slice(0, 10)

  const executionUrl = useMemo(() => {
    if (!open || !eventId || !department) return null
    const qs = new URLSearchParams({ eventId, department })
    if (eventDay) qs.set('eventDay', eventDay)
    return `/api/auditoria/executions?${qs.toString()}`
  }, [open, eventId, department, eventDay])

  const { data, error: swrError, isLoading, mutate } = useSWR<AuditExecutionPayload>(executionUrl, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const { incidents } = useIncidents({
    eventId,
    refreshKey: incidentsRefresh,
    light: true,
    enabled: open && Boolean(eventId),
  })

  const isWeddingServicesAudit = department === 'serveis' && event.lnKey === 'casaments'

  const extrasUrl = useMemo(() => {
    if (!open || !eventId || !isWeddingServicesAudit) return null
    const qs = new URLSearchParams({ eventId })
    if (eventDay) qs.set('eventDay', eventDay)
    return `/api/events/extras?${qs.toString()}`
  }, [open, eventId, eventDay, isWeddingServicesAudit])

  const { data: extrasData, error: extrasError, mutate: mutateExtras } = useSWR<ExtrasPayload>(
    extrasUrl,
    {
      revalidateOnFocus: false,
      dedupingInterval: 15_000,
    }
  )

  const incidentIds = useMemo(() => {
    const ids = new Set<string>()
    incidents.forEach((incident) => {
      const id = String(incident.id || '').trim()
      if (id) ids.add(id)
    })
    localIncidentIds.forEach((id) => {
      const normalizedId = String(id || '').trim()
      if (normalizedId) ids.add(normalizedId)
    })
    return Array.from(ids)
  }, [incidents, localIncidentIds])
  const extrasCount = Array.isArray(extrasData?.extras?.entries)
    ? extrasData.extras.entries.filter((entry) => String(entry?.text || '').trim()).length
    : Number(extrasData?.extras?.entriesCount || 0)
  const canFinalize =
    (!hasIncidents || incidentIds.length > 0) && (!hasExtras || extrasCount > 0)
  const isLocked = executionStatus !== 'draft'
  const totalAuditPhotos = useMemo(
    () =>
      Object.values(answers).reduce(
        (sum, answer) => sum + (Array.isArray(answer.photos) ? answer.photos.length : 0),
        0
      ),
    [answers]
  )

  const loadingExecution = Boolean(executionUrl) && isLoading && data === undefined

  useEffect(() => {
    mountedRef.current = true
    setPortalReady(true)
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setLocalIncidentIds([])
      setShowCreateIncident(false)
      setShowExtrasModal(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSuccess('')
    if (!department) {
      setError(
        'El teu usuari no te un departament amb plantilla d’auditoria (comercial, serveis, cuina, logística o deco).'
      )
      return
    }
    if (!executionUrl) return

    if (loadingExecution) return

    if (swrError) {
      setError(swrError instanceof Error ? swrError.message : 'Error carregant dades')
      return
    }
    if (isWeddingServicesAudit && extrasError) {
      setError(extrasError instanceof Error ? extrasError.message : 'Error carregant extres')
      return
    }

    if (data === undefined) return

    setError('')
    const execution = (data.execution || null) as ExistingExecution | null
    const status = String(execution?.status || '').toLowerCase()
    if (status === 'completed' || status === 'validated' || status === 'rejected') setExecutionStatus(status)
    else setExecutionStatus('draft')
    setHasIncidents((execution?.incidentOutcome || 'reported') === 'reported')
    setLocalIncidentIds(
      Array.isArray(execution?.incidentIds)
        ? execution.incidentIds.map((id) => String(id || '').trim()).filter(Boolean)
        : []
    )
    setHasExtras(
      isWeddingServicesAudit
        ? (execution?.extraOutcome || 'reported') === 'reported'
        : false
    )
    setNotes(String(execution?.notes || ''))
    setVisibleTemplate((data.visibleTemplate || null) as VisibleTemplate)
    const existingAnswers = Array.isArray(execution?.auditAnswers) ? execution?.auditAnswers : []
    const mapped: Record<
      string,
      { blockId: string; type: string; value: unknown; photos: Array<{ url: string; path: string; size?: number; type?: string }> }
    > = {}
    existingAnswers.forEach((a) => {
      const itemId = String(a?.itemId || '').trim()
      if (!itemId) return
      mapped[itemId] = {
        blockId: String(a?.blockId || ''),
        type: String(a?.type || ''),
        value: a?.value ?? null,
        photos: Array.isArray(a?.photos)
          ? a.photos
              .map((p) => {
                const url = String(p?.url || '')
                const path = String(p?.path || '')
                const size = typeof p?.size === 'number' && p.size > 0 ? p.size : undefined
                const mime = String(p?.type || '').trim()
                return {
                  url,
                  path,
                  ...(size != null ? { size } : {}),
                  ...(mime ? { type: mime } : {}),
                }
              })
              .filter((p) => p.url)
          : [],
      }
    })
    setAnswers(mapped)
  }, [open, department, executionUrl, loadingExecution, swrError, extrasError, data, isWeddingServicesAudit])

  const buildAuditAnswersPayload = (snapshot: AnswersSnapshot) =>
    Object.entries(snapshot).map(([itemId, a]) => ({
      itemId,
      blockId: a.blockId || null,
      type: a.type || 'checklist',
      value: a.value ?? null,
      photos: a.photos || [],
    }))

  const persistExecution = async (
    mode: 'save' | 'finalize',
    opts?: { answersSnapshot?: AnswersSnapshot; quiet?: boolean; successMessage?: string }
  ) => {
    if (!opts?.quiet) {
      setError('')
      setSuccess('')
    }
    if (!department) {
      if (!opts?.quiet) setError('No s ha pogut identificar el departament del responsable.')
      return false
    }
    const outcome: Outcome = hasIncidents ? 'reported' : 'none'
    const extraOutcome: Outcome = hasExtras ? 'reported' : 'none'

    if (mode === 'finalize' && outcome === 'reported' && incidentIds.length === 0) {
      if (!opts?.quiet) setError('Has indicat incidencies, pero no n hi ha cap creada.')
      return false
    }
    if (mode === 'finalize' && extraOutcome === 'reported' && extrasCount === 0) {
      if (!opts?.quiet) setError('Has indicat extres, pero no n hi ha cap registrat.')
      return false
    }

    const auditAnswers = buildAuditAnswersPayload(opts?.answersSnapshot ?? answers)

    if (!opts?.quiet) setSaving(true)
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
          eventDay: eventDay || null,
          department,
          incidentOutcome: outcome,
          incidentIds: hasIncidents ? incidentIds : [],
          extraOutcome,
          notes,
          auditAnswers,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut guardar'))
      const newStatus = String(json?.status || (mode === 'save' ? 'draft' : 'completed')).toLowerCase()
      if (newStatus === 'completed' || newStatus === 'validated' || newStatus === 'rejected') setExecutionStatus(newStatus)
      else setExecutionStatus('draft')
      if (mountedRef.current) {
        setSuccess(
          opts?.successMessage ||
            (mode === 'save' ? 'Auditoria desada com esborrany.' : 'Auditoria finalitzada correctament.')
        )
      }
      void mutate()
      return true
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Error guardant tancament')
      }
      return false
    } finally {
      if (!opts?.quiet) setSaving(false)
    }
  }

  const submit = async (mode: 'save' | 'finalize') => {
    await persistExecution(mode)
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
          eventDay: eventDay || null,
          department,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut reobrir'))
      setExecutionStatus('draft')
      setSuccess('Auditoria reoberta. Ja pots modificar i tornar a finalitzar.')
      void mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reobrint auditoria')
    } finally {
      setSaving(false)
    }
  }

  const setAnswer = (
    itemId: string,
    patch: Partial<{
      blockId: string
      type: string
      value: unknown
      photos: Array<{ url: string; path: string; size?: number; type?: string }>
    }>
  ) => {
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

  const uploadPhotos = async (itemId: string, blockId: string, files: File[]) => {
    if (files.length === 0 || !mountedRef.current) return
    const remainingSlots = MAX_AUDIT_PHOTOS_TOTAL - totalAuditPhotos
    if (remainingSlots <= 0) {
      if (mountedRef.current) setError(`L'auditoria admet com a maxim ${MAX_AUDIT_PHOTOS_TOTAL} fotos.`)
      return
    }
    const selectedFiles = files.slice(0, remainingSlots)
    const selectionWasTrimmed = selectedFiles.length < files.length
    if (mountedRef.current) {
      setUploadingItemId(itemId)
      setError('')
    }
    try {
      const uploadedPhotos = await Promise.all(
        selectedFiles.map(async (file) => {
          const fileToUpload = await prepareAuditImageUpload(file)
          const form = new FormData()
          form.append('file', fileToUpload)
          form.append('eventId', eventId)
          form.append('department', department)
          form.append('itemId', itemId)
          const res = await fetch('/api/auditoria/upload-image', { method: 'POST', body: form })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut pujar una imatge'))
          const url = String(json?.url || '')
          const path = String(json?.path || '')
          if (!url) throw new Error('No s ha retornat URL de la imatge')

          const meta = json?.meta as { size?: number; type?: string } | undefined
          const size = typeof meta?.size === 'number' && meta.size > 0 ? meta.size : undefined
          const mime = String(meta?.type || '').trim()
          return {
            url,
            path,
            ...(size != null ? { size } : {}),
            ...(mime ? { type: mime } : {}),
          }
        })
      )

      if (!mountedRef.current) return

      let nextAnswers: AnswersSnapshot | undefined
      setAnswers((prev) => {
        const current = prev[itemId] || {
          blockId,
          type: 'photo',
          value: null,
          photos: [] as Array<{ url: string; path: string; size?: number; type?: string }>,
        }
        nextAnswers = {
          ...prev,
          [itemId]: {
            ...current,
            blockId,
            type: 'photo',
            photos: [...(current.photos || []), ...uploadedPhotos],
          },
        }
        return nextAnswers
      })

      if (!isLocked && nextAnswers) {
        await persistExecution('save', {
          answersSnapshot: nextAnswers,
          quiet: true,
          successMessage:
            uploadedPhotos.length === 1
              ? 'Foto guardada a l’auditoria.'
              : `${uploadedPhotos.length} fotos guardades a l’auditoria.`,
        })
      } else if (mountedRef.current) {
        setSuccess(
          uploadedPhotos.length === 1
            ? 'Foto pujada correctament.'
            : `${uploadedPhotos.length} fotos pujades correctament.`
        )
      }
      if (selectionWasTrimmed && mountedRef.current) {
        setError(`Només s'han afegit les primeres ${remainingSlots} fotos per respectar el límit total.`)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Error pujant imatge')
      }
    } finally {
      if (mountedRef.current) setUploadingItemId(null)
    }
  }

  const handlePickedFiles = (
    itemId: string,
    blockId: string,
    files: File[],
    source: 'camera' | 'gallery'
  ) => {
    if (files.length === 0) return
    afterMobileFilePicker(() => {
      void uploadPhotos(itemId, blockId, files)
    }, source)
  }

  const removePhoto = async (itemId: string, blockId: string, photoIndex: number) => {
    if (isLocked || !mountedRef.current) return
    setError('')

    let nextAnswers: AnswersSnapshot | undefined
    setAnswers((prev) => {
      const current = prev[itemId]
      if (!current || !Array.isArray(current.photos) || photoIndex < 0 || photoIndex >= current.photos.length) {
        return prev
      }
      const photos = current.photos.filter((_, index) => index !== photoIndex)
      nextAnswers = {
        ...prev,
        [itemId]: {
          ...current,
          blockId,
          type: 'photo',
          photos,
        },
      }
      return nextAnswers
    })

    if (!nextAnswers) return

    await persistExecution('save', {
      answersSnapshot: nextAnswers,
      quiet: true,
      successMessage: 'Foto eliminada.',
    })
  }

  const openPhotoPicker = (itemId: string, blockId: string, source: 'camera' | 'gallery') => {
    if (isLocked || uploadingItemId || totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL) return
    pendingPhotoTargetRef.current = { itemId, blockId, source }
    const input = source === 'camera' ? cameraInputRef.current : galleryInputRef.current
    input?.click()
  }

  const handlePickerInputChange = (source: 'camera' | 'gallery', event: React.ChangeEvent<HTMLInputElement>) => {
    const target = pendingPhotoTargetRef.current
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    pendingPhotoTargetRef.current = null
    if (!target || target.source !== source) return
    handlePickedFiles(target.itemId, target.blockId, files, source)
  }

  const childModalOpen = showCreateIncident || showExtrasModal
  const eventTitle = event.summary.replace(/#.*$/, '').trim()

  if (!open || !portalReady) return null

  const modalLayer = !childModalOpen ? (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
      <div
        className={cn(
          'relative flex h-[min(92dvh,100svh)] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl',
          'rounded-t-2xl sm:max-h-[min(92dvh,100svh)] sm:rounded-2xl'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-execution-title"
        onClick={(e) => e.stopPropagation()}
      >
        {uploadingItemId ? (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-white/90 px-6 text-center"
            aria-live="polite"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-700" />
            <p className="text-sm font-medium text-slate-800">Pujant i desant fitxers…</p>
            <p className="text-xs text-slate-500">No tanquis aquesta pantalla</p>
          </div>
        ) : null}

        <ClientErrorBoundary title="Error al tancament operatiu" onReset={() => void mutate()}>
              <div className="shrink-0 border-b border-gray-100 px-4 pb-2 pt-3 sm:pt-4">
                <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 text-left">
                    <h2 id="audit-execution-title" className="text-lg font-semibold leading-none">
                      Tancament operatiu
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Auditoria + incidencies - {eventTitle}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-9 w-9 rounded-full"
                    onClick={onClose}
                    aria-label="Tancar"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

          {loadingExecution ? (
            <p className="px-4 pb-4 text-sm text-gray-500">Carregant...</p>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] touch-pan-y px-4 pb-4">
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

              {isWeddingServicesAudit ? (
                <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Gift className="w-4 h-4 text-fuchsia-600" />
                    Extres
                    <span className="rounded-full bg-fuchsia-100 px-2 py-[3px] text-xs font-semibold text-fuchsia-800">
                      {extrasCount}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2">
                    <Switch
                      checked={hasExtras}
                      onCheckedChange={setHasExtras}
                      className={hasExtras ? 'bg-emerald-600' : 'bg-red-500'}
                      disabled={isLocked}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowExtrasModal(true)}
                      disabled={!hasExtras || isLocked}
                      className="h-11"
                    >
                      Registrar extres
                    </Button>
                  </div>
                </div>
              ) : null}

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
                                    <div className="mt-1 flex items-center gap-3">
                                      <button
                                        type="button"
                                        disabled={isLocked}
                                        onClick={() =>
                                          setAnswer(itemId, {
                                            blockId: String(block.id || ''),
                                            type: 'checklist',
                                            value: nextChecklistValue(current?.value),
                                          })
                                        }
                                        className={[
                                          'inline-flex h-10 w-10 items-center justify-center rounded-full border transition',
                                          current?.value === true
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                                            : current?.value === false
                                            ? 'border-red-300 bg-red-50 text-red-600'
                                            : 'border-slate-300 bg-white text-slate-400',
                                          isLocked ? 'cursor-default opacity-70' : 'hover:bg-slate-50',
                                        ].join(' ')}
                                        aria-label={`Checklist ${item.label || `Item ${itemIdx + 1}`}`}
                                        title={
                                          current?.value === true
                                            ? 'Correcte'
                                            : current?.value === false
                                            ? 'Incorrecte'
                                            : 'Sense marcar'
                                        }
                                      >
                                        {current?.value === true ? (
                                          <CheckCircle2 className="h-5 w-5" />
                                        ) : current?.value === false ? (
                                          <XCircle className="h-5 w-5" />
                                        ) : (
                                          <Circle className="h-5 w-5" />
                                        )}
                                      </button>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm text-slate-700">
                                          {item.label || `Item ${itemIdx + 1}`}
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          {current?.value === true
                                            ? 'Verd: correcte'
                                            : current?.value === false
                                            ? 'Vermell: incorrecte'
                                            : 'Blanc: sense marcar'}
                                        </div>
                                      </div>
                                    </div>
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
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                        <button
                                          type="button"
                                          className={cn(
                                            'flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium touch-manipulation',
                                            (isLocked ||
                                              Boolean(uploadingItemId) ||
                                              totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL) &&
                                              'pointer-events-none opacity-50'
                                          )}
                                          disabled={
                                            isLocked ||
                                            Boolean(uploadingItemId) ||
                                            totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL
                                          }
                                          onClick={() =>
                                            openPhotoPicker(itemId, String(block.id || ''), 'camera')
                                          }
                                        >
                                          <Camera className="w-4 h-4 shrink-0" />
                                          Fer foto
                                        </button>
                                        <button
                                          type="button"
                                          className={cn(
                                            'flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium touch-manipulation',
                                            (isLocked ||
                                              Boolean(uploadingItemId) ||
                                              totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL) &&
                                              'pointer-events-none opacity-50'
                                          )}
                                          disabled={
                                            isLocked ||
                                            Boolean(uploadingItemId) ||
                                            totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL
                                          }
                                          onClick={() =>
                                            openPhotoPicker(itemId, String(block.id || ''), 'gallery')
                                          }
                                        >
                                          <Paperclip className="w-4 h-4 shrink-0" />
                                          Afegir fitxers
                                        </button>
                                      </div>
                                      <div className="text-[11px] text-slate-600">
                                        Pots seleccionar diverses fotos alhora.{' '}
                                        Fotos: {current?.photos?.length || 0}
                                        {uploadingItemId === itemId ? ' - Pujant...' : ''}
                                        {!isLocked && totalAuditPhotos >= MAX_AUDIT_PHOTOS_TOTAL ? ' - Limit total assolit' : ''}
                                      </div>
                                      {Array.isArray(current?.photos) && current.photos.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                                          {current.photos.map((photo, pIdx) => (
                                            <div
                                              key={`${itemId}-photo-${pIdx}`}
                                              className="space-y-1.5 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-1"
                                            >
                                              <a
                                                href={photo.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block overflow-hidden rounded"
                                              >
                                                {/* eslint-disable-next-line @next/next/no-img-element -- URL dinàmica externa */}
                                                <img
                                                  src={photo.url}
                                                  alt={`Foto ${pIdx + 1}`}
                                                  className="aspect-[4/3] h-16 w-full object-cover sm:h-20"
                                                  loading="lazy"
                                                />
                                              </a>
                                              {!isLocked ? (
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  size="sm"
                                                  className="h-8 w-full text-xs"
                                                  disabled={Boolean(uploadingItemId) || saving}
                                                  onClick={() =>
                                                    void removePhoto(itemId, String(block.id || ''), pIdx)
                                                  }
                                                >
                                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                  Eliminar
                                                </Button>
                                              ) : null}
                                            </div>
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
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            </>
          )}
            </ClientErrorBoundary>
          </div>
        </div>
  ) : null

  return (
    <>
      {modalLayer ? createPortal(modalLayer, document.body) : null}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handlePickerInputChange('camera', e)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handlePickerInputChange('gallery', e)}
      />

      <CreateIncidentModal
        open={showCreateIncident}
        event={event}
        onClose={() => setShowCreateIncident(false)}
        onCreated={(incidentId) => {
          setShowCreateIncident(false)
          setHasIncidents(true)
          if (incidentId) {
            setLocalIncidentIds((current) =>
              current.includes(incidentId) ? current : [...current, incidentId]
            )
          }
          setIncidentsRefresh((n) => n + 1)
        }}
      />
      <EventExtrasModal
        open={showExtrasModal}
        onClose={() => setShowExtrasModal(false)}
        event={event}
        onSaved={() => {
          void mutateExtras()
          setSuccess('Extres actualitzats correctament.')
        }}
      />
    </>
  )
}
