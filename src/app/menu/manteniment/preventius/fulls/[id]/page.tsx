'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths } from 'date-fns'
import { useParams, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { useSession } from 'next-auth/react'
import { RoleGuard } from '@/lib/withRoleGuard'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import ExportMenu from '@/components/export/ExportMenu'
import { normalizeRole } from '@/lib/roles'

type TemplateSection = { location: string; items: { label: string }[] }
type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  sections: TemplateSection[]
}

type MaintenanceStatus = 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat'

type Draft = {
  id: string
  title: string
  startTime: string
  endTime: string
  status: MaintenanceStatus
  notes: string
  templateId: string | null
  worker: string
}

type CompletedRecord = {
  id: string
  plannedId?: string | null
  templateId?: string | null
  title: string
  worker?: string | null
  startTime: string
  endTime: string
  status: MaintenanceStatus
  notes: string
  completedAt: string
  nextDue: string | null
  checklist?: Record<string, boolean>
  statusHistory?: Array<{
    status: MaintenanceStatus
    at: number
    byName?: string
    startTime?: string | null
    endTime?: string | null
    note?: string | null
  }>
}

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  validat: 'Validat',
}

const STATUS_BADGES: Record<MaintenanceStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-blue-100 text-blue-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  validat: 'bg-purple-100 text-purple-800',
}

const normalizePreventiuStatus = (value?: string | null): MaintenanceStatus => {
  const raw = String(value || 'assignat').trim().toLowerCase()
  if (raw === 'nou') return 'nou'
  if (raw === 'assignat' || raw === 'pendent') return 'assignat'
  if (raw === 'en curs' || raw === 'en_curs') return 'en_curs'
  if (raw === 'espera') return 'espera'
  if (raw === 'fet') return 'fet'
  if (raw === 'no fet' || raw === 'no_fet') return 'no_fet'
  if (raw === 'resolut' || raw === 'validat') return 'validat'
  return 'assignat'
}

const isCompletionOnlyStatus = (status: MaintenanceStatus) =>
  status === 'fet' || status === 'no_fet' || status === 'validat'

