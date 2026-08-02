import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { normalizeRole } from '@/lib/roles'
import { loadNotificationSummaryParts } from '@/lib/notifications/summaryParts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SessionUser {
  id: string
  role?: string
  canRespondSurveys?: boolean
}

export type NotificationSummaryPayload = {
  adminUserRequests: number
  userRequestResults: number
  torn: number
  projects: number
  logistics: number
  maintenance: number
  incidents: number
  events: number
  surveys: number
  robaPersonal: number
  messaging: number
  isAdmin: boolean
  isRrhh: boolean
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = String(user.id || '').trim()
  if (!userId) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
  }

  const role = normalizeRole(user.role || '')
  const isAdmin = role === 'admin'
  const canRespondSurveys = Boolean(user.canRespondSurveys)
  const canAccessSurveys = canRespondSurveys || ['admin', 'direccio', 'cap'].includes(role)

  try {
    const { buckets, messaging, robaPersonal, surveys, pendingUserRequests } =
      await loadNotificationSummaryParts({ userId, isAdmin, canAccessSurveys })

    const adminUserRequests = isAdmin ? pendingUserRequests : 0
    const userRequestResults = buckets.user_request_result
    const torn = buckets.torn
    const projects = buckets.projects
    const logistics = buckets.logistics
    const maintenance = buckets.maintenance
    const incidents = buckets.incidents
    const events = buckets.events

    const payload: NotificationSummaryPayload = {
      adminUserRequests,
      userRequestResults,
      torn,
      projects,
      logistics,
      maintenance,
      incidents,
      events,
      surveys,
      robaPersonal,
      messaging,
      isAdmin,
      isRrhh: false,
    }

    return NextResponse.json(payload)
  } catch (err: unknown) {
    console.error('[notifications/summary] unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
