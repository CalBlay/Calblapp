// file: src/app/menu/logistica/preparacio/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadXlsx } from '@/lib/loadXlsx'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { RoleGuard } from '@/lib/withRoleGuard'
import { LogisticsGrid } from '@/components/logistics'
import { useLogisticsData } from '@/hooks/useLogisticsData'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'
import type { EditedMap } from '@/components/logistics/LogisticsGrid'
import { Truck } from 'lucide-react'

function parseDM(value: string) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(value?.trim() || '')
  if (!m) return null
  const d = Number(m[1])
  const mm = Number(m[2])
  if (d < 1 || d > 31 || mm < 1 || mm > 12) return null
  return { d, m: mm }
}

function toISOFromDM(dm: string, year: number) {
  const p = parseDM(dm)
  if (!p) return ''
  const dd = String(p.d).padStart(2, '0')
  const mm = String(p.m).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function buildDefaultRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

function parseRoleForFilters(role: string): 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador' {
  if (role === 'admin') return 'Admin'
  if (role === 'direccio') return 'Direcció'
  if (role === 'cap') return 'Cap Departament'
  return 'Treballador'
}

interface PreparationExportRow {
  PreparacioData: string
  PreparacioHora: string
  Event: string
  Ubicacio: string
  Pax: string | number
  DataEvent: string
  HoraEvent: string
}

export default function LogisticsPage() {
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()
  const isWorker = role === 'treballador'
  const isManager = role === 'cap' || role === 'admin' || role === 'direccio'

  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(() => buildDefaultRange())
  const { events, refresh, loading } = useLogisticsData(dateRange)
  const [updating, setUpdating] = useState(false)
  const [edited, setEdited] = useState<EditedMap>({})
  const [rows, setRows] = useState(events)

  useEffect(() => {
    if (events.length > 0) {
      const sorted = [...events].sort((a, b) => {
        const aHas = !!(a.PreparacioData && a.PreparacioHora)
        const bHas = !!(b.PreparacioData && b.PreparacioHora)
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        if (!aHas && !bHas) {
          return new Date(a.DataInici).getTime() - new Date(b.DataInici).getTime()
        }
        const d1 = new Date(`${a.PreparacioData}T${a.PreparacioHora || '00:00'}`).getTime()
        const d2 = new Date(`${b.PreparacioData}T${b.PreparacioHora || '00:00'}`).getTime()
        return d1 - d2
      })
      setRows(sorted)
    } else {
      setRows([])
    }
  }, [events])

  const handleFilterChange = (f: SmartFiltersChange) => {
    if (f.start && f.end) setDateRange({ start: f.start, end: f.end })
  }

  const handleRefresh = async () => {
    setUpdating(true)
    await refresh()
    setUpdating(false)
  }

  const handleConfirm = async () => {
    const ids = Object.keys(edited)
    if (!ids.length) return

    setUpdating(true)

    try {
      const updates: Array<{ id: string; PreparacioData?: string; PreparacioHora?: string }> = []

      for (const id of ids) {
        const original = rows.find((r) => r.id === id)
        const payload: { id: string; PreparacioData?: string; PreparacioHora?: string } = { id }

        if (edited[id]?.PreparacioData) {
          const year = original ? new Date(original.DataInici).getFullYear() : new Date().getFullYear()
          const isoDate = toISOFromDM(edited[id].PreparacioData!, year)
          if (!isoDate) {
            alert(`La data de preparació de l'esdeveniment ${original?.NomEvent || id} no és vàlida.`)
            setUpdating(false)
            return
          }
          payload.PreparacioData = isoDate
        }

        if (edited[id]?.PreparacioHora) {
          payload.PreparacioHora = edited[id].PreparacioHora!
        }

        if (payload.PreparacioData || payload.PreparacioHora) {
          updates.push(payload)
        }
      }

      if (!updates.length) {
        setUpdating(false)
        return
      }

      const res = await fetch('/api/logistics/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      await refresh()
      setEdited({})
    } catch (err) {
      console.error('Error guardant preparacions:', err)
      alert('No s\'han pogut guardar les preparacions. Revisa les dades i torna-ho a provar.')
    } finally {
      setUpdating(false)
    }
  }

  const exportBase = dateRange?.start && dateRange?.end
    ? `preparacio-logistica-${dateRange.start}-${dateRange.end}`
    : 'preparacio-logistica-setmana'

  const exportRows = useMemo<PreparationExportRow[]>(() => {
    return rows.map((ev) => ({
      PreparacioData: ev.PreparacioData || '',
      PreparacioHora: ev.PreparacioHora || '',
      Event: ev.NomEvent || '',
      Ubicacio: ev.Ubicacio || '',
      Pax: ev.NumPax ?? '',
      DataEvent: ev.DataInici || '',
      HoraEvent: ev.HoraInici || '',
    }))
  }, [rows])

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Preparacio')
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
    const cols: Array<keyof PreparationExportRow> = [
      'PreparacioData',
      'PreparacioHora',
      'Event',
      'Ubicacio',
      'Pax',
      'DataEvent',
      'HoraEvent',
    ]

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
    <h1>Preparacio logistica</h1>
    <div class="meta">Rang: ${escapeHtml(
      dateRange?.start || ''
    )} - ${escapeHtml(dateRange?.end || '')}</div>
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
    <section className="space-y-6">
      <ModuleHeader
        icon={<Truck className="h-7 w-7 text-emerald-600" />}
        title="Preparació logística"
        subtitle="Planificació de dates i hores de preparació dels esdeveniments"
        actions={<ExportMenu items={exportItems} />}
      />

      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <LogisticsGrid
          rows={rows}
          loading={loading}
          isWorker={isWorker}
          isManager={isManager}
          edited={edited}
          setEdited={setEdited}
          onFilterChange={handleFilterChange}
          onRefresh={handleRefresh}
          onConfirm={handleConfirm}
          updating={updating}
          filterRole={parseRoleForFilters(role)}
        />
      </RoleGuard>
    </section>
  )
}
