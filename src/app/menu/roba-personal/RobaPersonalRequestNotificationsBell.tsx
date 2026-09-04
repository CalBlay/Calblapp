'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { CheckCheck } from 'lucide-react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import { Badge } from '@/components/ui/badge'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'
import type { DeliveryRow, RequestRow, RobaPersonalRequestNotification } from './robaPersonalTypes'
import { useRobaPersonalApiAccess } from '@/hooks/useRobaPersonalApiAccess'
import { useSyntheticNotificationDismissals } from '@/hooks/useSyntheticNotificationDismissals'

const swrFetcher = (url: string) => fetch(url).then((r) => r.json())

const ROBA_NOTIFICATION_TYPES = [
  'roba_personal_request',
  'roba_personal_sent_to_rrhh',
  'roba_personal_ready',
  'roba_personal_delivery_ack',
  'roba_personal_delivery_revised',
  'roba_personal_delivery_dispute',
] as const

type RobaDisplayedNotification = RobaPersonalRequestNotification & {
  synthetic?: boolean
}

const fetchRobaNotifications = async (): Promise<RobaDisplayedNotification[]> => {
  const responses = await Promise.all(
    ROBA_NOTIFICATION_TYPES.map(async (type) => {
      const response = await fetch(
        `/api/notifications?mode=list&type=${encodeURIComponent(type)}`,
        { cache: 'no-store' }
      )
      return response.json().catch(() => ({ notifications: [] }))
    })
  )

  const notifications = responses.flatMap((payload) =>
    Array.isArray(payload?.notifications) ? payload.notifications : []
  ) as RobaDisplayedNotification[]

  const deduped = new Map<string, RobaDisplayedNotification>()
  notifications.forEach((notification) => {
    const id = String(notification.id || '').trim()
    if (!id || deduped.has(id)) return
    deduped.set(id, notification)
  })

  return [...deduped.values()].sort((a, b) => {
    const aCreatedAt =
      typeof (a as { createdAt?: unknown }).createdAt === 'number'
        ? Number((a as { createdAt?: unknown }).createdAt)
        : 0
    const bCreatedAt =
      typeof (b as { createdAt?: unknown }).createdAt === 'number'
        ? Number((b as { createdAt?: unknown }).createdAt)
        : 0
    return bCreatedAt - aCreatedAt
  })
}

function notificationKindLabel(type: string): string {
  if (type === 'roba_personal_sent_to_rrhh') return 'Preparacio'
  if (type === 'roba_personal_request') return 'Recepcio'
  if (type === 'roba_personal_ready') return 'Recepcio'
  if (type === 'roba_personal_delivery_dispute') return 'Incidencia'
  return 'Entrega'
}

function notificationKindVariant(
  type: string
): 'secondary' | 'warning' | 'success' | 'destructive' {
  if (type === 'roba_personal_delivery_dispute') return 'destructive'
  if (type === 'roba_personal_ready') return 'warning'
  if (type === 'roba_personal_delivery_ack' || type === 'roba_personal_delivery_revised') {
    return 'success'
  }
  return 'secondary'
}

function notificationHeadline(n: RobaDisplayedNotification): string {
  const type = String(n.type || '')
  if (type === 'roba_personal_sent_to_rrhh') {
    return 'Sol licitud pendent de preparar'
  }
  if (type === 'roba_personal_request') return 'Nova sol licitud del departament'
  if (type === 'roba_personal_ready') return 'Preparacio pendent de validar'
  if (type === 'roba_personal_delivery_ack') return 'Recepcio pendent de signar'
  if (type === 'roba_personal_delivery_revised') return 'Recepcio corregida pendent'
  if (type === 'roba_personal_delivery_dispute') return 'Incidencia pendent de revisar'
  return String(n.title || '').trim() || 'Notificacio'
}

