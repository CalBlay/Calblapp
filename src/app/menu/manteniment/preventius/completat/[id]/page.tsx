 'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'

type TemplateSection = { location: string; items: { label: string }[] }
type Template = {
  id: string
  name: string
  sections: TemplateSection[]
}

type CompletedRecord = {
  id: string
  plannedId?: string | null
  templateId?: string | null
  title: string
  worker?: string | null
  startTime?: string
  endTime?: string
  status?: string
  notes?: string
  completedAt?: string | number
  checklist?: Record<string, boolean>
}

const toCompletedAtDate = (value?: string | number) => {
  if (value == null || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export default function PreventiuCompletatPage() {
  const params = useParams()
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string)
  const [record, setRecord] = useState<CompletedRecord | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/maintenance/preventius/completed/${id}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setRecord(json?.record || null)
      if (json?.record?.templateId) {
        const resTpl = await fetch('/api/maintenance/templates', { cache: 'no-store' })
        if (!resTpl.ok) return
        const jsonTpl = await resTpl.json()
        const list = Array.isArray(jsonTpl?.templates) ? jsonTpl.templates : []
        const found = list.find((t: Template) => t.id === json.record.templateId) || null
        setTemplate(found)
      }
    }
    load()
  }, [id])

  const checklistEntries = useMemo(() => {
    const map = record?.checklist || {}
    return map
  }, [record])

  if (!record) {
    return (
      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <div className="p-6 text-sm text-gray-600">Checklist no trobat.</div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="min-h-screen w-full bg-white flex flex-col">
        <ModuleHeader subtitle={record.title} />

        <div className="border-b px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-base font-semibold text-gray-900">{record.title}</div>
          <button
            type="button"
            className="rounded-full border px-4 py-2 text-xs text-gray-600"
            onClick={() => window.close()}
          >
            Tancar pestanya
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-0">
            <div className="px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto border-b xl:border-b-0 xl:border-r">
              <div className="grid grid-cols-1 gap-4 text-sm pb-24 xl:pb-6">
                <div className="text-xs text-gray-600">
                  Data: {toCompletedAtDate(record.completedAt) ? format(toCompletedAtDate(record.completedAt) as Date, 'dd/MM/yyyy HH:mm') : ''}
                </div>
                <div className="text-xs text-gray-600">Operari: {record.worker || '-'}</div>
                <div className="text-xs text-gray-600">Estat: {record.status || 'pendent'}</div>
                <div className="text-xs text-gray-600">
                  Hora: {record.startTime || '--:--'}–{record.endTime || '--:--'}
                </div>
                {record.notes && (
                  <div className="text-xs text-gray-600">Notes: {record.notes}</div>
                )}
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto">
              <div className="text-xs text-gray-600 mb-2">Checklist</div>
              <div className="rounded-2xl border px-2 py-2 text-xs text-gray-700">
                {template ? (
                  template.sections.map((sec) => (
                    <div key={sec.location} className="border-b last:border-b-0">
                      <div className="w-full flex items-center justify-between px-3 py-3 text-left">
                        <div className="text-[11px] font-semibold text-gray-700">
                          {sec.location}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {sec.items.filter((it) => checklistEntries[`${sec.location}::${it.label}`]).length}/{sec.items.length}
                        </div>
                      </div>
                      <div className="px-3 pb-4 space-y-2">
                        {sec.items.map((it, index) => {
                          const key = `${sec.location}::${it.label}`
                          const done = !!checklistEntries[key]
                          return (
                            <label key={`${key}::${index}`} className="flex items-start gap-2">
                              <input type="checkbox" checked={done} readOnly />
                              <span className="leading-snug">{it.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 space-y-2">
                    {Object.entries(checklistEntries).map(([key, done]) => (
                      <label key={key} className="flex items-start gap-2">
                        <input type="checkbox" checked={!!done} readOnly />
                        <span className="leading-snug">{key.split('::').slice(1).join('::')}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  )
}
