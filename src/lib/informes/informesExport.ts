import { exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { ROBA_REQUEST_STATUS_LABEL } from '@/app/menu/roba-personal/robaPersonalConstants'
import type { RrhhReportContext, RrhhRobaOverview } from '@/lib/informes/rrhhOverview'
import { deriveRrhhSignals } from '@/lib/informes/rrhhSignals'
import type { jsPDF } from 'jspdf'

export { robaExportFilename as informesExportFilename }

/** Vista exportada: KPIs (informe analític complet) vs informe a mida (resum curt + gràfics). */
export type RrhhRobaInformeExportMode = 'kpis' | 'custom'

function criteriaRowsForExport(
  data: RrhhRobaOverview,
  periodLabel: string
): { Criteri: string; Valor: string }[] {
  const ctx: RrhhReportContext | undefined = data.reportContext
  const rows: { Criteri: string; Valor: string }[] = []
  if (ctx?.kind === 'range' && ctx.dateFrom && ctx.dateTo) {
    rows.push({
      Criteri: 'Finestra temporal',
      Valor: `Sol·licituds creades del ${ctx.dateFrom} al ${ctx.dateTo} (filtre per data al client)`,
    })
  } else if (ctx?.kind === 'rolling' && ctx.rollingDays != null) {
    rows.push({
      Criteri: 'Finestra temporal',
      Valor: `Últims ${ctx.rollingDays} dies (sol·licituds creades en aquest interval)`,
    })
  } else {
    rows.push({ Criteri: 'Finestra temporal', Valor: periodLabel })
  }
  rows.push({
    Criteri: 'Departament sol·licitant',
    Valor: ctx?.department?.trim() ? ctx.department : 'Tots',
  })
  const estat = (ctx?.statusLabel?.trim() || ctx?.status?.trim())
    ? ctx?.statusLabel || ctx?.status || '—'
    : 'Tots'
  rows.push({ Criteri: 'Estat de la sol·licitud', Valor: estat })
  rows.push({
    Criteri: 'Article (línia inclosa)',
    Valor:
      ctx?.productLabel?.trim() || ctx?.productId?.trim()
        ? ctx?.productLabel || ctx?.productId || '—'
        : 'Tots',
  })
  rows.push({
    Criteri: 'Límit lectura (sol·licituds recents)',
    Valor: String(data.datasetScanLimit),
  })
  rows.push({
    Criteri: 'Etiqueta període a la capçalera',
    Valor: periodLabel,
  })
  return rows
}

function criteriaKvLinesForPdf(data: RrhhRobaOverview, periodLabel: string): string[] {
  return criteriaRowsForExport(data, periodLabel).map((r) => `${r.Criteri}: ${r.Valor}`)
}

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

function ensureY(
  pdf: { addPage: () => void; internal: { pageSize: { getHeight: () => number } } },
  y: number,
  need: number,
  pageHeight: number,
  margin: number,
  footerReserve: number
): number {
  if (y + need > pageHeight - margin - footerReserve) {
    pdf.addPage()
    return margin
  }
  return y
}

/** Colors alineats amb la paleta de la pantalla d’informes. */
const CHART_RGB: [number, number, number][] = [
  [5, 150, 105],
  [13, 148, 136],
  [37, 99, 235],
  [124, 58, 237],
  [217, 119, 6],
  [225, 29, 72],
  [100, 116, 139],
  [71, 85, 105],
]

const PDF_THEME = {
  brand: [20, 83, 45] as [number, number, number],
  brandBar: [16, 70, 38] as [number, number, number],
  /** Fons suau per a targetes i faixes (alineat amb emerald/shadcn). */
  brandWash: [236, 253, 245] as [number, number, number],
  headerBg: [250, 252, 250] as [number, number, number],
  headerBorder: [190, 210, 198] as [number, number, number],
  muted: [82, 82, 91] as [number, number, number],
  text: [24, 24, 27] as [number, number, number],
  tableHead: [209, 250, 229] as [number, number, number],
  tableStripe: [248, 250, 249] as [number, number, number],
  tableLine: [220, 228, 220] as [number, number, number],
  cardBg: [255, 255, 255] as [number, number, number],
  cardBorder: [204, 220, 208] as [number, number, number],
  sectionStrip: [241, 249, 244] as [number, number, number],
  footer: [100, 100, 108] as [number, number, number],
  footerRule: [167, 201, 176] as [number, number, number],
  signal: {
    positive: [20, 83, 45] as [number, number, number],
    neutral: [82, 82, 91] as [number, number, number],
    attention: [180, 83, 9] as [number, number, number],
    critical: [185, 28, 28] as [number, number, number],
  },
}

type PdfLayoutCtx = {
  pdf: jsPDF
  margin: number
  contentWidth: number
  pageWidth: number
  pageHeight: number
  footerH: number
}

function pdfEnsure(
  pdf: PdfLayoutCtx['pdf'],
  y: number,
  need: number,
  pageHeight: number,
  margin: number,
  footerH: number
): number {
  return ensureY(pdf, y, need, pageHeight, margin, footerH)
}

function formatDayShortCa(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })
}

