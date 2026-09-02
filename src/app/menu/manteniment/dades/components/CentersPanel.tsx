'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Save, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconActionButton } from '@/lib/iconActionButton'
import {
  corporateFilterBadgeClass,
  corporateFilterFieldClass,
  corporateFilterLabelClass,
} from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'
import { combineTravelParts, splitTravelMinutes } from '@/lib/maintenanceCenterTravel'
import type { CenterLocationNode, CenterRow } from '../types'

type EditableLocationNode = { name: string; zones: string[] }
type CenterForm = {
  name: string
  code: string
  tipus: 'propi' | 'extern'
  hours: string
  minutes: string
}

type CentersPanelProps = {
  centers: CenterRow[]
  allCentersForCounts: CenterRow[]
  loading: boolean
  tipusFilter: 'all' | 'propi' | 'extern'
  onTipusFilterChange: (value: 'all' | 'propi' | 'extern') => void
  onSaved: (
    id: string,
    patch: {
      travelMinutes: number
      internalLocations?: string[]
      locationNodes?: CenterLocationNode[]
      name?: string
      code?: string
      tipus?: string
      deleted?: boolean
      created?: CenterRow
    }
  ) => void
}

function buildCenterForm(row: CenterRow): CenterForm {
  const travel = splitTravelMinutes(row.travelMinutes)
  return {
    name: row.name || '',
    code: row.code || '',
    tipus: row.tipus === 'extern' ? 'extern' : 'propi',
    hours: String(travel.hours),
    minutes: String(travel.minutes),
  }
}

function buildLocationDraft(row: CenterRow): EditableLocationNode[] {
  const source =
    row.locationNodes?.length
      ? row.locationNodes
      : (row.internalLocations || []).map((name) => ({ name, zones: [] }))

  return source.map((item) => ({
    name: String(item.name || ''),
    zones: Array.isArray(item.zones) ? item.zones.map((zone) => String(zone || '')) : [],
  }))
}

function normalizeNodeKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function normalizeLocationDraft(nodes: EditableLocationNode[]): CenterLocationNode[] {
  const unique = new Map<string, CenterLocationNode>()

  for (const node of nodes) {
    const name = String(node.name || '').trim()
    const key = normalizeNodeKey(name)
    if (!name || !key || unique.has(key)) continue

    const zonesUnique = new Map<string, string>()
    for (const zoneValue of node.zones || []) {
      const zone = String(zoneValue || '').trim()
      const zoneKey = normalizeNodeKey(zone)
      if (!zone || !zoneKey || zonesUnique.has(zoneKey)) continue
      zonesUnique.set(zoneKey, zone)
    }

    unique.set(key, {
      name,
      zones: [...zonesUnique.values()].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' })),
    })
  }

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
}

function flattenLocationNames(nodes: CenterLocationNode[]): string[] {
  return nodes.map((item) => item.name)
}

