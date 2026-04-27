export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { normalizeCommercialAuditGroup, resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

function normalizeDept(raw?: string): Department | null {
  const value = (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'comercial') return 'comercial'
  if (value === 'serveis' || value === 'sala') return 'serveis'
  if (value === 'cuina') return 'cuina'
  if (value === 'logistica') return 'logistica'
  if (value === 'deco' || value === 'decoracio' || value === 'decoracions') return 'deco'
  return null
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

    const { searchParams } = new URL(req.url)
    const status = String(searchParams.get('status') || '').trim().toLowerCase()
    const q = String(searchParams.get('q') || '')
      .trim()
      .toLowerCase()
    const eventId = String(searchParams.get('eventId') || '').trim()
    const department = normalizeDept(searchParams.get('department') || '')
    let fromTs = Number(searchParams.get('fromTs') || 0)
    let toTs = Number(searchParams.get('toTs') || 0)
    const cursorTs = Number(searchParams.get('cursorTs') || 0)
    const limit = Math.max(1, Math.min(2000, Number(searchParams.get('limit') || 200)))
    if (fromTs > 0 && toTs > 0 && fromTs > toTs) {
      const tmp = fromTs
      fromTs = toTs
      toTs = tmp
    }

    let ref: FirebaseFirestore.Query = firestoreAdmin.collection('audit_runs')

    if (role === 'cap') {
      if (!userDept) return NextResponse.json({ executions: [] }, { status: 200 })
      ref = ref.where('department', '==', userDept)
    } else if (!['admin', 'direccio'].includes(role)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    if (department && role !== 'cap') ref = ref.where('department', '==', department)
    if (status) ref = ref.where('status', '==', status)
    if (eventId) ref = ref.where('eventId', '==', eventId)
    const fallbackRef = ref
    if (fromTs > 0) ref = ref.where('completedAt', '>=', fromTs)
    if (toTs > 0) ref = ref.where('completedAt', '<=', toTs)

    const mapRows = (snap: FirebaseFirestore.QuerySnapshot) =>
      snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        eventId: String(data.eventId || ''),
        eventSummary: String(data.eventSummary || ''),
        eventCode: String(data.eventCode || ''),
        eventLocation: String(data.eventLocation || ''),
        eventDay: String(data.eventDay || ''),
        department: String(data.department || ''),
        templateName: String(data.templateName || ''),
        incidentOutcome: String(data.incidentOutcome || ''),
        incidentIds: Array.isArray(data.incidentIds) ? data.incidentIds : [],
        status: String(data.status || ''),
        completedAt: Number(data.completedAt || 0),
        completedById: String(data.completedById || ''),
        completedByDepartment: String(data.completedByDepartment || ''),
        completedByName: String(data.completedByName || ''),
        reviewedAt: Number(data.reviewedAt || 0),
        reviewedByName: String(data.reviewedByName || ''),
        compliancePct: Number(data.compliancePct || 0),
      }
    })

    let rawRows: ReturnType<typeof mapRows> = []
    try {
      const fetchLimit = Math.max(limit + 1, 100)
      let orderedRef = ref.orderBy('completedAt', 'desc')
      if (cursorTs > 0) orderedRef = orderedRef.startAfter(cursorTs)
      const snap = await orderedRef.limit(fetchLimit).get()
      rawRows = mapRows(snap)
    } catch (queryErr: unknown) {
      // Fallback if a composite index is missing for the selected combination.
      const message = queryErr instanceof Error ? queryErr.message : ''
      const needsIndex = message.toLowerCase().includes('index')
      if (!needsIndex) throw queryErr
      const fallbackLimit = Math.max(limit + 1, 2000)
      try {
        let orderedFallbackRef = fallbackRef.orderBy('completedAt', 'desc')
        if (cursorTs > 0) orderedFallbackRef = orderedFallbackRef.startAfter(cursorTs)
        const fallbackSnap = await orderedFallbackRef.limit(fallbackLimit).get()
        rawRows = mapRows(fallbackSnap)
      } catch (fallbackErr: unknown) {
        const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : ''
        const fallbackNeedsIndex = fallbackMessage.toLowerCase().includes('index')
        if (!fallbackNeedsIndex || !eventId) throw queryErr
        const exactSnap = await fallbackRef.limit(fallbackLimit).get()
        rawRows = mapRows(exactSnap).sort((a, b) => b.completedAt - a.completedAt)
      }
    }

    const allowedCommercialUserIds =
      role === 'cap' && commercialGroup ? await loadCommercialUserIdsForGroup(commercialGroup) : null

    const filteredRows = rawRows.filter((row) => {
      if (status && row.status !== status) return false
      if (department && row.department !== department) return false
      if (eventId && row.eventId !== eventId) return false
      if (fromTs > 0 && row.completedAt < fromTs) return false
      if (toTs > 0 && row.completedAt > toTs) return false
      if (cursorTs > 0 && row.completedAt >= cursorTs) return false
      if (allowedCommercialUserIds) {
        const rowGroup = normalizeCommercialAuditGroup(row.completedByDepartment || '')
        if (rowGroup !== commercialGroup && !allowedCommercialUserIds.has(row.completedById)) return false
      }
      if (!q) return true
      const text = `${row.eventId} ${row.eventSummary} ${row.department} ${row.templateName} ${row.completedByName} ${row.status}`.toLowerCase()
      return text.includes(q)
    })

    const executions = filteredRows.slice(0, limit)
    const hasMore = filteredRows.length > limit
    const nextCursorTs = hasMore ? Number(executions[executions.length - 1]?.completedAt || 0) : null

    console.info('[auditoria/executions/list] completed', {
      durationMs: Date.now() - startedAt,
      role,
      status: status || 'all',
      department: department || (role === 'cap' ? userDept || '' : ''),
      eventId: eventId || '',
      q: q ? 'yes' : 'no',
      fromTs,
      toTs,
      cursorTs,
      requestedLimit: limit,
      returned: executions.length,
      rawRows: rawRows.length,
      hasMore,
    })

    return NextResponse.json({ executions, hasMore, nextCursorTs }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    console.error('[auditoria/executions/list] failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
