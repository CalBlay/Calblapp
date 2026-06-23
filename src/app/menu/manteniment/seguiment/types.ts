'use client'

import type { Ticket } from '@/app/menu/manteniment/tickets/types'

export type TabKey = 'tickets' | 'preventius'

export type MaintenanceStatus =
  | 'nou'
  | 'assignat'
  | 'en_curs'
  | 'espera'
  | 'fet'
  | 'no_fet'
  | 'resolut'
  | 'validat'

export type WorkHistoryEntry = {
  status?: string | null
  at?: number | string | null
  byName?: string
  startTime?: string | null
  endTime?: string | null
  note?: string | null
}

export type Preventiu = {
  id: string
  title: string
  location: string
  workerNames: string[]
  status: MaintenanceStatus
  progress: number | null
  plannedDate: string | null
  plannedStart: string | null
  plannedEnd: string | null
  createdAt: number | string | null
  updatedAt: number | string | null
  completedAt: number | string | null
  recordId?: string | null
  notes?: string | null
  checklist?: Record<string, boolean>
  history: Array<{
    status: MaintenanceStatus
    at: number
    byName?: string
    startTime?: string | null
    endTime?: string | null
    note?: string | null
  }>
}

export type CompletedRecord = {
  id?: string
  plannedId?: string
  templateId?: string | null
  status?: string
  completedAt?: string | number | null
  updatedAt?: string | number | null
  title?: string
  worker?: string | null
  startTime?: string
  endTime?: string
  notes?: string
  checklist?: Record<string, boolean>
  statusHistory?: WorkHistoryEntry[]
}

export type PlannedPreventiuApiItem = {
  id?: string | number
  title?: string
  location?: string
  workerNames?: unknown[]
  lastStatus?: string
  lastProgress?: number | null
  date?: string | null
  startTime?: string | null
  endTime?: string | null
  createdAt?: number | string | null
  lastUpdatedAt?: number | string | null
  updatedAt?: number | string | null
  lastCompletedAt?: number | string | null
  lastRecordId?: string | null
}

export type SeguimentRow = Ticket | Preventiu
