import { loadXlsx } from '@/lib/loadXlsx'

export function robaExportFilename(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '-')
  return `${prefix}-${stamp}`
}

type ExportCell = string | number | null | undefined

async function fetchImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

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
  const logoDataUrl = await fetchImageAsDataUrl('/logo.png')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  let y = margin

  pdf.setFillColor(244, 247, 245)
  pdf.roundedRect(margin, y, contentWidth, 64, 12, 12, 'F')
  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, 'PNG', margin + 14, y + 10, 64, 44)
    } catch {
      /* opcional */
    }
  }
  const titleX = logoDataUrl ? margin + 88 : margin + 14
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.setTextColor(20, 83, 45)
  pdf.text(title, titleX, y + 28)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(63, 63, 70)
  pdf.text(`Files: ${rows.length}`, titleX, y + 48)
  y += 78

  const clean = sanitizeRows(rows)
  for (const row of clean) {
    const line = Object.entries(row)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')
    const wrapped = pdf.splitTextToSize(line, contentWidth)
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
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(113, 113, 122)
  pdf.text('Cal Blay · Document generat des de l aplicacio.', margin, pageHeight - margin)
  pdf.save(`${fileBase}.pdf`)
}

type DeliveryReceiptRow = {
  reference: string
  deliveredAt: string
  workerName: string
  department: string
  requestReference?: string
  preparedByName?: string
  createdByName?: string
  lines: Array<{ label: string; quantity: number }>
  signatureDataUrl?: string | null
}

type RequestReceiptRow = {
  reference: string
  requestedAt: string
  workerName: string
  department: string
  status: string
  createdByName?: string
  pickupDate?: string
  lines: Array<{ label: string; quantity: number }>
}

export async function exportDeliveryReceiptsPdf(
  deliveries: DeliveryReceiptRow[],
  fileBase: string
): Promise<void> {
  if (deliveries.length === 0) {
    throw new Error('No hi ha entregues per exportar.')
  }

  const { jsPDF } = await import('jspdf')
  const logoDataUrl = await fetchImageAsDataUrl('/logo.png')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 42
  const contentWidth = pageWidth - margin * 2

  const drawField = (label: string, value: string, x: number, y: number, width: number) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(82, 82, 91)
    pdf.text(label, x, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(24, 24, 27)
    const wrapped = pdf.splitTextToSize(value || '-', width)
    pdf.text(wrapped, x, y + 14)
    return y + 14 + wrapped.length * 13
  }

  deliveries.forEach((delivery, index) => {
    if (index > 0) pdf.addPage()

    let y = margin
    pdf.setFillColor(244, 247, 245)
    pdf.roundedRect(margin, y, contentWidth, 72, 14, 14, 'F')
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'PNG', margin + 18, y + 12, 72, 50)
      } catch {
        // Ignore logo rendering errors and keep the document exportable.
      }
    }
    const headerTextX = logoDataUrl ? margin + 102 : margin + 18
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.setTextColor(20, 83, 45)
    pdf.text('Justificant d entrega de roba', headerTextX, y + 28)
    pdf.setFontSize(10)
    pdf.setTextColor(63, 63, 70)
    pdf.text(`Referencia: ${delivery.reference}`, headerTextX, y + 48)
    pdf.text(`Data: ${delivery.deliveredAt || '-'}`, headerTextX, y + 64)
    y += 96

    const leftX = margin
    const rightX = margin + contentWidth / 2 + 12
    const colWidth = contentWidth / 2 - 12
    const leftBottom = Math.max(
      drawField('Treballador', delivery.workerName, leftX, y, colWidth),
      drawField('Departament', delivery.department, rightX, y, colWidth)
    )
    const secondRowY = leftBottom + 12
    const secondBottom = Math.max(
      drawField('Sollicitud', delivery.requestReference || '-', leftX, secondRowY, colWidth),
      drawField('Preparat per', delivery.preparedByName || delivery.createdByName || '-', rightX, secondRowY, colWidth)
    )
    y = secondBottom + 22

    pdf.setDrawColor(212, 212, 216)
    pdf.setLineWidth(1)
    pdf.roundedRect(margin, y, contentWidth, 24, 8, 8)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(63, 63, 70)
    pdf.text('Article', margin + 14, y + 16)
    pdf.text('Quantitat rebuda', pageWidth - margin - 110, y + 16, { align: 'right' })
    y += 24

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(24, 24, 27)
    delivery.lines.forEach((line) => {
      const wrapped = pdf.splitTextToSize(line.label || '-', contentWidth - 130)
      const rowHeight = Math.max(24, wrapped.length * 13 + 10)
      if (y + rowHeight > pageHeight - 220) {
        pdf.addPage()
        y = margin
      }
      pdf.setDrawColor(228, 228, 231)
      pdf.line(margin, y, pageWidth - margin, y)
      pdf.text(wrapped, margin + 14, y + 16)
      pdf.text(String(line.quantity), pageWidth - margin - 22, y + 16, { align: 'right' })
      y += rowHeight
    })

    y += 18
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(63, 63, 70)
    pdf.text('Signatura', margin, y)
    y += 10
    pdf.roundedRect(margin, y, Math.min(260, contentWidth), 110, 10, 10)

    if (delivery.signatureDataUrl) {
      try {
        pdf.addImage(delivery.signatureDataUrl, 'PNG', margin + 10, y + 10, 240, 90)
      } catch {
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(10)
        pdf.setTextColor(113, 113, 122)
        pdf.text('No s ha pogut incrustar la signatura.', margin + 14, y + 58)
      }
    } else {
      pdf.setFont('helvetica', 'italic')
      pdf.setFontSize(10)
      pdf.setTextColor(113, 113, 122)
      pdf.text('Sense signatura registrada.', margin + 14, y + 58)
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(113, 113, 122)
    pdf.text(
      'Document generat des del modul de Roba personal.',
      margin,
      pageHeight - margin
    )
  })

  pdf.save(`${fileBase}.pdf`)
}

