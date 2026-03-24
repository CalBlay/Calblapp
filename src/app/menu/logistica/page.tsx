'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import {
  ClipboardCheck,
  ClipboardList,
  Truck,
  CalendarClock,
  Route,
  type LucideIcon,
} from 'lucide-react'
import { getVisibleModules } from '@/lib/accessControl'

export default function LogisticsHubPage() {
  const { data: session } = useSession()
  const user = session?.user

  const logisticaModule = getVisibleModules({
    role: user?.role,
    department: user?.department,
  }).find(m => m.path === '/menu/logistica')

  const submodules = logisticaModule?.submodules ?? []

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
              transports: { bg: 'bg-[#fff4e5]', text: 'text-[#b45309]', border: 'border-[#fde2bd]', Icon: Truck },
            }

            const styles = styleMap[key] ?? { bg: 'bg-white', text: 'text-slate-800', border: 'border-slate-200', Icon: ClipboardList }
            const Icon = styles.Icon

            return (
              <Link key={sub.path} href={sub.path}>
                <motion.div
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
                  <Icon className="w-7 h-7" />
                  {sub.label}
                </motion.div>
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
