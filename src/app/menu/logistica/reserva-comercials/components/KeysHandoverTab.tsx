'use client'

import { useMemo, useState } from 'react'
import { Printer, X } from 'lucide-react'

import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { FiltersState } from '@/components/layout/FiltersBar'
import {
  CorporateFilterSearch,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import type { KeysHandoverRow } from '../utils'
import { prettyDate } from '../utils'

type Props = {
  keysFilters: FiltersState
  loading: boolean
  withPlate: KeysHandoverRow[]
  withoutPlate: KeysHandoverRow[]
  showsDateColumn: boolean
  totalFleetVehicles: number
  onKeysDatesChange: (next: SmartFiltersChange) => void
}

const TABLE_COLUMN_COUNT = 5

function rangeLabel(start: string, end: string) {
  if (!start) return ''
  if (!end || start === end) return prettyDate(start)
  return `${prettyDate(start)} – ${prettyDate(end)}`
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matchesKeysSearch(row: KeysHandoverRow, query: string) {
  if (!query) return true
  const haystack = normalizeSearch(
    [
      row.plate,
      row.personName,
      row.destination,
      row.sourceLabel,
      prettyDate(row.date),
      row.startTime,
      row.endTime,
    ].join(' ')
  )
  return haystack.includes(query)
}

function groupRowsByDate(rows: KeysHandoverRow[]) {
  const map = new Map<string, KeysHandoverRow[]>()
  for (const row of rows) {
    const current = map.get(row.date) || []
    current.push(row)
    map.set(row.date, current)
  }
  return [...map.entries()].sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
}

function formatKeysDayGroupLabel(dayKey: string) {
  const parsed = new Date(`${dayKey}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return prettyDate(dayKey)
  return parsed.toLocaleDateString('ca-ES', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function KeysHandoverTable({ rows }: { rows: KeysHandoverRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Hora</th>
            <th className="px-4 py-3">Matrícula</th>
            <th className="px-4 py-3">Persona</th>
            <th className="px-4 py-3">Destinació</th>
            <th className="px-4 py-3">Origen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.id}:${row.date}`} className="border-b border-slate-100 last:border-b-0">
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                {row.startTime} - {row.endTime}
              </td>
              <td className="px-4 py-3">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-800">
                  {row.plate}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-800">{row.personName}</td>
              <td className="px-4 py-3 text-slate-600">{row.destination}</td>
              <td className="px-4 py-3 text-slate-500">{row.sourceLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeysHandoverGroupedTable({ groups }: { groups: Array<[string, KeysHandoverRow[]]> }) {
  return (
    <div className="space-y-6">
      {groups.map(([day, rows]) => (
        <section key={day} className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold capitalize text-emerald-800">
            {formatKeysDayGroupLabel(day)}
            <span className="ml-2 text-sm font-medium text-emerald-700">
              · {rows.length} vehicle{rows.length === 1 ? '' : 's'}
            </span>
          </div>
          <KeysHandoverTable rows={rows} />
        </section>
      ))}
    </div>
  )
}

export default function KeysHandoverTab({
  keysFilters,
  loading,
  withPlate,
  withoutPlate,
  showsDateColumn,
  totalFleetVehicles,
  onKeysDatesChange,
}: Props) {
  const [search, setSearch] = useState('')
  const periodLabel = rangeLabel(keysFilters.start || '', keysFilters.end || '')
  const searchQuery = normalizeSearch(search)

  const filteredWithPlate = useMemo(
    () => withPlate.filter((row) => matchesKeysSearch(row, searchQuery)),
    [searchQuery, withPlate]
  )

  const filteredWithoutPlate = useMemo(
    () => withoutPlate.filter((row) => matchesKeysSearch(row, searchQuery)),
    [searchQuery, withoutPlate]
  )

  const groupedWithPlate = useMemo(
    () => groupRowsByDate(filteredWithPlate),
    [filteredWithPlate]
  )

  const groupedWithoutPlate = useMemo(
    () => groupRowsByDate(filteredWithoutPlate),
    [filteredWithoutPlate]
  )

  const handlePrint = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

    const rowHtml = (rows: KeysHandoverRow[]) =>
      rows
        .map(
          (row) => `<tr>
            <td>${escapeHtml(`${row.startTime} - ${row.endTime}`)}</td>
            <td>${escapeHtml(row.plate)}</td>
            <td>${escapeHtml(row.personName)}</td>
            <td>${escapeHtml(row.destination)}</td>
            <td>${escapeHtml(row.sourceLabel)}</td>
          </tr>`
        )
        .join('')

    const tableBlock = (rows: KeysHandoverRow[]) => `<table>
      <thead>
        <tr>
          <th>Hora</th>
          <th>Matrícula</th>
          <th>Persona</th>
          <th>Destinació</th>
          <th>Origen</th>
        </tr>
      </thead>
      <tbody>${rowHtml(rows) || `<tr><td colspan="${TABLE_COLUMN_COUNT}">Cap vehicle assignat.</td></tr>`}</tbody>
    </table>`

    const assignedHtml = showsDateColumn
      ? groupedWithPlate
          .map(
            ([day, rows]) => `<div class="section">
              <h2>${escapeHtml(formatKeysDayGroupLabel(day))} · ${rows.length} vehicle${rows.length === 1 ? '' : 's'}</h2>
              ${tableBlock(rows)}
            </div>`
          )
          .join('')
      : tableBlock(filteredWithPlate)

    const pendingHtml = filteredWithoutPlate.length
      ? `<div class="section">
          <h2>Pendents sense vehicle assignat</h2>
          ${
            showsDateColumn
              ? groupedWithoutPlate
                  .map(
                    ([day, rows]) => `<div class="section">
                      <h3>${escapeHtml(formatKeysDayGroupLabel(day))}</h3>
                      <table>
                        <thead>
                          <tr>
                            <th>Hora</th>
                            <th>Persona</th>
                            <th>Destinació</th>
                            <th>Origen</th>
                          </tr>
                        </thead>
                        <tbody>${rows
                          .map(
                            (row) => `<tr>
                              <td>${escapeHtml(`${row.startTime} - ${row.endTime}`)}</td>
                              <td>${escapeHtml(row.personName)}</td>
                              <td>${escapeHtml(row.destination)}</td>
                              <td>${escapeHtml(row.sourceLabel)}</td>
                            </tr>`
                          )
                          .join('')}</tbody>
                      </table>
                    </div>`
                  )
                  .join('')
              : `<table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Persona</th>
                      <th>Destinació</th>
                      <th>Origen</th>
                    </tr>
                  </thead>
                  <tbody>${filteredWithoutPlate
                    .map(
                      (row) => `<tr>
                        <td>${escapeHtml(`${row.startTime} - ${row.endTime}`)}</td>
                        <td>${escapeHtml(row.personName)}</td>
                        <td>${escapeHtml(row.destination)}</td>
                        <td>${escapeHtml(row.sourceLabel)}</td>
                      </tr>`
                    )
                    .join('')}</tbody>
                </table>`
          }
        </div>`
      : ''

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lliurament de claus ${escapeHtml(periodLabel)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin: 16px 0 8px; text-transform: capitalize; }
      h3 { font-size: 13px; margin: 12px 0 6px; text-transform: capitalize; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
      th, td { border: 1px solid #ddd; padding: 8px 10px; vertical-align: top; text-align: left; }
      th { background: #f3f4f6; }
      tr:nth-child(even) td { background: #fafafa; }
      .section { margin-top: 20px; }
    </style>
  </head>
  <body>
    <h1>Lliurament de claus · cotxes comercials</h1>
    <div class="meta">Període: ${escapeHtml(periodLabel)}</div>
    ${assignedHtml}
    ${pendingHtml}
  </body>
</html>`

    printBrandedHtmlInNewWindow(html)
  }

  return (
    <div className="space-y-4">
      <CorporateFiltersShell
        variant="toolbar"
        showHeader={false}
        bodyClassName="flex-col items-stretch gap-0 xl:flex-row xl:flex-wrap xl:items-center"
      >
        <div className="flex w-full flex-wrap items-center gap-3">
          <div className="shrink-0">
            <SmartFilters
              modeDefault="day"
              modeOptions={['week', 'month', 'year', 'day', 'range']}
              role="Treballador"
              showDepartment={false}
              showWorker={false}
              showLocation={false}
              showStatus={false}
              compact
              onChange={onKeysDatesChange}
              initialStart={keysFilters.start}
              initialEnd={keysFilters.end}
            />
          </div>

          <div className="relative min-w-[240px] flex-1">
            <CorporateFilterSearch
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca matrícula, persona, destinació..."
              aria-label="Cerca intel·ligent"
              className="pr-10"
            />
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <Badge variant="outline" className="shrink-0 px-3 py-1.5 text-sm">
            {filteredWithPlate.length} / {totalFleetVehicles} vehicle
            {totalFleetVehicles === 1 ? '' : 's'}
          </Badge>

          <Button type="button" variant="outline" className="ml-auto shrink-0" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </CorporateFiltersShell>

      <Card className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <CardContent className="px-4 py-5 sm:px-6">
          {loading ? (
            <div className="py-4 text-sm text-slate-500">Carregant...</div>
          ) : filteredWithPlate.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-500">
              {search.trim()
                ? 'Cap resultat per aquesta cerca.'
                : 'No hi ha cotxes assignats per aquest període.'}
            </div>
          ) : showsDateColumn ? (
            <KeysHandoverGroupedTable groups={groupedWithPlate} />
          ) : (
            <KeysHandoverTable rows={filteredWithPlate} />
          )}
        </CardContent>
      </Card>

      {!loading && filteredWithoutPlate.length > 0 ? (
        <Card className="rounded-3xl border-amber-200 bg-amber-50">
          <CardContent className="px-4 py-5">
            <div className="text-sm font-semibold text-amber-900">
              Pendents sense vehicle assignat ({filteredWithoutPlate.length})
            </div>
            {showsDateColumn ? (
              <div className="mt-4 space-y-5">
                {groupedWithoutPlate.map(([day, rows]) => (
                  <section key={day} className="space-y-2">
                    <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold capitalize text-amber-900">
                      {formatKeysDayGroupLabel(day)}
                    </div>
                    <div className="space-y-2">
                      {rows.map((row) => (
                        <div
                          key={`${row.id}:${row.date}`}
                          className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700"
                        >
                          <span className="font-medium text-slate-900">{row.personName}</span>
                          <span className="text-slate-500"> · {row.startTime} - {row.endTime}</span>
                          <span className="text-slate-500"> · {row.destination}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {filteredWithoutPlate.map((row) => (
                  <div
                    key={`${row.id}:${row.date}`}
                    className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    <span className="font-medium text-slate-900">{row.personName}</span>
                    <span className="text-slate-500"> · {row.startTime} - {row.endTime}</span>
                    <span className="text-slate-500"> · {row.destination}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