export async function exportRequestReceiptsPdf(
  requests: RequestReceiptRow[],
  fileBase: string
): Promise<void> {
  if (requests.length === 0) {
    throw new Error('No hi ha sollicituds per exportar.')
  }

  const { jsPDF } = await import('jspdf')
  const logoDataUrl = await fetchImageAsDataUrl('/logo.png')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 42
  const contentWidth = pageWidth - margin * 2

  const drawField = (label: string, value: string, x: number, y: number, width: number) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(82, 82, 91)
    pdf.text(label, x, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(24, 24, 27)
    const wrapped = pdf.splitTextToSize(value || '-', width)
    pdf.text(wrapped, x, y + 14)
    return y + 14 + wrapped.length * 13
  }

  requests.forEach((request, index) => {
    if (index > 0) pdf.addPage()

    let y = margin
    pdf.setFillColor(244, 247, 245)
    pdf.roundedRect(margin, y, contentWidth, 72, 14, 14, 'F')
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'PNG', margin + 18, y + 12, 72, 50)
      } catch {
        // Keep export working even if the logo fails to render.
      }
    }
    const headerTextX = logoDataUrl ? margin + 102 : margin + 18
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.setTextColor(20, 83, 45)
    pdf.text('Justificant de sollicitud de roba', headerTextX, y + 28)
    pdf.setFontSize(10)
    pdf.setTextColor(63, 63, 70)
    pdf.text(`Referencia: ${request.reference}`, headerTextX, y + 48)
    pdf.text(`Data: ${request.requestedAt || '-'}`, headerTextX, y + 64)
    y += 96

    const leftX = margin
    const rightX = margin + contentWidth / 2 + 12
    const colWidth = contentWidth / 2 - 12
    const leftBottom = Math.max(
      drawField('Treballador', request.workerName, leftX, y, colWidth),
      drawField('Departament', request.department, rightX, y, colWidth)
    )
    const secondRowY = leftBottom + 12
    const secondBottom = Math.max(
      drawField('Estat', request.status || '-', leftX, secondRowY, colWidth),
      drawField('Sollicitant', request.createdByName || '-', rightX, secondRowY, colWidth)
    )
    y = secondBottom + 12

    if (request.pickupDate) {
      y = drawField('Recollida', request.pickupDate, leftX, y, colWidth) + 18
    } else {
      y += 18
    }

    pdf.setDrawColor(212, 212, 216)
    pdf.setLineWidth(1)
    pdf.roundedRect(margin, y, contentWidth, 24, 8, 8)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(63, 63, 70)
    pdf.text('Article', margin + 14, y + 16)
    pdf.text('Quantitat solicitada', pageWidth - margin - 110, y + 16, { align: 'right' })
    y += 24

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(24, 24, 27)
    request.lines.forEach((line) => {
      const wrapped = pdf.splitTextToSize(line.label || '-', contentWidth - 130)
      const rowHeight = Math.max(24, wrapped.length * 13 + 10)
      if (y + rowHeight > pageHeight - 220) {
        pdf.addPage()
        y = margin
      }
      pdf.setDrawColor(228, 228, 231)
      pdf.line(margin, y, pageWidth - margin, y)
      pdf.text(wrapped, margin + 14, y + 16)
      pdf.text(String(line.quantity), pageWidth - margin - 22, y + 16, { align: 'right' })
      y += rowHeight
    })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(113, 113, 122)
    pdf.text(
      'Document generat des del modul de Roba personal.',
      margin,
      pageHeight - margin
    )
  })

  pdf.save(`${fileBase}.pdf`)
}
