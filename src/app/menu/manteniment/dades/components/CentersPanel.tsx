'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { typography } from '@/lib/typography'
import { combineTravelParts, splitTravelMinutes } from '@/lib/maintenanceCenterTravel'
import type { CenterRow } from '../types'

type TravelDraft = { hours: string; minutes: string }

type CentersPanelProps = {
  centers: CenterRow[]
  allCentersForCounts: CenterRow[]
  loading: boolean
  tipusFilter: 'all' | 'propi' | 'extern'
  onTipusFilterChange: (value: 'all' | 'propi' | 'extern') => void
  onSaved: (id: string, travelMinutes: number) => void
}

function draftFromMinutes(total: number): TravelDraft {
  const { hours, minutes } = splitTravelMinutes(total)
  return { hours: String(hours), minutes: String(minutes) }
}

export default function CentersPanel({
  centers,
  allCentersForCounts,
  loading,
  tipusFilter,
  onTipusFilterChange,
  onSaved,
}: CentersPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, TravelDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, TravelDraft> = {}
    for (const row of centers) {
      next[row.id] = draftFromMinutes(row.travelMinutes)
    }
    setDrafts(next)
  }, [centers])

  const tipusCounts = useMemo(() => {
    const propi = allCentersForCounts.filter((c) => c.tipus === 'propi').length
    const extern = allCentersForCounts.filter((c) => c.tipus === 'extern').length
    return { all: allCentersForCounts.length, propi, extern }
  }, [allCentersForCounts])

  const saveRow = useCallback(
    async (row: CenterRow) => {
      const draft = drafts[row.id] ?? draftFromMinutes(row.travelMinutes)
      const travelMinutes = combineTravelParts(Number(draft.hours), Number(draft.minutes))
      const previous = row.travelMinutes
      if (travelMinutes === previous) return

      setSavingId(row.id)
      setErrorById((prev) => {
        const copy = { ...prev }
        delete copy[row.id]
        return copy
      })

      try {
        const res = await fetch(`/api/maintenance/data/centers/${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            travelHours: Number(draft.hours) || 0,
            travelMinutesPart: Number(draft.minutes) || 0,
          }),
        })
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(json.error || 'No s ha pogut desar')
        }
        onSaved(row.id, travelMinutes)
      } catch (err) {
        setErrorById((prev) => ({
          ...prev,
          [row.id]: err instanceof Error ? err.message : 'Error desant',
        }))
        setDrafts((prev) => ({ ...prev, [row.id]: draftFromMinutes(previous) }))
      } finally {
        setSavingId(null)
      }
    },
    [drafts, onSaved]
  )

  const updateDraft = (id: string, patch: Partial<TravelDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { hours: '0', minutes: '0' }), ...patch },
    }))
  }

  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={typography('sectionTitle')}>Centres (finques)</div>
          <p className="mt-1 text-sm text-slate-500">
            Temps de desplaçament anada des de la base. Els informes poden sumar-lo a la durada
            registrada al tancar un ticket (anada + tornada).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                tipusFilter === chip.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Centre</th>
              <th className="px-3 py-2">Codi</th>
              <th className="px-3 py-2">Tipus</th>
              <th className="px-3 py-2">Temps desplaçament (anada)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-slate-500">
                  Carregant centres...
                </td>
              </tr>
            ) : centers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-slate-500">
                  Cap centre coincideix amb els filtres.
                </td>
              </tr>
            ) : (
              centers.map((row) => {
                const draft = drafts[row.id] ?? draftFromMinutes(row.travelMinutes)
                const isSaving = savingId === row.id
                const err = errorById[row.id]
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-3 py-3 text-slate-600">{row.code || '—'}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.tipus === 'propi'
                            ? 'bg-emerald-50 text-emerald-800'
                            : row.tipus === 'extern'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {row.tipus === 'propi'
                          ? 'Propi'
                          : row.tipus === 'extern'
                            ? 'Extern'
                            : row.tipus}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-slate-600">
                          <input
                            type="number"
                            min={0}
                            max={99}
                            inputMode="numeric"
                            disabled={isSaving}
                            value={draft.hours}
                            onChange={(e) => updateDraft(row.id, { hours: e.target.value })}
                            onBlur={() => void saveRow(row)}
                            className="h-9 w-14 rounded-lg border border-slate-200 px-2 text-center"
                            aria-label={`Hores desplaçament ${row.name}`}
                          />
                          <span className="text-xs">h</span>
                        </label>
                        <label className="flex items-center gap-1 text-slate-600">
                          <input
                            type="number"
                            min={0}
                            max={59}
                            inputMode="numeric"
                            disabled={isSaving}
                            value={draft.minutes}
                            onChange={(e) => updateDraft(row.id, { minutes: e.target.value })}
                            onBlur={() => void saveRow(row)}
                            className="h-9 w-14 rounded-lg border border-slate-200 px-2 text-center"
                            aria-label={`Minuts desplaçament ${row.name}`}
                          />
                          <span className="text-xs">min</span>
                        </label>
                        {isSaving ? (
                          <span className="text-xs text-slate-400">Desant...</span>
                        ) : null}
                        {err ? <span className="text-xs text-rose-600">{err}</span> : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