export default function CentersPanel({
  centers,
  allCentersForCounts,
  loading,
  tipusFilter,
  onTipusFilterChange,
  onSaved,
}: CentersPanelProps) {
  const [expandedCenterId, setExpandedCenterId] = useState<string | null>(null)
  const [centerForms, setCenterForms] = useState<Record<string, CenterForm>>({})
  const [locationDrafts, setLocationDrafts] = useState<Record<string, EditableLocationNode[]>>({})
  const [selectedLocationIndexByCenter, setSelectedLocationIndexByCenter] = useState<Record<string, number>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [createForm, setCreateForm] = useState<CenterForm>({
    name: '',
    code: '',
    tipus: 'propi',
    hours: '0',
    minutes: '0',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    const nextForms: Record<string, CenterForm> = {}
    const nextLocations: Record<string, EditableLocationNode[]> = {}
    for (const row of centers) {
      nextForms[row.id] = buildCenterForm(row)
      nextLocations[row.id] = buildLocationDraft(row)
    }
    setCenterForms(nextForms)
    setLocationDrafts(nextLocations)
  }, [centers])

  useEffect(() => {
    if (expandedCenterId && centers.some((row) => row.id === expandedCenterId)) return
    setExpandedCenterId(null)
  }, [centers, expandedCenterId])

  const tipusCounts = useMemo(() => {
    const propi = allCentersForCounts.filter((c) => c.tipus === 'propi').length
    const extern = allCentersForCounts.filter((c) => c.tipus === 'extern').length
    return { all: allCentersForCounts.length, propi, extern }
  }, [allCentersForCounts])

  const clearRowError = useCallback((id: string) => {
    setErrorById((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }, [])

  const updateCenterForm = (id: string, patch: Partial<CenterForm>) => {
    setCenterForms((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || buildCenterForm(centers.find((row) => row.id === id) as CenterRow)), ...patch },
    }))
  }

  const setSelectedLocationIndex = (centerId: string, index: number) => {
    setSelectedLocationIndexByCenter((prev) => ({ ...prev, [centerId]: index }))
  }

  const addLocation = (centerId: string) => {
    setLocationDrafts((prev) => {
      const next = [...(prev[centerId] || []), { name: '', zones: [] }]
      setSelectedLocationIndex(centerId, next.length - 1)
      return { ...prev, [centerId]: next }
    })
  }

  const updateLocationName = (centerId: string, index: number, value: string) => {
    setLocationDrafts((prev) => ({
      ...prev,
      [centerId]: (prev[centerId] || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, name: value } : item
      ),
    }))
  }

  const removeLocation = (centerId: string, index: number) => {
    setLocationDrafts((prev) => ({
      ...prev,
      [centerId]: (prev[centerId] || []).filter((_, itemIndex) => itemIndex !== index),
    }))
    setSelectedLocationIndexByCenter((prev) => ({ ...prev, [centerId]: Math.max(0, index - 1) }))
  }

  const addZone = (centerId: string, locationIndex: number) => {
    setLocationDrafts((prev) => ({
      ...prev,
      [centerId]: (prev[centerId] || []).map((item, itemIndex) =>
        itemIndex === locationIndex ? { ...item, zones: [...item.zones, ''] } : item
      ),
    }))
  }

  const updateZone = (centerId: string, locationIndex: number, zoneIndex: number, value: string) => {
    setLocationDrafts((prev) => ({
      ...prev,
      [centerId]: (prev[centerId] || []).map((item, itemIndex) =>
        itemIndex === locationIndex
          ? {
              ...item,
              zones: item.zones.map((zone, currentZoneIndex) =>
                currentZoneIndex === zoneIndex ? value : zone
              ),
            }
          : item
      ),
    }))
  }

  const removeZone = (centerId: string, locationIndex: number, zoneIndex: number) => {
    setLocationDrafts((prev) => ({
      ...prev,
      [centerId]: (prev[centerId] || []).map((item, itemIndex) =>
        itemIndex === locationIndex
          ? { ...item, zones: item.zones.filter((_, currentZoneIndex) => currentZoneIndex !== zoneIndex) }
          : item
      ),
    }))
  }

  const saveCenter = useCallback(
    async (row: CenterRow) => {
      const form = centerForms[row.id] || buildCenterForm(row)
      const locationNodes = normalizeLocationDraft(locationDrafts[row.id] || [])
      const travelMinutes = combineTravelParts(Number(form.hours), Number(form.minutes))

      setSavingId(row.id)
      clearRowError(row.id)

      try {
        const res = await fetch(`/api/maintenance/data/centers/${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            code: form.code,
            tipus: form.tipus,
            travelHours: Number(form.hours) || 0,
            travelMinutesPart: Number(form.minutes) || 0,
            locationNodes,
          }),
        })

        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(json.error || 'No s ha pogut desar el centre')
        }

        onSaved(row.id, {
          travelMinutes,
          internalLocations: flattenLocationNames(locationNodes),
          locationNodes,
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          tipus: form.tipus,
        })
      } catch (err) {
        setErrorById((prev) => ({
          ...prev,
          [row.id]: err instanceof Error ? err.message : 'Error desant centre',
        }))
      } finally {
        setSavingId(null)
      }
    },
    [centerForms, clearRowError, locationDrafts, onSaved]
  )

  const createCenter = useCallback(async () => {
    setCreating(true)
    setCreateError(null)

    try {
      const travelMinutes = combineTravelParts(Number(createForm.hours), Number(createForm.minutes))
      const res = await fetch('/api/maintenance/data/centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          code: createForm.code,
          tipus: createForm.tipus,
          travelMinutes,
          locationNodes: [],
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        center?: CenterRow
      }

      if (!res.ok || !json.center) {
        throw new Error(json.error || 'No s ha pogut crear el centre')
      }

      onSaved(json.center.id, {
        travelMinutes: json.center.travelMinutes,
        created: json.center,
      })
      setExpandedCenterId(json.center.id)
      setShowCreateCard(false)
      setCreateForm({ name: '', code: '', tipus: 'propi', hours: '0', minutes: '0' })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error creant centre')
    } finally {
      setCreating(false)
    }
  }, [createForm, onSaved])

  const deleteCenter = useCallback(
    async (row: CenterRow) => {
      const confirmDelete = window.confirm(`Vols eliminar el centre "${row.name}"?`)
      if (!confirmDelete) return

      setSavingId(row.id)
      clearRowError(row.id)

      try {
        const res = await fetch(`/api/maintenance/data/centers/${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          throw new Error(json.error || 'No s ha pogut eliminar el centre')
        }
        onSaved(row.id, { travelMinutes: row.travelMinutes, deleted: true })
        if (expandedCenterId === row.id) setExpandedCenterId(null)
      } catch (err) {
        setErrorById((prev) => ({
          ...prev,
          [row.id]: err instanceof Error ? err.message : 'Error eliminant centre',
        }))
      } finally {
        setSavingId(null)
      }
    },
    [clearRowError, expandedCenterId, onSaved]
  )

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800">Centres</div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'all' as const, label: `Tots (${tipusCounts.all})` },
              { key: 'propi' as const, label: `Propis (${tipusCounts.propi})` },
              { key: 'extern' as const, label: `Externs (${tipusCounts.extern})` },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onTipusFilterChange(chip.key)}
              className={corporateFilterBadgeClass(tipusFilter === chip.key)}
            >
              {chip.label}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setShowCreateCard((prev) => !prev)}
          >
            <Plus className="h-4 w-4" />
            Nou centre
          </Button>
        </div>
      </div>

      {showCreateCard ? (
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <label className={corporateFilterLabelClass}>Nom</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              />
            </div>
            <div>
              <label className={corporateFilterLabelClass}>Codi</label>
              <input
                value={createForm.code}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              />
            </div>
            <div>
              <label className={corporateFilterLabelClass}>Tipus</label>
              <select
                value={createForm.tipus}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    tipus: e.target.value === 'extern' ? 'extern' : 'propi',
                  }))
                }
                className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              >
                <option value="propi">Propi</option>
                <option value="extern">Extern</option>
              </select>
            </div>
            <div>
              <label className={corporateFilterLabelClass}>Desplacament</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={createForm.hours}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, hours: e.target.value }))}
                  className={cn(corporateFilterFieldClass, 'w-20 px-2 text-center')}
                />
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={createForm.minutes}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, minutes: e.target.value }))}
                  className={cn(corporateFilterFieldClass, 'w-20 px-2 text-center')}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" className="gap-2" disabled={creating} onClick={() => void createCenter()}>
              <Save className="h-4 w-4" />
              {creating ? 'Creant...' : 'Crear centre'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreateCard(false)}>
              Cancel·lar
            </Button>
            {createError ? <span className="text-sm text-rose-600">{createError}</span> : null}
          </div>
        </article>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 xl:col-span-4 md:col-span-2">
            Carregant centres...
          </div>
        ) : centers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 xl:col-span-4 md:col-span-2">
            Cap centre coincideix amb els filtres.
          </div>
        ) : (
          centers.map((row) => {
            const form = centerForms[row.id] || buildCenterForm(row)
            const locations = locationDrafts[row.id] || []
            const isOpen = expandedCenterId === row.id
            const saving = savingId === row.id
            const selectedLocationIndex = selectedLocationIndexByCenter[row.id] ?? 0
            const selectedLocation = locations[selectedLocationIndex] || null
            const zoneCount = locations.reduce((total, item) => total + item.zones.length, 0)

            return (
              <article
                key={row.id}
                className={cn(
                  'overflow-hidden rounded-2xl border border-slate-200 bg-white',
                  isOpen ? 'md:col-span-2 xl:col-span-4' : ''
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedCenterId((prev) => (prev === row.id ? null : row.id))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">{row.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={corporateFilterBadgeClass(true)}>
                          {row.tipus === 'extern' ? 'Extern' : 'Propi'}
                        </span>
                        {row.code ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                            {row.code}
                          </span>
                        ) : null}
                        <span className="text-sm text-slate-500">
                          {locations.length} ubic. · {zoneCount} zones · {row.travelMinutes} min
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    <IconActionButton
                      icon={Pencil}
                      label="Editar centre"
                      onClick={() => setExpandedCenterId((prev) => (prev === row.id ? null : row.id))}
                    />
                    <IconActionButton
                      icon={Trash2}
                      label="Eliminar centre"
                      tone="danger"
                      disabled={saving}
                      onClick={() => void deleteCenter(row)}
                    />
                  </div>
                </div>

                {isOpen ? (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="xl:col-span-2">
                            <label className={corporateFilterLabelClass}>Nom</label>
                            <input
                              value={form.name}
                              onChange={(e) => updateCenterForm(row.id, { name: e.target.value })}
                              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
                            />
                          </div>
                          <div>
                            <label className={corporateFilterLabelClass}>Codi</label>
                            <input
                              value={form.code}
                              onChange={(e) => updateCenterForm(row.id, { code: e.target.value.toUpperCase() })}
                              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
                            />
                          </div>
                          <div>
                            <label className={corporateFilterLabelClass}>Tipus</label>
                            <select
                              value={form.tipus}
                              onChange={(e) =>
                                updateCenterForm(row.id, {
                                  tipus: e.target.value === 'extern' ? 'extern' : 'propi',
                                })
                              }
                              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
                            >
                              <option value="propi">Propi</option>
                              <option value="extern">Extern</option>
                            </select>
                          </div>
                          <div>
                            <label className={corporateFilterLabelClass}>Hores</label>
                            <input
                              type="number"
                              min={0}
                              max={99}
                              value={form.hours}
                              onChange={(e) => updateCenterForm(row.id, { hours: e.target.value })}
                              className={cn(corporateFilterFieldClass, 'mt-1 w-full px-2 text-center')}
                            />
                          </div>
                          <div>
                            <label className={corporateFilterLabelClass}>Minuts</label>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              value={form.minutes}
                              onChange={(e) => updateCenterForm(row.id, { minutes: e.target.value })}
                              className={cn(corporateFilterFieldClass, 'mt-1 w-full px-2 text-center')}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <span className={corporateFilterLabelClass}>Ubicacions</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => addLocation(row.id)}
                            >
                              <Plus className="h-4 w-4" />
                              Afegir ubicacio
                            </Button>
                          </div>

                          {locations.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500">
                              Sense ubicacions
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {locations.map((location, index) => {
                                const active = index === selectedLocationIndex
                                return (
                                  <button
                                    key={`${row.id}-location-${index}`}
                                    type="button"
                                    onClick={() => setSelectedLocationIndex(row.id, index)}
                                    className={cn(
                                      'flex items-center gap-2 rounded-full border px-3 py-2 text-sm',
                                      active
                                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                                        : 'border-slate-200 bg-white text-slate-700'
                                    )}
                                  >
                                    <span>{location.name || 'Nova ubicacio'}</span>
                                    <span className="text-xs text-slate-500">{location.zones.length}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span className={corporateFilterLabelClass}>Ubicacio</span>
                            {selectedLocation ? (
                              <IconActionButton
                                icon={Trash2}
                                label="Eliminar ubicacio"
                                tone="danger"
                                onClick={() => removeLocation(row.id, selectedLocationIndex)}
                              />
                            ) : null}
                          </div>

                          {selectedLocation ? (
                            <div className="space-y-3">
                              <input
                                value={selectedLocation.name}
                                onChange={(e) =>
                                  updateLocationName(row.id, selectedLocationIndex, e.target.value)
                                }
                                className={cn(corporateFilterFieldClass, 'w-full')}
                              />

                              <div className="flex items-center justify-between gap-2">
                                <span className={corporateFilterLabelClass}>Zones</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => addZone(row.id, selectedLocationIndex)}
                                >
                                  <Plus className="h-4 w-4" />
                                  Afegir zona
                                </Button>
                              </div>

                              {selectedLocation.zones.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500">
                                  Sense zones
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {selectedLocation.zones.map((zone, zoneIndex) => (
                                    <div
                                      key={`${row.id}-zone-${zoneIndex}`}
                                      className="flex items-center gap-2"
                                    >
                                      <input
                                        value={zone}
                                        onChange={(e) =>
                                          updateZone(row.id, selectedLocationIndex, zoneIndex, e.target.value)
                                        }
                                        className={cn(corporateFilterFieldClass, 'flex-1')}
                                      />
                                      <IconActionButton
                                        icon={Trash2}
                                        label="Eliminar zona"
                                        tone="danger"
                                        onClick={() => removeZone(row.id, selectedLocationIndex, zoneIndex)}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500">
                              Selecciona una ubicacio
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="primary"
                            className="gap-2"
                            disabled={saving}
                            onClick={() => void saveCenter(row)}
                          >
                            <Save className="h-4 w-4" />
                            {saving ? 'Desant...' : 'Desar'}
                          </Button>
                          {errorById[row.id] ? (
                            <span className="text-sm text-rose-600">{errorById[row.id]}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
