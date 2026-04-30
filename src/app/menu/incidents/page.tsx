// file: src/app/menu/incidents/page.tsx
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AlertTriangle, FileText } from 'lucide-react'
import { loadXlsx } from '@/lib/loadXlsx'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

import ModuleHeader from '@/components/layout/ModuleHeader'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { useIncidents } from '@/hooks/useIncidents'
import IncidentsTable from './components/IncidentsTable'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import ExportMenu from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import MeetingMinutesDialog from './components/MeetingMinutesDialog'
import {
  canManageIncidentCategories,
  normalizeIncidentStatus,
} from '@/lib/incidentPolicy'
import { normalizeDept } from '@/lib/accessControl'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

const MARKETING_DEFAULT_CATEGORY_FILTER = '9XX'
const MARKETING_DEPARTMENTS = new Set(['marqueting', 'marketing'])

function thisWeekRange() {
  const now = new Date()
  const start = new Date(now)
  const day = start.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  start.setDate(now.getDate() + diffToMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(0, 0, 0, 0)

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
}

function incidentStatusDisplayLabel(raw?: string | null) {
  const w = normalizeIncidentStatus(raw)
  if (w === 'en_curs') return 'En curs'
  if (w === 'resolt') return 'Resolt'
  if (w === 'tancat') return 'Tancat'
  return 'Obert'
}

export default function IncidentsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const sessionUser = session?.user as { name?: string; email?: string } | undefined
  const accessUser = (session?.user as { role?: string; department?: string }) || {}
  const isMarketingUser = MARKETING_DEPARTMENTS.has(normalizeDept(accessUser.department || ''))
  const actaAuthorLabel = sessionUser?.name?.trim() || sessionUser?.email?.trim()
  const canEditTipologies = canManageIncidentCategories(
    accessUser
  )
  const [meetingMinutesOpen, setMeetingMinutesOpen] = useState(false)
  const initialRange = useMemo(() => thisWeekRange(), [])
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [defaultFiltersReady, setDefaultFiltersReady] = useState(false)
  const [marketingDefaultSuppressed, setMarketingDefaultSuppressed] = useState(false)
  const [filters, setFilters] = useState({
    from: initialRange.from as string | undefined,
    to: initialRange.to as string | undefined,
    department: undefined as string | undefined,
    importance: 'all' as string,
    categoryLabel: 'all' as string,
    status: 'all' as 'all' | 'obert' | 'en_curs' | 'resolt' | 'tancat',
  })

  const effectiveCategoryLabel =
    isMarketingUser && !marketingDefaultSuppressed && filters.categoryLabel === 'all'
      ? MARKETING_DEFAULT_CATEGORY_FILTER
      : filters.categoryLabel

  const { incidents, rawIncidents, loading, isRefreshing, error, updateIncident } = useIncidents({
    ...filters,
    categoryLabel: effectiveCategoryLabel,
    limit: 800,
    light: true,
    enabled: defaultFiltersReady,
  })

  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    rawIncidents.forEach((i) => {
      const dep = i.department?.trim()
      if (dep) set.add(dep)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rawIncidents])

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>()
    rawIncidents.forEach((i) => {
      const id = i.category?.id?.trim()
      const label = i.category?.label?.trim()
      if (id && label && !map.has(id)) map.set(id, label)
    })
    let items = Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
    if (isMarketingUser && effectiveCategoryLabel === MARKETING_DEFAULT_CATEGORY_FILTER) {
      items = items.filter((item) => item.id.startsWith('9'))
    }
    return items
  }, [effectiveCategoryLabel, isMarketingUser, rawIncidents])

  const categorySelectValue =
    effectiveCategoryLabel === MARKETING_DEFAULT_CATEGORY_FILTER ? 'all' : effectiveCategoryLabel || 'all'

  useEffect(() => {
    if (sessionStatus === 'loading') return
    setDefaultFiltersReady(true)
  }, [sessionStatus])

  const totalIncidencies = incidents.length

  const handleFilterChange = (f: SmartFiltersChange) => {
    setFilters(prev => ({
      ...prev,
      from: f.start,
      to: f.end,
      department: f.department,
      importance: f.importance || 'all',
      categoryLabel:
        f.categoryId === undefined ? prev.categoryLabel : f.categoryId !== 'all' ? f.categoryId : 'all',
    }))
  }

  const { setContent, setOpen } = useFilters()

  const openFiltersPanel = () => {
    setContent(
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className={typography('label')}>Departament</label>
          <Select
            value={filters.department || 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, department: v === 'all' ? undefined : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              {departmentOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Importància</label>
          <Select
            value={filters.importance || 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, importance: v === 'all' ? 'all' : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Categoria</label>
          <Select
            value={categorySelectValue}
            onValueChange={(v) =>
              {
                if (v === 'all') {
                  setMarketingDefaultSuppressed(true)
                  setFilters((prev) => ({ ...prev, categoryLabel: 'all' }))
                  return
                }
                setMarketingDefaultSuppressed(true)
                setFilters((prev) => ({ ...prev, categoryLabel: v }))
              }
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Estat</label>
          <Select
            value={filters.status}
            onValueChange={(v) =>
              setFilters((prev) => ({
                ...prev,
                status: v as typeof prev.status,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              <SelectItem value="obert">Obert</SelectItem>
              <SelectItem value="en_curs">En curs</SelectItem>
              <SelectItem value="resolt">Resolt</SelectItem>
              <SelectItem value="tancat">Tancat</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <ResetFilterButton
            onClick={() => {
              const range = thisWeekRange()
              setDateResetSignal((n) => n + 1)
              setMarketingDefaultSuppressed(true)
              setFilters({
                from: range.from,
                to: range.to,
                department: undefined,
                importance: 'all',
                categoryLabel: 'all',
                status: 'all',
              })
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Tancar
          </Button>
        </div>
      </div>
    )
    setOpen(true)
  }

  const exportBase = `incidencies-${filters.from || 'start'}-${filters.to || 'end'}`

  const exportRows = useMemo(
    () =>
      incidents.map((i) => ({
        DataEvent: (i.eventDate || '').slice(0, 10),
        Event: i.eventTitle || '',
        Codi: i.eventCode || '',
        Ubicacio: i.eventLocation || '',
        Departament: i.department || '',
        Importancia: i.importance || '',
        Categoria: i.category?.label || '',
        Estat: incidentStatusDisplayLabel(i.status),
        Descripcio: i.description || '',
        Creada: (i.createdAt || '').slice(0, 19),
        Creador: i.createdBy || '',
        LN: i.ln || '',
        Pax: i.pax ?? '',
        Servei: i.serviceType || '',
      })),
    [incidents]
  )

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Incidencies')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const cols = [
      'DataEvent',
      'Event',
      'Codi',
      'Ubicacio',
      'Departament',
      'Importancia',
      'Categoria',
      'Estat',
      'Descripcio',
      'Creada',
      'Creador',
      'LN',
      'Pax',
      'Servei',
    ]

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String((row as any)[key] ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Incidencies</h1>
    <div class="meta">Rang: ${escapeHtml(filters.from || '')} - ${escapeHtml(
      filters.to || ''
    )}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    const html = buildPdfTableHtml()
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const handleExportPdfView = () => {
    window.print()
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel },
    { label: 'PDF (vista)', onClick: handleExportPdfView },
    { label: 'PDF (taula)', onClick: handleExportPdfTable },
  ]

  return (
    <div className="p-4 flex flex-col gap-4 w-full max-w-none">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #incidencies-print-root, #incidencies-print-root * { visibility: visible; }
          #incidencies-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      {/* Capçalera principal */}
      <ModuleHeader
        icon={<AlertTriangle className="w-7 h-7 text-yellow-600" />}
        title="Incidències"
        subtitle="Tauler de treball setmanal"
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Link
              href="/menu/incidents/quadre"
              className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
            >
              Quadre de comandament
            </Link>
            {canEditTipologies ? (
              <Link
                href="/menu/incidents/tipologies"
                className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
              >
                Tipologies
              </Link>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap gap-1.5"
              disabled={loading}
              onClick={() => setMeetingMinutesOpen(true)}
            >
              <FileText className="h-4 w-4 shrink-0" aria-hidden />
              Acta reunió
            </Button>
            <ExportMenu items={exportItems} />
          </div>
        }
      />

      <MeetingMinutesDialog
        open={meetingMinutesOpen}
        onOpenChange={setMeetingMinutesOpen}
        incidents={incidents}
        filters={{ ...filters, categoryLabel: effectiveCategoryLabel }}
        generatedByLabel={actaAuthorLabel}
      />

      {/* Total incidències de la setmana */}
      <div className={`px-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${typography('bodyMd')}`}>
        <span>Total incidències: {totalIncidencies}</span>
        {isRefreshing ? (
          <span className={typography('bodyXs')}>Actualitzant dades…</span>
        ) : null}
      </div>

      {/* Barra compacta: només dates + botó filtres */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm mb-2 flex items-center gap-3 flex-nowrap">

        <SmartFilters
          modeDefault="week"
          modeOptions={['week', 'month', 'year', 'range']}
          role="Direcció"
          onChange={handleFilterChange}
          showDepartment={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          showImportance={false}
          categoryOptions={categoryOptions}
          showAdvanced={false}
          compact
          initialStart={filters.from}
          initialEnd={filters.to}
          resetSignal={dateResetSignal}
        />
        <div className="flex-1 min-w-[8px]" />
        <FilterButton onClick={openFiltersPanel} />
      </div>

      {/* Contingut */}
      {loading && (
        <p className={cn('text-center py-10', typography('bodySm'))}>Carregant…</p>
      )}
      {error && (
        <p className={cn('text-center py-10', typography('bodySm'), 'text-red-600')}>{error}</p>
      )}

      {!loading && !error && (
        <div id="incidencies-print-root" className="w-full">
          <IncidentsTable
            incidents={incidents}
            onUpdate={updateIncident}
          />
        </div>
      )}
    </div>
  )
}
