import { INCIDENTS_ACCIONS_PATH, INCIDENTS_UI_PATH } from '@/lib/incidentsPermissions'

export function incidentNotificationHref(incidentId?: string | null) {
  const id = String(incidentId || '').trim()
  if (!id) return INCIDENTS_UI_PATH

  const qs = new URLSearchParams({
    incidentId: id,
    dateMode: 'all',
  })
  return `${INCIDENTS_UI_PATH}?${qs.toString()}`
}

export function incidentActionNotificationHref(actionId?: string | null) {
  const id = String(actionId || '').trim()
  if (!id) return INCIDENTS_ACCIONS_PATH

  const qs = new URLSearchParams({
    actionId: id,
    dateMode: 'all',
  })
  return `${INCIDENTS_ACCIONS_PATH}?${qs.toString()}`
}

export function incidentOperationsHref(incidentId?: string | null) {
  const id = String(incidentId || '').trim()
  if (!id) return INCIDENTS_UI_PATH

  const qs = new URLSearchParams({
    incidentId: id,
    ops: '1',
    dateMode: 'all',
  })
  return `${INCIDENTS_UI_PATH}?${qs.toString()}`
}