/** Barres apil·lades: unitats (verd) + sol·licituds (índigo), mateix eix temporal que la UI. */
function drawPdfVisualDaily(pdf: jsPDF, daily: RrhhRobaOverview['dailyActivity'], yStart: number, c: PdfLayoutCtx): number {
  let y = yStart
  const head = 18
  const chartH = 128
  const foot = 20
  y = pdfEnsure(pdf, y, head + chartH + foot + 6, c.pageHeight, c.margin, c.footerH)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...PDF_THEME.text)
  pdf.text('Activitat diària (UTC)', c.margin, y + 10)
  pdf.setDrawColor(...PDF_THEME.brand)
  pdf.setLineWidth(0.75)
  pdf.line(c.margin, y + 14, c.margin + 72, y + 14)
  pdf.setLineWidth(0.35)
  y += head + 2

  const n = daily.length
  if (n === 0) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...PDF_THEME.muted)
    pdf.text('Sense sèrie diària.', c.margin, y + 24)
    return y + chartH
  }

  const maxU = Math.max(1, ...daily.map((d) => d.requestedUnits))
  const maxR = Math.max(1, ...daily.map((d) => d.requestCount))
  const padL = 6
  const padB = 22
  const padT = 4
  const innerW = c.contentWidth - padL - 8
  const innerH = chartH - padB - padT
  const x0 = c.margin + padL
  const baseline = y + padT + innerH
  const h2 = innerH * 0.34
  const gapMid = innerH * 0.08
  const h1 = innerH - h2 - gapMid
  const barGap = Math.min(3.5, innerW / (n * 5))
  const barW = Math.max(2.5, (innerW - barGap * (n + 1)) / n)

  pdf.setDrawColor(...PDF_THEME.tableLine)
  pdf.setLineWidth(0.5)
  pdf.line(x0, baseline, x0 + innerW, baseline)

  for (let i = 0; i < n; i++) {
    const bx = x0 + barGap + i * (barW + barGap)
    const u = daily[i].requestedUnits
    const bh1 = (u / maxU) * h1
    pdf.setFillColor(5, 150, 105)
    pdf.roundedRect(bx, baseline - h2 - gapMid - bh1, barW, bh1, 1, 1, 'F')
    const rc = daily[i].requestCount
    const bh2 = (rc / maxR) * h2
    pdf.setFillColor(79, 70, 229)
    pdf.roundedRect(bx, baseline - bh2, barW, bh2, 1, 1, 'F')
  }

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.setTextColor(...PDF_THEME.muted)
  const step = n > 14 ? Math.ceil(n / 9) : n > 8 ? 2 : 1
  for (let i = 0; i < n; i += step) {
    const bx = x0 + barGap + i * (barW + barGap)
    pdf.text(formatDayShortCa(daily[i].day), bx + barW / 2, baseline + 14, { align: 'center' })
  }

  y += chartH
  pdf.setFontSize(8)
  pdf.text(
    'Verd: unitats sol·licitades · Índigo: sol·licituds creades (escales independents).',
    c.margin,
    y + 6
  )
  return y + foot
}