export default function PreventiusFullsFitxaPage() {
  const { data: session } = useSession()
  const params = useParams()
  const plannedId = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string)
  const searchParams = useSearchParams()
  const recordId = searchParams?.get('recordId') || null

  const [templates, setTemplates] = useState<Template[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadingDraft, setLoadingDraft] = useState(true)
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({})
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [lastRecord, setLastRecord] = useState<CompletedRecord | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [activeRecordId, setActiveRecordId] = useState<string | null>(recordId)
  const role = normalizeRole((session?.user as any)?.role || '')
  const department = ((session?.user as any)?.department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const canValidate = role === 'admin' || (role === 'cap' && isMaintenanceCapDepartment(department))
  const isValidated = lastRecord?.status === 'validat'
  const currentStatus = draft?.status || 'assignat'
  const isChecklistReadOnly = isValidated

  const allowedNextStatuses = useMemo(() => {
    if (!draft) return [] as MaintenanceStatus[]
    if (draft.status === 'nou') return ['assignat'] as MaintenanceStatus[]
    if (draft.status === 'assignat') return ['en_curs', 'espera'] as MaintenanceStatus[]
    if (draft.status === 'en_curs') return ['espera', 'fet', 'no_fet'] as MaintenanceStatus[]
    if (draft.status === 'espera') return ['en_curs', 'fet', 'no_fet'] as MaintenanceStatus[]
    if (draft.status === 'fet' && canValidate) return ['validat'] as MaintenanceStatus[]
    return [] as MaintenanceStatus[]
  }, [canValidate, draft])

  const applyRecordToDraft = (record: any) => {
    if (!record) return
    const normalizedStatus = normalizePreventiuStatus(record.status)
    const history = Array.isArray(record.statusHistory)
      ? record.statusHistory.map((item: any) => ({
          ...item,
          status: normalizePreventiuStatus(item?.status),
        }))
      : []
    setLastRecord({ ...record, status: normalizedStatus, statusHistory: history })
    if (record.checklist) setChecklistState(record.checklist)
    setDraft({
      id: String(record.plannedId || plannedId),
      title: String(record.title || 'Preventiu'),
      startTime: String(record.startTime || ''),
      endTime: String(record.endTime || ''),
      status: normalizedStatus,
      notes: String(record.notes || ''),
      templateId: record.templateId || null,
      worker: String(record.worker || ''),
    })
    if (record.id) setActiveRecordId(String(record.id))
  }

  useEffect(() => {
    const cacheKey = 'maintenance.templates.cache'
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.templates)) setTemplates(parsed.templates)
      }
    } catch {
      // ignore
    }

    const load = async () => {
      try {
        const res = await fetch('/api/maintenance/templates', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const list = Array.isArray(json?.templates) ? json.templates : []
        setTemplates(list)
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ templates: list, at: Date.now() }))
        } catch {
          return
        }
      } catch {
        return
      }
    }
    load()
  }, [])

  useEffect(() => {
    const loadFromPlanned = async () => {
      try {
        const res = await fetch(
          `/api/maintenance/preventius/planned/${encodeURIComponent(plannedId)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) {
          setDraft(null)
          return
        }
        const json = await res.json()
        const item = json?.item
        if (!item) {
          setDraft(null)
          return
        }

        const linkedRecordId = String(item.lastRecordId || '').trim()
        if (linkedRecordId) {
          try {
            const recRes = await fetch(
              `/api/maintenance/preventius/completed/${encodeURIComponent(linkedRecordId)}`,
              { cache: 'no-store' }
            )
            if (recRes.ok) {
              const recJson = await recRes.json()
              if (recJson?.record) {
                applyRecordToDraft(recJson.record)
                return
              }
            }
          } catch {
            // fallback to latest record
          }
        }

        // fallback: load latest completed record for this planned item
        try {
          const latestRes = await fetch(
            `/api/maintenance/preventius/completed?plannedId=${encodeURIComponent(item.id || plannedId)}`,
            { cache: 'no-store' }
          )
          if (latestRes.ok) {
            const latestJson = await latestRes.json()
            const list = Array.isArray(latestJson?.records) ? latestJson.records : []
            if (list[0]) {
              applyRecordToDraft(list[0])
              return
            }
          }
        } catch {
          // ignore
        }

        const workerNames = Array.isArray(item.workerNames) ? item.workerNames.map(String) : []
        setDraft({
          id: String(item.id || plannedId),
          title: String(item.title || ''),
          startTime: String(item.startTime || ''),
          endTime: String(item.endTime || ''),
          status: workerNames.length ? 'assignat' : 'nou',
          notes: '',
          templateId: item.templateId || null,
          worker: workerNames.length ? workerNames.join(', ') : '',
        })
      } catch {
        setDraft(null)
      } finally {
        setLoadingDraft(false)
      }
    }

    if (recordId) return
    loadFromPlanned()
  }, [plannedId, recordId])

  useEffect(() => {
    if (!recordId) return
    const loadRecord = async () => {
      try {
        const res = await fetch(
          `/api/maintenance/preventius/completed/${encodeURIComponent(recordId)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) return
        const json = await res.json()
        const record = json?.record || null
        if (!record) return
        applyRecordToDraft(record)
      } finally {
        setLoadingDraft(false)
      }
    }
    loadRecord()
  }, [recordId, plannedId])

  const selectedTemplate = useMemo(() => {
    if (!draft?.templateId) return null
    return templates.find((t) => t.id === draft.templateId) || null
  }, [draft?.templateId, templates])

  const checklistRows = useMemo(() => {
    if (!selectedTemplate) return []
    return selectedTemplate.sections.flatMap((sec) =>
      sec.items.map((it, idx) => {
        const entryKey = `${sec.location}::${it.label}`
        return {
          Grup: sec.location,
          Camp: it.label,
          Fet: checklistState[entryKey] ? 'Si' : 'No',
          Ordre: idx + 1,
        }
      })
    )
  }, [selectedTemplate, checklistState])

  useEffect(() => {
    if (!selectedTemplate) return
    if (Object.keys(checklistState).length > 0) return
    const nextState: Record<string, boolean> = {}
    const nextOpen: Record<string, boolean> = {}
    selectedTemplate.sections.forEach((sec) => {
      sec.items.forEach((it) => {
        nextState[`${sec.location}::${it.label}`] = false
      })
      nextOpen[sec.location] = false
    })
    setChecklistState(nextState)
    setOpenSections(nextOpen)
  }, [selectedTemplate, checklistState])

  const computeNextDue = (date: Date, periodicity?: Template['periodicity']) => {
    if (!periodicity) return null
    if (periodicity === 'monthly') return addMonths(date, 1)
    if (periodicity === 'quarterly') return addMonths(date, 3)
    if (periodicity === 'yearly') return addMonths(date, 12)
    if (periodicity === 'weekly') return addDays(date, 7)
    if (periodicity === 'daily') return addDays(date, 1)
    return null
  }

  const saveCompletion = async () => {
    if (!draft) return
    if (isValidated) {
      alert('Aquest preventiu ja esta validat i no es pot editar.')
      return
    }
    if (isCompletionOnlyStatus(draft.status)) {
      if (!draft.endTime) {
        alert('Omple hora fi.')
        return
      }
    } else if (draft.status !== 'nou' && !draft.startTime) {
      alert('Omple hora inici.')
      return
    }
    setSaveStatus('saving')
    const now = new Date()
    const nextDue = computeNextDue(now, selectedTemplate?.periodicity)
    const record = {
      plannedId: draft.id || null,
      templateId: draft.templateId || null,
      title: draft.title,
      worker: draft.worker || null,
      startTime: draft.startTime,
      endTime: draft.endTime,
      status: draft.status,
      notes: draft.notes,
      completedAt: now.toISOString(),
      nextDue: nextDue ? nextDue.toISOString() : null,
      checklist: checklistState,
    }
    try {
      const res = await fetch('/api/maintenance/preventius/completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(activeRecordId ? { id: activeRecordId } : {}),
          ...record,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'save_failed')
      const docId = json?.id ? String(json.id) : `comp_${Date.now()}`
      const nextHistory = Array.isArray(lastRecord?.statusHistory)
        ? [
            ...(lastRecord?.statusHistory || []),
            {
              status: draft.status,
              at: Date.now(),
              byName: String((session?.user as any)?.name || ''),
              startTime: isCompletionOnlyStatus(draft.status) ? null : draft.startTime || null,
              endTime: isCompletionOnlyStatus(draft.status) ? draft.endTime || null : null,
              note: draft.notes || '',
            },
          ]
        : [
            {
              status: draft.status,
              at: Date.now(),
              byName: String((session?.user as any)?.name || ''),
              startTime: isCompletionOnlyStatus(draft.status) ? null : draft.startTime || null,
              endTime: isCompletionOnlyStatus(draft.status) ? draft.endTime || null : null,
              note: draft.notes || '',
            },
          ]
      setLastRecord({ ...(record as any), id: docId, statusHistory: nextHistory })
      setActiveRecordId(docId)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const handleReopen = async () => {
    if (!lastRecord?.id || !canValidate) return
    try {
      const res = await fetch(`/api/maintenance/preventius/completed/${encodeURIComponent(lastRecord.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fet' }),
      })
      if (!res.ok) throw new Error('reopen_failed')
      setLastRecord((prev) => (prev ? { ...prev, status: 'fet' } : prev))
      setDraft((prev) => (prev ? { ...prev, status: 'fet' } : prev))
    } catch {
      alert("No s'ha pogut reobrir el preventiu.")
    }
  }

  const exportBase = `fitxa-${(draft?.title || 'preventiu')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preventiu'}`
  const exportTitle = draft?.title || 'Preventiu'
  const exportStatus = draft?.status || ''
  const exportStartTime = draft?.startTime || ''
  const exportEndTime = draft?.endTime || ''
  const exportWorker = draft?.worker || ''
  const exportNotes = draft?.notes || ''

  const handleExportExcel = () => {
    const metadata = [
      {
        Titol: exportTitle,
        Estat: exportStatus,
        HoraInici: exportStartTime,
        HoraFi: exportEndTime,
        Operari: exportWorker,
        Observacions: exportNotes,
      },
    ]
    const wb = XLSX.utils.book_new()
    const wsMeta = XLSX.utils.json_to_sheet(metadata)
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Fitxa')
    const wsChecklist = XLSX.utils.json_to_sheet(checklistRows)
    XLSX.utils.book_append_sheet(wb, wsChecklist, 'Checklist')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const rows = checklistRows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.Grup)}</td><td>${escapeHtml(row.Camp)}</td><td>${escapeHtml(
            row.Fet
          )}</td></tr>`
      )
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
      .block { margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(exportTitle)}</h1>
    <div class="meta block">
      Estat: ${escapeHtml(exportStatus)} · Hora: ${escapeHtml(exportStartTime)}-${escapeHtml(
      exportEndTime
    )} · Operari: ${escapeHtml(exportWorker)}
    </div>
    <div class="meta block">Observacions: ${escapeHtml(exportNotes)}</div>
    <table>
      <thead><tr><th>Grup</th><th>Camp</th><th>Fet</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    const html = buildPdfTableHtml()
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const handleExportPdfView = () => {
    window.print()
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel },
    { label: 'PDF (vista)', onClick: handleExportPdfView },
    { label: 'PDF (taula)', onClick: handleExportPdfTable },
  ]

  if (loadingDraft) {
    return (
      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <div className="p-6 text-sm text-gray-600">Carregant fitxa...</div>
      </RoleGuard>
    )
  }

  if (!draft) {
    return (
      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <div className="p-6 text-sm text-gray-600">Fitxa no trobada.</div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="min-h-screen w-full bg-white flex flex-col">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #manteniment-fitxa-print-root, #manteniment-fitxa-print-root * { visibility: visible; }
            #manteniment-fitxa-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
        <div className="w-full max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-gray-900">{draft.title}</div>
            <div className="flex items-center gap-2">
              <ExportMenu items={exportItems} />
              <button
                type="button"
                className="rounded-full border px-4 py-2 text-xs text-gray-700"
                onClick={() => window.close()}
              >
                Tancar pestanya
              </button>
            </div>
          </div>
        </div>

        <div id="manteniment-fitxa-print-root" className="border-y">
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 gap-0 md:grid-cols-2">
            <div className="px-4 py-6 md:px-6 md:py-8 border-r">
              <div className="space-y-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Hora inici</span>
                  <input
                    type="time"
                    className="h-10 rounded-xl border px-3"
                    value={draft.startTime}
                    disabled={isValidated}
                    onChange={(e) => setDraft((d) => (d ? { ...d, startTime: e.target.value } : d))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Hora fi</span>
                  <input
                    type="time"
                    className="h-10 rounded-xl border px-3"
                    value={draft.endTime}
                    disabled={isValidated}
                    onChange={(e) => setDraft((d) => (d ? { ...d, endTime: e.target.value } : d))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Observacions</span>
                  <textarea
                    className="min-h-[120px] rounded-xl border px-3 py-2 text-sm"
                    value={draft.notes}
                    disabled={isValidated}
                    onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value } : d))}
                  />
                </label>
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Estat actual</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGES[currentStatus]}`}
                    >
                      {STATUS_LABELS[currentStatus]}
                    </span>
                    {draft.worker ? (
                      <span className="text-xs text-slate-500">Operari: {draft.worker}</span>
                    ) : null}
                  </div>

                  {!isValidated && allowedNextStatuses.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-600">Canvi d'estat</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {allowedNextStatuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setDraft((prev) => (prev ? { ...prev, status } : prev))}
                            className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                              draft.status === status
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            {STATUS_LABELS[status]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs text-gray-600">Adjuntar imatge</div>
                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1 rounded-full border text-xs cursor-pointer">
                      Fitxer
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          setImagePreview(file ? URL.createObjectURL(file) : null)
                        }}
                      />
                    </label>
                    <label className="px-3 py-1 rounded-full border text-xs cursor-pointer">
                      Foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          setImagePreview(file ? URL.createObjectURL(file) : null)
                        }}
                      />
                    </label>
                  </div>
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Previsualitzacio"
                      className="w-full max-h-48 object-cover rounded-xl border"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 py-6 md:px-6 md:py-8">
              <div className="text-xs text-gray-600 mb-2">Checklist</div>
              {!selectedTemplate && (
                <div className="rounded-xl border px-3 py-2 text-xs text-gray-500">
                  Aquesta tasca no te plantilla assignada.
                </div>
              )}
              {selectedTemplate && (
                <div className="rounded-2xl border px-2 py-2 text-xs text-gray-700">
                  {selectedTemplate.sections.map((sec) => {
                    const isOpen = !!openSections[sec.location]
                    const doneCount = sec.items.filter((it) => checklistState[`${sec.location}::${it.label}`]).length
                    return (
                      <div key={sec.location} className="border-b last:border-b-0">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-3 text-left"
                          onClick={() =>
                            setOpenSections((prev) => ({
                              ...prev,
                              [sec.location]: !prev[sec.location],
                            }))
                          }
                        >
                          <div className="text-[11px] font-semibold text-gray-700">{sec.location}</div>
                          <div className="text-[11px] text-gray-500">
                            {doneCount}/{sec.items.length}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-4 space-y-2">
                            {sec.items.map((it, idx) => {
                              const key = `${sec.location}::${it.label}::${idx}`
                              const entryKey = `${sec.location}::${it.label}`
                              return (
                                <label key={key} className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={!!checklistState[entryKey]}
                                    disabled={isChecklistReadOnly}
                                    onChange={() => {
                                      if (isChecklistReadOnly) return
                                      setChecklistState((prev) => ({
                                        ...prev,
                                        [entryKey]: !prev[entryKey],
                                      }))
                                      setDraft((prev) => {
                                        if (!prev) return prev
                                        if (prev.status === 'assignat') {
                                          return { ...prev, status: 'en_curs' }
                                        }
                                        return prev
                                      })
                                    }}
                                  />
                                  <span className="leading-snug">{it.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {lastRecord?.statusHistory?.length ? (
                <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</div>
                  <div className="space-y-2">
                    {[...(lastRecord.statusHistory || [])]
                      .slice()
                      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
                      .map((item, index) => (
                        <div key={`${item.status}-${item.at}-${index}`} className="rounded-xl border bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGES[item.status]}`}
                            >
                              {STATUS_LABELS[item.status]}
                            </span>
                            <span className="text-xs text-slate-500">{item.byName || '-'}</span>
                            {item.startTime || item.endTime ? (
                              <span className="text-xs text-slate-500">
                                {item.startTime || '--:--'} {item.endTime ? `- ${item.endTime}` : ''}
                              </span>
                            ) : null}
                          </div>
                          {item.note ? <div className="mt-2 text-xs text-slate-600">{item.note}</div> : null}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 border-t bg-white">
          <div className="w-full max-w-6xl mx-auto px-4 py-3 flex items-center justify-end gap-2">
            {saveStatus === 'saved' && (
              <div className="mr-auto text-xs text-emerald-700">Guardat correctament.</div>
            )}
            {saveStatus === 'error' && (
              <div className="mr-auto text-xs text-red-600">No s'ha pogut guardar.</div>
            )}
            {isValidated && canValidate && (
              <button
                type="button"
                className="mr-auto rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-700"
                onClick={handleReopen}
              >
                Reobrir
              </button>
            )}
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
              onClick={saveCompletion}
            >
              {saveStatus === 'saving' ? 'Guardant...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </RoleGuard>
  )
}

