import { format, parseISO } from 'date-fns'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { getStatusLabel, normalizeMaintenanceStatus, PROGRESS_VISIBLE_STATUSES } from './status'
import type {
  JourneyDateFilters,
  PreventiuPlannedItem,
  TicketJourneyItem,
  WorkExportRow,
  WorkItem,
} from './types'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')

export function buildExportRows(
  grouped: Array<[string, WorkItem[]]>
): WorkExportRow[] {
  return grouped.flatMap(([day, items]) =>
    items.map((item) => {
      const isTicket = item.kind === 'ticket'
      const status = isTicket
        ? normalizeMaintenanceStatus((item as TicketJourneyItem).status)
        : normalizeMaintenanceStatus((item as PreventiuPlannedItem).lastStatus)
      const progress =
        !isTicket &&
        PROGRESS_VISIBLE_STATUSES.has(status) &&
        typeof (item as PreventiuPlannedItem).lastProgress === 'number'
          ? `${(item as PreventiuPlannedItem).lastProgress}%`
          : ''
      return {
        Data: format(parseISO(day), 'dd/MM/yyyy'),
        Tipus: isTicket ? 'Ticket' : 'Preventiu',
        Codi: isTicket ? (item as TicketJourneyItem).code || '' : '',
        Titol: item.title || '',
        HoraInici: item.startTime || '',
        HoraFi: item.endTime || '',
        Ubicacio: item.location || '',
        Operari: item.worker || '',
        Estat: getStatusLabel(status, 'assignat'),
        Progres: progress,
      }
    })
  )
}

export async function exportJourneyExcel(
  rows: WorkExportRow[],
  filters: JourneyDateFilters
) {
  const exportBase = `manteniment-fulls-${filters.start || 'start'}-${filters.end || 'end'}`
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'FullsTreball')
  XLSX.writeFile(wb, `${exportBase}.xlsx`)
}

export function exportJourneyPdfTable(rows: WorkExportRow[], filters: JourneyDateFilters) {
  const exportBase = `manteniment-fulls-${filters.start || 'start'}-${filters.end || 'end'}`
  const cols = [
    'Data',
    'Tipus',
    'Codi',
    'Titol',
    'HoraInici',
    'HoraFi',
    'Ubicacio',
    'Operari',
    'Estat',
    'Progres',
  ]

  const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
  const body = rows
    .map((row) => {
      const cells = cols
        .map((key) => `<td>${escapeHtml(String(row[key as keyof WorkExportRow] ?? ''))}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const html = `<!doctype html>
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
    <h1>Manteniment - Fulls de treball</h1>
    <div class="meta">Rang: ${escapeHtml(filters.start || '')} - ${escapeHtml(filters.end || '')}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`

  printBrandedHtmlInNewWindow(html)
}
