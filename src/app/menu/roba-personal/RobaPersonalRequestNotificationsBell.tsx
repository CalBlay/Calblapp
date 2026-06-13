'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import { Badge } from '@/components/ui/badge'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markNotificationRead } from '@/lib/notifications/markRead'
import type { DeliveryRow, RequestRow, RobaPersonalRequestNotification } from './robaPersonalTypes'
import { useRobaPersonalApiAccess } from '@/hooks/useRobaPersonalApiAccess'

const swrFetcher = (url: string) => fetch(url).then((r) => r.json())

function notificationKindLabel(type: string): string {
  if (type === 'roba_personal_sent_to_rrhh') return 'Preparació'
  if (type === 'roba_personal_request') return 'Recepció'
  if (type === 'roba_personal_ready') return 'Recepció'
  if (type === 'roba_personal_delivery_dispute') return 'Incidència'
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

function notificationHeadline(n: RobaPersonalRequestNotification): string {
  const type = String(n.type || '')
  if (type === 'roba_personal_sent_to_rrhh') {
    return 'Sol·licitud pendent de preparar'
  }
  if (type === 'roba_personal_request') return 'Nova sol·licitud del departament'
  if (type === 'roba_personal_ready') return 'Preparació pendent de validar'
  if (type === 'roba_personal_delivery_ack') return 'Recepció pendent de signar'
  if (type === 'roba_personal_delivery_revised') return 'Recepció corregida pendent'
  if (type === 'roba_personal_delivery_dispute') return 'Incidència pendent de revisar'
  return String(n.title || '').trim() || 'Notificació'
}

function notificationSummary(n: RobaPersonalRequestNotification): string {
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
  syntheticWorkerNotice,
  onDismiss,
}: {
  visibleNotifications: RobaPersonalRequestNotification[]
  syntheticWorkerNotice: {
    headline: string
    summary: string
    requestId?: string
    deliveryId?: string
  } | null
  onDismiss: (notificationId: string) => Promise<void>
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()
  const { isDeptLeadLimited } = useRobaPersonalApiAccess()

  const openNotification = (n: RobaPersonalRequestNotification) => {
    closeBell?.()
    const dtype = String(n.type || '')
    if (dtype === 'roba_personal_delivery_ack') {
      const did = String(n.deliveryId || '').trim()
      if (!did) return
      router.replace(
        `/menu/roba-personal?tab=entregues&deliveryId=${encodeURIComponent(did)}`,
        { scroll: false }
      )
      return
    }
    if (dtype === 'roba_personal_delivery_revised') {
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

  const openSyntheticWorkerNotice = () => {
    if (!syntheticWorkerNotice) return
    closeBell?.()
    if (syntheticWorkerNotice.requestId) {
      router.replace(
        `/menu/roba-personal?tab=entregues&requestId=${encodeURIComponent(syntheticWorkerNotice.requestId)}`,
        { scroll: false }
      )
      return
    }
    if (syntheticWorkerNotice.deliveryId) {
      router.replace(
        `/menu/roba-personal?tab=entregues&deliveryId=${encodeURIComponent(syntheticWorkerNotice.deliveryId)}`,
        { scroll: false }
      )
    }
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
      {visibleNotifications.length === 0 && syntheticWorkerNotice ? (
        <NotificationListItem
          prefix={<Badge variant="success">Entrega</Badge>}
          primary={syntheticWorkerNotice.headline}
          detail={syntheticWorkerNotice.summary || 'Revisar i signar'}
          onOpen={openSyntheticWorkerNotice}
          dismissible={false}
        />
      ) : null}
    </>
  )
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

  const { data, mutate } = useSWR(userId ? '/api/notifications?mode=list' : null, swrFetcher)
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
      (Array.isArray(data?.notifications) ? data.notifications : []).filter(
        (n: RobaPersonalRequestNotification) =>
          !n.read &&
          (String(n.type || '') === 'roba_personal_request' ||
            String(n.type || '') === 'roba_personal_sent_to_rrhh' ||
            String(n.type || '') === 'roba_personal_ready' ||
            String(n.type || '') === 'roba_personal_delivery_ack' ||
            String(n.type || '') === 'roba_personal_delivery_revised' ||
            String(n.type || '') === 'roba_personal_delivery_dispute')
      ),
    [data]
  )

  const visibleNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return []
    if (isWorkerSelf) {
      return notifications.filter((n) => {
        const dtype = String(n.type || '')
        if (dtype === 'roba_personal_delivery_ack' || dtype === 'roba_personal_delivery_revised') {
          const did = String(n.deliveryId || '').trim()
          return Array.isArray(deliveriesData)
            ? deliveriesData.some(
                (d) =>
                  String(d.id || '').trim() === did &&
                  d.workerReceiptAckExpected === true &&
                  !d.workerReceiptAckAt
              )
            : false
        }
        if (dtype === 'roba_personal_ready') {
          const rid = String(n.requestId || '').trim()
          return Array.isArray(requestsData)
            ? requestsData.some((r) => {
                const status = String(r.status || '').trim()
                return (
                  String(r.id || '').trim() === rid &&
                  (status === 'ready_for_worker_delivery' || status === 'picked_up')
                )
              })
            : false
        }
        return false
      })
    }
    return notifications
  }, [deliveriesData, isWorkerSelf, notifications, requestsData])

  const taskCount = useMemo(() => {
    const requests = Array.isArray(requestsData) ? requestsData : []
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : []

    if (isWorkerSelf) {
      const requestsPending = requests.filter(
        (r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up'
      ).length
      const deliveriesPending = deliveries.filter(
        (d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
      ).length
      return requestsPending + deliveriesPending
    }

    if (isDeptLeadLimited) {
      const requestsPending = requests.filter(
        (r) => r.status === 'submitted' || r.status === 'prepared'
      ).length
      const disputesPending = deliveries.filter((d) => d.workerReceiptCorrectionOpen === true).length
      return requestsPending + disputesPending
    }

    if (isFullUser) {
      return requests.filter((r) => r.status === 'sent_to_rrhh').length
    }

    return visibleNotifications.length
  }, [
    deliveriesData,
    isDeptLeadLimited,
    isFullUser,
    isWorkerSelf,
    requestsData,
    visibleNotifications.length,
  ])

  const syntheticWorkerNotice = useMemo(() => {
    if (!isWorkerSelf || visibleNotifications.length > 0) return null
    const requests = Array.isArray(requestsData) ? requestsData : []
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : []
    const pendingRequest = requests.find(
      (r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up'
    )
    if (pendingRequest) {
      return {
        headline: 'Recepció pendent de signar',
        summary: [String(pendingRequest.reference || '').trim(), 'revisar i signar']
          .filter(Boolean)
          .join(' · '),
        requestId: pendingRequest.id,
      }
    }
    const pendingDelivery = deliveries.find(
      (d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
    )
    if (pendingDelivery) {
      return {
        headline: 'Recepció pendent de signar',
        summary: [String(pendingDelivery.reference || '').trim(), 'revisar i signar']
          .filter(Boolean)
          .join(' · '),
        deliveryId: pendingDelivery.id,
      }
    }
    return null
  }, [deliveriesData, isWorkerSelf, requestsData, visibleNotifications.length])

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  const bellCount = Math.max(taskCount, visibleNotifications.length, syntheticWorkerNotice ? 1 : 0)
  if (!userId || bellCount === 0) return null

  return (
    <ModuleNotificationsBell title="Avisos de roba" count={bellCount}>
      <RobaNotificationItems
        visibleNotifications={visibleNotifications}
        syntheticWorkerNotice={syntheticWorkerNotice}
        onDismiss={dismiss}
      />
    </ModuleNotificationsBell>
  )
}
