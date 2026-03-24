// src/services/reports.ts
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { Timestamp } from 'firebase-admin/firestore'
import type { Query } from 'firebase-admin/firestore'

export interface ReportFilters {
  department:   string
  role:         string
  from:         string
  to:           string
  event:        string
  responsible:  string
  businessLine: string
}

interface StaffMember {
  id: string
  name: string
  role?: string
  startTime?: string | { toDate: () => Date }
  endTime?: string | { toDate: () => Date }
  isResponsible?: boolean
}

interface AssignmentDoc {
  code?: string
  name?: string
  businessLine?: string
  startTime?: string | { toDate: () => Date }
  endTime?: string | { toDate: () => Date }
  isResponsible?: boolean
  assignedStaff?: StaffMember[]
}

interface QuadrantDoc {
  department: string
  assignments?: AssignmentDoc[]
}

export async function getPersonnelReport(filters: ReportFilters) {
  // 1) Consulta quadrants segons dates
  let q: Query = firestoreAdmin.collection('quadrants')
  if (filters.from) q = q.where('weekStart', '>=', Timestamp.fromDate(new Date(filters.from)))
  if (filters.to)   q = q.where('weekStart', '<=', Timestamp.fromDate(new Date(filters.to)))
  const quadSnap = await q.get()

  // 2) Aplanem tots els assignedStaff
  type Asg = {
    personId:      string
    personName:    string
    personRole:    string
    department:    string
    startTime:     string | { toDate: () => Date }
    endTime:       string | { toDate: () => Date }
    isResponsible: boolean
    code?:         string
    name?:         string
    businessLine?: string
  }

  const allAsgs: Asg[] = []
  quadSnap.forEach(doc => {
    const data = doc.data() as QuadrantDoc
    const dept = data.department

    for (const asg of data.assignments || []) {
      const {
        code,
        name,
        businessLine,
        startTime: aStart,
        endTime:   aEnd,
        isResponsible
      } = asg

      for (const staff of asg.assignedStaff || []) {
        allAsgs.push({
          personId:      staff.id,
          personName:    staff.name,
          personRole:    staff.role || '',
          department:    dept,
          startTime:     staff.startTime ?? aStart ?? '',
          endTime:       staff.endTime   ?? aEnd   ?? '',
          isResponsible: staff.isResponsible ?? isResponsible ?? false,
          code,
          name,
          businessLine
        })
      }
    }
  })

  // 3) Filtrat segons els paràmetres
  const filtered = allAsgs.filter(a => {
    if (filters.department   && a.department   !== filters.department) return false
    if (filters.role         && a.personRole   !== filters.role)       return false
    if (filters.event) {
      const ev = filters.event.toLowerCase()
      if (!(
        a.code?.toLowerCase().includes(ev) ||
        a.name?.toLowerCase().includes(ev)
      )) return false
    }
    if (filters.responsible) {
      if (!a.personName.toLowerCase().includes(filters.responsible.toLowerCase()))
        return false
    }
    if (filters.businessLine && a.businessLine !== filters.businessLine)
      return false
    return true
  })

  // 4) Agreguem per persona i calculem hores
  interface Stats {
    id: string
    name: string
    department: string
    role: string
    hoursWorked: number
    extraHours: number
    responsableCount: number
    eventsCount: number
    contractHours: number
  }
  const statsMap: Record<string, Stats> = {}

  for (const a of filtered) {
    // converteixo a Date object segons el tipus
    const startDate = typeof a.startTime === 'string'
      ? new Date(a.startTime)
      : a.startTime.toDate()
    const endDate = typeof a.endTime === 'string'
      ? new Date(a.endTime)
      : a.endTime.toDate()

    const hrs = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)

    if (!statsMap[a.personId]) {
      statsMap[a.personId] = {
        id:               a.personId,
        name:             a.personName,
        department:       a.department,
        role:             a.personRole,
        hoursWorked:      0,
        extraHours:       0,
        responsableCount: 0,
        eventsCount:      0,
        contractHours:    0 // omple-ho si tens aquest valor a Firestore
      }
    }
    const p = statsMap[a.personId]
    p.hoursWorked      += hrs
    p.eventsCount      += 1
    if (a.isResponsible) p.responsableCount += 1
  }

  // 5) KPI globals
  let totalPersonnel = 0, totalHours = 0, totalExtras = 0
  for (const p of Object.values(statsMap)) {
    p.extraHours = Math.max(0, p.hoursWorked - p.contractHours)
    totalPersonnel++
    totalHours  += p.hoursWorked
    totalExtras  += p.extraHours
  }

  const chartByPerson = Object.values(statsMap).map(p => ({
    name:  p.name,
    hours: Math.round(p.hoursWorked)
  }))
  const chartDonut = [
    { name: 'Hores extres',  value: Math.round(totalExtras) },
    { name: 'Hores normals', value: Math.round(totalHours - totalExtras) }
  ]
  const topResp = Object.values(statsMap)
    .sort((a,b) => b.responsableCount - a.responsableCount)
    .slice(0,5)
    .map(p => p.name)
    .join(', ')

  return {
    stats: {
      totalPersonnel,
      totalHours:      Math.round(totalHours),
      extraHours:      Math.round(totalExtras),
      topResponsables: topResp
    },
    chartByPerson,
    chartDonut,
    rows: Object.values(statsMap)
  }
}
