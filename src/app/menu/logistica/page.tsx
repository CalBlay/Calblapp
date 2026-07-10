'use client'

import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import { useLogisticsReservationNotificationCount } from '@/hooks/useAdminNotifications'
import {
  ClipboardCheck,
  ClipboardList,
  Truck,
  CalendarClock,
  Route,
  CarFront,
} from 'lucide-react'
import { getVisibleModules, MODULES } from '@/lib/accessControl'

const fetcher = (url: string) => fetch(url).then((response) => response.json())

const LOGISTICS_CARD_MAP = {
  preparacio: {
    title: 'Preparació',
    description: 'Planificació i preparació',
    icon: ClipboardCheck,
    tone: 'emerald',
  },
  assignacions: {
    title: 'Assignacions',
    description: 'Vehicles i rutes',
    icon: Route,
    tone: 'indigo',
  },
  disponibilitat: {
    title: 'Disponibilitat',
    description: 'Disponibilitat logística',
    icon: CalendarClock,
    tone: 'sky',
  },
  'reserva-comercials': {
    title: 'Reserva comercials',
    description: 'Reserves de comercials',
    icon: CarFront,
    tone: 'teal',
  },
  transports: {
    title: 'Transports',
    description: 'Seguiment de transports',
    icon: Truck,
    tone: 'orange',
  },
} as const

export default function LogisticsHubPage() {
  const { data: session } = useSession()
  const user = session?.user
  const { count: reservationNotificationCount } = useLogisticsReservationNotificationCount()
  const { data: uiPermData } = useSWR(user?.id ? '/api/permissions/ui' : null, fetcher)
  const uiMap = (uiPermData?.map || {}) as Record<string, boolean>

  const baseLogistica = getVisibleModules({
    role: user?.role,
    department: user?.department,
  }).find((m) => m.path === '/menu/logistica')

  const catalogLogistica = MODULES.find((m) => m.path === '/menu/logistica')
  const submodules = uiPermData
    ? (catalogLogistica?.submodules || []).filter((sub) => uiMap[sub.path] === true)
    : baseLogistica?.submodules ?? []

  const cards: ModuleHubCard[] = submodules.map((sub) => {
    const key = sub.path.split('/').pop() || sub.path
    const config = LOGISTICS_CARD_MAP[key as keyof typeof LOGISTICS_CARD_MAP]

    return {
      href: sub.path,
      title: config?.title ?? sub.label,
      description: config?.description,
      icon: config?.icon ?? ClipboardList,
      tone: config?.tone ?? 'slate',
      badge:
        key === 'reserva-comercials' && reservationNotificationCount > 0 ? (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {reservationNotificationCount}
          </span>
        ) : undefined,
    }
  })

  return <ModuleHub cards={cards} emptyMessage="No tens accés a cap secció de Logística." />
}
