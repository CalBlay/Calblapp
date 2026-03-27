'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'

type TemplateSection = { location: string; items: { label: string }[] }
type EditableSection = { id: string; location: string; items: { id: string; label: string }[] }
type Template = {
  id: string
  name: string
  source: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  active?: boolean
  sections: TemplateSection[]
}

const PERIODICITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'daily', label: 'Diari' },
  { value: 'weekly', label: 'Setmanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export default function PlantillaDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string)

  const [template, setTemplate] = useState<Template | null>(null)
  const [operators, setOperators] = useState<string[]>([])
  const [form, setForm] = useState<{
    name?: string
    periodicity?: Template['periodicity']
    lastDone?: string | null
    location?: string
    primaryOperator?: string
    backupOperator?: string
    active?: boolean
  }>({})
  const [sections, setSections] = useState<EditableSection[]>([])
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/maintenance/templates/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const json = await res.json()
      const found = (json?.template as Template) || null
      setTemplate(found)
      if (found) {
        setForm({
          name: found.name || '',
          periodicity: found.periodicity,
          lastDone: found.lastDone || '',
          location: found.location || '',
          primaryOperator: found.primaryOperator || '',
          backupOperator: found.backupOperator || '',
          active: found.active !== false,
        })
        const mappedSections: EditableSection[] = (Array.isArray(found.sections) ? found.sections : [])
          .map((sec) => ({
            id: createLocalId(),
            location: String(sec.location || ''),
            items: (Array.isArray(sec.items) ? sec.items : []).map((item) => ({
              id: createLocalId(),
              label: String(item.label || ''),
            })),
          }))
        setSections(mappedSections)
        const nextOpen: Record<string, boolean> = {}
        mappedSections.forEach((sec) => {
          nextOpen[sec.id] = false
        })
        setOpenSections(nextOpen)
      }
    }
    load()
  }, [id])

  useEffect(() => {
    const loadOperators = async () => {
      try {
        const res = await fetch('/api/personnel?department=manteniment', { cache: 'no-store' })
        if (!res.ok) {
          setOperators([])
          return
        }
        const json = await res.json()
        const list = Array.isArray(json?.data) ? json.data : []
        const names = list
          .map((item: any) => String(item?.name || '').trim())
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b))
        setOperators(Array.from(new Set(names)))
      } catch {
        setOperators([])
      }
    }
    loadOperators()
  }, [])

  useEffect(() => {
    const loadLastDone = async () => {
      try {
        const res = await fetch(
          `/api/maintenance/preventius/completed?templateId=${encodeURIComponent(id)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) return
        const json = await res.json()
        const list = Array.isArray(json?.records) ? json.records : []
        const resolved = list.find((r: any) => r.status === 'validat' || r.status === 'resolut')
        if (resolved?.completedAt) {
          const date = new Date(resolved.completedAt)
          const yyyy = date.getFullYear()
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          const dd = String(date.getDate()).padStart(2, '0')
          const formatted = `${yyyy}-${mm}-${dd}`
          setForm((prev) => (prev.lastDone ? prev : { ...prev, lastDone: formatted }))
        }
      } catch {
        return
      }
    }
    loadLastDone()
  }, [id])

  const lastDoneRequired = !form.lastDone
  const backupOptions = useMemo(
    () => operators.filter((operator) => operator !== (form.primaryOperator || '')),
    [operators, form.primaryOperator]
  )

  const save = async () => {
    const cleanSections: TemplateSection[] = sections
      .map((sec) => ({
        location: String(sec.location || '').trim(),
        items: sec.items
          .map((it) => ({ label: String(it.label || '').trim() }))
          .filter((it) => Boolean(it.label)),
      }))
      .filter((sec) => Boolean(sec.location) || sec.items.length > 0)
      .map((sec) => ({
        location: sec.location || 'GENERAL',
        items: sec.items,
      }))

    try {
      const res = await fetch(`/api/maintenance/templates/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || '',
          periodicity: form.periodicity || null,
          lastDone: form.lastDone || null,
          location: form.location || '',
          primaryOperator: form.primaryOperator || '',
          backupOperator: form.backupOperator || '',
          active: form.active !== false,
          sections: cleanSections,
        }),
      })
      if (!res.ok) throw new Error('save_failed')
      setSavedAt(new Date().toISOString())
      setTemplate((prev) =>
        prev
          ? {
              ...prev,
              name: String(form.name || prev.name),
              active: form.active !== false,
              sections: cleanSections,
            }
          : prev
      )
    } catch {
      return
    }
  }

  const addSection = () => {
    const id = createLocalId()
    setSections((prev) => [...prev, { id, location: '', items: [] }])
    setOpenSections((prev) => ({ ...prev, [id]: true }))
  }

  const removeSection = (sectionId: string) => {
    setSections((prev) => prev.filter((sec) => sec.id !== sectionId))
    setOpenSections((prev) => {
      const next = { ...prev }
      delete next[sectionId]
      return next
    })
  }

  const updateSectionLocation = (sectionId: string, location: string) => {
    setSections((prev) =>
      prev.map((sec) => (sec.id === sectionId ? { ...sec, location } : sec))
    )
  }

  const addItem = (sectionId: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: [...sec.items, { id: createLocalId(), label: '' }] }
          : sec
      )
    )
  }

  const updateItemLabel = (sectionId: string, itemId: string, label: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              items: sec.items.map((it) => (it.id === itemId ? { ...it, label } : it)),
            }
          : sec
      )
    )
  }

  const removeItem = (sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) } : sec
      )
    )
  }

  const openHistory = () => {
    const url = `/menu/manteniment/preventius/plantilles/${id}/historial`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  const setTemplateActive = async (active: boolean) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/maintenance/templates/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) throw new Error('toggle_failed')
      setForm((prev) => ({ ...prev, active }))
      setTemplate((prev) => (prev ? { ...prev, active } : prev))
      setSavedAt(new Date().toISOString())
    } finally {
      setActionLoading(false)
    }
  }

  const deleteTemplate = async () => {
    const ok = window.confirm(`Vols eliminar la plantilla "${form.name || template?.name || ''}"?`)
    if (!ok) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/maintenance/templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('delete_failed')
      router.push('/menu/manteniment/dades')
      router.refresh()
    } finally {
      setActionLoading(false)
    }
  }

  if (!template) {
    return (
      <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
        <div className="p-6 text-sm text-gray-600">Plantilla no trobada.</div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="min-h-screen w-full bg-white flex flex-col">
        <ModuleHeader subtitle={form.name || template.name} />

        <div className="border-b px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-gray-900">{form.name || template.name}</div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                form.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {form.active !== false ? 'Activa' : 'Inactiva'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && <div className="text-xs text-emerald-700">Guardat</div>}
            <button
              type="button"
              className="rounded-full border px-4 py-2 text-xs text-gray-600 disabled:opacity-50"
              onClick={() => void setTemplateActive(form.active === false)}
              disabled={actionLoading}
            >
              {form.active === false ? 'Activar' : 'Desactivar'}
            </button>
            <button
              type="button"
              className="rounded-full border px-4 py-2 text-xs text-gray-600 disabled:opacity-50"
              onClick={openHistory}
              disabled={actionLoading}
            >
              Historial
            </button>
            <button
              type="button"
              className="rounded-full border border-red-300 px-4 py-2 text-xs text-red-700 disabled:opacity-50"
              onClick={() => void deleteTemplate()}
              disabled={actionLoading}
            >
              Eliminar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-0">
            <div className="px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto border-b xl:border-b-0 xl:border-r">
              <div className="grid grid-cols-1 gap-4 text-sm pb-24 xl:pb-6">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Nom plantilla</span>
                  <input
                    className="h-10 rounded-xl border px-3"
                    value={form.name || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Temporalitat</span>
                  <select
                    className="h-10 rounded-xl border px-3"
                    value={form.periodicity || ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        periodicity: e.target.value as Template['periodicity'],
                      }))
                    }
                  >
                    <option value="">Selecciona</option>
                    {PERIODICITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">
                    Ultima data revisio {lastDoneRequired && '(obligatori)'}
                  </span>
                  <input
                    type="date"
                    className={`h-10 rounded-xl border px-3 ${
                      lastDoneRequired ? 'border-red-300' : ''
                    }`}
                    value={form.lastDone || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastDone: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Ubicacio</span>
                  <input
                    className="h-10 rounded-xl border px-3"
                    value={form.location || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Operari assignat</span>
                  <select
                    className="h-10 rounded-xl border px-3"
                    value={form.primaryOperator || ''}
                    onChange={(e) => {
                      const next = e.target.value
                      setForm((prev) => ({
                        ...prev,
                        primaryOperator: next,
                        backupOperator: prev.backupOperator === next ? '' : prev.backupOperator,
                      }))
                    }}
                  >
                    <option value="">Sense assignar</option>
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Segon operari</span>
                  <select
                    className="h-10 rounded-xl border px-3"
                    value={form.backupOperator || ''}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, backupOperator: e.target.value }))
                    }
                  >
                    <option value="">Sense assignar</option>
                    {backupOptions.map((operator) => (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs text-gray-600">Checklist</div>
                <button
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs text-gray-700"
                  onClick={addSection}
                >
                  + Grup
                </button>
              </div>
              <div className="rounded-2xl border px-2 py-2 text-xs text-gray-700">
                {sections.map((sec) => {
                  const isOpen = !!openSections[sec.id]
                  return (
                    <div key={sec.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-3 text-left"
                        onClick={() =>
                          setOpenSections((prev) => ({
                            ...prev,
                            [sec.id]: !prev[sec.id],
                          }))
                        }
                      >
                        <div className="text-[11px] font-semibold text-gray-700">{sec.location || 'Nou grup'}</div>
                        <div className="text-[11px] text-gray-500">{sec.items.length}</div>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              className="h-9 flex-1 rounded-xl border px-3"
                              value={sec.location}
                              onChange={(e) => updateSectionLocation(sec.id, e.target.value)}
                              placeholder="Nom del grup / ubicacio"
                            />
                            <button
                              type="button"
                              title="Eliminar grup"
                              aria-label="Eliminar grup"
                              className="rounded-full border border-red-300 p-2 text-red-600 hover:bg-red-50"
                              onClick={() => removeSection(sec.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {sec.items.map((it) => (
                            <div key={it.id} className="flex items-center gap-2">
                              <input
                                className="h-9 flex-1 rounded-xl border px-3"
                                value={it.label}
                                onChange={(e) => updateItemLabel(sec.id, it.id, e.target.value)}
                                placeholder="Camp checklist"
                              />
                              <button
                                type="button"
                                title="Eliminar camp"
                                aria-label="Eliminar camp"
                                className="rounded-full border border-red-300 p-2 text-red-600 hover:bg-red-50"
                                onClick={() => removeItem(sec.id, it.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="rounded-full border px-3 py-1 text-[11px] text-gray-700"
                            onClick={() => addItem(sec.id)}
                          >
                            + Camp
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {sections.length === 0 && (
                  <div className="px-3 py-4 text-gray-500">No hi ha grups. Crea el primer amb “+ Grup”.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button
            type="button"
            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
            onClick={save}
          >
            Guardar
          </button>
        </div>
      </div>
    </RoleGuard>
  )
}
