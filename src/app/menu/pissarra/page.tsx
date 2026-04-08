// filename: src/app/menu/pissarra/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { startOfWeek, endOfWeek } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { loadXlsx } from '@/lib/loadXlsx'
import { normalizeRole } from '@/lib/roles'
import { RoleGuard } from '@/lib/withRoleGuard'
import usePissarra from '@/hooks/usePissarra'
import PissarraList from './components/PissarraList'
import SmartFilters from '@/components/filters/SmartFilters'
import { Button } from '@/components/ui/button'
import FilterButton from '@/components/ui/filter-button'
import ExportMenu from '@/components/export/ExportMenu'
import { useFilters } from '@/context/FiltersContext'

export default function PissarraPage() {
  const { data: session, status } = useSession()

  const role = normalizeRole(session?.user?.role || 'treballador')
  const dept = (session?.user?.department || '').toLowerCase()
  const defaultMode: 'produccio' | 'logistica' | 'cuina' =
    dept === 'cuina' ? 'cuina' : dept === 'logistica' ? 'logistica' : 'produccio'
  const [mode, setMode] = useState<'produccio' | 'logistica' | 'cuina'>(defaultMode)
  const [lnFilter, setLnFilter] = useState<string>('__all__')
  const [commercialFilter, setCommercialFilter] = useState<string>('__all__')
  const [statusFilter, setStatusFilter] = useState<'__all__' | 'confirmed' | 'draft'>(
    '__all__'
  )

  const now = new Date()
  const defaultWeekStart = startOfWeek(now, { weekStartsOn: 1 })
  const defaultWeekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const [week, setWeek] = useState({
    startISO: defaultWeekStart.toISOString().slice(0, 10),
    endISO: defaultWeekEnd.toISOString().slice(0, 10),
  })

  const { dataByDay, flat, loading, error, canEdit, updateField } = usePissarra(
    week.startISO,
    week.endISO,
    role,
    dept,
    mode
  )

  const { setContent, setOpen } = useFilters()

  const lnOptions = useMemo(
    () => Array.from(new Set(flat.map((e) => e.LN).filter(Boolean))).sort(),
    [flat]
  )
  const commercialOptions = useMemo(
    () => Array.from(new Set(flat.map((e) => e.comercial).filter(Boolean))).sort(),
    [flat]
  )

  const filteredFlat = useMemo(() => {
    return flat.filter((ev) => {
      if (lnFilter !== '__all__' && ev.LN !== lnFilter) return false
      if (commercialFilter !== '__all__' && ev.comercial !== commercialFilter) return false
      if (statusFilter !== '__all__') {
        const st = (ev.status || '').toLowerCase()
        if (st !== statusFilter) return false
      }
      return true
    })
  }, [flat, lnFilter, commercialFilter, statusFilter])

  const filteredDataByDay = useMemo(() => {
    const grouped: Record<string, typeof flat> = {}

    filteredFlat.forEach((ev) => {
      const day = ev.startDate || 'sense-data'
      if (!grouped[day]) grouped[day] = []
      grouped[day].push(ev)
    })

    return grouped
  }, [filteredFlat])

  const exportBase = `pissarra-${mode}-${week.startISO}-${week.endISO}`

  const formatVehicles = (vehicles: typeof flat[number]['vehicles']) => {
    if (!Array.isArray(vehicles) || vehicles.length === 0) return ''
    return vehicles
      .map((v) => {
        const plate = v?.plate || ''
        const driver = v?.conductor || ''
        const type = v?.type || ''
        return [plate, driver, type].filter(Boolean).join(' ')
      })
      .filter(Boolean)
      .join(' | ')
  }

  const formatWorkers = (workers: typeof flat[number]['workers']) => {
    if (!Array.isArray(workers) || workers.length === 0) return ''
    return workers.filter(Boolean).join(', ')
  }

  const exportRows = useMemo(
    () =>
      filteredFlat.map((ev) => {
        if (mode === 'cuina') {
          return {
            Data: ev.startDate || '',
            Hora: ev.startTime || '',
            Esdeveniment: ev.eventName || '',
            Ubicacio: ev.location || '',
            Servei: ev.servei || '',
            Pax: ev.pax ?? '',
            'G1 Responsable': ev.group1Responsible || '',
            'G1 Conductors': (ev.group1Drivers || []).join(', '),
            'G1 Treballadors': (ev.group1Workers || []).join(', '),
            'G1 Meeting point': ev.group1MeetingPoint || '',
            'G1 Hora inici': ev.group1StartTime || '',
            'G2 Responsable': ev.group2Responsible || '',
            'G2 Conductors': (ev.group2Drivers || []).join(', '),
            'G2 Treballadors': (ev.group2Workers || []).join(', '),
            'G2 Meeting point': ev.group2MeetingPoint || '',
            'G2 Hora inici': ev.group2StartTime || '',
          }
        }
        return {
          Data: ev.startDate || '',
          Hora: ev.startTime || '',
          Arribada: ev.arrivalTime || '',
          Esdeveniment: ev.eventName || '',
          Ubicacio: ev.location || '',
          LN: ev.LN || '',
          Servei: ev.servei || '',
          Comercial: ev.comercial || '',
          Responsable: ev.responsableName || '',
          Pax: ev.pax ?? '',
          Vehicles: formatVehicles(ev.vehicles),
          Treballadors: formatWorkers(ev.workers),
        }
      }),
    [filteredFlat, mode]
  )

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pissarra')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const rows = [...filteredFlat].sort((a, b) => {
      const dA = (a.startDate || '').localeCompare(b.startDate || '')
      if (dA !== 0) return dA
      return (a.startTime || '').localeCompare(b.startTime || '')
    })

    const cols =
      mode === 'logistica'
        ? [
            'Data',
            'Hora',
            'Arribada',
            'Esdeveniment',
            'Ubicacio',
            'Vehicles',
            'Treballadors',
          ]
        : mode === 'cuina'
        ? [
            'Data',
            'Hora',
            'Esdeveniment',
            'Ubicacio',
            'Servei',
            'Pax',
            'G1 Responsable',
            'G1 Conductors',
            'G1 Treballadors',
            'G1 Meeting point',
            'G1 Hora inici',
            'G2 Responsable',
            'G2 Conductors',
            'G2 Treballadors',
            'G2 Meeting point',
            'G2 Hora inici',
          ]
        : [
            'Data',
            'Hora',
            'Esdeveniment',
            'Ubicacio',
            'LN',
            'Servei',
            'Comercial',
            'Responsable',
            'Pax',
          ]

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = rows
      .map((ev) => {
        const base =
          mode === 'cuina'
            ? {
                Data: ev.startDate || '',
                Hora: ev.startTime || '',
                Esdeveniment: ev.eventName || '',
                Ubicacio: ev.location || '',
                Servei: ev.servei || '',
                Pax: ev.pax ?? '',
                'G1 Responsable': ev.group1Responsible || '',
                'G1 Conductors': (ev.group1Drivers || []).join(', '),
                'G1 Treballadors': (ev.group1Workers || []).join(', '),
                'G1 Meeting point': ev.group1MeetingPoint || '',
                'G1 Hora inici': ev.group1StartTime || '',
                'G2 Responsable': ev.group2Responsible || '',
                'G2 Conductors': (ev.group2Drivers || []).join(', '),
                'G2 Treballadors': (ev.group2Workers || []).join(', '),
                'G2 Meeting point': ev.group2MeetingPoint || '',
                'G2 Hora inici': ev.group2StartTime || '',
              }
            : {
                Data: ev.startDate || '',
                Hora: ev.startTime || '',
                Arribada: ev.arrivalTime || '',
                Esdeveniment: ev.eventName || '',
                Ubicacio: ev.location || '',
                LN: ev.LN || '',
                Servei: ev.servei || '',
                Comercial: ev.comercial || '',
                Responsable: ev.responsableName || '',
                Pax: ev.pax ?? '',
                Vehicles: formatVehicles(ev.vehicles),
                Treballadors: formatWorkers(ev.workers),
              }
        const cells = cols
          .map((key) => `<td>${escapeHtml(String((base as any)[key] ?? ''))}</td>`)
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
    <h1>Pissarra (${escapeHtml(mode)})</h1>
    <div class="meta">Setmana: ${escapeHtml(week.startISO)} - ${escapeHtml(
      week.endISO
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

  const openFiltersPanel = () => {
    setContent(
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-sm text-gray-700">Línia de negoci</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            value={lnFilter}
            onChange={(e) => setLnFilter(e.target.value)}
          >
            <option value="__all__">Totes</option>
            {lnOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Comercial</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            value={commercialFilter}
            onChange={(e) => setCommercialFilter(e.target.value)}
          >
            <option value="__all__">Tots</option>
            {commercialOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Estat quadrant</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as '__all__' | 'confirmed' | 'draft')
            }
          >
            <option value="__all__">Tots</option>
            <option value="confirmed">Confirmats</option>
            <option value="draft">Esborrany</option>
          </select>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setLnFilter('__all__')
            setCommercialFilter('__all__')
            setStatusFilter('__all__')
            setOpen(false)
          }}
        >
          Neteja filtres
        </Button>
      </div>
    )
    setOpen(true)
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <RoleGuard
      allowedRoles={[
        'admin',
        'direccio',
        'cap',
        'treballador',
        'comercial',
        'usuari',
      ]}
    >
      <main className="flex flex-col h-full w-full overflow-y-auto bg-gray-50">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #pissarra-print-root, #pissarra-print-root * { visibility: visible; }
            #pissarra-print-root { position: absolute; left: 0; top: 0; width: 100%; }
            #pissarra-print-root [data-print='content'] { max-height: none !important; overflow: visible !important; }
          }
        `}</style>

        {/* Barra filtres i mode */}
        <div className="border-b bg-white sticky top-0 z-10 px-3 py-2 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <SmartFilters
              modeDefault="week"
              role={
                session?.user?.role === 'admin'
                  ? 'Admin'
                  : session?.user?.role === 'direccio'
                  ? 'Direcció'
                  : session?.user?.role === 'cap'
                  ? 'Cap Departament'
                  : 'Treballador'
              }
              showDepartment={false}
              showWorker={false}
              showLocation={false}
              showStatus={false}
              showImportance={false}
              compact
              onChange={(f) => {
                if (f.start && f.end) {
                  setWeek({ startISO: f.start, endISO: f.end })
                }
              }}
            />
            <FilterButton onClick={openFiltersPanel} />
            <ExportMenu items={exportItems} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('produccio')}
                className={[
                  'h-9 rounded-md px-3 text-sm border',
                  mode === 'produccio'
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                    : 'border-gray-300 bg-white text-gray-700',
                ].join(' ')}
              >
                Produccio
              </button>
              <button
                type="button"
                onClick={() => setMode('logistica')}
                className={[
                  'h-9 rounded-md px-3 text-sm border',
                  mode === 'logistica'
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                    : 'border-gray-300 bg-white text-gray-700',
                ].join(' ')}
              >
                Logistica
              </button>
              <button
                type="button"
                onClick={() => setMode('cuina')}
                className={[
                  'h-9 rounded-md px-3 text-sm border',
                  mode === 'cuina'
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                    : 'border-gray-300 bg-white text-gray-700',
                ].join(' ')}
              >
                Cuina
              </button>
            </div>
          </div>
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <p className="text-center text-red-500 text-sm mt-4">
            Error: {error}
          </p>
        )}

        {/* Llista */}
        {!loading && !error && (
          <div id="pissarra-print-root">
            <PissarraList
              key={`${week.startISO}-${mode}`}
              dataByDay={filteredDataByDay}
              canEdit={canEdit}
              onUpdate={updateField}
              weekStart={new Date(week.startISO)}
              variant={mode}
            />
          </div>
        )}

      </main>
    </RoleGuard>
  )
}
