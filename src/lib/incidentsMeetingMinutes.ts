import type { Incident } from '@/hooks/useIncidents'
import { formatDateString } from '@/lib/formatDate'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'

export type GroupedIncidentEvent = {
  eventTitle?: string
  eventCode?: string
  ln?: string
  location?: string
  serviceType?: string
  pax?: number
  fincaId?: string
  commercial: string
  rows: Incident[]
}

export type DayIncidentGroup = {
  day: string
  events: GroupedIncidentEvent[]
  totalCount: number
}

/** Mateixa agrupació que el tauler: per data d’event i per esdeveniment. */
export function groupIncidentsByDayAndEvent(incidents: Incident[]): DayIncidentGroup[] {
  const days = incidents.reduce<Record<string, Record<string, GroupedIncidentEvent>>>((acc, inc) => {
    const day = (inc.eventDate || '').slice(0, 10)
    if (!acc[day]) acc[day] = {}
    const key = inc.eventId || 'no-event'

    if (!acc[day][key]) {
      acc[day][key] = {
        eventTitle: inc.eventTitle,
        eventCode: inc.eventCode,
        ln: inc.ln,
        location: inc.eventLocation,
        serviceType: inc.serviceType,
        pax: inc.pax,
        fincaId: inc.fincaId,
        commercial: inc.eventCommercial || '',
        rows: [],
      }
    }

    acc[day][key].rows.push(inc)
    return acc
  }, {})

  const sortedDays = Object.keys(days).sort()
  return sortedDays.map((day) => {
    const events = Object.values(days[day] || {})
    const totalCount = events.reduce((sum, event) => sum + event.rows.length, 0)
    return { day, events, totalCount }
  })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function incidentStatusDisplayLabel(raw?: string | null) {
  const w = normalizeIncidentStatus(raw)
  if (w === 'en_curs') return 'En curs'
  if (w === 'resolt') return 'Resolt'
  if (w === 'tancat') return 'Tancat'
  return 'Obert'
}

function importanceDisplayLabel(raw?: string) {
  const v = (raw || '').toLowerCase().trim()
  if (v === 'mitjana') return 'Normal'
  if (v === 'urgent') return 'Urgent'
  if (v === 'alta') return 'Alta'
  if (v === 'baixa') return 'Baixa'
  if (v === 'normal') return 'Normal'
  return raw?.trim() || '—'
}

export type MeetingMinutesFilters = {
  from?: string
  to?: string
  department?: string
  importance: string
  categoryLabel: string
  status: 'all' | 'obert' | 'en_curs' | 'resolt' | 'tancat'
}

export function buildMeetingFilterSummaryLines(f: MeetingMinutesFilters): string[] {
  const pFrom = formatDateString(f.from) ?? (f.from || '—')
  const pTo = formatDateString(f.to) ?? (f.to || '—')

  const imp =
    f.importance === 'all'
      ? 'Totes'
      : f.importance === 'urgent'
        ? 'Urgent'
        : f.importance === 'alta'
          ? 'Alta'
          : f.importance === 'normal'
            ? 'Normal'
            : f.importance === 'baixa'
              ? 'Baixa'
              : f.importance

  const st =
    f.status === 'all'
      ? 'Tots'
      : incidentStatusDisplayLabel(f.status)

  return [
    `Període: ${pFrom} – ${pTo}`,
    `Departament: ${f.department?.trim() ? f.department.trim() : 'Tots'}`,
    `Importància: ${imp}`,
    `Categoria: ${f.categoryLabel === 'all' ? 'Totes' : f.categoryLabel}`,
    `Estat: ${st}`,
  ]
}

export type BuildMeetingMinutesHtmlInput = {
  incidents: Incident[]
  filters: MeetingMinutesFilters
  meetingNotes: string
  generatedAtIso: string
  generatedByLabel?: string
}

export function buildIncidentsMeetingMinutesHtml(input: BuildMeetingMinutesHtmlInput): string {
  const { incidents, filters, meetingNotes, generatedAtIso, generatedByLabel } = input
  const filterLines = buildMeetingFilterSummaryLines(filters)
  const dayEntries = groupIncidentsByDayAndEvent(incidents)
  const total = incidents.length

  const genDate = formatDateString(generatedAtIso.slice(0, 10))
  const genTime = generatedAtIso.length >= 19 ? generatedAtIso.slice(11, 19) : ''
  const genLabel = [genDate, genTime].filter(Boolean).join(' ') || generatedAtIso

  const notesBlock =
    meetingNotes.trim().length > 0
      ? `<section class="notes"><h2>Notes de la reunió</h2><div class="notes-body">${escapeHtml(
          meetingNotes
        ).replace(/\r\n|\n|\r/g, '<br/>')}</div></section>`
      : ''

  const eventsHtml = dayEntries
    .map(({ day, events, totalCount }) => {
      const dayDisplay = escapeHtml(formatDateString(day) || day || 'Sense data')
      const blocks = events
        .map((ev) => {
          const title = escapeHtml(ev.eventTitle || 'Sense títol')
          const code = ev.eventCode ? escapeHtml(ev.eventCode) : ''
          const loc = ev.location ? escapeHtml(ev.location) : ''
          const metaBits = [
            loc && `Ubicació: ${loc}`,
            ev.commercial && `Comercial: ${escapeHtml(ev.commercial)}`,
            typeof ev.pax === 'number' && `Pax: ${ev.pax}`,
            ev.serviceType && `Servei: ${escapeHtml(ev.serviceType)}`,
            ev.ln && `LN: ${escapeHtml(ev.ln)}`,
          ].filter(Boolean)
          const meta = metaBits.length
            ? `<p class="event-meta">${metaBits.join(' · ')}</p>`
            : ''

          const rows = ev.rows
            .map((inc) => {
              const desc = escapeHtml(inc.description || '—')
              const res = inc.resolutionNote ? escapeHtml(inc.resolutionNote) : '—'
              return `<tr>
                <td>${escapeHtml(inc.incidentNumber || '—')}</td>
                <td>${escapeHtml(inc.department || '—')}</td>
                <td>${escapeHtml(importanceDisplayLabel(inc.importance))}</td>
                <td>${escapeHtml(incidentStatusDisplayLabel(inc.status))}</td>
                <td>${escapeHtml(inc.category?.label || '—')}</td>
                <td class="wrap">${desc}</td>
                <td class="wrap muted">${res}</td>
              </tr>`
            })
            .join('')

          return `<section class="event-block">
            <h3>${title}${code ? ` <span class="muted">· ${code}</span>` : ''}</h3>
            ${meta}
            <table>
              <thead>
                <tr>
                  <th>Nº</th><th>Dept</th><th>Imp.</th><th>Estat</th><th>Cat.</th><th>Descripció</th><th>Resolució</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </section>`
        })
        .join('')

      return `<section class="day-block">
        <h2>${dayDisplay} <span class="tag">${totalCount} incid.</span></h2>
        ${blocks}
      </section>`
    })
    .join('')

  const emptyMsg =
    total === 0
      ? '<p class="empty">Cap incidència amb els filtres seleccionats (o sense dades en aquest període).</p>'
      : ''

  const titleSafe = `acta-incidencies-${filters.from || 'inici'}-${filters.to || 'fi'}`

  return `<!doctype html>
<html lang="ca">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(titleSafe)}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px 24px 32px; color: #111; font-size: 12px; line-height: 1.45; }
      h1 { font-size: 20px; margin: 0 0 8px; letter-spacing: -0.02em; }
      .subtitle { color: #444; font-size: 13px; margin-bottom: 16px; }
      .filters { background: #f4f4f5; border: 1px solid #e4e4e7; padding: 10px 12px; border-radius: 6px; margin-bottom: 14px; font-size: 11px; }
      .filters ul { margin: 6px 0 0; padding-left: 18px; }
      .summary { font-weight: 600; margin-bottom: 18px; font-size: 13px; }
      .notes { margin-bottom: 20px; padding: 12px 14px; border: 1px solid #d4d4d8; border-radius: 6px; background: #fafafa; }
      .notes h2 { font-size: 14px; margin: 0 0 8px; }
      .notes-body { white-space: normal; }
      .day-block { margin-bottom: 28px; page-break-inside: avoid; }
      .day-block h2 { font-size: 15px; border-bottom: 2px solid #27272a; padding-bottom: 6px; margin: 0 0 12px; }
      .tag { font-size: 11px; font-weight: 600; color: #9f1239; background: #ffe4e6; padding: 2px 8px; border-radius: 999px; margin-left: 8px; vertical-align: middle; }
      .event-block { margin-bottom: 20px; page-break-inside: avoid; }
      .event-block h3 { font-size: 13px; margin: 0 0 4px; }
      .muted { color: #52525b; font-weight: normal; }
      .event-meta { margin: 0 0 8px; color: #52525b; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 4px; }
      th, td { border: 1px solid #d4d4d8; padding: 5px 6px; vertical-align: top; text-align: left; }
      th { background: #f4f4f5; font-weight: 600; }
      tr:nth-child(even) td { background: #fafafa; }
      td.wrap { max-width: 220px; word-break: break-word; }
      .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e4e4e7; font-size: 10px; color: #71717a; }
      .empty { padding: 16px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; color: #78350f; }
      @media print {
        body { margin: 12mm; }
        .day-block, .event-block { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <h1>Acta — Reunió d’incidències</h1>
    <p class="subtitle">Document generat a partir del tauler d’incidències (vista i filtres actuals).</p>
    <div class="filters">
      <strong>Filtres aplicats</strong>
      <ul>${filterLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
    </div>
    <p class="summary">Total incidències incloses a l’acta: ${total}</p>
    ${notesBlock}
    ${emptyMsg}
    ${eventsHtml}
    <div class="footer">
      Generat: ${escapeHtml(String(genLabel))}${generatedByLabel ? ` · ${escapeHtml(generatedByLabel)}` : ''}
    </div>
  </body>
</html>`
}
