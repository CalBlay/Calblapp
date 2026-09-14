'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultServiceCostConfig } from '@/lib/costServeis/defaults'
import {
  COST_SERVEIS_DEPARTMENTS,
  COST_SERVEIS_DEPT_LABELS,
  type ServiceCostConfig,
} from '@/lib/costServeis/types'
import type { ServeiWeightRow } from '@/lib/costServeis/serveiWeights'
import { SPACE_KIND_LABELS, type SpaceKind } from '@/lib/costServeis/spaceOwnership'
import { SpaceKindBadge } from '../SpaceKindBadge'
import { TRANSPORT_TYPE_OPTIONS } from '@/lib/transportTypes'
import { cn } from '@/lib/utils'
import { MonthlyDataTab } from './MonthlyDataTab'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TabId = 'general' | 'dades'

function currentMonthRange() {
  const now = new Date()
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

export default function CostServeisConfigPage() {
  const [tab, setTab] = useState<TabId>('general')

  return (
    <div className="w-full space-y-6 pb-24">
      <ModuleHeader
        title="Configuració"
        subtitle="Tarifes operatives i dades mensuals de cost per esdeveniment i pax"
      />

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            { id: 'general' as const, label: 'General' },
            { id: 'dades' as const, label: 'Dades mensuals' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-cyan-600 text-cyan-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' ? <GeneralConfigTab /> : <MonthlyDataTab />}
    </div>
  )
}

function GeneralConfigTab() {
  const { data, mutate, isLoading } = useSWR('/api/cost-serveis/config', fetcher)
  const [config, setConfig] = useState<ServiceCostConfig>(defaultServiceCostConfig())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (data?.config) setConfig(data.config)
  }, [data])

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/cost-serveis/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Error desant')
      setConfig(json.config)
      await mutate({ config: json.config }, false)
      setMessage('Configuració desada.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading && !data) {
    return <p className="text-sm text-slate-500">Carregant…</p>
  }

  return (
    <div className="w-full space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Preu hora (€/h)</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:max-w-4xl">
          {COST_SERVEIS_DEPARTMENTS.map((dept) => (
            <label key={dept} className="block text-xs text-slate-600">
              {COST_SERVEIS_DEPT_LABELS[dept]}
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={config.hourlyRates[dept]}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    hourlyRates: {
                      ...c.hourlyRates,
                      [dept]: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Punts de sortida (km)</h2>
        {COST_SERVEIS_DEPARTMENTS.map((dept) => (
          <div key={dept} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-700">
              {COST_SERVEIS_DEPT_LABELS[dept]}
            </div>
            <Input
              placeholder="Etiqueta"
              value={config.departures[dept].label}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  departures: {
                    ...c.departures,
                    [dept]: { ...c.departures[dept], label: e.target.value },
                  },
                }))
              }
            />
            <Input
              placeholder="Adreça"
              value={config.departures[dept].address}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  departures: {
                    ...c.departures,
                    [dept]: { ...c.departures[dept], address: e.target.value },
                  },
                }))
              }
            />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Combustible per tipus de vehicle
          </h2>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={config.fuel.roundTripDefault}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  fuel: { ...c.fuel, roundTripDefault: e.target.checked },
                }))
              }
            />
            Anada + tornada per defecte
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Tipus definits al mòdul Transports. Cada tipus té el seu consum (L/100 km) i preu (€/L).
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tipus</th>
                <th className="px-3 py-2">L / 100 km</th>
                <th className="px-3 py-2">€ / litre</th>
              </tr>
            </thead>
            <tbody>
              {TRANSPORT_TYPE_OPTIONS.map((opt) => {
                const row = config.fuel.byVehicleType[opt.value] || {
                  litersPer100km: 12,
                  pricePerLiter: 1.47,
                }
                return (
                  <tr key={opt.value} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{opt.label}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.1"
                        value={row.litersPer100km}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            fuel: {
                              ...c.fuel,
                              byVehicleType: {
                                ...c.fuel.byVehicleType,
                                [opt.value]: {
                                  ...row,
                                  litersPer100km: Number(e.target.value) || 0,
                                },
                              },
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={row.pricePerLiter}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            fuel: {
                              ...c.fuel,
                              byVehicleType: {
                                ...c.fuel.byVehicleType,
                                [opt.value]: {
                                  ...row,
                                  pricePerLiter: Number(e.target.value) || 0,
                                },
                              },
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Desant…' : 'Desar configuració'}
        </Button>
        {message ? <span className="text-sm text-slate-600">{message}</span> : null}
      </div>
    </div>
  )
}

/** @deprecated Conservat temporalment per poder consultar la configuració històrica. */
export function LegacyPonderacioTab() {
  const range0 = useMemo(() => currentMonthRange(), [])
  const [dept, setDept] = useState<'logistica' | 'cuina' | 'all'>('logistica')
  const [spaceFilter, setSpaceFilter] = useState<'all' | SpaceKind>('all')
  /** Per defecte no es mostren els inactius. */
  const [showInactive, setShowInactive] = useState(false)
  const [from, setFrom] = useState(range0.from)
  const [to, setTo] = useState(range0.to)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR(
    `/api/cost-serveis/ponderacio?dept=${dept}`,
    fetcher
  )
  const rows = useMemo(() => {
    let all = (data?.rows || []) as ServeiWeightRow[]
    if (!showInactive) all = all.filter((r) => r.active !== false)
    if (spaceFilter !== 'all') all = all.filter((r) => r.spaceKind === spaceFilter)
    return all
  }, [data?.rows, spaceFilter, showInactive])

  const syncFromEdicio = async () => {
    setSyncing(true)
    setMsg('')
    try {
      const res = await fetch(
        `/api/cost-serveis/ponderacio?from=${from}&to=${to}`,
        { method: 'POST' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      await mutate()
      setMsg(
        `Sync: ${json.uniquePairs ?? json.uniqueTypes ?? 0} combinacions · +${json.createdServeis ?? 0} al catàleg · +${json.createdWeightRows ?? 0} files noves`
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSyncing(false)
    }
  }

  const saveRow = async (row: ServeiWeightRow) => {
    setSavingId(row.id)
    setMsg('')
    try {
      const res = await fetch('/api/cost-serveis/ponderacio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          dept: row.dept,
          gestio: row.gestio,
          preparacio: row.preparacio,
          rentat: row.rentat,
          active: row.active,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Error desant')
      await mutate()
      setMsg(
        `Pesos desats: ${row.serveiNom} · ${SPACE_KIND_LABELS[row.spaceKind]} (${COST_SERVEIS_DEPT_LABELS[row.dept]})`
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingId(null)
    }
  }

  const toggleActive = async (row: ServeiWeightRow) => {
    setSavingId(row.id)
    setMsg('')
    try {
      const nextActive = row.active === false
      const res = await fetch('/api/cost-serveis/ponderacio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          dept: row.dept,
          active: nextActive,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Error desant')
      await mutate()
      setMsg(
        nextActive
          ? `Activat: ${row.serveiNom}`
          : `Inactivat: ${row.serveiNom}`
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="w-full space-y-6">
      <p className="max-w-4xl text-sm text-slate-600">
        Es creen només les combinacions <strong>servei × espai</strong> que surten a
        Edició (coma = diversos tipus). Si el mateix servei després apareix en l’altre
        tipus d’espai, s’afegeix aleshores. Logística i Cuina es guarden en col·leccions
        separades; un cop creat no es trepitja. Prep/rentat × pax; 2+ tipus → suma de
        coeficients.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-slate-600">
            Departament
            <select
              className="mt-1 block h-9 rounded-md border border-slate-200 px-2 text-sm"
              value={dept}
              onChange={(e) => setDept(e.target.value as typeof dept)}
            >
              <option value="logistica">Logística</option>
              <option value="cuina">Cuina</option>
              <option value="all">Tots</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Espai
            <select
              className="mt-1 block h-9 rounded-md border border-slate-200 px-2 text-sm"
              value={spaceFilter}
              onChange={(e) => setSpaceFilter(e.target.value as typeof spaceFilter)}
            >
              <option value="all">Tots</option>
              <option value="Propi">{SPACE_KIND_LABELS.Propi}</option>
              <option value="Extern">{SPACE_KIND_LABELS.Extern}</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-end gap-2 pb-1 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span>Mostrar inactius</span>
          </label>
          <label className="text-xs text-slate-600">
            Des de
            <Input
              type="date"
              className="mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Fins a
            <Input
              type="date"
              className="mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <Button onClick={() => void syncFromEdicio()} disabled={syncing}>
          {syncing ? 'Sincronitzant…' : 'Carregar tipus des d’Edició'}
        </Button>
      </div>

      {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {showInactive
            ? 'Encara no hi ha files. Tria un període i clica «Carregar tipus des d’Edició».'
            : 'Cap servei actiu amb aquests filtres. Activa «Mostrar inactius» o carrega tipus des d’Edició.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tipus de servei</th>
                <th className="px-3 py-2">Espai</th>
                <th className="px-3 py-2">Dept</th>
                <th className="px-3 py-2">Gestió</th>
                <th className="px-3 py-2">Preparació</th>
                <th className="px-3 py-2">Rentat</th>
                <th className="px-3 py-2 text-center" title="Servei actiu al càlcul i a la llista">
                  Actiu
                </th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <PonderacioRow
                  key={row.id}
                  row={row}
                  busy={savingId === row.id}
                  onSave={saveRow}
                  onToggleActive={toggleActive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PonderacioRow({
  row,
  busy,
  onSave,
  onToggleActive,
}: {
  row: ServeiWeightRow
  busy: boolean
  onSave: (row: ServeiWeightRow) => void
  onToggleActive: (row: ServeiWeightRow) => void
}) {
  const [gestio, setGestio] = useState(row.gestio)
  const [preparacio, setPreparacio] = useState(row.preparacio)
  const [rentat, setRentat] = useState(row.rentat)

  useEffect(() => {
    setGestio(row.gestio)
    setPreparacio(row.preparacio)
    setRentat(row.rentat)
  }, [row.gestio, row.preparacio, row.rentat, row.id])

  const dirty =
    gestio !== row.gestio || preparacio !== row.preparacio || rentat !== row.rentat
  const isActive = row.active !== false

  return (
    <tr
      className={cn(
        'border-t border-slate-100',
        !isActive && 'bg-slate-50/80 text-slate-500'
      )}
    >
      <td className="px-3 py-2">
        <div className={cn('font-medium', isActive ? 'text-slate-900' : 'text-slate-500')}>
          {row.serveiNom}
        </div>
        <div className="font-mono text-[11px] text-slate-400">{row.serveiCodi}</div>
      </td>
      <td className="px-3 py-2">
        <SpaceKindBadge kind={row.spaceKind} compact />
      </td>
      <td className="px-3 py-2 text-slate-700">
        {COST_SERVEIS_DEPT_LABELS[row.dept]}
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.1"
          min={0}
          className="h-9 w-24"
          value={gestio}
          disabled={!isActive}
          onChange={(e) => setGestio(Number(e.target.value) || 0)}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.1"
          min={0}
          className="h-9 w-24"
          value={preparacio}
          disabled={!isActive}
          onChange={(e) => setPreparacio(Number(e.target.value) || 0)}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.1"
          min={0}
          className="h-9 w-24"
          value={rentat}
          disabled={!isActive}
          onChange={(e) => setRentat(Number(e.target.value) || 0)}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={isActive}
          disabled={busy}
          title={isActive ? 'Actiu — desmarca per inactivar' : 'Inactiu — marca per activar'}
          onChange={() => onToggleActive(row)}
        />
      </td>
      <td className="px-3 py-2 text-right">
        {dirty && isActive ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              onSave({ ...row, gestio, preparacio, rentat })
            }
          >
            {busy ? '…' : 'Desar'}
          </Button>
        ) : null}
      </td>
    </tr>
  )
}
