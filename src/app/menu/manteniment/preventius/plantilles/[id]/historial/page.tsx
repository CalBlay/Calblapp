'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'

type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semestral' | 'yearly'
  location?: string
  primaryOperator?: string
  backupOperator?: string
}

type CompletedRecord = {
  id: string
  plannedId?: string | null
  templateId?: string | null
  title?: string
  worker?: string | null
  startTime?: string
  endTime?: string
  status?: string
  notes?: string
  completedAt?: string | number
  createdByName?: string
  checklist?: Record<string, boolean>
}

const PERIODICITY_LABELS: Record<string, string> = {
  daily: 'Diari',
  weekly: 'Setmanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semestral: 'Semestral',
  yearly: 'Anual',
}

const STATUS_LABELS: Record<string, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Validat',
  validat: 'Validat',
}

const STATUS_BADGES: Record<string, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-sky-100 text-sky-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  resolut: 'bg-violet-100 text-violet-800',
  validat: 'bg-violet-100 text-violet-800',
}

const formatDateTime = (value?: string | number) => {
  if (!value && value !== 0) return '-'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return format(date, 'dd/MM/yyyy HH:mm')
}

const getStatusLabel = (status?: string | null) => {
  const key = String(status || 'assignat').trim().toLowerCase()
  return STATUS_LABELS[key] || key || '-'
}

const getChecklistSummary = (checklist?: Record<string, boolean>) => {
  const values = Object.values(checklist || {})
  if (values.length === 0) return 'Sense checklist'
  const done = values.filter(Boolean).length
  return `${done}/${values.length} checks`
}

export default function PlantillaHistorialPage() {
  const params = useParams()
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const [template, setTemplate] = useState<Template | null>(null)
  const [records, setRecords] = useState<CompletedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError('')

        const [templateRes, recordsRes] = await Promise.all([
          fetch(`/api/maintenance/templates/${encodeURIComponent(id)}`, { cache: 'no-store' }),
          fetch(`/api/maintenance/preventius/completed?templateId=${encodeURIComponent(id)}`, {
            cache: 'no-store',
          }),
        ])

        const templateJson = templateRes.ok ? await templateRes.json() : null
        const recordsJson = recordsRes.ok ? await recordsRes.json() : null

        if (cancelled) return

        setTemplate((templateJson?.template as Template) || null)
        setRecords(Array.isArray(recordsJson?.records) ? recordsJson.records : [])
      } catch (err) {
        if (cancelled) return
        setTemplate(null)
        setRecords([])
        setError(err instanceof Error ? err.message : 'No s ha pogut carregar l historial')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [id])

  const validatedCount = useMemo(
    () => records.filter((record) => ['validat', 'resolut'].includes(String(record.status || ''))).length,
    [records]
  )

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="min-h-screen space-y-5 px-4 pb-8">
        <ModuleHeader
          title="Manteniment"
          subtitle="Historial de plantilla"
          mainHref="/menu/manteniment"
        />

        <section className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="text-lg font-semibold text-emerald-900">{template?.name || 'Plantilla'}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-emerald-800/90">
            <span className="rounded-full bg-white/80 px-3 py-1">
              Periodicitat: {PERIODICITY_LABELS[String(template?.periodicity || '')] || '-'}
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1">
              Ubicacio: {template?.location || '-'}
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1">
              Validats: {validatedCount}
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-800/80">
            Operari principal: {template?.primaryOperator || '-'} · Backup: {template?.backupOperator || '-'}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Execucions registrades</div>
            <div className="text-xs text-slate-500">{records.length} registres</div>
          </div>

          {loading ? <div className="px-4 py-6 text-sm text-slate-500">Carregant historial...</div> : null}
          {error ? <div className="px-4 py-6 text-sm text-red-600">{error}</div> : null}
          {!loading && !error && records.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500">Aquesta plantilla encara no te registres.</div>
          ) : null}

          {!loading && !error && records.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {records.map((record) => {
                const statusKey = String(record.status || 'assignat').trim().toLowerCase()
                return (
                  <article key={record.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,2fr),auto]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900">
                          {record.title || template?.name || 'Preventiu'}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            STATUS_BADGES[statusKey] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {getStatusLabel(record.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                        <span>Data: {formatDateTime(record.completedAt)}</span>
                        <span>Operari: {record.worker || '-'}</span>
                        <span>
                          Hora: {record.startTime || '--:--'} - {record.endTime || '--:--'}
                        </span>
                        <span>{getChecklistSummary(record.checklist)}</span>
                      </div>
                      {record.notes ? <div className="text-sm text-slate-600">{record.notes}</div> : null}
                    </div>

                    <div className="flex items-center">
                      <Link
                        href={`/menu/manteniment/preventius/completat/${encodeURIComponent(record.id)}`}
                        target="_blank"
                        className="inline-flex min-h-[44px] items-center rounded-full border border-sky-200 px-4 text-sm font-medium text-sky-700"
                      >
                        Obrir detall
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>
      </div>
    </RoleGuard>
  )
}
