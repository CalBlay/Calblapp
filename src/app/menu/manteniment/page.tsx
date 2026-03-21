'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import {
  Wrench,
  Eye,
  CalendarCheck2,
  FileStack,
  CheckCircle2,
  ClipboardList,
  Database,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { RoleGuard } from '@/lib/withRoleGuard'
import { normalizeRole } from '@/lib/roles'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useMaintenanceAssignedCount } from '@/hooks/useMaintenanceAssignedCount'
import { getAblyClient } from '@/lib/ablyClient'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

type MaintenanceNotification = {
  id: string
  title?: string
  body?: string
  type?: string
  read?: boolean
  ticketId?: string
  plannedId?: string
  recordId?: string
  ticketCode?: string | null
  location?: string | null
  machine?: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MAINTENANCE_NOTIFICATION_TYPES = new Set([
  'maintenance_ticket_new',
  'maintenance_ticket_assigned',
  'maintenance_ticket_validated',
])

const buildWeekQuery = (value?: number | string | null) => {
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
      ? new Date(value)
      : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return `start=${format(start, 'yyyy-MM-dd')}&end=${format(end, 'yyyy-MM-dd')}`
}

export default function MantenimentIndexPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userRole = normalizeRole((session?.user as any)?.role || '')
  const userDepartment = normalizeDept((session?.user as any)?.department || '')
  const userId = String((session?.user as any)?.id || '').trim()
  const isMaintenanceWorker = userRole === 'treballador' && userDepartment === 'manteniment'
  const isMaintenanceCap = userRole === 'cap' && userDepartment === 'manteniment'
  const isAdmin = userRole === 'admin' || userRole === 'direccio'
  const isProductionWorker = userRole === 'treballador' && userDepartment === 'produccio'
  const isCommercial = userRole === 'comercial'
  const { count: assignedTicketsCount } = useMaintenanceAssignedCount()
  const { data: notificationsData, mutate: mutateNotifications } = useSWR(
    userId ? '/api/notifications?mode=list' : null,
    fetcher
  )

  useEffect(() => {
    if (!userId) return

    const client = getAblyClient()
    const channel = client.channels.get(`user:${userId}:notifications`)
    const handler = () => {
      mutateNotifications().catch(() => {})
    }

    channel.subscribe('created', handler)

    return () => {
      channel.unsubscribe('created', handler)
    }
  }, [userId, mutateNotifications])

  const maintenanceNotifications = useMemo(
    () =>
      (Array.isArray(notificationsData?.notifications) ? notificationsData.notifications : []).filter(
        (notification: MaintenanceNotification) =>
          !notification.read && MAINTENANCE_NOTIFICATION_TYPES.has(String(notification.type || ''))
      ),
    [notificationsData]
  )

  const markNotificationAsRead = async (notificationId: string) => {
    const id = String(notificationId || '').trim()
    if (!id) return

    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', notificationId: id }),
    })
    await mutateNotifications()
  }

  const extractNotificationLabel = (notification: MaintenanceNotification) => {
    const code = String(notification.ticketCode || '').trim()
    const machine = String(notification.machine || '').trim()
    const location = String(notification.location || '').trim()
    const body = String(notification.body || '').trim()
    const primaryBase = machine || location || body || notification.title || 'Ticket'
    const primary = code ? `${code} Â· ${primaryBase}` : primaryBase
    const secondary = location || body || machine || ''

    if (notification.type === 'maintenance_ticket_assigned') {
      return { prefix: 'Assignat', primary, secondary }
    }
    if (notification.type === 'maintenance_ticket_validated') {
      return { prefix: 'Validat', primary, secondary }
    }
    return { prefix: 'Nou ticket', primary, secondary }
  }

  const openMaintenanceNotification = async (notification: MaintenanceNotification) => {
    await markNotificationAsRead(notification.id)

    if (notification.plannedId) {
      const params = new URLSearchParams()
      if (notification.recordId) params.set('recordId', notification.recordId)
      router.push(
        `/menu/manteniment/preventius/fulls/${encodeURIComponent(notification.plannedId)}${
          params.toString() ? `?${params.toString()}` : ''
        }`
      )
      return
    }

    const ticketId = String(notification.ticketId || '').trim()
    if (!ticketId) {
      router.push('/menu/manteniment/tickets')
      return
    }

    let query = new URLSearchParams({ ticketId })
    try {
      const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(ticketId)}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const json = await res.json()
        const ticket = json?.ticket || null
        const validationAt = Array.isArray(ticket?.statusHistory)
          ? [...ticket.statusHistory]
              .filter((item: any) => item?.status === 'validat' || item?.status === 'resolut')
              .sort((a: any, b: any) => Number(b?.at || 0) - Number(a?.at || 0))[0]?.at
          : null
        const baseDate =
          notification.type === 'maintenance_ticket_validated'
            ? validationAt || ticket?.plannedStart || ticket?.assignedAt || ticket?.createdAt
            : ticket?.plannedStart || ticket?.assignedAt || ticket?.createdAt
        const weekQuery = buildWeekQuery(baseDate)
        if (weekQuery) {
          const weekParams = new URLSearchParams(weekQuery)
          weekParams.forEach((value, key) => query.set(key, value))
        }
      }
    } catch {
      // keep fallback route below
    }

    if (notification.type === 'maintenance_ticket_assigned') {
      router.push(`/menu/manteniment/preventius/fulls?${query.toString()}`)
      return
    }

    router.push(`/menu/manteniment/tickets?${query.toString()}`)
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
        <ModuleHeader title="Manteniment" subtitle="Gestió i assignació" />

        {maintenanceNotifications.length > 0 ? (
          <section className="rounded-[14px] border border-emerald-200/80 bg-white px-2.5 py-2 shadow-sm">
            <div className="mb-1.5 flex items-center gap-2">
              <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Avisos de manteniment
              </div>
              <div className="text-xs text-slate-500">{maintenanceNotifications.length} pendents</div>
            </div>
            <div className="space-y-1">
              {maintenanceNotifications.slice(0, 6).map((notification: MaintenanceNotification) => {
                const label = extractNotificationLabel(notification)
                return (
                  <div
                    key={notification.id}
                    className="flex min-h-9 items-center gap-2 rounded-md border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-sm"
                  >
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                      {label.prefix}
                    </span>
                    <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-slate-700">
                      <button
                        type="button"
                        className="truncate font-medium text-slate-900 hover:text-emerald-700 hover:underline"
                        onClick={() => void openMaintenanceNotification(notification)}
                      >
                        {label.primary}
                      </button>
                      {label.secondary ? <span className="text-slate-400">Â·</span> : null}
                      {label.secondary ? (
                        <span className="truncate text-slate-500">{label.secondary}</span>
                      ) : (
                        <span className="text-slate-400">{notification.title || ''}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                      aria-label="Marcar com a llegit"
                      onClick={() => void markNotificationAsRead(notification.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {(isAdmin || isMaintenanceCap || isMaintenanceWorker) && (
            <Link
              href="/menu/manteniment/tickets"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-amber-50 to-yellow-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-amber-700">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Tickets</div>
                  <div className="text-xs text-gray-500">Entrada i gestio</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap) && (
            <Link
              href="/menu/manteniment/preventius/planificador"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-teal-50 to-cyan-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-teal-700">
                  <CalendarCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Planificador</div>
                  <div className="text-xs text-gray-500">Preventius + tickets</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap) && (
            <Link
              href="/menu/manteniment/preventius/plantilles"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-slate-50 to-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-slate-700">
                  <FileStack className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Plantilles</div>
                  <div className="text-xs text-gray-500">Plans i checklists</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap) && (
            <Link
              href="/menu/manteniment/dades"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-sky-50 to-blue-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-sky-700">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Dades</div>
                  <div className="text-xs text-gray-500">Maquinaria i proveidors</div>
                </div>
              </div>
            </Link>
          )}

          {(isMaintenanceWorker || isMaintenanceCap || isAdmin) && (
            <Link
              href="/menu/manteniment/preventius/fulls"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-emerald-50 to-green-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-emerald-600">
                  <div className="relative">
                    <Wrench className="w-5 h-5" />
                    {assignedTicketsCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {assignedTicketsCount}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Jornada</div>
                  <div className="text-xs text-gray-500">Preventius + tickets</div>
                </div>
              </div>
            </Link>
          )}

          {(isAdmin || isMaintenanceCap || isCommercial || isProductionWorker) && (
            <Link
              href="/menu/manteniment/seguiment"
              className="border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br from-indigo-50 to-purple-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Seguiment</div>
                  <div className="text-xs text-gray-500">Consulta dâ€™estat</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}