function drawPdfVisualStatus(
  pdf: jsPDF,
  byStatus: Record<string, number>,
  yStart: number,
  c: PdfLayoutCtx
): number {
  let y = yStart
  const entries = Object.entries(byStatus)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  const rowH = 15
  const labelW = 118
  const barMaxW = c.contentWidth - labelW - 10
  const need = 16 + entries.length * rowH + 10
  y = pdfEnsure(pdf, y, need, c.pageHeight, c.margin, c.footerH)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...PDF_THEME.text)
  pdf.text('Estats (barres proporcionals)', c.margin, y + 10)
  pdf.setDrawColor(...PDF_THEME.brand)
  pdf.setLineWidth(0.75)
  pdf.line(c.margin, y + 14, c.margin + 120, y + 14)
  pdf.setLineWidth(0.35)
  y += 18

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  entries.forEach(([code, val], i) => {
    const name = ROBA_REQUEST_STATUS_LABEL[code] || code
    pdf.setTextColor(...PDF_THEME.text)
    pdf.text(name.length > 26 ? `${name.slice(0, 25)}…` : name, c.margin + 4, y + 9)
    pdf.setTextColor(...PDF_THEME.muted)
    pdf.text(String(val), c.margin + labelW - 22, y + 9)
    const bw = (val / total) * barMaxW
    const [r, g, b] = CHART_RGB[i % CHART_RGB.length]
    pdf.setFillColor(r, g, b)
    pdf.roundedRect(c.margin + labelW, y + 1, Math.max(bw, 2.5), 9, 1.5, 1.5, 'F')
    y += rowH
  })

  return y + 6
}

function drawPdfVisualDeptArticle(
  pdf: jsPDF,
  mix: RrhhRobaOverview['deptArticleMix'],
  yStart: number,
  c: PdfLayoutCtx
): number {
  let y = yStart
  const rows = mix.slice(0, 10)
  if (rows.length === 0) {
    y = pdfEnsure(pdf, y, 44, c.pageHeight, c.margin, c.footerH)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(...PDF_THEME.text)
    pdf.text('Departament × article', c.margin, y + 10)
    pdf.setDrawColor(...PDF_THEME.brand)
    pdf.setLineWidth(0.75)
    pdf.line(c.margin, y + 14, c.margin + 118, y + 14)
    pdf.setLineWidth(0.35)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(...PDF_THEME.muted)
    pdf.text('Sense combinacions al període.', c.margin, y + 30)
    return y + 40
  }

  const maxU = Math.max(1, ...rows.map((r) => r.units))
  const labelW = c.contentWidth * 0.5
  const barMaxW = c.contentWidth - labelW - 14
  let need = 22
  pdf.setFont('helvetica', 'normal')
  rows.forEach((r) => {
    const mixLabel = `${r.department} · ${r.productLabel}`
    pdf.setFontSize(7.5)
    const lines = pdf.splitTextToSize(mixLabel, labelW - 6)
    need += Math.max(13, lines.length * 9 + 4)
  })
  need += 12
  y = pdfEnsure(pdf, y, need, c.pageHeight, c.margin, c.footerH)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...PDF_THEME.text)
  pdf.text('Departament × article (top unitats)', c.margin, y + 10)
  pdf.setDrawColor(...PDF_THEME.brand)
  pdf.setLineWidth(0.75)
  pdf.line(c.margin, y + 14, c.margin + 200, y + 14)
  pdf.setLineWidth(0.35)
  y += 18

  rows.forEach((r, i) => {
    const mixLabel = `${r.department} · ${r.productLabel}`
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(...PDF_THEME.text)
    const lines = pdf.splitTextToSize(mixLabel, labelW - 6)
    const rh = Math.max(12, lines.length * 9 + 2)
    y = pdfEnsure(pdf, y, rh + 4, c.pageHeight, c.margin, c.footerH)
    pdf.text(lines, c.margin + 4, y + 8)
    const bw = (r.units / maxU) * barMaxW
    const [cr, cg, cb] = CHART_RGB[(CHART_RGB.length - 1 - (i % CHART_RGB.length)) % CHART_RGB.length]
    pdf.setFillColor(cr, cg, cb)
    pdf.roundedRect(c.margin + labelW, y + 1, Math.max(bw, 3), 9, 1.5, 1.5, 'F')
    pdf.setFontSize(7)
    pdf.setTextColor(...PDF_THEME.muted)
    pdf.text(String(r.units), c.margin + labelW + bw + 3, y + 9)
    y += rh
  })

  return y + 8
}

/**
 * Informe PDF RRHH (dotacio roba): capçalera amb logo Cal Blay.
 * `kpis`: indicadors complets, vista visual i taules; `custom`: només resum del tall (4 mètriques) i vista visual.
 */
