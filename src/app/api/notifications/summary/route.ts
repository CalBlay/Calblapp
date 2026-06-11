import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { normalizeRole } from '@/lib/roles'
import { countUnreadNotifications, countUnreadNotificationsByTypes } from '@/lib/notifications/firestoreCounts'
import { countMessagingUnread } from '@/lib/notifications/messagingUnreadCount'
import { computeRobaBadgeCount } from '@/lib/notifications/robaBadgeCount'
import {
  INCIDENT_NOTIFICATION_TYPES,
  LOGISTICS_NOTIFICATION_TYPES,
  MAINTENANCE_NOTIFICATION_TYPES,
  PROJECT_NOTIFICATION_TYPES,
  TORN_NOTIFICATION_TYPES,
} from '@/lib/notifications/notificationTypes'
import { listUserQuadrantSurveys } from '@/lib/quadrantSurveys'

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
    const [
      adminUserRequests,
      userRequestResults,
      torn,
      projects,
      logistics,
      maintenance,
      incidents,
      messaging,
      robaPersonal,
      surveys,
    ] = await Promise.all([
      isAdmin ? countUnreadNotifications(userId, { type: 'user_request' }) : Promise.resolve(0),
      countUnreadNotifications(userId, { type: 'user_request_result' }),
      countUnreadNotificationsByTypes(userId, [...TORN_NOTIFICATION_TYPES]),
      countUnreadNotificationsByTypes(userId, [...PROJECT_NOTIFICATION_TYPES]),
      countUnreadNotificationsByTypes(userId, [...LOGISTICS_NOTIFICATION_TYPES]),
      countUnreadNotificationsByTypes(userId, [...MAINTENANCE_NOTIFICATION_TYPES]),
      countUnreadNotificationsByTypes(userId, [...INCIDENT_NOTIFICATION_TYPES]),
      countMessagingUnread(userId),
      computeRobaBadgeCount(),
      canAccessSurveys
        ? listUserQuadrantSurveys(userId).then((items) =>
            items.filter((survey) => !(survey as { myResponse?: unknown }).myResponse).length
          )
        : Promise.resolve(0),
    ])

    const payload: NotificationSummaryPayload = {
      adminUserRequests,
      userRequestResults,
      torn,
      projects,
      logistics,
      maintenance,
      incidents,
      surveys,
      robaPersonal,
      messaging,
      isAdmin,
      isRrhh: false,
    }

    return NextResponse.json(payload)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
