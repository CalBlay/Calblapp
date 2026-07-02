// file: src/app/menu/incidents/page.tsx
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { AlertTriangle, Clock3, FileText } from 'lucide-react'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

import ModuleHeader from '@/components/layout/ModuleHeader'
import { CorporateFiltersShell } from '@/components/layout/corporate-filters'
import { corporateFilterBadgeClass } from '@/lib/corporate-filters'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { useIncidents } from '@/hooks/useIncidents'
import IncidentsTable from './components/IncidentsTable'
import IncidentsLnFilterBadges from './components/IncidentsLnFilterBadges'
import { incidentMatchesLnFilter } from '@/lib/incidentLn'
import {
  INCIDENTS_CATEGORY_EDIT_PERM,
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_ACCIONS_PATH,
  INCIDENTS_MEETING_MINUTES_PERM,
  INCIDENTS_TYPOLOGIES_MANAGE_PERM,
  INCIDENTS_QUADRE_PATH,
} from '@/lib/incidentsPermissions'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import ExportMenu from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import MeetingMinutesDialog from './components/MeetingMinutesDialog'
import MeetingMinutesHistoryDialog from './components/MeetingMinutesHistoryDialog'
import IncidentNotificationsBell from './components/IncidentNotificationsBell'
import {
  canDeleteIncident,
  normalizeIncidentStatus,
} from '@/lib/incidentPolicy'
import { normalizeDept } from '@/lib/accessControl'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

