import { loadXlsx } from '@/lib/loadXlsx'
import type { OpenChatAnswer } from './types'

function escapeHtmlExport(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeExcelSheetName(name: string, fallback: string): string {
  const s = (name || fallback).replace(/[:\\/?*\[\]]/g, '_').slice(0, 31).trim()
  return s || fallback
}

export async function exportOpenChatToXlsx(
  openQuestion: string,
  openAnswer: OpenChatAnswer
): Promise<void> {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  const taken = new Set<string>()
  const appendSheet = (ws: object, desired: string, fallback: string) => {
    let base = safeExcelSheetName(desired, fallback)
    let name = base
    let n = 1
    while (taken.has(name)) {
      n += 1
      const suf = `_${n}`
      name = safeExcelSheetName(base.slice(0, Math.max(1, 31 - suf.length)) + suf, fallback)
    }
    taken.add(name)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const metaRows: (string | number)[][] = [
    ['Informe', 'Consulta MCP (Cal Blay)'],
    ['Generat', new Date().toLocaleString('ca-ES')],
    ['Pregunta', openQuestion],
    ['Model', openAnswer.model ?? ''],
    ['Eines MCP', openAnswer.toolCallsUsed ?? ''],
    ['Cache', openAnswer.cached ? 'Sí' : 'No'],
    [],
    ['Resposta (text)', openAnswer.text],
  ]
  appendSheet(XLSX.utils.aoa_to_sheet(metaRows), 'Informe', 'Informe')

  const hl = openAnswer.report?.highlights
  if (hl?.length) {
    const aoa = [['Punts clau'], ...hl.map((h) => [h])]
    appendSheet(XLSX.utils.aoa_to_sheet(aoa), 'Punts_clau', 'Punts_clau')
  }

  const kpis = openAnswer.report?.kpis
  if (kpis?.length) {
    const header = [
      'Indicador',
      'Període A',
      'Valor A',
      'Període B',
      'Valor B',
      'Δ',
      '% var.',
      'Format',
    ]
    const rows = kpis.map((k) => [
      k.label,
      k.periodALabel,
      k.valueA,
      k.periodBLabel,
      k.valueB,
      k.delta ?? '',
      k.deltaPct ?? '',
      k.format ?? '',
    ])
    appendSheet(XLSX.utils.aoa_to_sheet([header, ...rows]), 'KPIs', 'KPIs')
  }

  openAnswer.report?.tables?.forEach((t, i) => {
    const aoa = [t.columns, ...t.rows]
    appendSheet(
      XLSX.utils.aoa_to_sheet(aoa),
      `T${i + 1}_${t.title || 'taula'}`,
      `Taula_${i + 1}`
    )
  })

  const ch = openAnswer.report?.chart
  if (ch?.data?.length) {
    const cols = [ch.xKey, ...ch.series.map((s) => s.dataKey)]
    const header = cols
    const rows = ch.data.map((row) => cols.map((c) => row[c] ?? ''))
    const aoa = [header, ...rows]
    appendSheet(
      XLSX.utils.aoa_to_sheet(aoa),
      `Grafic_${ch.title || 'dades'}`,
      'Grafic_dades'
    )
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  XLSX.writeFile(wb, `consulta-mcp-${stamp}.xlsx`)
}

export function buildOpenChatInformePdfHtml(
  openQuestion: string,
  openAnswer: OpenChatAnswer
): string {
  const esc = escapeHtmlExport
  const stamp = new Date().toLocaleString('ca-ES')
  const metaLines = [
    `Generat: ${stamp}`,
    openAnswer.model ? `Model: ${openAnswer.model}` : null,
    openAnswer.toolCallsUsed != null ? `Eines MCP: ${openAnswer.toolCallsUsed}` : null,
    openAnswer.cached ? 'Cache: sí (sense cost OpenAI)' : null,
  ]
    .filter(Boolean)
    .map((l) => `<div class="meta">${esc(String(l))}</div>`)
    .join('')

  const highlightsBlock =
    openAnswer.report?.highlights?.length ?
      `<h2>Punts clau</h2><ul>${openAnswer.report.highlights
        .map((h) => `<li>${esc(h)}</li>`)
        .join('')}</ul>`
    : ''

  const kpis = openAnswer.report?.kpis
  const kpisBlock =
    kpis?.length ?
      `<h2>Indicadors (KPI)</h2>
      <table class="kpi-table">
        <thead><tr>
          <th>Indicador</th>
          <th>${esc(kpis[0]?.periodALabel ?? 'Període A')}</th>
          <th>${esc(kpis[0]?.periodBLabel ?? 'Període B')}</th>
          <th>Δ (B−A)</th>
          <th>% variació</th>
        </tr></thead>
        <tbody>
        ${kpis
          .map(
            (k) =>
              `<tr>
            <td>${esc(k.label)}</td>
            <td class="num">${esc(k.valueA)}</td>
            <td class="num">${esc(k.valueB)}</td>
            <td class="num">${esc(k.delta ?? '—')}</td>
            <td class="num">${esc(k.deltaPct ?? '—')}</td>
          </tr>`
          )
          .join('')}
        </tbody>
      </table>`
    : ''

  const tablesBlock =
    openAnswer.report?.tables
      ?.map((t) => {
        const header = t.columns.map((c) => `<th>${esc(String(c))}</th>`).join('')
        const body = t.rows
          .map((row) => {
            const cells = t.columns
              .map((_, ci) => `<td>${esc(String(row[ci] ?? ''))}</td>`)
              .join('')
            return `<tr>${cells}</tr>`
          })
          .join('')
        return `<h2>${esc(t.title)}</h2><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
      })
      .join('') ?? ''

  const ch = openAnswer.report?.chart
  let chartBlock = ''
  if (ch?.data?.length) {
    const cols = [ch.xKey, ...ch.series.map((s) => s.dataKey)]
    const header = cols.map((c) => `<th>${esc(String(c))}</th>`).join('')
    const body = ch.data
      .map((row) => {
        const cells = cols
          .map((c) => `<td>${esc(String(row[c] ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    chartBlock = `<h2>${esc(ch.title || 'Dades del gràfic')}</h2>
        <p class="note">La imatge del gràfic no s'inclou al PDF; es mostren les dades en taula.</p>
        <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${esc('Informe consulta MCP')}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin-bottom: 8px; }
      h2 { font-size: 14px; margin: 20px 0 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 4px; }
      .pregunta { font-size: 13px; margin: 12px 0 16px; padding: 10px; background: #f3f4f6; border-radius: 6px; }
      .narrative { white-space: pre-wrap; font-size: 13px; line-height: 1.45; margin-bottom: 16px; }
      .note { font-size: 11px; color: #666; margin: 0 0 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
      ul { margin: 0; padding-left: 1.2rem; font-size: 13px; }
      li { margin: 4px 0; }
    </style>
  </head>
  <body>
    <h1>Informe · Consulta MCP</h1>
    ${metaLines}
    <div class="pregunta"><strong>Pregunta</strong><br/>${esc(openQuestion)}</div>
    <h2>Resposta</h2>
    <div class="narrative">${esc(openAnswer.text || '—')}</div>
    ${kpisBlock}
    ${highlightsBlock}
    ${tablesBlock}
    ${chartBlock}
  </body>
</html>`
}

export function printHtmlInNewWindow(html: string): void {
  const win = window.open('', '_blank', 'width=1200,height=900')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 300)
}
