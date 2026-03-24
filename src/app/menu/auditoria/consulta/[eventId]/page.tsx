'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'
const DEPARTMENTS: Array<{ id: Department; label: string }> = [
  { id: 'comercial', label: 'Comercial' },
  { id: 'serveis', label: 'Serveis' },
  { id: 'cuina', label: 'Cuina' },
  { id: 'logistica', label: 'Logistica' },
  { id: 'deco', label: 'Deco' },
]

type ExecutionRow = {
  id: string
  eventId: string
  eventSummary?: string
  department: string
  templateName: string
  status: string
  completedAt: number
  completedByName: string
}

type DetailAnswer = {
  itemId?: string
  type?: string
  value?: unknown
  photos?: Array<{ url?: string; path?: string }>
}

type DetailExecution = {
  id: string
  eventId: string
  eventSummary?: string
  department: string
  templateName?: string
  status: string
  completedAt?: number
  completedByName?: string
  templateBlocks?: Array<{
    id?: string
    title?: string
    items?: Array<{ id?: string; label?: string; type?: string }>
  }>
  auditAnswers?: DetailAnswer[]
}

const formatDate = (ts?: number) => {
  const d = new Date(Number(ts || 0))
  if (Number.isNaN(d.getTime()) || ts === 0) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

const statusClass = (status?: string) => {
  const s = String(status || '').toLowerCase()
  if (s === 'validated') return 'bg-emerald-100 text-emerald-700'
  if (s === 'rejected') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}

const statusLabel = (status?: string) => {
  const s = String(status || '').toLowerCase()
  if (s === 'validated') return 'validada'
  if (s === 'rejected') return 'no validada'
  return 'pendent'
}

export default function AuditoriaConsultaEventPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const eventId = decodeURIComponent(String((params as Record<string, string> | null)?.eventId || ''))

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ExecutionRow[]>([])
  const [activeDept, setActiveDept] = useState<Department>('serveis')
  const [detail, setDetail] = useState<DetailExecution | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fromTs = String(searchParams?.get('fromTs') || '').trim()
  const toTs = String(searchParams?.get('toTs') || '').trim()

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ limit: '100', status: 'validated', eventId })
      if (fromTs) qs.set('fromTs', fromTs)
      if (toTs) qs.set('toTs', toTs)

      const res = await fetch(`/api/auditoria/executions/list?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar l esdeveniment'))
      setRows(Array.isArray(json?.executions) ? (json.executions as ExecutionRow[]) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error carregant esdeveniment')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!eventId) return
    load()
  }, [eventId, fromTs, toTs])

  const auditsByDept = useMemo(() => {
    const map: Record<Department, ExecutionRow[]> = {
      comercial: [],
      serveis: [],
      cuina: [],
      logistica: [],
      deco: [],
    }
    rows.forEach((r) => {
      const d = String(r.department || '').toLowerCase().trim()
      if (d === 'comercial' || d === 'serveis' || d === 'cuina' || d === 'logistica' || d === 'deco') {
        map[d].push(r)
      }
    })
    DEPARTMENTS.forEach((d) => {
      map[d.id] = map[d.id].sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0))
    })
    return map
  }, [rows])

  useEffect(() => {
    const first = DEPARTMENTS.find((d) => auditsByDept[d.id].length > 0)?.id
    if (first) setActiveDept(first)
  }, [rows])

  const activeAudit = auditsByDept[activeDept][0] || null

  const loadDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/auditoria/executions/${id}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error()
      setDetail((json?.execution || null) as DetailExecution | null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!activeAudit?.id) {
      setDetail(null)
      return
    }
    loadDetail(activeAudit.id)
  }, [activeAudit?.id])

  const answersByItemId = useMemo(() => {
    const map = new Map<string, DetailAnswer>()
    ;(detail?.auditAnswers || []).forEach((answer) => {
      const itemId = String(answer.itemId || '').trim()
      if (!itemId) return
      map.set(itemId, answer)
    })
    return map
  }, [detail?.auditAnswers])

  const eventSummary = String(rows[0]?.eventSummary || `Event ${eventId}`)

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
        <ModuleHeader subtitle="Consulta" />

        <Card className="space-y-4">
          <div className="text-base font-semibold text-gray-900">{eventSummary}</div>

          <div className="flex flex-wrap items-center gap-2">
            {DEPARTMENTS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveDept(d.id)}
                className={[
                  'h-9 rounded-md px-3 text-sm border',
                  activeDept === d.id ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : 'border-gray-300 bg-white text-gray-700',
                ].join(' ')}
              >
                {d.label} ({auditsByDept[d.id].length})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">Carregant...</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : !activeAudit ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">No hi ha auditoria en aquest departament.</div>
          ) : detailLoading || !detail ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">Carregant auditoria...</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border p-3 text-sm text-gray-700 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{detail.templateName || 'Sense plantilla'}</span>
                  <span className="text-gray-600">{formatDate(detail.completedAt)}</span>
                  <span className="text-gray-600">{detail.completedByName || '-'}</span>
                  <span className={['text-xs rounded-full px-2 py-1', statusClass(detail.status)].join(' ')}>
                    {statusLabel(detail.status)}
                  </span>
                </div>
              </div>

              {(detail.templateBlocks || []).map((block, bIdx) => (
                <div key={String(block.id || bIdx)} className="rounded-xl border p-3 space-y-2">
                  <div className="text-sm font-semibold text-gray-900">{block.title || `Bloc ${bIdx + 1}`}</div>
                  {(block.items || []).map((item, iIdx) => {
                    const answer = answersByItemId.get(String(item.id || ''))
                    const type = String(item.type || 'checklist')

                    return (
                      <div key={String(item.id || iIdx)} className="space-y-1">
                        <div className="text-sm text-gray-900">{item.label || `Item ${iIdx + 1}`}</div>
                        {type !== 'photo' ? (
                          <div className="text-sm text-gray-700">
                            {type === 'checklist'
                              ? answer?.value === true
                                ? 'Si'
                                : 'No'
                              : String(answer?.value ?? '-')}
                          </div>
                        ) : Array.isArray(answer?.photos) && answer.photos.length > 0 ? (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                            {answer.photos
                              .filter((p) => String(p?.url || '').trim())
                              .map((p, pIdx) => (
                                <a key={`${iIdx}-${pIdx}`} href={String(p.url)} target="_blank" rel="noreferrer" className="block overflow-hidden hover:opacity-90">
                                  <img src={String(p.url)} alt={`Evidencia ${pIdx + 1}`} className="h-28 w-full object-cover rounded-md" />
                                </a>
                              ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">Sense fotos</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </RoleGuard>
  )
}
