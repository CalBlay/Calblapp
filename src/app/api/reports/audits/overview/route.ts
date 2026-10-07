import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { canViewReportsDomain, reportsDomainForbiddenResponse } from '@/lib/server/reportsApiAuth'
import {
  buildAuditOverview,
  type AuditReportAnswer,
  type AuditReportIncident,
  type AuditReportRun,
  type AuditReportTemplateBlock,
} from '@/lib/informes/auditOverview'
import { normalizeCommercialAuditGroup, resolveAuditDepartmentForUser } from '@/lib/auditDepartment'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 366
const MAX_RUNS = 10_000

function startOfDayMs(ymd: string): number {
  return new Date(`${ymd}T00:00:00`).getTime()
}

function endOfDayMs(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999`).getTime()
}

function ymd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function previousPeriod(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - days + 1)
  return { dateFrom: ymd(previousStart), dateTo: ymd(previousEnd) }
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis
    if (typeof toMillis === 'function') return Number(toMillis.call(value)) || 0
  }
  if (typeof value === 'string') return Date.parse(value) || 0
  return 0
}

function normalizeDepartment(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function mapRun(id: string, data: Record<string, unknown>): AuditReportRun {
  return {
    id,
    eventId: String(data.eventId || ''),
    eventSummary: String(data.eventSummary || ''),
    eventCode: String(data.eventCode || ''),
    eventLocation: String(data.eventLocation || ''),
    eventDay: String(data.eventDay || ''),
    department: normalizeDepartment(data.department),
    templateId: String(data.templateId || ''),
    templateName: String(data.templateName || ''),
    status: String(data.status || '').toLowerCase(),
    completedAt: normalizeTimestamp(data.completedAt),
    savedAt: normalizeTimestamp(data.savedAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
    completedById: String(data.completedById || ''),
    completedByName: String(data.completedByName || data.savedByName || ''),
    completedByDepartment: String(data.completedByDepartment || data.savedByDepartment || ''),
    reviewedByName: String(data.reviewedByName || ''),
    compliancePct: Number(data.compliancePct || 0),
    incidentOutcome: String(data.incidentOutcome || ''),
    incidentIds: Array.isArray(data.incidentIds)
      ? data.incidentIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    templateSnapshot: Array.isArray(data.templateSnapshot)
      ? (data.templateSnapshot as AuditReportTemplateBlock[])
      : [],
    auditAnswers: Array.isArray(data.auditAnswers) ? (data.auditAnswers as AuditReportAnswer[]) : [],
  }
}

async function commercialUserIdsForGroup(group: string): Promise<Set<string>> {
  const snap = await firestoreAdmin.collection('users').get()
  return new Set(
    snap.docs.flatMap((doc) => {
      const data = doc.data() as Record<string, unknown>
      if (normalizeRole(String(data.role || '')) !== 'comercial') return []
      const department = normalizeCommercialAuditGroup(
        String(data.departmentLower || data.department || '')
      )
      return department === group ? [doc.id] : []
    })
  )
}

async function loadIncidents(ids: string[]): Promise<AuditReportIncident[]> {
  if (ids.length === 0) return []
  const uniqueIds = Array.from(new Set(ids)).slice(0, 3000)
  const chunks: string[][] = []
  for (let index = 0; index < uniqueIds.length; index += 300) {
    chunks.push(uniqueIds.slice(index, index + 300))
  }
  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      firestoreAdmin.getAll(...chunk.map((id) => firestoreAdmin.collection('incidents').doc(id)))
    )
  )
  return snapshots.flatMap((group) =>
    group.flatMap((doc) =>
      doc.exists ? [{ id: doc.id, status: String(doc.data()?.status || '') }] : []
    )
  )
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const roleFailure = requireRoles(auth, ['admin', 'direccio', 'cap'])
  if (roleFailure) return roleFailure.res
  if (!(await canViewReportsDomain(auth.user, 'audits'))) {
    return reportsDomainForbiddenResponse()
  }

  try {
    const { searchParams } = new URL(req.url)
    const dateFrom = String(searchParams.get('dateFrom') || '').trim()
    const dateTo = String(searchParams.get('dateTo') || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ error: 'Cal indicar dateFrom i dateTo.' }, { status: 400 })
    }
    const fromMs = startOfDayMs(dateFrom)
    const toMs = endOfDayMs(dateTo)
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      return NextResponse.json({ error: 'El període no és vàlid.' }, { status: 400 })
    }
    if (toMs - fromMs > MAX_RANGE_DAYS * 86_400_000) {
      return NextResponse.json({ error: 'El rang màxim és d’un any.' }, { status: 400 })
    }

    const userDepartment = resolveAuditDepartmentForUser(auth.user.department || '')
    const commercialGroup = normalizeCommercialAuditGroup(auth.user.department || '')
    let query: FirebaseFirestore.Query = firestoreAdmin.collection('audit_runs')
    if (auth.role === 'cap') {
      if (!userDepartment) {
        return NextResponse.json({ error: 'El perfil no té un departament d’auditoria.' }, { status: 403 })
      }
      query =
        userDepartment === 'foodlovers' && commercialGroup === 'foodlovers'
          ? query.where('department', 'in', ['foodlovers', 'comercial'])
          : query.where('department', '==', userDepartment)
    }

    const snap = await query.limit(MAX_RUNS).get()
    let runs = snap.docs.map((doc) => mapRun(doc.id, doc.data() as Record<string, unknown>))

    if (auth.role === 'cap' && commercialGroup) {
      const allowedIds = await commercialUserIdsForGroup(commercialGroup)
      runs = runs.filter((run) => {
        const runGroup = normalizeCommercialAuditGroup(run.completedByDepartment)
        return runGroup === commercialGroup || allowedIds.has(run.completedById)
      })
      if (userDepartment === 'foodlovers') {
        runs = runs.map((run) =>
          run.department === 'comercial' ? { ...run, department: 'foodlovers' } : run
        )
      }
    }

    const previous = previousPeriod(dateFrom, dateTo)
    const incidentIds = runs.flatMap((run) => run.incidentIds)
    const incidents = await loadIncidents(incidentIds)
    const overview = buildAuditOverview({
      runs,
      incidents,
      dateFrom,
      dateTo,
      previousDateFrom: previous.dateFrom,
      previousDateTo: previous.dateTo,
      filters: {
        department: searchParams.get('department') || undefined,
        responsible: searchParams.get('responsible') || undefined,
        template: searchParams.get('template') || undefined,
        status: searchParams.get('status') || undefined,
        location: searchParams.get('location') || undefined,
        ln: searchParams.get('ln') || undefined,
      },
    })

    return NextResponse.json(overview, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: unknown) {
    console.error('[api/reports/audits/overview]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s’ha pogut construir l’informe.' },
      { status: 500 }
    )
  }
}
