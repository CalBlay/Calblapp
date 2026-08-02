import type { TicketPriority, TicketStatus } from '@/app/menu/manteniment/tickets/types'

export const MAINTENANCE_STATUSES: TicketStatus[] = [
  'nou',
  'assignat',
  'reassignat',
  'en_curs',
  'espera',
  'fet',
  'no_fet',
  'validat',
]

export const MAINTENANCE_STATUS_LABELS: Record<TicketStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  reassignat: 'Reassignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  validat: 'Validat',
}

export const MAINTENANCE_STATUS_BADGE_CLASSES: Record<TicketStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-blue-100 text-blue-800',
  reassignat: 'bg-orange-100 text-orange-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  validat: 'bg-purple-100 text-purple-800',
}

export const MAINTENANCE_STATUS_FILTER_STYLES: Record<
  TicketStatus,
  { active: string; dot: string; label: string }
> = {
  nou: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
    label: MAINTENANCE_STATUS_LABELS.nou,
  },
  assignat: {
    active: 'bg-sky-100 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
    label: MAINTENANCE_STATUS_LABELS.assignat,
  },
  reassignat: {
    active: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    label: MAINTENANCE_STATUS_LABELS.reassignat,
  },
  en_curs: {
    active: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: MAINTENANCE_STATUS_LABELS.en_curs,
  },
  espera: {
    active: 'bg-slate-200 text-slate-800 border-slate-300',
    dot: 'bg-slate-500',
    label: MAINTENANCE_STATUS_LABELS.espera,
  },
  fet: {
    active: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    label: MAINTENANCE_STATUS_LABELS.fet,
  },
  no_fet: {
    active: 'bg-rose-100 text-rose-800 border-rose-200',
    dot: 'bg-rose-500',
    label: MAINTENANCE_STATUS_LABELS.no_fet,
  },
  validat: {
    active: 'bg-violet-100 text-violet-800 border-violet-200',
    dot: 'bg-violet-500',
    label: MAINTENANCE_STATUS_LABELS.validat,
  },
}

export const MAINTENANCE_PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

export const MAINTENANCE_PRIORITY_BADGE_CLASSES: Record<TicketPriority, string> = {
  urgent: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-slate-100 text-slate-700',
  baixa: 'bg-blue-100 text-blue-700',
}

export const MAINTENANCE_EXTERNAL_FLOW_LABELS = {
  all: 'Tots',
  internal: 'Interns',
  external: 'Derivats a proveidor',
} as const