const INCIDENT_DATE_MODE_LABELS: Record<'all' | 'event', string> = {
  all: 'Sense filtre de data',
  event: 'Data de l’esdeveniment',
}

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
  const searchParams = useSearchParams()
  const { data: session, status: sessionStatus } = useSession()
  const sessionUser = session?.user as {
    id?: string
    name?: string
    email?: string
    role?: string
    department?: string
  } | undefined
  const accessUser = useMemo(
    () =>
      ((session?.user as {
        id?: string
        role?: string
        department?: string
        name?: string
        email?: string
      }) || {}),
    [session?.user]
  )
  const isMarketingUser = MARKETING_DEPARTMENTS.has(normalizeDept(accessUser.department || ''))
  const actaAuthorLabel = sessionUser?.name?.trim() || sessionUser?.email?.trim()
  const { ready: uiPermsReady, hasAction } = useUiPermissions()
  const canSeeQuadre = uiPermsReady && hasAction(INCIDENTS_COMMAND_BOARD_PERM)
  const canMeetingMinutes = uiPermsReady && hasAction(INCIDENTS_MEETING_MINUTES_PERM)
  const canEditIncidentCategory = uiPermsReady && hasAction(INCIDENTS_CATEGORY_EDIT_PERM)
  const canEditTipologies = uiPermsReady && hasAction(INCIDENTS_TYPOLOGIES_MANAGE_PERM)
  const [meetingMinutesOpen, setMeetingMinutesOpen] = useState(false)
  const [meetingMinutesHistoryOpen, setMeetingMinutesHistoryOpen] = useState(false)
  const [meetingActaStatus, setMeetingActaStatus] = useState<'draft' | 'finalized' | null>(null)
  const [activeMeetingSessionId, setActiveMeetingSessionId] = useState<string | null>(null)
  const [selectedMeetingSessionId, setSelectedMeetingSessionId] = useState<string | null>(null)
  const [selectedMeetingSession, setSelectedMeetingSession] = useState<import('@/lib/incidentMeetingSession').IncidentMeetingSession | null>(null)
  const [incidentCategoryOptions, setIncidentCategoryOptions] = useState<Array<{ id: string; label: string }>>([])
  const initialRange = useMemo(() => thisWeekRange(), [])

  useEffect(() => {
    if (!canMeetingMinutes) return
    void fetch('/api/incidents/meeting-minutes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        const status = json?.session?.status
        const sessionId = String(json?.session?.id || '').trim()
        setMeetingActaStatus(status === 'finalized' ? 'finalized' : status === 'draft' ? 'draft' : null)
        setActiveMeetingSessionId(sessionId || null)
      })
      .catch(() => {
        setMeetingActaStatus(null)
        setActiveMeetingSessionId(null)
      })
  }, [canMeetingMinutes, meetingMinutesHistoryOpen, meetingMinutesOpen, selectedMeetingSessionId])

  useEffect(() => {
    if (!canEditIncidentCategory) {
      setIncidentCategoryOptions([])
      return
    }
    void fetch('/api/incidents/categories', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        const rows = Array.isArray(json?.categories) ? json.categories : []
        setIncidentCategoryOptions(
          rows
            .filter((row: { active?: boolean }) => row.active !== false)
            .map((row: { id?: string; label?: string }) => ({
              id: String(row.id || '').trim(),
              label: String(row.label || row.id || '').trim(),
            }))
            .filter((row: { id: string; label: string }) => row.id && row.label)
        )
      })
      .catch(() => setIncidentCategoryOptions([]))
  }, [canEditIncidentCategory])

  const handleMeetingMinutesOpenChange = (next: boolean) => {
    setMeetingMinutesOpen(next)
    if (!next) {
      setSelectedMeetingSessionId(null)
      setSelectedMeetingSession(null)
    }
  }

  const openActiveMeetingMinutes = () => {
    setSelectedMeetingSessionId(null)
    setSelectedMeetingSession(null)
    setMeetingMinutesOpen(true)
  }

  const openMeetingSessionFromHistory = (session: import('@/lib/incidentMeetingSession').IncidentMeetingSession) => {
    setSelectedMeetingSession(session)
    setSelectedMeetingSessionId(session.id)
    setMeetingMinutesOpen(true)
  }
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [defaultFiltersReady, setDefaultFiltersReady] = useState(false)
  const [marketingDefaultSuppressed, setMarketingDefaultSuppressed] = useState(false)
  const [filters, setFilters] = useState({
    from: initialRange.from as string | undefined,
    to: initialRange.to as string | undefined,
    dateMode: 'event' as 'all' | 'event',
    department: undefined as string | undefined,
    importance: 'all' as string,
    categoryLabel: 'all' as string,
    status: 'all' as 'all' | 'obert' | 'en_curs' | 'resolt' | 'tancat',
    ln: 'all' as string,
  })

  const effectiveCategoryLabel =
    isMarketingUser && !marketingDefaultSuppressed && filters.categoryLabel === 'all'
      ? MARKETING_DEFAULT_CATEGORY_FILTER
      : filters.categoryLabel

  const deepLinkIncidentId = searchParams.get('incidentId')?.trim() || ''
  const shouldExpandOps = searchParams.get('ops') === '1'

  useEffect(() => {
    if (searchParams.get('dateMode') !== 'all') return
    setFilters((prev) =>
      prev.dateMode === 'all'
        ? prev
        : {
            ...prev,
            dateMode: 'all',
            from: undefined,
            to: undefined,
          }
    )
  }, [searchParams])

  const {
    incidents,
    rawIncidents,
    actionsByIncident,
    loading,
    isRefreshing,
    error,
    updateIncident,
    deleteIncident,
    patchIncidentLocal,
    patchIncidentActionsLocal,
  } = useIncidents({
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

  const visibleIncidents = useMemo(
    () => incidents.filter((inc) => incidentMatchesLnFilter(inc.ln, filters.ln)),
    [incidents, filters.ln]
  )

  const totalIncidencies = visibleIncidents.length

  const canDeleteRow = React.useCallback(
    (incident: import('@/hooks/useIncidents').Incident) =>
      canDeleteIncident(accessUser, incident),
    [accessUser]
  )

  const handleDeleteIncident = React.useCallback(
    async (incident: import('@/hooks/useIncidents').Incident) => {
      const label = incident.incidentNumber || incident.description || 'aquesta incidència'
      const confirmed = window.confirm(`Vols eliminar ${label}? Aquesta acció no es pot desfer.`)
      if (!confirmed) return
      await deleteIncident(incident.id)
    },
    [deleteIncident]
  )

  const handleFilterChange = React.useCallback((f: SmartFiltersChange) => {
    setFilters((prev) => {
      const nextCategoryLabel =
        f.categoryId === undefined ? prev.categoryLabel : f.categoryId !== 'all' ? f.categoryId : 'all'
      const nextFrom = f.start
      const nextTo = f.end
      const nextDepartment = f.department
      const nextImportance = f.importance || 'all'

      if (
        prev.from === nextFrom &&
        prev.to === nextTo &&
        prev.department === nextDepartment &&
        prev.importance === nextImportance &&
        prev.categoryLabel === nextCategoryLabel
      ) {
        return prev
      }

      return {
        ...prev,
        from: nextFrom,
        to: nextTo,
        department: nextDepartment,
        importance: nextImportance,
        categoryLabel: nextCategoryLabel,
      }
    })
  }, [])

  const { setContent, setOpen } = useFilters()

  const openFiltersPanel = () => {
    setContent(
      <div key={`incidents-filters-${filters.dateMode}-${dateResetSignal}`} className="p-4 space-y-4">
        <div className="space-y-2">
          <label className={typography('label')}>Tipus de data</label>
          <Select
            value={filters.dateMode}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, dateMode: v as typeof prev.dateMode }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event">Data de l’esdeveniment</SelectItem>
              <SelectItem value="all">Sense filtre de data</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
                dateMode: 'event',
                department: undefined,
                importance: 'all',
                categoryLabel: 'all',
                status: 'all',
                ln: 'all',
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

  const exportBase =
    filters.dateMode === 'all'
      ? 'incidencies-totes'
      : `incidencies-${filters.from || 'start'}-${filters.to || 'end'}`

  const exportRows = useMemo(
    () =>
      visibleIncidents.map((i) => ({
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
    [visibleIncidents]
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
    ] as const

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String(row[key] ?? ''))}</td>`)
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
    printBrandedHtmlInNewWindow(html)
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
            <IncidentNotificationsBell />
            <Link
              href={INCIDENTS_ACCIONS_PATH}
              className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
            >
              Les meves accions
            </Link>
            {canSeeQuadre ? (
              <Link
                href={INCIDENTS_QUADRE_PATH}
                className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
              >
                Quadre de comandament
              </Link>
            ) : null}
            {canEditTipologies ? (
              <Link
                href="/menu/incidents/tipologies"
                className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
              >
                Tipologies
              </Link>
            ) : null}
            {canMeetingMinutes ? (
              <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap gap-1.5"
                disabled={loading}
                onClick={openActiveMeetingMinutes}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                {meetingActaStatus === 'draft'
                  ? 'Apunts reunió'
                  : meetingActaStatus === 'finalized'
                  ? 'Tancar acta'
                  : 'Acta reunió'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap gap-1.5"
                onClick={() => setMeetingMinutesHistoryOpen(true)}
              >
                <Clock3 className="h-4 w-4 shrink-0" aria-hidden />
                Historial actes
              </Button>
              </>
            ) : null}
            <ExportMenu items={exportItems} />
          </div>
        }
      />

      {canMeetingMinutes ? (
        <>
          <MeetingMinutesDialog
            open={meetingMinutesOpen}
            onOpenChange={handleMeetingMinutesOpenChange}
            defaultFilters={{ ...filters, categoryLabel: effectiveCategoryLabel }}
            generatedByLabel={actaAuthorLabel}
            onSessionStatusChange={selectedMeetingSessionId ? undefined : setMeetingActaStatus}
            sessionId={selectedMeetingSessionId}
            initialSession={selectedMeetingSession}
          />
          <MeetingMinutesHistoryDialog
            open={meetingMinutesHistoryOpen}
            onOpenChange={setMeetingMinutesHistoryOpen}
            onPickSession={openMeetingSessionFromHistory}
            activeSessionId={activeMeetingSessionId}
          />
        </>
      ) : null}

      <div className={`px-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${typography('bodyMd')}`}>
        <span>Total incidències: {totalIncidencies}</span>
        {isRefreshing ? (
          <span className={typography('bodyXs')}>Actualitzant dades…</span>
        ) : null}
      </div>

      <CorporateFiltersShell variant="toolbar" className="mb-2">
        <div className="flex min-w-[200px] flex-wrap items-center gap-2">
          <span className={corporateFilterBadgeClass(true)}>
            {INCIDENT_DATE_MODE_LABELS[filters.dateMode]}
          </span>
        </div>

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
          resetSignal={dateResetSignal}
        />
        <IncidentsLnFilterBadges
          value={filters.ln}
          onChange={(ln) => setFilters((prev) => ({ ...prev, ln }))}
        />
        <div className="min-w-[8px] flex-1" />
        <FilterButton onClick={openFiltersPanel} />
      </CorporateFiltersShell>

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
            incidents={visibleIncidents}
            actionsByIncident={actionsByIncident}
            daySort={filters.dateMode === 'event' ? 'chronological' : 'proximity'}
            expandIncidentId={shouldExpandOps ? deepLinkIncidentId : undefined}
            onUpdate={updateIncident}
            onLocalPatch={patchIncidentLocal}
            onActionsLocalPatch={patchIncidentActionsLocal}
            onDelete={handleDeleteIncident}
            canDeleteIncident={canDeleteRow}
            canEditCategory={canEditIncidentCategory}
            categoryOptions={incidentCategoryOptions}
          />
        </div>
      )}
    </div>
  )
}
