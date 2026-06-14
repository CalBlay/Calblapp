import type { Incident } from '@/hooks/useIncidents'
import { formatDateString } from '@/lib/formatDate'
import { sortIncidentDayKeysByProximityToToday } from '@/lib/incidentListSort'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'

export type GroupedIncidentEvent = {
  eventId?: string
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

export type IncidentDaySort = 'chronological' | 'proximity'

/** Mateixa agrupació que el tauler: per data d’event i per esdeveniment. */
export function groupIncidentsByDayAndEvent(
  incidents: Incident[],
  daySort: IncidentDaySort = 'chronological'
): DayIncidentGroup[] {
  const days = incidents.reduce<Record<string, Record<string, GroupedIncidentEvent>>>((acc, inc) => {
    const day = (inc.eventDate || '').slice(0, 10)
    if (!acc[day]) acc[day] = {}
    const key = inc.eventId || 'no-event'

    if (!acc[day][key]) {
      acc[day][key] = {
        eventId: inc.eventId || key,
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

  const dayKeys = Object.keys(days)
  const sortedDays =
    daySort === 'proximity'
      ? sortIncidentDayKeysByProximityToToday(dayKeys)
      : dayKeys.sort()
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

export function buildMeetingPeriodLabel(f: MeetingMinutesFilters): string {
  const pFrom = formatDateString(f.from) ?? (f.from || '—')
  const pTo = formatDateString(f.to) ?? (f.to || '—')
  return `${pFrom} – ${pTo}`
}

export type MeetingMinutesAttendanceRow = {
  name: string
  email: string
  attendance: 'in_person' | 'online' | 'absent' | null
  absenceReason?: string
}

export type BuildMeetingMinutesHtmlInput = {
  incidents: Incident[]
  filters: MeetingMinutesFilters
  meetingNotes: string
  generatedAtIso: string
  generatedByLabel?: string
  attendance?: MeetingMinutesAttendanceRow[]
  /** `/logo.png` al navegador; data URL al correu. */
  logoSrc?: string
}

function formatGeneratedStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const genDate = formatDateString(iso.slice(0, 10))
    const genTime = iso.length >= 19 ? iso.slice(11, 19) : ''
    return [genDate, genTime].filter(Boolean).join(' ') || iso
  }
  return d.toLocaleString('ca-ES', { dateStyle: 'medium', timeStyle: 'short' })
}

function buildMeetingMinutesHeaderHtml(logoSrc: string, generatedAtIso: string): string {
  const stamp = escapeHtml(formatGeneratedStamp(generatedAtIso))
  const logo = escapeHtml(logoSrc)
  return `<header class="calblay-print-brand">
    <img
      src="${logo}"
      alt="Cal Blay"
      class="calblay-print-brand__logo"
      data-calblay-print-logo="true"
    />
    <div class="calblay-print-brand__meta">
      <h1 class="calblay-print-brand__title">Acta — Reunió d’incidències</h1>
      <p class="calblay-print-brand__stamp">${stamp}</p>
    </div>
  </header>`
}

function buildAttendanceHtml(rows: MeetingMinutesAttendanceRow[]) {
  if (!rows.length) return ''

  const list = (items: MeetingMinutesAttendanceRow[], withReason = false) =>
    `<ul>${items
      .map((item) => {
        const reason =
          withReason && item.absenceReason
            ? ` — <span class="muted">${escapeHtml(item.absenceReason)}</span>`
            : ''
        return `<li>${escapeHtml(item.name)}${reason}</li>`
      })
      .join('')}</ul>`

  const columns: { label: string; items: MeetingMinutesAttendanceRow[]; withReason?: boolean }[] = []
  const present = rows.filter((r) => r.attendance === 'in_person')
  const online = rows.filter((r) => r.attendance === 'online')
  const absent = rows.filter((r) => r.attendance === 'absent')
  const unknown = rows.filter((r) => r.attendance === null)

  if (present.length) columns.push({ label: 'Present', items: present })
  if (online.length) columns.push({ label: 'Online', items: online })
  if (absent.length) columns.push({ label: 'Absent', items: absent, withReason: true })
  if (unknown.length) columns.push({ label: 'Sense registrar', items: unknown })

  if (!columns.length) return ''

  const cols = columns.length
  return `<section class="attendance">
    <h2>Assistència</h2>
    <div class="attendance-grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));">
      ${columns
        .map(
          (col) =>
            `<div><strong>${escapeHtml(col.label)}</strong>${list(col.items, col.withReason)}</div>`
        )
        .join('')}
    </div>
  </section>`
}

export function buildIncidentsMeetingMinutesHtml(input: BuildMeetingMinutesHtmlInput): string {
  const {
    incidents,
    filters,
    meetingNotes,
    generatedAtIso,
    generatedByLabel,
    attendance,
    logoSrc = '/logo.png',
  } = input
  const periodLabel = buildMeetingPeriodLabel(filters)
  const dayEntries = groupIncidentsByDayAndEvent(incidents)
  const total = incidents.length
  const headerHtml = buildMeetingMinutesHeaderHtml(logoSrc, generatedAtIso)

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
    total === 0 ? '<p class="empty">Cap incidència en aquest període.</p>' : ''

  const titleSafe = `acta-incidencies-${filters.from || 'inici'}-${filters.to || 'fi'}`

  return `<!doctype html>
<html lang="ca">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(titleSafe)}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px 24px 32px; color: #111; font-size: 12px; line-height: 1.45; }
      .calblay-print-brand {
        display: flex;
        align-items: center;
        gap: 18px;
        margin: 0 0 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid #d7dfd8;
      }
      .calblay-print-brand__logo {
        width: 168px;
        height: 54px;
        object-fit: contain;
        object-position: left center;
        flex: 0 0 auto;
      }
      .calblay-print-brand__meta { min-width: 0; }
      .calblay-print-brand__title {
        font-size: 18px;
        font-weight: 700;
        margin: 0 0 4px;
        letter-spacing: -0.02em;
        color: #111;
      }
      .calblay-print-brand__stamp {
        margin: 0;
        font-size: 12px;
        color: #4b5563;
        line-height: 1.45;
      }
      .period { color: #3f3f46; font-size: 13px; margin: 0 0 10px; }
      .summary { font-weight: 600; margin-bottom: 18px; font-size: 13px; }
      .notes { margin-bottom: 20px; padding: 12px 14px; border: 1px solid #d4d4d8; border-radius: 6px; background: #fafafa; }
      .notes h2 { font-size: 14px; margin: 0 0 8px; }
      .notes-body { white-space: normal; }
      .attendance { margin-bottom: 20px; padding: 12px 14px; border: 1px solid #d4d4d8; border-radius: 6px; background: #f8fafc; }
      .attendance h2 { font-size: 14px; margin: 0 0 8px; }
      .attendance-grid { display: grid; gap: 12px; font-size: 11px; }
      .attendance ul { margin: 6px 0 0; padding-left: 18px; }
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
    ${headerHtml}
    <p class="period">Període: ${escapeHtml(periodLabel)}</p>
    <p class="summary">Total incidències: ${total}</p>
    ${notesBlock}
    ${attendance?.length ? buildAttendanceHtml(attendance) : ''}
    ${emptyMsg}
    ${eventsHtml}
    ${generatedByLabel ? `<div class="footer">Elaborat per: ${escapeHtml(generatedByLabel)}</div>` : ''}
  </body>
</html>`
}
