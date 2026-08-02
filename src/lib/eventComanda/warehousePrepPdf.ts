'use client'

import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import { EVENT_COMANDA_BATCH_STATUS_LABELS } from '@/lib/eventComanda/batchStatus'
import { formatOrderDeliverySummary } from '@/lib/eventComanda/deliverySlots'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import { formatEventComandaQty } from '@/lib/eventComanda/ui'
import { addCalBlayLogoToPdf, fetchCalBlayLogoDataUrl } from '@/lib/exportBranding'

export type WarehousePrepPdfParams = {
  eventTitle: string
  eventMeta?: string
  eventId: string
  batch: EventComandaOrderBatch
  sentAt?: string | null
  sentBy?: string | null
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
  comments?: string | null
}

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function resolvePreparedQty(
  line: EventComandaOrderBatch['lines'][number],
  batchStatus: EventComandaOrderBatch['status']
): number | null {
  if (line.qtyPrepared != null && Number.isFinite(Number(line.qtyPrepared))) {
    return Number(line.qtyPrepared)
  }
  if (batchStatus === 'ready' || batchStatus === 'sent') {
    const requested = Number(line.qtyRequested)
    return Number.isFinite(requested) ? requested : null
  }
  return null
}

function shouldShowPreparedColumn(batch: EventComandaOrderBatch) {
  if (batch.status === 'in_progress' || batch.status === 'ready' || batch.status === 'sent') {
    return true
  }
  return batch.lines.some((line) => line.qtyPrepared != null)
}

export async function exportEventComandaWarehousePrepPdf(params: WarehousePrepPdfParams) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 40
  const footerH = 28
  const contentWidth = pageWidth - margin * 2

  const logoDataUrl = await fetchCalBlayLogoDataUrl()
  let y = margin

  if (addCalBlayLogoToPdf(pdf, logoDataUrl, { x: margin, y, width: 96, height: 36 })) {
    y += 44
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.setTextColor(20, 83, 45)
  pdf.text('Llista de preparació · Magatzem', margin, y)
  y += 22

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(15, 23, 42)
  const titleLines = pdf.splitTextToSize(params.eventTitle, contentWidth)
  pdf.text(titleLines, margin, y)
  y += titleLines.length * 14 + 4

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(71, 85, 105)

  const metaLines: string[] = []
  if (params.eventMeta) metaLines.push(params.eventMeta)
  metaLines.push(
    `Magatzem: ${params.batch.warehouseName || params.batch.warehouseCode || params.batch.warehouseId}`
  )
  metaLines.push(`Estat: ${EVENT_COMANDA_BATCH_STATUS_LABELS[params.batch.status]}`)
  const preparerName = String(params.batch.statusUpdatedBy || '').trim()
  if (
    preparerName &&
    (params.batch.status === 'in_progress' ||
      params.batch.status === 'ready' ||
      params.batch.status === 'sent')
  ) {
    metaLines.push(`Preparador: ${preparerName}`)
  }
  const deliveryLabel = formatOrderDeliverySummary({
    deliveryDate: params.deliveryDate,
    deliveryTimeSlot: params.deliveryTimeSlot,
  })
  if (deliveryLabel) metaLines.push(`Entrega: ${deliveryLabel}`)
  if (params.comments?.trim()) metaLines.push(`Comentaris: ${params.comments.trim()}`)
  if (params.sentAt) {
    metaLines.push(`Enviada: ${new Date(params.sentAt).toLocaleString('ca-ES')}`)
  }
  if (params.sentBy) metaLines.push(`Enviada per: ${params.sentBy}`)
  metaLines.push(`Línies: ${params.batch.lines.length}`)

  for (const line of metaLines) {
    pdf.text(line, margin, y)
    y += 13
  }
  y += 8

  const hasPrepared = shouldShowPreparedColumn(params.batch)
  const headers = hasPrepared
    ? ['#', 'Codi', 'Article', 'Demanat', 'Preparat', 'U.']
    : ['#', 'Codi', 'Article', 'Quantitat', 'U.']
  const widths = hasPrepared
    ? [24, 64, contentWidth - 24 - 64 - 58 - 58 - 32, 58, 58, 32]
    : [28, 72, contentWidth - 28 - 72 - 72 - 36, 72, 36]
  const rowH = 18
  const headH = 22

  const ensureSpace = (need: number) => {
    if (y + need <= pageHeight - margin - footerH) return
    pdf.addPage()
    y = margin
  }

  const drawHeader = () => {
    ensureSpace(headH + rowH)
    let x = margin
    pdf.setFillColor(241, 245, 249)
    pdf.rect(margin, y, contentWidth, headH, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(51, 65, 85)
    headers.forEach((header, index) => {
      pdf.text(header, x + 6, y + 14)
      x += widths[index]
    })
    y += headH
  }

  drawHeader()

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(15, 23, 42)

  params.batch.lines.forEach((line, index) => {
    const articleLines = pdf.splitTextToSize(line.articleName, widths[2] - 10)
    const rh = Math.max(rowH, articleLines.length * 11 + 6)
    ensureSpace(rh + 4)
    if (y === margin) drawHeader()

    let x = margin
    if (index % 2 === 1) {
      pdf.setFillColor(248, 250, 252)
      pdf.rect(margin, y, contentWidth, rh, 'F')
    }

    const cells = hasPrepared
      ? [
          String(index + 1),
          line.articleCode,
          line.articleName,
          formatEventComandaQty(line.qtyRequested, line.qtyUnit),
          (() => {
            const prepared = resolvePreparedQty(line, params.batch.status)
            return prepared == null
              ? '—'
              : formatEventComandaQty(prepared, line.qtyUnit)
          })(),
          eventComandaQtyUnit(line.qtyUnit),
        ]
      : [
          String(index + 1),
          line.articleCode,
          line.articleName,
          formatEventComandaQty(line.qtyRequested, line.qtyUnit),
          eventComandaQtyUnit(line.qtyUnit),
        ]

    cells.forEach((cell, cellIndex) => {
      const text =
        cellIndex === 2 ? pdf.splitTextToSize(cell, widths[cellIndex] - 10) : [cell]
      pdf.text(text, x + 6, y + 12)
      x += widths[cellIndex]
    })

    y += rh
  })

  const totalPages = pdf.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(100, 116, 139)
    pdf.text('Cal Blay · Comanda esdeveniments', margin, pageHeight - margin + 4)
    pdf.text(`Pàgina ${page} / ${totalPages}`, pageWidth - margin, pageHeight - margin + 4, {
      align: 'right',
    })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const warehouseSlug = slug(params.batch.warehouseCode || params.batch.warehouseName || 'magatzem')
  const eventSlug = slug(params.eventTitle).slice(0, 40) || params.eventId
  pdf.save(`comanda-${warehouseSlug}-${eventSlug}-${stamp}.pdf`)
}
