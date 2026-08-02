import { countMessagingUnread } from '@/lib/notifications/messagingUnreadCount'
import { countPendingAdminUserRequests } from '@/lib/notifications/pendingUserRequestsCount'
import { computeRobaBadgeCount } from '@/lib/notifications/robaBadgeCount'
import { getUserUnreadBuckets, type NotificationUnreadBuckets } from '@/lib/notifications/unreadCounts'
import { countPendingUserQuadrantSurveys } from '@/lib/quadrantSurveysPending'
import { reconcileEventComandaNotificationCount } from '@/lib/eventComanda/notificationCount.server'

async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[notifications/summary] ${label} failed:`, err)
    return fallback
  }
}

export async function loadNotificationSummaryParts(params: {
  userId: string
  isAdmin: boolean
  canAccessSurveys: boolean
}): Promise<{
  buckets: NotificationUnreadBuckets
  messaging: number
  robaPersonal: number
  surveys: number
  pendingUserRequests: number
}> {
  const { userId, isAdmin, canAccessSurveys } = params

  const [buckets, messaging, robaPersonal, surveys, pendingUserRequests, eventComandaCount] =
    await Promise.all([
    safe('unreadBuckets', {
      user_request: 0,
      user_request_result: 0,
      torn: 0,
      projects: 0,
      logistics: 0,
      maintenance: 0,
      incidents: 0,
      events: 0,
      version: 2,
      syncedAt: Date.now(),
    }, () => getUserUnreadBuckets(userId)),
    safe('messaging', 0, () => countMessagingUnread(userId)),
    safe('robaPersonal', 0, () => computeRobaBadgeCount()),
    safe('surveys', 0, () =>
      canAccessSurveys ? countPendingUserQuadrantSurveys(userId) : Promise.resolve(0)
    ),
    safe('pendingUserRequests', 0, () =>
      isAdmin ? countPendingAdminUserRequests() : Promise.resolve(0)
    ),
    safe('eventComanda', 0, () => reconcileEventComandaNotificationCount(userId)),
  ])

  return {
    buckets: { ...buckets, events: eventComandaCount },
    messaging,
    robaPersonal,
    surveys,
    pendingUserRequests,
  }
}