function notificationSummary(n: RobaDisplayedNotification): string {
  const type = String(n.type || '')
  const ref = String(n.reference || '').trim()
  const worker = String(n.requestedByWorkerName || '').trim()
  const dept = String(n.requestingDepartment || '').trim()
  if (type === 'roba_personal_delivery_dispute') {
    return [ref, 'revisar quantitats'].filter(Boolean).join(' · ')
  }
  if (type === 'roba_personal_delivery_ack') {
    return [ref, 'revisar i signar'].filter(Boolean).join(' · ')
  }
  if (type === 'roba_personal_delivery_revised') {
    return [ref, 'tornar a revisar i signar'].filter(Boolean).join(' · ')
  }
  return [ref, worker, dept].filter(Boolean).join(' · ')
}

function RobaNotificationItems({
  visibleNotifications,
  onDismiss,
}: {
  visibleNotifications: RobaDisplayedNotification[]
  onDismiss: (notificationId: string) => Promise<void>
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()
  const { isDeptLeadLimited } = useRobaPersonalApiAccess()

  const openNotification = (n: RobaDisplayedNotification) => {
    closeBell?.()
    const dtype = String(n.type || '')
    if (dtype === 'roba_personal_delivery_ack' || dtype === 'roba_personal_delivery_revised') {
      const did = String(n.deliveryId || '').trim()
      if (!did) return
      router.replace(
        `/menu/roba-personal?tab=entregues&deliveryId=${encodeURIComponent(did)}`,
        { scroll: false }
      )
      return
    }
    if (dtype === 'roba_personal_delivery_dispute') {
      const did = String(n.deliveryId || '').trim()
      if (!did) return
      router.replace(
        `/menu/roba-personal?tab=recollides&deliveryId=${encodeURIComponent(did)}`,
        { scroll: false }
      )
      return
    }
    const rid = String(n.requestId || '').trim()
    if (!rid) return
    if (dtype === 'roba_personal_ready') {
      router.replace(
        `/menu/roba-personal?tab=recollides&requestId=${encodeURIComponent(rid)}`,
        { scroll: false }
      )
      return
    }
    if (dtype === 'roba_personal_request' && isDeptLeadLimited) {
      router.replace(
        `/menu/roba-personal?tab=recollides&requestId=${encodeURIComponent(rid)}`,
        { scroll: false }
      )
      return
    }
    router.replace(
      `/menu/roba-personal?tab=sollicituds&requestId=${encodeURIComponent(rid)}`,
      { scroll: false }
    )
  }

  return (
    <>
      {visibleNotifications.slice(0, 12).map((n) => (
        <NotificationListItem
          key={n.id}
          prefix={
            <Badge variant={notificationKindVariant(String(n.type || ''))}>
              {notificationKindLabel(String(n.type || ''))}
            </Badge>
          }
          primary={notificationHeadline(n)}
          detail={notificationSummary(n) || 'Sense detall'}
          onOpen={() => openNotification(n)}
          onDismiss={() => onDismiss(n.id)}
        />
      ))}
    </>
  )
}

function buildDisplayedNotifications(params: {
  notifications: RobaDisplayedNotification[]
  requests: RequestRow[]
  deliveries: DeliveryRow[]
  isFullUser: boolean
  isDeptLeadLimited: boolean
  isWorkerSelf: boolean
}): RobaDisplayedNotification[] {
  const { notifications, requests, deliveries, isFullUser, isDeptLeadLimited, isWorkerSelf } = params

  const pendingWorkerRequestIds = new Set(
    requests
      .filter((r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up')
      .map((r) => String(r.id || '').trim())
      .filter(Boolean)
  )
  const pendingWorkerDeliveryIds = new Set(
    deliveries
      .filter((d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt)
      .map((d) => String(d.id || '').trim())
      .filter(Boolean)
  )
  const pendingDeptRequestIds = new Set(
    requests
      .filter((r) => r.status === 'submitted' || r.status === 'prepared')
      .map((r) => String(r.id || '').trim())
      .filter(Boolean)
  )
  const pendingDeptDisputeIds = new Set(
    deliveries
      .filter((d) => d.workerReceiptCorrectionOpen === true)
      .map((d) => String(d.id || '').trim())
      .filter(Boolean)
  )
  const pendingFullRequestIds = new Set(
    requests
      .filter((r) => r.status === 'sent_to_rrhh')
      .map((r) => String(r.id || '').trim())
      .filter(Boolean)
  )

  const stored = notifications.filter((n) => {
    const dtype = String(n.type || '')
    const requestId = String(n.requestId || '').trim()
    const deliveryId = String(n.deliveryId || '').trim()

    if (isWorkerSelf) {
      if (dtype === 'roba_personal_ready') return pendingWorkerRequestIds.has(requestId)
      if (dtype === 'roba_personal_delivery_ack' || dtype === 'roba_personal_delivery_revised') {
        return pendingWorkerDeliveryIds.has(deliveryId)
      }
      return false
    }

    if (isDeptLeadLimited) {
      if (dtype === 'roba_personal_request' || dtype === 'roba_personal_ready') {
        return pendingDeptRequestIds.has(requestId)
      }
      if (dtype === 'roba_personal_delivery_dispute') return pendingDeptDisputeIds.has(deliveryId)
      return false
    }

    if (isFullUser) {
      return dtype === 'roba_personal_sent_to_rrhh' && pendingFullRequestIds.has(requestId)
    }

    return true
  })

  const storedRequestIds = new Set(stored.map((n) => String(n.requestId || '').trim()).filter(Boolean))
  const storedDeliveryIds = new Set(stored.map((n) => String(n.deliveryId || '').trim()).filter(Boolean))

  const synthetic: RobaDisplayedNotification[] = []

  if (isWorkerSelf) {
    requests
      .filter(
        (r) =>
          (r.status === 'ready_for_worker_delivery' || r.status === 'picked_up') &&
          !storedRequestIds.has(String(r.id || '').trim())
      )
      .forEach((r) => {
        synthetic.push({
          id: `synthetic-request-${r.id}`,
          type: 'roba_personal_ready',
          requestId: r.id,
          reference: r.reference,
          requestingDepartment: r.requestingDepartment,
          requestedByWorkerName: r.requestedByWorkerName || null,
          createdByUserName: r.createdByUserName || null,
          synthetic: true,
        })
      })

    deliveries
      .filter(
        (d) =>
          d.workerReceiptAckExpected === true &&
          !d.workerReceiptAckAt &&
          !storedDeliveryIds.has(String(d.id || '').trim())
      )
      .forEach((d) => {
        synthetic.push({
          id: `synthetic-delivery-${d.id}`,
          type: 'roba_personal_delivery_ack',
          deliveryId: d.id,
          requestId: d.requestId || undefined,
          reference: d.reference,
          requestingDepartment: d.requestRequestingDepartment || undefined,
          createdByUserName: d.requestCreatedByUserName || null,
          synthetic: true,
        })
      })
  } else if (isDeptLeadLimited) {
    requests
      .filter(
        (r) =>
          (r.status === 'submitted' || r.status === 'prepared') &&
          !storedRequestIds.has(String(r.id || '').trim())
      )
      .forEach((r) => {
        synthetic.push({
          id: `synthetic-request-${r.id}`,
          type: r.status === 'prepared' ? 'roba_personal_ready' : 'roba_personal_request',
          requestId: r.id,
          reference: r.reference,
          requestingDepartment: r.requestingDepartment,
          requestedByWorkerName: r.requestedByWorkerName || null,
          createdByUserName: r.createdByUserName || null,
          synthetic: true,
        })
      })

    deliveries
      .filter(
        (d) =>
          d.workerReceiptCorrectionOpen === true &&
          !storedDeliveryIds.has(String(d.id || '').trim())
      )
      .forEach((d) => {
        synthetic.push({
          id: `synthetic-dispute-${d.id}`,
          type: 'roba_personal_delivery_dispute',
          deliveryId: d.id,
          requestId: d.requestId || undefined,
          reference: d.reference,
          requestingDepartment: d.requestRequestingDepartment || undefined,
          createdByUserName: d.requestCreatedByUserName || null,
          synthetic: true,
        })
      })
  } else if (isFullUser) {
    requests
      .filter(
        (r) => r.status === 'sent_to_rrhh' && !storedRequestIds.has(String(r.id || '').trim())
      )
      .forEach((r) => {
        synthetic.push({
          id: `synthetic-request-${r.id}`,
          type: 'roba_personal_sent_to_rrhh',
          requestId: r.id,
          reference: r.reference,
          requestingDepartment: r.requestingDepartment,
          requestedByWorkerName: r.requestedByWorkerName || null,
          createdByUserName: r.createdByUserName || null,
          synthetic: true,
        })
      })
  }

  return [...stored, ...synthetic]
}

export function RobaPersonalRequestNotificationsBell() {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string })?.id || '').trim()
  const {
    isFullUser,
    isDeptLeadLimited,
    isWorkerSelf,
    canFetchRequests,
    canFetchDeliveries,
  } = useRobaPersonalApiAccess()
  const { dismissedIds: dismissedSyntheticIds, dismiss: dismissSynthetic } =
    useSyntheticNotificationDismissals('roba_personal')

  const { data, mutate } = useSWR(userId ? 'roba-personal-notifications' : null, fetchRobaNotifications)
  const { data: requestsData } = useSWR<RequestRow[]>(
    canFetchRequests ? '/api/roba-personal/requests' : null,
    swrFetcher
  )
  const { data: deliveriesData } = useSWR<DeliveryRow[]>(
    canFetchDeliveries ? '/api/roba-personal/deliveries' : null,
    swrFetcher
  )

  useEffect(() => {
    if (!userId) return
    const handler = () => {
      mutate().catch(() => {})
    }
    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [userId, mutate])

  const notifications = useMemo(
    () =>
      (Array.isArray(data) ? data : []).filter(
        (n: RobaDisplayedNotification) =>
          !n.read &&
          ROBA_NOTIFICATION_TYPES.includes(
            String(n.type || '') as (typeof ROBA_NOTIFICATION_TYPES)[number]
          )
      ),
    [data]
  )

  const visibleNotifications = useMemo(
    () =>
      buildDisplayedNotifications({
        notifications,
        requests: Array.isArray(requestsData) ? requestsData : [],
        deliveries: Array.isArray(deliveriesData) ? deliveriesData : [],
        isFullUser,
        isDeptLeadLimited,
        isWorkerSelf,
      }).filter(
        (notification) =>
          !notification.synthetic || !dismissedSyntheticIds.includes(String(notification.id || ''))
      ),
    [
      deliveriesData,
      dismissedSyntheticIds,
      isDeptLeadLimited,
      isFullUser,
      isWorkerSelf,
      notifications,
      requestsData,
    ]
  )

  const dismiss = async (notificationId: string) => {
    const target = visibleNotifications.find((notification) => notification.id === notificationId)
    if (target?.synthetic) {
      await dismissSynthetic([notificationId])
      return
    }

    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    for (const type of ROBA_NOTIFICATION_TYPES) {
      await markAllNotificationsRead(type)
    }
    const syntheticIds = visibleNotifications
      .filter((notification) => notification.synthetic)
      .map((notification) => notification.id)
    if (syntheticIds.length > 0) {
      await dismissSynthetic(syntheticIds)
    }
    await mutate()
  }

  const bellCount = visibleNotifications.length
  const hasStoredNotifications = visibleNotifications.some((notification) => !notification.synthetic)
  const hasSyntheticNotifications = visibleNotifications.some((notification) => notification.synthetic)
  if (!userId) return null

  return (
    <ModuleNotificationsBell
      title="Avisos de roba"
      count={bellCount}
      showWhenEmpty
      emptyMessage="Cap avis de roba pendent"
      headerActions={
        hasStoredNotifications || hasSyntheticNotifications ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            onClick={() => void markAll()}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar tot
          </button>
        ) : undefined
      }
    >
      <RobaNotificationItems visibleNotifications={visibleNotifications} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
