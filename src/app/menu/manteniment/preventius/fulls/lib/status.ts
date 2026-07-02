import type { MaintenanceStatus } from './types'

export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  validat: 'Validat',
}

export const STATUS_CLASSES: Record<MaintenanceStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-blue-100 text-blue-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  validat: 'bg-purple-100 text-purple-800',
}

export const WORKER_VISIBLE_JOURNEY_STATUSES = new Set<MaintenanceStatus>([
  'assignat',
  'en_curs',
  'espera',
  'fet',
])

export const WORKER_JOURNEY_FILTER_STATUSES: MaintenanceStatus[] = [
  'assignat',
  'en_curs',
  'espera',
  'fet',
  'no_fet',
]

export const MANAGER_JOURNEY_FILTER_STATUSES: MaintenanceStatus[] = [
  'nou',
  'assignat',
  'en_curs',
  'espera',
  'fet',
  'no_fet',
  'validat',
]

export const PROGRESS_VISIBLE_STATUSES = new Set<MaintenanceStatus>([
  'en_curs',
  'espera',
  'fet',
  'validat',
])

export const normalizeMaintenanceStatus = (status?: string | null): MaintenanceStatus => {
  const key = String(status || 'assignat').trim().toLowerCase()
  if (key === 'nou') return 'nou'
  if (key === 'assignat' || key === 'pendent') return 'assignat'
  if (key === 'en curs' || key === 'en_curs') return 'en_curs'
  if (key === 'espera') return 'espera'
  if (key === 'fet') return 'fet'
  if (key === 'no fet' || key === 'no_fet') return 'no_fet'
  if (key === 'resolut') return 'fet'
  if (key === 'validat') return 'validat'
  return 'assignat'
}

export const getStatusLabel = (status?: string | null, fallback = 'assignat') => {
  return STATUS_LABELS[normalizeMaintenanceStatus(status || fallback)]
}

export const getAllowedNextStatuses = (
  status: MaintenanceStatus,
  role: string
): MaintenanceStatus[] => {
  if (status === 'assignat') return ['en_curs', 'espera']
  if (status === 'en_curs') {
    return role === 'treballador'
      ? ['espera', 'fet', 'no_fet']
      : ['espera', 'fet', 'no_fet', 'validat']
  }
  if (status === 'espera') {
    return role === 'treballador'
      ? ['en_curs', 'fet', 'no_fet']
      : ['en_curs', 'fet', 'no_fet', 'validat']
  }
  if (status === 'fet') return role === 'treballador' ? [] : ['validat']
  if (status === 'no_fet') return []
  return []
}
