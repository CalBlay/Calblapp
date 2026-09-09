'use client'

/**
 * PE comercial — 3 camps enllaçats (PE = 0).
 * Filtres: LN → Centre → Servei (només actius).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  corporateFilterFieldClass,
  corporateFilterLabelClass,
} from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'
import {
  SPACE_KIND_LABELS,
  type SpaceKind,
} from '@/lib/costServeis/spaceOwnership'
import {
  PE_CALCULATION_VERSION,
  type PeBucketDoc,
  type PeLookupResponse,
} from '@/lib/costServeis/peBucketTypes'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function fmtEuro(n: number) {
  return n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  })
}

function fmtPct(n: number) {
  return `${(n * 100).toLocaleString('ca-ES', { maximumFractionDigits: 2 })}%`
}

function margePerPax(
  preu: number,
  cvOp: number,
  pctCompres: number,
  pctGestio: number
): number {
  return preu - (cvOp + preu * (pctCompres + pctGestio))
}

function paxAtPe(
  preu: number,
  fixos: number,
  cvOp: number,
  pctCompres: number,
  pctGestio: number
): number | null {
  if (!(preu > 0) || !(fixos > 0)) return null
  const m = margePerPax(preu, cvOp, pctCompres, pctGestio)
  if (!(m > 0)) return null
  return round2(fixos / m)
}

function preuAtPe(
  pax: number,
  fixos: number,
  cvOp: number,
  pctCompres: number,
  pctGestio: number
): number | null {
  if (!(pax > 0) || !(fixos > 0)) return null
  const denom = 1 - pctCompres - pctGestio
  if (!(denom > 0)) return null
  return round2((fixos / pax + cvOp) / denom)
}

type Costs = {
  cvOp: number
  pctCompres: number
  pctGestio: number
  fixDirecte: number
  fixIndirecte: number
  fixos: number
}
type Fields = { preu: number; pax: number; facturacio: number }

function solveFromPreu(preu: number, c: Costs): Fields | null {
  const pax = paxAtPe(preu, c.fixos, c.cvOp, c.pctCompres, c.pctGestio)
  if (pax == null) return null
  return { preu: round2(preu), pax, facturacio: round2(preu * pax) }
}

function solveFromPax(pax: number, c: Costs): Fields | null {
  const preu = preuAtPe(
    pax,
    c.fixos,
    c.cvOp,
    c.pctCompres,
    c.pctGestio
  )
  if (preu == null) return null
  return { preu, pax: round2(pax), facturacio: round2(preu * pax) }
}

function solveFromFact(
  fact: number,
  c: Costs,
  preuHint: number
): Fields | null {
  if (!(fact > 0) || !(c.fixos > 0)) return null
  const mc = c.fixos / fact
  const denom = 1 - c.pctCompres - c.pctGestio - mc
  if (!(denom > 0) || !(mc > 0 && mc < 1)) {
    if (!(preuHint > 0)) return null
    return solveFromPax(round2(fact / preuHint), c)
  }
  const preu = round2(c.cvOp / denom)
  const pax = round2(fact / preu)
  return { preu, pax, facturacio: round2(fact) }
}

function initFromBucket(b: PeBucketDoc): {
  costs: Costs
  fields: Fields | null
} {
  const costs: Costs = {
    cvOp: Math.max(0, b.cvOperatiuPerPax ?? 0),
    pctCompres: Math.max(0, b.pctCompres ?? 0),
    pctGestio: Math.max(0, b.pctGestio ?? 0),
    fixDirecte: Math.max(0, b.fixDirecte ?? 0),
    fixIndirecte: Math.max(0, b.fixIndirecte ?? 0),
    fixos: Math.max(0, b.fixos ?? 0),
  }
  const preuSeed = b.preuMitjaPax && b.preuMitjaPax > 0 ? b.preuMitjaPax : 0
  const fields = preuSeed > 0 ? solveFromPreu(preuSeed, costs) : null
  return { costs, fields }
}

export default function PeTab({ year }: { year: number }) {
  const [ln, setLn] = useState('')
  const [spaceKind, setSpaceKind] = useState<SpaceKind | ''>('')
  const [serviceType, setServiceType] = useState('')
  const [recomputing, setRecomputing] = useState(false)

  const [costs, setCosts] = useState<Costs | null>(null)
  const [fields, setFields] = useState<Fields | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const seedRef = useRef('')

  // Cascade: always fetch options with current LN / centre
  const optionsUrl = useMemo(() => {
    const p = new URLSearchParams({ year: String(year) })
    if (ln) p.set('ln', ln)
    if (spaceKind) p.set('spaceKind', spaceKind)
    return `/api/cost-serveis/pe?${p.toString()}`
  }, [year, ln, spaceKind])

  const { data: optionsData, mutate: mutateOptions } = useSWR<PeLookupResponse>(
    optionsUrl,
    fetcher
  )

  const ready = Boolean(ln && spaceKind && serviceType)
  const lookupUrl = ready
    ? `/api/cost-serveis/pe?year=${year}&ln=${encodeURIComponent(ln)}&spaceKind=${spaceKind}&serviceType=${encodeURIComponent(serviceType)}`
    : null

  const { data, isLoading, error, mutate } = useSWR<PeLookupResponse>(
    lookupUrl,
    fetcher
  )

  const options = optionsData?.options || data?.options
  const meta = optionsData?.meta || data?.meta
  const bucket = data?.bucket

  // Quan canvia LN, neteja centre i servei
  const onLn = (v: string) => {
    setLn(v)
    setSpaceKind('')
    setServiceType('')
    seedRef.current = ''
    setCosts(null)
    setFields(null)
    setBlocked(null)
  }

  const onCentre = (v: SpaceKind | '') => {
    setSpaceKind(v)
    setServiceType('')
    seedRef.current = ''
    setCosts(null)
    setFields(null)
    setBlocked(null)
  }

  useEffect(() => {
    if (!bucket) {
      if (ready && data && !data.bucket) {
        setCosts(null)
        setFields(null)
      }
      return
    }
    const key = `${bucket.id}|${bucket.computedAt}`
    if (key === seedRef.current) return
    seedRef.current = key

    const { costs: c, fields: f } = initFromBucket(bucket)
    setCosts(c)
    if (!(c.fixos > 0)) {
      setFields(
        bucket.preuMitjaPax
          ? { preu: round2(bucket.preuMitjaPax), pax: 0, facturacio: 0 }
          : null
      )
      setBlocked(
        'Fixos = 0. Sincronitza Costos estructura i torna a «Recalcular».'
      )
      return
    }
    setBlocked(null)
    if (!f) {
      setBlocked(
        'Amb el preu mitjà actual no hi ha marge. Puja el preu.'
      )
      setFields(
        bucket.preuMitjaPax
          ? { preu: round2(bucket.preuMitjaPax), pax: 0, facturacio: 0 }
          : null
      )
      return
    }
    setFields(f)
  }, [bucket, ready, data])

  const onRecompute = async () => {
    setRecomputing(true)
    try {
      const res = await fetch(`/api/cost-serveis/pe?year=${year}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setBlocked(json.error || `Error ${res.status}`)
        return
      }
      seedRef.current = ''
      await Promise.all([mutateOptions(), mutate()])
    } finally {
      setRecomputing(false)
    }
  }

  const onChangePreu = (preu: number) => {
    if (!costs) return
    const next = solveFromPreu(preu, costs)
    if (!next) {
      setFields((prev) =>
        prev ? { ...prev, preu: round2(preu), pax: 0, facturacio: 0 } : prev
      )
      setBlocked('Aquest preu no deixa marge. No hi ha PE.')
      return
    }
    setBlocked(null)
    setFields(next)
  }

  const onChangePax = (pax: number) => {
    if (!costs) return
    const next = solveFromPax(pax, costs)
    if (!next) {
      setFields((prev) =>
        prev ? { ...prev, pax: round2(pax), preu: 0, facturacio: 0 } : prev
      )
      setBlocked('No es pot calcular el preu PE amb aquests pax.')
      return
    }
    setBlocked(null)
    setFields(next)
  }

  const onChangeFact = (fact: number) => {
    if (!costs || !fields) return
    const next = solveFromFact(fact, costs, fields.preu)
    if (!next) {
      setFields((prev) =>
        prev ? { ...prev, facturacio: round2(fact) } : prev
      )
      setBlocked('No es pot equilibrar el PE amb aquesta facturació.')
      return
    }
    setBlocked(null)
    setFields(next)
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          1) LN → 2) Centre → 3) Servei actiu. Després els 3 números al{' '}
          <strong>PE = 0</strong>. Els costos parteixen de la mitjana anual
          normalitzada d’un esdeveniment d’aquest perfil.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={recomputing}
          onClick={onRecompute}
        >
          {recomputing ? '…' : `Recalcular ${year}`}
        </Button>
      </div>

      {!meta?.computedAt || meta.calculationVersion !== PE_CALCULATION_VERSION ? (
        <p className="text-xs text-amber-700">
          {meta?.computedAt
            ? `La fórmula desada és anterior. Prem «Recalcular ${year}».`
            : `Encara no hi ha mitjanes de ${year}. Prem «Recalcular ${year}».`}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className={cn(corporateFilterLabelClass, 'block')}>
          LN
          <select
            className={cn(corporateFilterFieldClass, 'mt-1 w-44')}
            value={ln}
            onChange={(e) => onLn(e.target.value)}
          >
            <option value="">—</option>
            {(options?.lns || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className={cn(corporateFilterLabelClass, 'block')}>
          Centre
          <select
            className={cn(corporateFilterFieldClass, 'mt-1 w-44')}
            value={spaceKind}
            disabled={!ln}
            onChange={(e) =>
              onCentre((e.target.value as SpaceKind | '') || '')
            }
          >
            <option value="">—</option>
            {(options?.spaceKinds || []).map((sk) => (
              <option key={sk} value={sk}>
                {SPACE_KIND_LABELS[sk]}
              </option>
            ))}
          </select>
        </label>

        <label className={cn(corporateFilterLabelClass, 'block')}>
          Servei (actius)
          <select
            className={cn(corporateFilterFieldClass, 'mt-1 w-56')}
            value={serviceType}
            disabled={!ln || !spaceKind}
            onChange={(e) => {
              setServiceType(e.target.value)
              seedRef.current = ''
            }}
          >
            <option value="">—</option>
            {(options?.serviceTypes || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ln && spaceKind && (options?.serviceTypes || []).length === 0 ? (
        <p className="text-xs text-slate-500">
          Cap servei actiu per aquesta LN i centre. Revisa Configuració
          (ponderació) o recalcula l’any.
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-slate-500">
          Selecciona LN, després centre, després servei.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : error || data?.error ? (
        <p className="text-sm text-red-600">{data?.error || 'Error'}</p>
      ) : fields && costs ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {ln} · {spaceKind ? SPACE_KIND_LABELS[spaceKind] : ''} ·{' '}
            {serviceType}
          </div>

          <label className="block">
            <span className="text-sm text-slate-600">Preu € / pax</span>
            <Input
              type="number"
              step="0.01"
              min={0}
              className="mt-1 h-14 text-2xl font-semibold tabular-nums"
              value={fields.preu}
              onChange={(e) => onChangePreu(Number(e.target.value) || 0)}
              disabled={!(costs.fixos > 0)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">Pax (comensals)</span>
            <Input
              type="number"
              step="1"
              min={0}
              className="mt-1 h-14 text-2xl font-semibold tabular-nums"
              value={fields.pax}
              onChange={(e) => onChangePax(Number(e.target.value) || 0)}
              disabled={!(costs.fixos > 0)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">Facturació €</span>
            <Input
              type="number"
              step="1"
              min={0}
              className="mt-1 h-14 text-2xl font-semibold tabular-nums"
              value={fields.facturacio}
              onChange={(e) => onChangeFact(Number(e.target.value) || 0)}
              disabled={!(costs.fixos > 0)}
            />
          </label>

          {blocked ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {blocked}
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              PE = 0: canvia un camp i els altres s’ajusten.
            </p>
          )}

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Components aplicats a un esdeveniment teòric
            </p>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
              <dt className="text-slate-500">Variable operatiu / pax</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtEuro(costs.cvOp)}
              </dd>
              <dt className="text-slate-500">Compres teòriques</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtPct(costs.pctCompres)}
              </dd>
              <dt className="text-slate-500">Gestió teòrica</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtPct(costs.pctGestio)}
              </dd>
              <dt className="text-slate-500">Fix directe / esdeveniment</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtEuro(costs.fixDirecte)}
              </dd>
              <dt className="text-slate-500">Fix indirecte / esdeveniment</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtEuro(costs.fixIndirecte)}
              </dd>
              <dt className="font-medium text-slate-700">Total fix a cobrir</dt>
              <dd className="text-right font-semibold tabular-nums">
                {fmtEuro(costs.fixos)}
              </dd>
            </dl>
          </div>
        </div>
      ) : ready ? (
        <p className="text-sm text-slate-500">Sense dades per aquest perfil.</p>
      ) : null}
    </div>
  )
}
