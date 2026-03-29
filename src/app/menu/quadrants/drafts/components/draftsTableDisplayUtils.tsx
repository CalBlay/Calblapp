import React from 'react'
import { ChevronDown, ChevronUp, GraduationCap, Truck, User } from 'lucide-react'
import type { Role, Row } from './types'
import { normalizeDraftText } from './draftsTableUtils'

export type DisplayItem =
  | { type: 'single'; row: Row; index: number }
  | { type: 'merged'; key: string; rows: Array<{ row: Row; index: number }> }

export const roleIconMap: Record<Role, React.ReactNode> = {
  responsable: <GraduationCap className="text-blue-700" size={20} />,
  conductor: <Truck className="text-orange-500" size={18} />,
  treballador: <User className="text-green-600" size={18} />,
}

export function buildDisplayItems(rows: Row[], groupId?: string): DisplayItem[] {
  const order: string[] = []
  const grouped = new Map<string, Array<{ row: Row; index: number }>>()

  rows.forEach((row, index) => {
    if (groupId && row.groupId !== groupId) return
    if (!groupId && row.groupId) return

    const name = row.name || ''
    const canMerge = name && name !== 'Extra' && !row.isExternal
    const key = canMerge
      ? [
          groupId || 'nogroup',
          normalizeDraftText(name),
          row.startDate,
          row.startTime,
          row.endDate,
          row.endTime,
          row.meetingPoint || '',
        ].join('|')
      : `single-${index}`

    if (!grouped.has(key)) {
      grouped.set(key, [])
      order.push(key)
    }
    grouped.get(key)!.push({ row, index })
  })

  return order.map((key) => {
    const groupRows = grouped.get(key) || []
    if (groupRows.length <= 1) {
      const single = groupRows[0]
      return { type: 'single', row: single.row, index: single.index }
    }
    return { type: 'merged', key, rows: groupRows }
  })
}

export function getMergedPresentation(item: Extract<DisplayItem, { type: 'merged' }>) {
  const roleRows = item.rows.map((r) => r.row)
  const roles = Array.from(new Set(roleRows.map((r) => r.role)))
  const primary =
    roleRows.find((r) => r.role === 'conductor') ||
    roleRows.find((r) => r.role === 'responsable') ||
    roleRows[0]

  return { roleRows, roles, primary }
}

export function renderMergedToggle(isExpanded: boolean) {
  return isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
}
