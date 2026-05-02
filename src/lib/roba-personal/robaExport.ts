import { loadXlsx } from '@/lib/loadXlsx'

export function robaExportFilename(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '-')
  return `${prefix}-${stamp}`
}

type ExportCell = string | number | null | undefined

function sanitizeRows(
  rows: Record<string, ExportCell>[]
): Record<string, string | number>[] {
  return rows.map((r) => {
    const o: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(r)) {
      if (v == null) o[k] = ''
      else if (typeof v === 'number' && !Number.isFinite(v)) o[k] = ''
      else o[k] = v
    }
    return o
  })
}

export async function exportRowsToXlsx(
  sheets: { name: string; rows: Record<string, ExportCell>[] }[],
  fileBase: string
): Promise<void> {
  const nonEmpty = sheets.filter((s) => s.rows.length > 0)
  if (nonEmpty.length === 0) {
    throw new Error('No hi ha files per exportar.')
  }
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  for (const { name, rows } of nonEmpty) {
    const ws = XLSX.utils.json_to_sheet(sanitizeRows(rows))
    const safeName = name.replace(/[[\]*?:/\\]/g, ' ').slice(0, 31) || 'Full'
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }
  XLSX.writeFile(wb, `${fileBase}.xlsx`)
}

export async function exportRowsToPdf(
  rows: Record<string, ExportCell>[],
  title: string,
  fileBase: string
): Promise<void> {
  if (rows.length === 0) {
    throw new Error('No hi ha files per exportar.')
  }
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 40
  let y = margin

  pdf.setFontSize(12)
  pdf.text(title, margin, y)
  y += 22
  pdf.setFontSize(9)
  pdf.text(`Files: ${rows.length}`, margin, y)
  y += 16

  const clean = sanitizeRows(rows)
  for (const row of clean) {
    const line = Object.entries(row)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')
    const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2)
    for (const wline of wrapped) {
      if (y > pageHeight - margin) {
        pdf.addPage()
        y = margin
      }
      pdf.text(wline, margin, y)
      y += 11
    }
    y += 4
  }
  pdf.save(`${fileBase}.pdf`)
}
