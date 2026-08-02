import type { Incident } from '@/hooks/useIncidents'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'

export type IncidentEventGroupMeta = {
  openCount: number
  urgentCount: number
  allResolved: boolean
}

export type IncidentEventBlockVisual = {
  accent: string
  shell: string
  header: string
  body: string
  statusLabel: string | null
}

function isHighPriority(inc: Incident) {
  const v = (inc.importance || inc.priority || '').toLowerCase().trim()
  return v === 'urgent' || v === 'alta'
}

function isActiveStatus(inc: Incident) {
  const w = normalizeIncidentStatus(inc.status)
  return w === 'obert' || w === 'en_curs'
}

/** Resum i estat inicial de col·lapse per un bloc d’esdeveniment. */
export function getIncidentEventGroupMeta(rows: Incident[]): IncidentEventGroupMeta {
  let openCount = 0
  let urgentCount = 0

  for (const inc of rows) {
    if (isActiveStatus(inc)) openCount += 1
    if (isHighPriority(inc)) urgentCount += 1
  }

  const allResolved =
    rows.length > 0 &&
    rows.every((inc) => {
      const w = normalizeIncidentStatus(inc.status)
      return w === 'resolt' || w === 'tancat'
    })

  return { openCount, urgentCount, allResolved }
}

/** Estil visual del bloc segons estat i si està expandit. */
export function getEventBlockVisualStyle(
  meta: IncidentEventGroupMeta,
  expanded: boolean
): IncidentEventBlockVisual {
  if (meta.urgentCount > 0) {
    return {
      accent: 'border-l-rose-500',
      shell: expanded
        ? 'border-rose-200 bg-white shadow-lg ring-2 ring-rose-100'
        : 'border-rose-200/90 bg-white shadow-md hover:border-rose-300 hover:shadow-lg',
      header: expanded ? 'bg-rose-50/70' : 'bg-white',
      body: 'border-t border-rose-100 bg-rose-50/20',
      statusLabel: 'Urgent / alta',
    }
  }

  if (meta.openCount > 0) {
    return {
      accent: 'border-l-amber-500',
      shell: expanded
        ? 'border-amber-200 bg-white shadow-lg ring-2 ring-amber-100'
        : 'border-amber-200/90 bg-white shadow-md hover:border-amber-300 hover:shadow-lg',
      header: expanded ? 'bg-amber-50/80' : 'bg-white',
      body: 'border-t border-amber-100 bg-slate-50/80',
      statusLabel: meta.openCount === 1 ? '1 incidència oberta' : `${meta.openCount} incidències obertes`,
    }
  }

  if (meta.allResolved) {
    return {
      accent: 'border-l-emerald-400',
      shell: expanded
        ? 'border-emerald-200 bg-white shadow-md ring-2 ring-emerald-50'
        : 'border-slate-200 bg-slate-50/60 shadow-sm hover:border-slate-300 hover:shadow-md',
      header: expanded ? 'bg-emerald-50/50' : 'bg-slate-50/60',
      body: 'border-t border-emerald-100 bg-white',
      statusLabel: 'Tot resolt',
    }
  }

  return {
    accent: 'border-l-indigo-400',
    shell: expanded
      ? 'border-indigo-200 bg-white shadow-lg ring-2 ring-indigo-100'
      : 'border-slate-200 bg-white shadow-md hover:border-indigo-200 hover:shadow-lg',
    header: expanded ? 'bg-indigo-50/40' : 'bg-white',
    body: 'border-t border-slate-200 bg-slate-50/80',
    statusLabel: null,
  }
}
