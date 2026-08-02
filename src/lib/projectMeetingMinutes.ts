import type { KickoffAttendee, ProjectBlock, ProjectData } from '@/app/menu/projects/components/project-shared'
import { BLOCK_STATUS_OPTIONS, formatProjectDate } from '@/app/menu/projects/components/project-shared'
import { formatDateString } from '@/lib/formatDate'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function blockStatusLabel(status?: string) {
  return BLOCK_STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '—'
}

function formatAttendance(attendee: KickoffAttendee) {
  if (attendee.attended === false) return 'No ha assistit'
  if (attendee.attended === true) return 'Ha assistit'
  return 'Sense registrar'
}

export type BuildProjectMeetingMinutesHtmlInput = {
  project: Pick<ProjectData, 'name' | 'kickoff' | 'blocks' | 'launchDate'>
  meetingNotes: string
  generatedAtIso: string
  generatedByLabel?: string
  logoSrc?: string
}

export function buildProjectMeetingMinutesHtml(input: BuildProjectMeetingMinutesHtmlInput): string {
  const { project, meetingNotes, generatedAtIso, generatedByLabel, logoSrc = '/logo.png' } = input
  const kickoff = project.kickoff
  const attendees = kickoff.attendees || []
  const blocks = project.blocks || []

  const blocksHtml = blocks
    .map((block: ProjectBlock) => {
      const tasks = (block.tasks || [])
        .map(
          (task) =>
            `<li><strong>${escapeHtml(task.title || 'Tasca')}</strong> · ${escapeHtml(task.owner || 'Sense responsable')} · ${escapeHtml(formatProjectDate(task.deadline) || 'Sense data')}</li>`
        )
        .join('')
      return `
        <div class="block-card">
          <h3>${escapeHtml(block.name || 'Bloc')}</h3>
          <p class="meta">${escapeHtml(block.owner || 'Sense responsable')} · ${escapeHtml(formatProjectDate(block.deadline) || 'Sense data')} · ${escapeHtml(blockStatusLabel(block.status))}</p>
          ${block.summary ? `<p>${escapeHtml(block.summary)}</p>` : ''}
          ${tasks ? `<ul>${tasks}</ul>` : '<p class="muted">Sense tasques</p>'}
        </div>
      `
    })
    .join('')

  const attendanceHtml = attendees
    .map(
      (attendee) =>
        `<tr><td>${escapeHtml(attendee.name || attendee.email)}</td><td>${escapeHtml(attendee.department || '')}</td><td>${escapeHtml(formatAttendance(attendee))}</td></tr>`
    )
    .join('')

  const notesHtml = escapeHtml(meetingNotes.trim() || '(sense notes)')
    .split('\n')
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('')

  const meetingDate = kickoff.date ? formatDateString(kickoff.date) ?? kickoff.date : 'Sense data'
  const generatedAt = formatDateString(generatedAtIso.slice(0, 10)) ?? generatedAtIso

  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <title>Acta · ${escapeHtml(project.name || 'Projecte')}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; line-height: 1.55; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 28px 0 10px; color: #14532d; }
    h3 { font-size: 14px; margin: 0 0 6px; }
    .meta { color: #6b7280; font-size: 13px; margin: 0 0 16px; }
    .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
    .block-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
    .muted { color: #9ca3af; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    th { background: #f3f4f6; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    .calblay-print-brand {
      display: flex;
      align-items: center;
      gap: 18px;
      margin: 0 0 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d7dfd8;
    }
    .calblay-print-brand__logo {
      width: 168px;
      height: auto;
      object-fit: contain;
      object-position: left center;
      flex: 0 0 auto;
    }
    .calblay-print-brand__meta { min-width: 0; }
    .calblay-print-brand__eyebrow {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #14532d;
      margin-bottom: 4px;
    }
    .calblay-print-brand__stamp {
      font-size: 12px;
      line-height: 1.45;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="calblay-print-brand">
    <img src="${escapeHtml(logoSrc)}" alt="Cal Blay" class="calblay-print-brand__logo" />
    <div class="calblay-print-brand__meta">
      <div class="calblay-print-brand__eyebrow">Acta de reunió de projecte</div>
      <div class="calblay-print-brand__stamp">Generada ${escapeHtml(generatedAt)}${generatedByLabel ? ` · ${escapeHtml(generatedByLabel)}` : ''}</div>
    </div>
  </div>
  <h1>${escapeHtml(project.name || 'Projecte')}</h1>
  <p class="meta">Reunió d'arrencada: ${escapeHtml(meetingDate)} · ${escapeHtml(kickoff.startTime || 'Sense hora')} · Arrencada projecte: ${escapeHtml(formatProjectDate(project.launchDate) || 'Sense data')}</p>

  <h2>Anotacions de la reunió</h2>
  <div class="notes">${notesHtml}</div>

  <h2>Recull de blocs i tasques</h2>
  ${blocksHtml || '<p class="muted">Encara no hi ha blocs definits.</p>'}

  <h2>Assistència</h2>
  ${
    attendanceHtml
      ? `<table><thead><tr><th>Persona</th><th>Àrea</th><th>Assistència</th></tr></thead><tbody>${attendanceHtml}</tbody></table>`
      : '<p class="muted">Sense assistents registrats.</p>'
  }
</body>
</html>`
}
