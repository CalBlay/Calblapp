'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  AuditItemType,
  AuditItemWeightMode,
  AuditTemplateBlock,
  AuditTemplateDetail,
  AuditTemplateItem,
} from '@/types/auditoria'
import { cn } from '@/lib/utils'

type TemplateState = {
  name: string
  status: 'draft' | 'active'
  blocks: AuditTemplateBlock[]
}

const ITEM_TYPES: Array<{ value: AuditItemType; label: string }> = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'rating', label: 'Valoracio 1-10' },
  { value: 'photo', label: 'Foto' },
]
const DEFAULT_TEMPLATE_NAME = 'Escriure nom de la nova plantilla'
const DEFAULT_ITEM_WEIGHT_MODE: AuditItemWeightMode = 'equal'

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function rounded2(value: number) {
  return Math.round(value * 100) / 100
}

function buildEqualItemWeights(items: AuditTemplateItem[]) {
  if (!items.length) return items
  const base = Math.floor((100 / items.length) * 100) / 100
  let remaining = 100
  return items.map((item, index) => {
    const weight = index === items.length - 1 ? rounded2(remaining) : base
    remaining = rounded2(remaining - weight)
    return { ...item, weight }
  })
}

export default function AuditoriaPlantillaEditPage() {
  const params = useParams()
  const router = useRouter()
  const templateId = String((params as Record<string, string> | null)?.id || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [data, setData] = useState<TemplateState>({
    name: '',
    status: 'draft',
    blocks: [],
  })
  const [baseline, setBaseline] = useState<TemplateState | null>(null)

  const weightTotal = useMemo(
    () => data.blocks.reduce((sum, block) => sum + (Number(block.weight) || 0), 0),
    [data.blocks]
  )

  const isComplete = useMemo(() => {
    if (!data.name.trim()) return false
    if (!data.blocks.length) return false
    if (weightTotal !== 100) return false
    return data.blocks.every((block) => {
      if (!String(block.title || '').trim()) return false
      if (!Array.isArray(block.items) || block.items.length === 0) return false
      if (!block.items.every((item) => String(item.label || '').trim().length > 0)) return false
      if ((block.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE) !== 'manual') return true
      return rounded2(block.items.reduce((sum, item) => sum + Number(item.weight || 0), 0)) === 100
    })
  }, [data, weightTotal])

  useEffect(() => {
    if (!templateId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/auditoria/templates/${templateId}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar la plantilla'))
        if (cancelled) return
        const tpl = json as AuditTemplateDetail
        const next = {
          name: tpl.name || '',
          status: tpl.status || 'draft',
          blocks: Array.isArray(tpl.blocks) ? tpl.blocks : [],
        }
        setData(next)
        setBaseline(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error carregant plantilla')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [templateId])

  const updateBlock = (blockId: string, patch: Partial<AuditTemplateBlock>) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }))
  }

  const updateBlockWeightMode = (blockId: string, mode: AuditItemWeightMode) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => {
        if (b.id !== blockId) return b
        const nextItems =
          mode === 'manual'
            ? buildEqualItemWeights((b.items || []).map((item) => ({ ...item, weight: item.weight ?? 0 })))
            : (b.items || []).map((item) => {
                const next = { ...item }
                delete next.weight
                return next
              })
        return { ...b, itemWeightMode: mode, items: nextItems }
      }),
    }))
  }

  const removeBlock = (blockId: string) => {
    setData((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== blockId) }))
  }

  const addBlock = () => {
    setData((prev) => ({
      ...prev,
      blocks: [
        ...prev.blocks,
        {
          id: makeId('b'),
          title: '',
          weight: 0,
          itemWeightMode: DEFAULT_ITEM_WEIGHT_MODE,
          items: [],
        },
      ],
    }))
  }

  const addItem = (blockId: string) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              items:
                (b.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE) === 'manual'
                  ? buildEqualItemWeights([
                      ...(b.items || []),
                      { id: makeId('i'), label: '', type: 'checklist', weight: 0 },
                    ])
                  : [...(b.items || []), { id: makeId('i'), label: '', type: 'checklist' }],
            }
          : b
      ),
    }))
  }

  const updateItem = (blockId: string, itemId: string, patch: Partial<AuditTemplateItem>) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
            }
          : b
      ),
    }))
  }

  const removeItem = (blockId: string, itemId: string) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              items:
                (b.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE) === 'manual'
                  ? buildEqualItemWeights(b.items.filter((i) => i.id !== itemId))
                  : b.items.filter((i) => i.id !== itemId),
            }
          : b
      ),
    }))
  }

  const saveTemplate = async () => {
    setSaving(true)
    setSaveOk(null)
    setError(null)
    try {
      const res = await fetch(`/api/auditoria/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          status: data.status,
          blocks: data.blocks,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut desar la plantilla'))
      if (json?.status === 'draft' || json?.status === 'active') {
        const next = { ...data, status: json.status }
        setData(next)
        setBaseline(next)
      } else {
        setBaseline(data)
      }
      setSaveOk('Plantilla desada correctament')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant plantilla')
    } finally {
      setSaving(false)
    }
  }

  const undoChanges = () => {
    if (!baseline) return
    setData(baseline)
    setError(null)
    setSaveOk(null)
  }

  const deleteTemplate = async () => {
    const ok = window.confirm('Vols eliminar aquesta plantilla?')
    if (!ok) return
    setDeleting(true)
    setError(null)
    setSaveOk(null)
    try {
      const res = await fetch(`/api/auditoria/templates/${templateId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut eliminar la plantilla'))
      router.push('/menu/auditoria/plantilles')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminant plantilla')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
        <ModuleHeader subtitle="Plantilles" />

        <Card className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Editar plantilla</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                title="Desfer canvis"
                aria-label="Desfer canvis"
                onClick={undoChanges}
                disabled={loading || !baseline}
                className="text-gray-700"
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Eliminar plantilla"
                aria-label="Eliminar plantilla"
                onClick={deleteTemplate}
                disabled={deleting || loading}
                className="text-red-600"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Desar plantilla"
                aria-label="Desar plantilla"
                onClick={saveTemplate}
                disabled={saving || loading}
                className="text-blue-600"
              >
                <Save className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-600">Carregant...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2">
                <Input
                  value={data.name}
                  onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
                  onFocus={() => {
                    if (data.name === DEFAULT_TEMPLATE_NAME) {
                      setData((prev) => ({ ...prev, name: '' }))
                    }
                  }}
                  placeholder="Nom de la plantilla"
                  className={cn(
                    data.name === DEFAULT_TEMPLATE_NAME ? 'italic text-gray-500' : ''
                  )}
                />
                <div className="h-10 rounded-md border border-gray-300 bg-gray-50 px-3 text-sm flex items-center">
                  {isComplete ? 'Activa' : 'Esborrany'}
                </div>
              </div>

              <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
                Pes total actual: <span className="font-semibold">{weightTotal}%</span>
              </div>

              <div className="space-y-3">
                {data.blocks.map((block, blockIdx) => (
                  <div key={block.id} className="rounded-xl border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        Bloc
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2">
                      <Input
                        value={block.title}
                        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                        placeholder={`Nom del bloc ${blockIdx + 1}`}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={String(block.weight ?? 0)}
                        onChange={(e) =>
                          updateBlock(block.id, { weight: Number(e.target.value || 0) })
                        }
                        placeholder="% pes"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Eliminar bloc"
                        aria-label="Eliminar bloc"
                        onClick={() => removeBlock(block.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2">
                      <select
                        value={block.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE}
                        onChange={(e) =>
                          updateBlockWeightMode(
                            block.id,
                            e.target.value === 'manual' ? 'manual' : 'equal'
                          )
                        }
                        className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                      >
                        <option value="equal">Repartiment automatic</option>
                        <option value="manual">Ponderacio manual</option>
                      </select>
                      <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm flex items-center text-slate-700">
                        {(block.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE) === 'manual'
                          ? `Suma items: ${rounded2(
                              (block.items || []).reduce((sum, item) => sum + Number(item.weight || 0), 0)
                            )}%`
                          : 'El pes del bloc es repartira igual entre els items'}
                      </div>
                    </div>

                    <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">
                      Items
                    </div>
                    <div className="space-y-2">
                      {(block.items || []).map((item) => (
                        <div
                          key={item.id}
                          className={[
                            'grid grid-cols-1 gap-2',
                            (block.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE) === 'manual'
                              ? 'sm:grid-cols-[1fr_180px_120px_auto]'
                              : 'sm:grid-cols-[1fr_180px_auto]',
                          ].join(' ')}
                        >
                          <Input
                            value={item.label}
                            onChange={(e) => updateItem(block.id, item.id, { label: e.target.value })}
                            placeholder="Text de la pregunta/item"
                          />
                          <select
                            value={item.type}
                            onChange={(e) =>
                              updateItem(block.id, item.id, {
                                type:
                                  e.target.value === 'rating' || e.target.value === 'photo'
                                    ? e.target.value
                                    : 'checklist',
                              })
                            }
                            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                          >
                            {ITEM_TYPES.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {(block.itemWeightMode || DEFAULT_ITEM_WEIGHT_MODE) === 'manual' ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={String(item.weight ?? 0)}
                              onChange={(e) =>
                                updateItem(block.id, item.id, { weight: Number(e.target.value || 0) })
                              }
                              placeholder="% item"
                            />
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Eliminar item"
                            aria-label="Eliminar item"
                            onClick={() => removeItem(block.id, item.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Afegir item"
                        aria-label="Afegir item"
                        onClick={() => addItem(block.id)}
                        className="text-gray-700"
                      >
                        <Plus className="w-5 h-5" />
                      </Button>
                      <span className="text-xs text-slate-600">Nou item</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Afegir bloc"
                  aria-label="Afegir bloc"
                  onClick={addBlock}
                  className="text-gray-700"
                >
                  <Plus className="w-5 h-5" />
                </Button>
                <span className="text-xs text-slate-600">Nou bloc</span>
              </div>
            </>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
          {saveOk && <div className="text-sm text-emerald-700">{saveOk}</div>}
        </Card>
      </div>
    </RoleGuard>
  )
}