export async function exportRrhhRobaInformePdf(
  data: RrhhRobaOverview,
  periodLabel: string,
  fileBase: string,
  mode: RrhhRobaInformeExportMode = 'kpis'
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const logoDataUrl = await fetchImageAsDataUrl('/logo.png')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  const footerH = 22
  let sectionNum = 0

  const ensure = (y: number, need: number) => ensureY(pdf, y, need, pageHeight, margin, footerH)

  const drawFooters = () => {
    const total = pdf.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i)
      pdf.setDrawColor(...PDF_THEME.footerRule)
      pdf.setLineWidth(0.65)
      pdf.line(margin, pageHeight - margin - footerH + 8, pageWidth - margin, pageHeight - margin - footerH + 8)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...PDF_THEME.footer)
      pdf.text('Cal Blay · Informes interns · PDF', margin, pageHeight - margin - 4)
      pdf.text(
        `P\u00e0gina ${i} / ${total}`,
        pageWidth - margin,
        pageHeight - margin - 4,
        { align: 'right' }
      )
    }
  }

  const drawBrandBar = () => {
    pdf.setFillColor(...PDF_THEME.brandBar)
    pdf.rect(0, 0, pageWidth, 6, 'F')
  }

  const drawHeaderBlock = (yStart: number) => {
    let y = yStart
    drawBrandBar()
    y += 20
    const headerH = 84
    const stripW = 8
    const cardX = margin + stripW
    const cardW = contentWidth - stripW
    pdf.setFillColor(...PDF_THEME.brand)
    pdf.rect(margin, y, stripW, headerH, 'F')
    pdf.setFillColor(...PDF_THEME.headerBg)
    pdf.roundedRect(cardX, y, cardW, headerH, 10, 10, 'F')
    pdf.setDrawColor(...PDF_THEME.headerBorder)
    pdf.setLineWidth(0.55)
    pdf.roundedRect(cardX, y, cardW, headerH, 10, 10, 'S')

    const pad = 18
    const logoW = 76
    const logoH = 48
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'PNG', cardX + pad, y + (headerH - logoH) / 2, logoW, logoH)
      } catch {
        /* logo opcional */
      }
    }
    const textX = logoDataUrl ? cardX + pad + logoW + 16 : cardX + pad
    const textW = cardW - (textX - cardX) - pad
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...PDF_THEME.muted)
    pdf.text('MÒDUL INFORMES', textX, y + 22)
    pdf.setFontSize(19)
    pdf.setTextColor(...PDF_THEME.brand)
    const titleLines = pdf.splitTextToSize('RRHH — Dotació de roba personal', textW)
    pdf.text(titleLines, textX, y + 42)
    const titleExtra = Math.max(0, (titleLines.length - 1) * 17)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10.5)
    pdf.setTextColor(...PDF_THEME.text)
    pdf.text(`Per\u00edode: ${periodLabel}`, textX, y + 58 + titleExtra)
    pdf.setFontSize(8.5)
    pdf.setTextColor(...PDF_THEME.muted)
    pdf.text(
      `Generat ${new Date().toLocaleString('ca-ES', { dateStyle: 'medium', timeStyle: 'short' })}`,
      textX,
      y + 74 + titleExtra
    )
    return y + headerH + 26
  }

  const drawCriteriaBlock = (lines: string[]) => {
    if (lines.length === 0) return
    const pad = 14
    const lineH = 12
    const titleH = 20
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    let innerH = titleH + 6
    for (const line of lines) {
      const wrapped = pdf.splitTextToSize(`\u2022  ${line}`, contentWidth - pad * 2 - 6)
      innerH += wrapped.length * lineH
    }
    const boxH = innerH + pad * 2
    y = ensure(y, boxH + 10)
    pdf.setFillColor(...PDF_THEME.brandWash)
    pdf.roundedRect(margin, y, contentWidth, boxH, 8, 8, 'F')
    pdf.setFillColor(...PDF_THEME.brand)
    pdf.roundedRect(margin, y, 5, boxH, 2, 2, 'F')
    pdf.setDrawColor(...PDF_THEME.headerBorder)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(margin, y, contentWidth, boxH, 8, 8, 'S')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(...PDF_THEME.text)
    pdf.text('Criteris de tall (reprodu\u00efbilitat)', margin + pad + 4, y + pad + 10)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...PDF_THEME.text)
    let ly = y + pad + titleH + 6
    for (const line of lines) {
      const wrapped = pdf.splitTextToSize(`\u2022  ${line}`, contentWidth - pad * 2 - 6)
      pdf.text(wrapped, margin + pad + 4, ly)
      ly += wrapped.length * lineH
    }
    y += boxH + 16
  }

  let y = drawHeaderBlock(margin)

  const critLines = criteriaKvLinesForPdf(data, periodLabel)
  drawCriteriaBlock(critLines)

  const sectionTitle = (title: string) => {
    sectionNum += 1
    const badgeR = 12
    const titleX = margin + 16 + badgeR * 2 + 12
    const titleMaxW = pageWidth - margin - titleX - 10
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    const ttlLines = pdf.splitTextToSize(title, titleMaxW)
    const stripH = Math.max(40, 18 + ttlLines.length * 15)
    y = ensure(y, stripH + 12)
    pdf.setFillColor(...PDF_THEME.sectionStrip)
    pdf.roundedRect(margin, y, contentWidth, stripH, 7, 7, 'F')
    pdf.setDrawColor(...PDF_THEME.headerBorder)
    pdf.setLineWidth(0.45)
    pdf.roundedRect(margin, y, contentWidth, stripH, 7, 7, 'S')
    const badgeCx = margin + 16 + badgeR
    const badgeCy = y + stripH / 2
    pdf.setFillColor(...PDF_THEME.brand)
    pdf.circle(badgeCx, badgeCy, badgeR, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(255, 255, 255)
    pdf.text(String(sectionNum), badgeCx, badgeCy + 4, { align: 'center' })
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.setTextColor(...PDF_THEME.text)
    const titleBlockH = ttlLines.length * 15
    const ty = y + stripH / 2 - titleBlockH / 2 + 12
    pdf.text(ttlLines, titleX, ty)
    y += stripH + 14
  }

  const drawMetricCards = (items: { label: string; value: string }[]) => {
    const gap = 12
    const colW = (contentWidth - gap) / 2
    const baseCardH = 56
    let rowY = y

    const measureCard = (label: string, value: string, w: number) => {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      const lw = w - 24
      const labelLines = pdf.splitTextToSize(label.toUpperCase(), lw)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      const valueLines = pdf.splitTextToSize(value, lw)
      return 22 + labelLines.length * 9 + 6 + valueLines.length * 16 + 14
    }

    const paintCard = (
      x: number,
      item: { label: string; value: string },
      w: number,
      h: number,
      top: number
    ) => {
      pdf.setFillColor(...PDF_THEME.brandWash)
      pdf.roundedRect(x, top, w, h, 8, 8, 'F')
      pdf.setFillColor(...PDF_THEME.brand)
      pdf.rect(x + 10, top + 7, w - 20, 3.2, 'F')
      pdf.setDrawColor(...PDF_THEME.cardBorder)
      pdf.setLineWidth(0.45)
      pdf.roundedRect(x, top, w, h, 8, 8, 'S')
      let cy = top + 22
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.setTextColor(...PDF_THEME.muted)
      const lLines = pdf.splitTextToSize(item.label.toUpperCase(), w - 24)
      pdf.text(lLines, x + 12, cy)
      cy += lLines.length * 9 + 6
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.setTextColor(...PDF_THEME.brand)
      const vLines = pdf.splitTextToSize(item.value, w - 24)
      pdf.text(vLines, x + 12, cy)
    }

    for (let i = 0; i < items.length; i += 2) {
      const left = items[i]!
      const right = items[i + 1]
      let rowH: number
      if (right) {
        rowH = Math.max(
          measureCard(left.label, left.value, colW),
          measureCard(right.label, right.value, colW),
          baseCardH
        )
      } else {
        rowH = Math.max(measureCard(left.label, left.value, contentWidth), baseCardH)
      }
      rowY = ensure(rowY, rowH + gap)
      const top = rowY
      if (right) {
        paintCard(margin, left, colW, rowH, top)
        paintCard(margin + colW + gap, right, colW, rowH, top)
      } else {
        paintCard(margin, left, contentWidth, rowH, top)
      }
      rowY += rowH + gap
    }
    y = rowY
  }

  const drawTable = (
    headers: string[],
    colWidths: number[],
    rows: string[][],
    headHeight = 22,
    rowMinH = 18
  ) => {
    const x0 = margin
    let cx = x0
    const totalW = colWidths.reduce((a, b) => a + b, 0)
    const scale = contentWidth / totalW
    const widths = colWidths.map((w) => w * scale)

    const rowHeightFor = (cells: string[], hPad: number) => {
      let maxLines = 1
      cells.forEach((cell, i) => {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        const lines = pdf.splitTextToSize(cell, widths[i] - 10)
        maxLines = Math.max(maxLines, lines.length)
      })
      return Math.max(rowMinH, maxLines * 11 + hPad)
    }

    const hh = Math.max(headHeight, 26)
    y = ensure(y, hh + 10)
    cx = x0
    pdf.setFillColor(...PDF_THEME.tableHead)
    pdf.roundedRect(x0, y, contentWidth, hh, 5, 5, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(...PDF_THEME.brand)
    headers.forEach((h, i) => {
      pdf.text(h, cx + 8, y + 17)
      cx += widths[i]
    })
    pdf.setDrawColor(...PDF_THEME.tableLine)
    pdf.setLineWidth(0.45)
    pdf.line(x0, y + hh, x0 + contentWidth, y + hh)
    y += hh

    rows.forEach((cells, ri) => {
      const rh = rowHeightFor(cells, 12)
      y = ensure(y, rh + 2)
      if (ri % 2 === 1) {
        pdf.setFillColor(...PDF_THEME.tableStripe)
        pdf.rect(x0, y, contentWidth, rh, 'F')
      }
      cx = x0
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(...PDF_THEME.text)
      cells.forEach((cell, i) => {
        const lines = pdf.splitTextToSize(cell, widths[i] - 14)
        pdf.text(lines, cx + 8, y + 14)
        cx += widths[i]
      })
      pdf.setDrawColor(...PDF_THEME.tableLine)
      pdf.setLineWidth(0.35)
      pdf.line(x0, y + rh, x0 + contentWidth, y + rh)
      y += rh
    })
    y += 12
  }

  const pctCompl =
    data.pctDeliveredVsRequested != null
      ? `${data.pctDeliveredVsRequested.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`
      : '—'
  const pctAmbEnt =
    data.totalRequests > 0
      ? `${((100 * data.requestsWithSomeDelivery) / data.totalRequests).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}%`
      : '—'
  const pctCanc =
    data.totalRequests > 0
      ? `${((100 * data.cancelledRequestsInPeriod) / data.totalRequests).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}%`
      : '—'
  const mitjanaDies =
    data.avgDaysToFirstDelivery != null
      ? data.avgDaysToFirstDelivery.toLocaleString('ca-ES', { maximumFractionDigits: 1 })
      : '—'

  const layoutCtx: PdfLayoutCtx = { pdf, margin, contentWidth, pageWidth, pageHeight, footerH }

  if (mode === 'custom') {
    sectionTitle('Resum del tall')
    drawMetricCards([
      { label: 'Sol·licituds', value: String(data.totalRequests) },
      { label: 'Unitats sol·lic.', value: String(data.requestedUnitsInPeriod) },
      { label: 'Unitats lliurades', value: String(data.deliveredUnitsLinked) },
      { label: 'Compliment', value: pctCompl },
    ])
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(7)
    pdf.setTextColor(...PDF_THEME.muted)
    const cobNote = pdf.splitTextToSize(
      `Cobertura: fins a ${data.datasetScanLimit} sol·licituds més recents.`,
      contentWidth
    )
    y = pdfEnsure(pdf, y, cobNote.length * 9 + 12, pageHeight, margin, footerH)
    pdf.text(cobNote, margin, y + 8)
    y += cobNote.length * 9 + 16

    sectionTitle('Vista visual')
    y = drawPdfVisualDaily(pdf, data.dailyActivity, y, layoutCtx)
    y = drawPdfVisualStatus(pdf, data.byStatus, y, layoutCtx)
    y = drawPdfVisualDeptArticle(pdf, data.deptArticleMix, y, layoutCtx)

    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(7)
    pdf.setTextColor(...PDF_THEME.muted)
    const vistaNoteCustom = pdf.splitTextToSize(
      'Aquest apartat coincideix amb la «Vista visual» de la pantalla (activitat diària, estats i departament × article).',
      contentWidth
    )
    y = pdfEnsure(pdf, y, vistaNoteCustom.length * 9 + 12, pageHeight, margin, footerH)
    pdf.text(vistaNoteCustom, margin, y + 8)
    y += vistaNoteCustom.length * 9 + 16

    drawFooters()
    pdf.save(`${fileBase}.pdf`)
    return
  }

  sectionTitle('Indicadors principals')
  drawMetricCards([
    { label: 'Sol·licituds al període', value: String(data.totalRequests) },
    { label: 'Amb entrega registrada', value: `${data.requestsWithSomeDelivery} (${pctAmbEnt})` },
    { label: 'Sense entrega (actives)', value: String(data.requestsPendingNoDelivery) },
    { label: 'Unitats sol·licitades', value: String(data.requestedUnitsInPeriod) },
    { label: 'Unitats lliurades (vinc.)', value: String(data.deliveredUnitsLinked) },
    { label: 'Compliment (lliur./sol·lic.)', value: pctCompl },
    { label: 'Dies fins 1a entrega (mitj.)', value: mitjanaDies },
    { label: 'Incidències recepció obertes', value: String(data.deliveriesWithOpenDispute) },
    { label: 'Cancel·lades al període', value: `${data.cancelledRequestsInPeriod} (${pctCanc})` },
    {
      label: 'Mostra dades (màx. sol·licituds)',
      value: String(data.datasetScanLimit),
    },
  ])

  sectionTitle('Vista visual')
  y = drawPdfVisualDaily(pdf, data.dailyActivity, y, layoutCtx)
  y = drawPdfVisualStatus(pdf, data.byStatus, y, layoutCtx)
  y = drawPdfVisualDeptArticle(pdf, data.deptArticleMix, y, layoutCtx)

  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(7)
  pdf.setTextColor(...PDF_THEME.muted)
  const vistaNote = pdf.splitTextToSize(
    'Aquest apartat resumeix gràficament el mateix conjunt de dades que la «Vista visual» de la pantalla (activitat diària, estats i departament × article). Les taules següents en detallen els valors exactes.',
    contentWidth
  )
  y = pdfEnsure(pdf, y, vistaNote.length * 9 + 12, pageHeight, margin, footerH)
  pdf.text(vistaNote, margin, y + 8)
  y += vistaNote.length * 9 + 16

  sectionTitle('Distribució per estat (taula)')
  const statusRows = Object.entries(data.byStatus).map(([st, n]) => {
    const label = ROBA_REQUEST_STATUS_LABEL[st] || st
    return [label, String(n)]
  })
  drawTable(['Estat', 'Nombre'], [0.72, 0.28], statusRows)

  sectionTitle('Top articles (unitats sol·licitades)')
  const articleRows = data.topProducts.map((p, i) => [
    String(i + 1),
    p.label,
    String(p.quantity),
    `${p.shareOfRequestedPct.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`,
  ])
  drawTable(['#', 'Article', 'Unitats', '% demanda'], [0.06, 0.52, 0.2, 0.22], articleRows)

  sectionTitle('Top departaments')
  const deptRows = data.topDepartments.map((d, i) => [
    String(i + 1),
    d.department,
    String(d.requestCount),
    String(d.requestedUnits),
    `${d.shareOfRequestedPct.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`,
  ])
  drawTable(
    ['#', 'Departament', 'Sol·lic.', 'Unitats', '% demanda'],
    [0.06, 0.38, 0.14, 0.16, 0.26],
    deptRows
  )

  sectionTitle('Lectura de control (automàtica)')
  const signals = deriveRrhhSignals(data)
  for (const s of signals) {
    const tone = PDF_THEME.signal[s.tone] ?? PDF_THEME.signal.neutral
    const lines = pdf.splitTextToSize(s.message, contentWidth - 36)
    const boxPad = 14
    const blH = boxPad * 2 + lines.length * 11.5 + 4
    y = ensure(y, blH + 4)
    pdf.setFillColor(...PDF_THEME.brandWash)
    pdf.roundedRect(margin, y, contentWidth, blH, 7, 7, 'F')
    pdf.setDrawColor(...PDF_THEME.cardBorder)
    pdf.setLineWidth(0.4)
    pdf.roundedRect(margin, y, contentWidth, blH, 7, 7, 'S')
    pdf.setFillColor(...tone)
    pdf.roundedRect(margin + 8, y + 10, 3.5, blH - 20, 1.5, 1.5, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...PDF_THEME.text)
    pdf.text(lines, margin + 20, y + boxPad + 8)
    y += blH + 8
  }

  drawFooters()

  pdf.save(`${fileBase}.pdf`)
}

export async function exportRrhhRobaInformeXlsx(
  data: RrhhRobaOverview,
  periodLabel: string,
  fileBase: string,
  mode: RrhhRobaInformeExportMode = 'kpis'
) {
  const pctCompl =
    data.pctDeliveredVsRequested != null
      ? `${data.pctDeliveredVsRequested.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`
      : ''
  const pctAmbEnt =
    data.totalRequests > 0
      ? `${((100 * data.requestsWithSomeDelivery) / data.totalRequests).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}%`
      : ''
  const pctCanc =
    data.totalRequests > 0
      ? `${((100 * data.cancelledRequestsInPeriod) / data.totalRequests).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}%`
      : ''

  const resumKpis = [
    { Metrica: 'Periode', Valor: periodLabel },
    { Metrica: 'Sollicituds', Valor: data.totalRequests },
    { Metrica: 'Amb entrega', Valor: `${data.requestsWithSomeDelivery} (${pctAmbEnt})` },
    { Metrica: 'Sense entrega actives', Valor: data.requestsPendingNoDelivery },
    { Metrica: 'Unitats solicitades', Valor: data.requestedUnitsInPeriod },
    { Metrica: 'Unitats lliurades', Valor: data.deliveredUnitsLinked },
    { Metrica: 'Compliment %', Valor: pctCompl },
    {
      Metrica: 'Dies fins 1a entrega (mitj.)',
      Valor:
        data.avgDaysToFirstDelivery != null
          ? data.avgDaysToFirstDelivery.toLocaleString('ca-ES', { maximumFractionDigits: 1 })
          : '',
    },
    { Metrica: 'Incidencies recepcio', Valor: data.deliveriesWithOpenDispute },
    { Metrica: 'Cancelades', Valor: `${data.cancelledRequestsInPeriod} (${pctCanc})` },
    { Metrica: 'Max sollicituds escanejades', Valor: data.datasetScanLimit },
  ]

  const resumCustom = [
    { Metrica: 'Periode', Valor: periodLabel },
    { Metrica: 'Sollicituds', Valor: data.totalRequests },
    { Metrica: 'Unitats solicitades', Valor: data.requestedUnitsInPeriod },
    { Metrica: 'Unitats lliurades', Valor: data.deliveredUnitsLinked },
    { Metrica: 'Compliment %', Valor: pctCompl },
    { Metrica: 'Cobertura max sollicituds', Valor: data.datasetScanLimit },
  ]

  const estats = Object.entries(data.byStatus).map(([codi, nombre]) => ({
    Estat: ROBA_REQUEST_STATUS_LABEL[codi] || codi,
    Nombre: nombre,
  }))

  const activitatDiaria = data.dailyActivity.map((d) => ({
    Dia: d.day,
    Sollicituds: d.requestCount,
    Unitats_solicitades: d.requestedUnits,
    Productes_distints: d.distinctProductsRequested,
  }))

  const deptArticle = data.deptArticleMix.map((r) => ({
    Departament: r.department,
    Producte_id: r.productId,
    Article: r.productLabel,
    Unitats: r.units,
  }))

  const articles = data.topProducts.map((p, i) => ({
    Posicio: i + 1,
    Article: p.label,
    Unitats: p.quantity,
    Percentatge_demanda: `${p.shareOfRequestedPct.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`,
  }))

  const departaments = data.topDepartments.map((d, i) => ({
    Posicio: i + 1,
    Departament: d.department,
    Sollicituds: d.requestCount,
    Unitats: d.requestedUnits,
    Percentatge_demanda: `${d.shareOfRequestedPct.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`,
  }))

  const senyals = deriveRrhhSignals(data).map((s, i) => ({
    Ordre: i + 1,
    Missatge: s.message,
    Nivell: s.tone,
  }))

  const criteris = criteriaRowsForExport(data, periodLabel)

  const sheets =
    mode === 'custom'
      ? [
          { name: 'Criteris', rows: criteris },
          { name: 'Resum', rows: resumCustom },
          { name: 'Activitat diaria', rows: activitatDiaria },
          { name: 'Estats', rows: estats },
          { name: 'Dept i article', rows: deptArticle },
        ]
      : [
          { name: 'Criteris', rows: criteris },
          { name: 'Resum', rows: resumKpis },
          { name: 'Estats', rows: estats },
          { name: 'Top articles', rows: articles },
          { name: 'Top departaments', rows: departaments },
          { name: 'Lectura control', rows: senyals },
        ]

  await exportRowsToXlsx(sheets, fileBase)
}
