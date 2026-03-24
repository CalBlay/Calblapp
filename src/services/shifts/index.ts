import type { Assignment } from '@/services/db'

export type TemplateRow = {
  id: string
  date?: string
  name?: string
  location?: string
  startTime?: string
  endTime?: string
  staffCount?: number
  driversCount?: number
  responsableManual?: string
}

export type { Assignment }

export async function buildRawAssignments(
  _rows: TemplateRow[],
  _department: string
): Promise<Assignment[]> {
  return []
}

export async function confirmQuadrant(
  _rows: TemplateRow[],
  _assignments: Assignment[],
  _department: string
): Promise<void> {
  return
}
