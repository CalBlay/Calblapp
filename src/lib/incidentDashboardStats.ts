import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import {
  normalizeIncidentStatus,
  type IncidentWorkflowStatus,
} from '@/lib/incidentPolicy'

export type IncidentDashboardRow = {
  id?: string
  incidentNumber?: string | null
  eventTitle?: string | null
  eventCode?: string | null
  status?: string | null
  department?: string | null
  category?: { label?: string | null } | null
  importance?: string | null
  eventDate?: string | null
  createdAt?: string | null
}

const STATUS_ORDER: IncidentWorkflowStatus[] = ['obert', 'en_curs', 'resolt', 'tancat']

const statusLabel: Record<IncidentWorkflowStatus, string> = {
  obert: 'Obert',
  en_curs: 'En curs',
  resolt: 'Resolt',
  tancat: 'Tancat',
}

function isHighPriority(importance?: string | null) {
  const v = (importance || '').toLowerCase().trim()
  return v === 'urgent' || v === 'alta'
}

/** Agrupa incidències per al quadre de comandament (tot client-side). */
export function buildIncidentDashboardStats(incidents: IncidentDashboardRow[]) {
  const byStatus: Record<IncidentWorkflowStatus, number> = {
    obert: 0,
    en_curs: 0,
    resolt: 0,
    tancat: 0,
  }

  const deptMap = new Map<string, number>()
  const catMap = new Map<string, number>()
  const dayMap = new Map<string, number>()
  let highPriority = 0

  for (const inc of incidents) {
    const w = normalizeIncidentStatus(inc.status)
    byStatus[w] += 1

    const dep = (inc.department || '').trim() || 'Sense departament'
    deptMap.set(dep, (deptMap.get(dep) || 0) + 1)

    const cat = (inc.category?.label || '').trim() || 'Sense categoria'
    catMap.set(cat, (catMap.get(cat) || 0) + 1)

    const day = (inc.eventDate || '').slice(0, 10) || (inc.createdAt || '').slice(0, 10) || ''
    if (day) dayMap.set(day, (dayMap.get(day) || 0) + 1)

    if (isHighPriority(inc.importance)) highPriority += 1
  }

  const statusChart = STATUS_ORDER.filter((k) => byStatus[k] > 0).map((k) => ({
    name: statusLabel[k],
    value: byStatus[k],
  }))

  const deptChart = [...deptMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  const catSorted = [...catMap.entries()].sort((a, b) => b[1] - a[1])
  const topCat = 10
  let catChart = catSorted.slice(0, topCat).map(([name, value]) => ({ name, value }))
  if (catSorted.length > topCat) {
    const rest = catSorted.slice(topCat).reduce((s, [, n]) => s + n, 0)
    if (rest > 0) catChart = [...catChart, { name: 'Altres categories', value: rest }]
  }

  return {
    total: incidents.length,
    byStatus,
    statusChart,
    deptChart,
    catChart,
    dayMap,
    highPriority,
  }
}

export { STATUS_ORDER, statusLabel }

/** Una barra per cada dia del rang (0 si no hi ha incidències). */
export function buildDaySeriesForChart(
  dayMap: Map<string, number>,
  fromIso: string,
  toIso: string
): { name: string; value: number }[] {
  const start = parseISO(fromIso)
  const end = parseISO(toIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const a = start <= end ? start : end
  const b = start <= end ? end : start
  return eachDayOfInterval({ start: a, end: b }).map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    return {
      name: format(d, 'd MMM', { locale: ca }),
      value: dayMap.get(key) ?? 0,
    }
  })
}
