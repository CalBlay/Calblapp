export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { normalizeCommercialAuditGroup, resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

type ExecutionRow = {
  id: string
  eventId: string
  eventSummary: string
  eventCode: string
  eventLocation: string
  eventDay: string
  status: string
  completedById: string
  completedByDepartment: string
  completedAt: number
}

type EventSummaryRow = {
  eventId: string
  eventSummary: string
  eventCode: string
  eventLocation: string
  eventDay: string
  eventLn: string
  audits: number
  lastAt: number
}

function lnFromCode(code?: string) {
  const s = String(code || '').trim().toUpperCase()
  if (!s) return ''
  if (s.startsWith('E-')) return 'Empresa'
  if (s.startsWith('C-')) return 'Casaments'
  if (s.startsWith('F-')) return 'Foodlovers'
  if (s.startsWith('PM')) return 'Agenda'
  return ''
}

async function loadCommercialUserIdsForGroup(group: string) {
  const snap = await firestoreAdmin.collection('users').get()
  const ids = new Set<string>()
  snap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>
    const role = normalizeRole(String(data.role || ''))
    if (role !== 'comercial') return
    const dept = normalizeCommercialAuditGroup(String(data.departmentLower || data.department || ''))
    if (dept === group) ids.add(doc.id)
  })
  return ids
}

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

    const role = normalizeRole(user.role || '')
    const userDept = resolveAuditDepartmentForUser(user.department || '')
    const commercialGroup = normalizeCommercialAuditGroup(user.department || '')

    if (!['admin', 'direccio', 'cap'].includes(role)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    let fromTs = Number(searchParams.get('fromTs') || 0)
    let toTs = Number(searchParams.get('toTs') || 0)
    const limit = Math.max(1, Math.min(1000, Number(searchParams.get('limit') || 300)))
    if (fromTs > 0 && toTs > 0 && fromTs > toTs) {
      const tmp = fromTs
      fromTs = toTs
      toTs = tmp
    }

    let ref: FirebaseFirestore.Query = firestoreAdmin.collection('audit_runs')
    if (role === 'cap') {
      if (!userDept) return NextResponse.json({ events: [] }, { status: 200 })
      ref = ref.where('department', '==', userDept)
    }

    ref = ref.where('status', '==', 'validated')
    const fallbackRef = ref
    if (fromTs > 0) ref = ref.where('completedAt', '>=', fromTs)
    if (toTs > 0) ref = ref.where('completedAt', '<=', toTs)

    const mapRows = (snap: FirebaseFirestore.QuerySnapshot): ExecutionRow[] =>
      snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return {
          id: docSnap.id,
          eventId: String(data.eventId || ''),
          eventSummary: String(data.eventSummary || ''),
          eventCode: String(data.eventCode || ''),
          eventLocation: String(data.eventLocation || ''),
          eventDay: String(data.eventDay || ''),
          status: String(data.status || ''),
          completedById: String(data.completedById || ''),
          completedByDepartment: String(data.completedByDepartment || ''),
          completedAt: Number(data.completedAt || 0),
        }
      })

    let rows: ExecutionRow[] = []
    try {
      const snap = await ref.orderBy('completedAt', 'desc').limit(Math.max(limit * 4, 500)).get()
      rows = mapRows(snap)
    } catch (queryErr: unknown) {
      const message = queryErr instanceof Error ? queryErr.message : ''
      const needsIndex = message.toLowerCase().includes('index')
      if (!needsIndex) throw queryErr
      const fallbackSnap = await fallbackRef.orderBy('completedAt', 'desc').limit(Math.max(limit * 4, 500)).get()
      rows = mapRows(fallbackSnap).filter((row) => {
        if (fromTs > 0 && row.completedAt < fromTs) return false
        if (toTs > 0 && row.completedAt > toTs) return false
        return row.status === 'validated'
      })
    }

    const allowedCommercialUserIds =
      role === 'cap' && commercialGroup ? await loadCommercialUserIdsForGroup(commercialGroup) : null

    if (allowedCommercialUserIds) {
      rows = rows.filter((row) => {
        const rowGroup = normalizeCommercialAuditGroup(row.completedByDepartment || '')
        return rowGroup === commercialGroup || allowedCommercialUserIds.has(row.completedById)
      })
    }

    const byEvent = new Map<string, EventSummaryRow>()
    rows.forEach((row) => {
      const currentEventId = String(row.eventId || '').trim()
      if (!currentEventId) return

      const existing = byEvent.get(currentEventId)
      if (!existing) {
        byEvent.set(currentEventId, {
          eventId: currentEventId,
          eventSummary: row.eventSummary || `Event ${currentEventId}`,
          eventCode: row.eventCode || '',
          eventLocation: row.eventLocation || '-',
          eventDay: /^\d{4}-\d{2}-\d{2}$/.test(row.eventDay) ? row.eventDay : '',
          eventLn: lnFromCode(row.eventCode),
          audits: 1,
          lastAt: Number(row.completedAt || 0),
        })
        return
      }

      existing.audits += 1
      if (!existing.eventCode && row.eventCode) existing.eventCode = row.eventCode
      if ((!existing.eventLocation || existing.eventLocation === '-') && row.eventLocation) {
        existing.eventLocation = row.eventLocation
      }
      if (!existing.eventDay && /^\d{4}-\d{2}-\d{2}$/.test(row.eventDay)) {
        existing.eventDay = row.eventDay
      }
      if (!existing.eventLn) existing.eventLn = lnFromCode(existing.eventCode || row.eventCode)
      if (Number(row.completedAt || 0) > existing.lastAt) existing.lastAt = Number(row.completedAt || 0)
    })

    const events = Array.from(byEvent.values())
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, limit)

    console.info('[auditoria/consulta/summary] completed', {
      durationMs: Date.now() - startedAt,
      role,
      fromTs,
      toTs,
      requestedLimit: limit,
      returned: events.length,
      sourceRows: rows.length,
    })

    return NextResponse.json({ events }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    console.error('[auditoria/consulta/summary] failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
