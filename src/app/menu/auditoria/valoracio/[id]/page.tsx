'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, RotateCcw, Save, XCircle } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const VALUATION_NAV_STORAGE_KEY = 'auditoria-valoracio-nav-ids'

type DetailAnswer = {
  itemId?: string
  type?: 'checklist' | 'rating' | 'photo' | string
  value?: boolean | number | string | null
  photos?: Array<{ url?: string; path?: string }>
}

type DetailBlock = {
  id?: string
  title?: string
  weight?: number
  itemWeightMode?: 'equal' | 'manual' | string
  items?: Array<{ id?: string; label?: string; type?: string; weight?: number }>
}

type ReviewBlockCheck = {
  blockId: string
  isValid: boolean
}

type ReviewItemCheck = {
  blockId: string
  itemId: string
  isValid: boolean
}

type ExecutionDetail = {
  id: string
  eventId: string
  eventSummary?: string
  department: string
  templateName?: string
  status: string
  notes?: string | null
  auditAnswers?: DetailAnswer[]
  templateBlocks?: DetailBlock[]
  completedAt?: number
  completedByName?: string
  reviewedAt?: number
  reviewedByName?: string
  reviewNote?: string | null
  reviewBlockChecks?: ReviewBlockCheck[]
  reviewItemChecks?: ReviewItemCheck[]
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

export default function AuditoriaValoracioDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const executionId = String((params as Record<string, string> | null)?.id || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ExecutionDetail | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [itemChecks, setItemChecks] = useState<Record<string, boolean | null>>({})

  const navQuery = useMemo(() => {
    const q = new URLSearchParams()
    const keys = ['fromTs', 'toTs', 'status', 'department', 'q']
    keys.forEach((key) => {
      const value = String(searchParams?.get(key) || '').trim()
      if (value) q.set(key, value)
    })
    return q
  }, [searchParams])

  const [navIds, setNavIds] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/auditoria/executions/${executionId}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar l auditoria'))
      const execution = (json?.execution || null) as ExecutionDetail | null
      setDetail(execution)
      setReviewNote(String(execution?.reviewNote || ''))

      const initialChecks: Record<string, boolean | null> = {}
      const reviewItemChecks = Array.isArray(execution?.reviewItemChecks) ? execution.reviewItemChecks : []
      if (reviewItemChecks.length > 0) {
        reviewItemChecks.forEach((itemCheck) => {
          const blockId = String(itemCheck?.blockId || '').trim()
          const itemId = String(itemCheck?.itemId || '').trim()
          if (!blockId || !itemId || typeof itemCheck?.isValid !== 'boolean') return
          initialChecks[`${blockId}::${itemId}`] = itemCheck.isValid
        })
      } else {
        const reviewBlockChecks = Array.isArray(execution?.reviewBlockChecks) ? execution.reviewBlockChecks : []
        reviewBlockChecks.forEach((blockCheck) => {
          const blockId = String(blockCheck?.blockId || '').trim()
          if (!blockId || typeof blockCheck?.isValid !== 'boolean') return
          const block = (execution?.templateBlocks || []).find(
            (candidate, idx) => String(candidate?.id || `b-${idx + 1}`) === blockId
          )
          ;(block?.items || []).forEach((item, itemIdx) => {
            const itemId = String(item?.id || `i-${blockId}-${itemIdx + 1}`)
            initialChecks[`${blockId}::${itemId}`] = blockCheck.isValid
          })
        })
      }
      setItemChecks(initialChecks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error carregant auditoria')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!executionId) return
    load()
  }, [executionId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(VALUATION_NAV_STORAGE_KEY)
      if (!raw) {
        setNavIds([])
        return
      }
      const parsed = JSON.parse(raw)
      setNavIds(Array.isArray(parsed) ? parsed.map((value) => String(value || '')).filter(Boolean) : [])
    } catch {
      setNavIds([])
    }
  }, [executionId])

  const answersByItemId = useMemo(() => {
    const map = new Map<string, DetailAnswer>()
    ;(detail?.auditAnswers || []).forEach((answer) => {
      const itemId = String(answer.itemId || '').trim()
      if (!itemId) return
      map.set(itemId, answer)
    })
    return map
  }, [detail?.auditAnswers])

  const currentNavIndex = navIds.findIndex((id) => id === executionId)
  const prevId = currentNavIndex > 0 ? navIds[currentNavIndex - 1] : null
  const nextId = currentNavIndex >= 0 && currentNavIndex < navIds.length - 1 ? navIds[currentNavIndex + 1] : null
  const auditNotes = String(detail?.notes || '').trim()

  const allItemsChecked = useMemo(() => {
    const blocks = Array.isArray(detail?.templateBlocks) ? detail.templateBlocks : []
    if (!blocks.length) return false
    return blocks.every((block, idx) => {
      const blockId = String(block?.id || `b-${idx + 1}`)
      const items = Array.isArray(block?.items) ? block.items : []
      if (!items.length) return false
      return items.every((item, itemIdx) => {
        const itemId = String(item?.id || `i-${idx + 1}-${itemIdx + 1}`)
        return typeof itemChecks[`${blockId}::${itemId}`] === 'boolean'
      })
    })
  }, [detail?.templateBlocks, itemChecks])

  const toggleItemCheck = (blockId: string, itemId: string) => {
    const key = `${blockId}::${itemId}`
    setItemChecks((prev) => {
      const current = prev[key]
      if (current === true) return { ...prev, [key]: false }
      return { ...prev, [key]: true }
    })
  }

  const saveValidation = async () => {
    if (!detail?.id || saving || !allItemsChecked) return
    setSaving(true)
    setError('')
    try {
      const blocks = Array.isArray(detail.templateBlocks) ? detail.templateBlocks : []
      const payloadChecks = blocks.flatMap((block, idx) => {
        const blockId = String(block?.id || `b-${idx + 1}`)
        const items = Array.isArray(block?.items) ? block.items : []
        return items.map((item, itemIdx) => {
          const itemId = String(item?.id || `i-${idx + 1}-${itemIdx + 1}`)
          return {
            blockId,
            itemId,
            isValid: itemChecks[`${blockId}::${itemId}`] === true,
          }
        })
      })

      const res = await fetch(`/api/auditoria/executions/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: reviewNote,
          itemChecks: payloadChecks,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut desar la validacio'))

      setDetail((prev) => (prev ? { ...prev, status: String(json?.status || prev.status) } : prev))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant validacio')
    } finally {
      setSaving(false)
    }
  }

  const reopenValidation = async () => {
    if (!detail?.id || saving) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/auditoria/executions/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut reobrir la validacio'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reobrint validacio')
    } finally {
      setSaving(false)
    }
  }

  const goToExecution = (targetId: string | null) => {
    if (!targetId) return
    const suffix = navQuery.toString()
    router.push(`/menu/auditoria/valoracio/${targetId}${suffix ? `?${suffix}` : ''}`)
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
        <ModuleHeader subtitle="Valoracio" />

        <Card className="space-y-6">
          {loading ? (
            <div className="text-sm text-gray-600">Carregant auditoria...</div>
          ) : !detail ? (
            <div className="text-sm text-gray-600">No s'ha trobat l'auditoria.</div>
          ) : (
            <>
              <header className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-gray-900 truncate">{detail.eventSummary || `Event ${detail.eventId}`}</h2>
                    <p className="text-sm text-gray-600">{detail.completedByName || '-'} - {formatDate(detail.completedAt)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Auditoria anterior"
                      title="Auditoria anterior"
                      disabled={!prevId}
                      onClick={() => goToExecution(prevId)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Auditoria seguent"
                      title="Auditoria seguent"
                      disabled={!nextId}
                      onClick={() => goToExecution(nextId)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </header>

              {auditNotes && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <h3 className="text-sm font-semibold text-amber-950">Notes de l'auditoria</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{auditNotes}</p>
                </section>
              )}

              {(detail.templateBlocks || []).map((block, bIdx) => {
                const blockId = String(block.id || `b-${bIdx + 1}`)
                const items = Array.isArray(block.items) ? block.items : []
                const checkedCount = items.filter((item, itemIdx) => {
                  const itemId = String(item?.id || `i-${bIdx + 1}-${itemIdx + 1}`)
                  return itemChecks[`${blockId}::${itemId}`] === true
                }).length
                return (
                  <section key={blockId} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{block.title || `Bloc ${bIdx + 1}`}</h3>
                      <div className="text-xs rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        {checkedCount}/{items.length} amb check positiu
                      </div>
                    </div>

                    <div className="space-y-2 pl-1">
                      {items.map((item, iIdx) => {
                        const answer = answersByItemId.get(String(item.id || ''))
                        const type = String(item.type || 'checklist')
                        const photos = Array.isArray(answer?.photos)
                          ? answer.photos.filter((p) => String(p?.url || '').trim())
                          : []
                        const itemId = String(item.id || `i-${bIdx + 1}-${iIdx + 1}`)
                        const current = itemChecks[`${blockId}::${itemId}`]

                        const value =
                          type === 'checklist'
                            ? answer?.value === true
                              ? 'Si'
                              : 'No'
                            : String(answer?.value ?? '-')

                        return (
                          <div key={String(item.id || iIdx)} className="space-y-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.label || `Item ${iIdx + 1}`}
                                </div>
                                {Number(item.weight || 0) > 0 && (
                                  <div className="text-[11px] text-slate-500">
                                    Pes dins bloc: {Number(item.weight || 0)}%
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={detail.status !== 'completed'}
                                onClick={() => toggleItemCheck(blockId, itemId)}
                                className="inline-flex items-center justify-center h-9 w-9 shrink-0 disabled:opacity-50"
                                title={current === false ? 'No validat' : current === true ? 'Validat' : 'Pendent'}
                              >
                                {current === false ? (
                                  <XCircle className="w-6 h-6 text-red-600" />
                                ) : current === true ? (
                                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                ) : (
                                  <Circle className="w-6 h-6 text-gray-400" />
                                )}
                              </button>
                            </div>
                            {type !== 'photo' && <div className="text-sm text-gray-700">Resposta: {value}</div>}
                            {type === 'photo' && photos.length > 0 && (
                              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                                {photos.map((p, pIdx) => (
                                  <a key={`${blockId}-${iIdx}-${pIdx}`} href={String(p.url)} target="_blank" rel="noreferrer" className="block overflow-hidden hover:opacity-90">
                                    <img src={String(p.url)} alt={`Evidencia ${pIdx + 1}`} className="h-28 w-full object-cover rounded-md" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}

              <div className="space-y-2 pt-2">
                <textarea
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={4}
                  placeholder="Nota de validacio (opcional)"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  disabled={detail.status !== 'completed'}
                />
                <div className="flex justify-end">
                  {detail.status === 'completed' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Desar validacio"
                      aria-label="Desar validacio"
                      disabled={saving || !allItemsChecked}
                      onClick={saveValidation}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Reobrir validacio"
                      aria-label="Reobrir validacio"
                      disabled={saving}
                      onClick={reopenValidation}
                      className="text-amber-600 hover:text-amber-700"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </Card>
      </div>
    </RoleGuard>
  )
}
