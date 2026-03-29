export type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  autoPlanExcludedWeeks?: string[]
}

export type DueTemplate = Template & {
  dueState: 'due' | 'overdue'
  dueDate: string
}

export type TicketCard = {
  id: string
  code: string
  title: string
  priority: 'urgent' | 'alta' | 'normal' | 'baixa'
  minutes: number
  status?: string
  createdAt?: string | number | null
  ageDays: number
  ageBucket: 'today' | 'days_1_2' | 'days_3_7' | 'days_8_plus'
  location?: string
  machine?: string
}

export type ScheduledItem = {
  id: string
  kind: 'preventiu' | 'ticket'
  title: string
  workers: string[]
  workersCount: number
  dayIndex: number
  start: string
  end: string
  minutes: number
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  location?: string
  machine?: string
  createdAt?: string | number | null
  templateId?: string | null
  ticketId?: string | null
  status?: string
  progress?: number
}

export type PlannerDraft = {
  id?: string
  kind: 'preventiu' | 'ticket'
  templateId?: string | null
  ticketId?: string | null
  title: string
  createdAt?: string | number | null
  dayIndex: number
  start: string
  duration: number
  end: string
  workersCount: number
  workers: string[]
  priority: 'urgent' | 'alta' | 'normal' | 'baixa'
  location: string
  machine: string
  status?: string
  progress?: number
}
