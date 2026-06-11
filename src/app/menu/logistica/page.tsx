'use client'

import Link from 'next/link'
import { MotionDiv } from '@/lib/lazyMotion'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { useLogisticsReservationNotificationCount } from '@/hooks/useAdminNotifications'
import ModuleHeader from '@/components/layout/ModuleHeader'
import {
  ClipboardCheck,
  ClipboardList,
  Truck,
  CalendarClock,
  Route,
  CarFront,
  type LucideIcon,
} from 'lucide-react'
import { getVisibleModules, MODULES } from '@/lib/accessControl'

const fetcher = (url: string) => fetch(url).then((response) => response.json())

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

  return (
    <>
      <ModuleHeader />

      <section className="w-full h-full flex flex-col items-center justify-center p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
          {submodules.map(sub => {
            const key = sub.path.split('/').pop() || sub.path

            const styleMap: Record<string, { bg: string; text: string; border: string; Icon: LucideIcon }> = {
              preparacio: { bg: 'bg-[#e9f8ee]', text: 'text-[#155e37]', border: 'border-[#c7eed6]', Icon: ClipboardCheck },
              assignacions: { bg: 'bg-[#eef2ff]', text: 'text-[#3730a3]', border: 'border-[#c7d2fe]', Icon: Route },
              disponibilitat: { bg: 'bg-[#e8f5ff]', text: 'text-[#0f5c99]', border: 'border-[#c9e6ff]', Icon: CalendarClock },
              'reserva-comercials': { bg: 'bg-[#edf7ff]', text: 'text-[#155e75]', border: 'border-[#cde9f6]', Icon: CarFront },
              transports: { bg: 'bg-[#fff4e5]', text: 'text-[#b45309]', border: 'border-[#fde2bd]', Icon: Truck },
            }

            const styles = styleMap[key] ?? { bg: 'bg-white', text: 'text-slate-800', border: 'border-slate-200', Icon: ClipboardList }
            const Icon = styles.Icon

            return (
              <Link key={sub.path} href={sub.path}>
                <MotionDiv
                  whileTap={{ scale: 0.97 }}
                  className={`
                    w-full 
                    font-semibold 
                    rounded-xl 
                    p-5 
                    text-center 
                    shadow-sm 
                    border 
                    flex flex-col 
                    items-center 
                    gap-2
                    ${styles.bg} ${styles.text} ${styles.border}
                  `}
                >
                  <div className="relative">
                    <Icon className="w-7 h-7" />
                    {key === 'reserva-comercials' && reservationNotificationCount > 0 && (
                      <span className="absolute -top-2 -right-3 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {reservationNotificationCount}
                      </span>
                    )}
                  </div>
                  {sub.label}
                </MotionDiv>
              </Link>
            )
          })}

          {!submodules.length && (
            <p className="text-sm text-gray-500 text-center col-span-full">
              No tens accés a cap secció de Logística.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
