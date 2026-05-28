'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Map } from 'lucide-react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  SPACES_BBDD_PATH,
  SPACES_RESERVES_PATH,
} from '@/lib/spacesPermissions'

export default function SpacesHubClient() {
  const { ready, canViewPath } = useUiPermissions()

  const cards = useMemo(() => {
    const items: Array<{
      href: string
      label: string
      className: string
      Icon: typeof CalendarDays
    }> = []

    if (!ready || canViewPath(SPACES_RESERVES_PATH)) {
      items.push({
        href: SPACES_RESERVES_PATH,
        label: 'Consultar reserves',
        className: 'bg-[#e8f0ff] text-[#1b3b8a] border-[#d6e2ff]',
        Icon: CalendarDays,
      })
    }

    if (!ready || canViewPath(SPACES_BBDD_PATH)) {
      items.push({
        href: SPACES_BBDD_PATH,
        label: 'Consultar espais',
        className: 'bg-[#e9f8ee] text-[#155e37] border-[#c7eed6]',
        Icon: Map,
      })
    }

    return items
  }, [ready, canViewPath])

  return (
    <section className="w-full h-full flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col gap-4 w-full max-w-xs">
        {cards.map(({ href, label, className, Icon }) => (
          <Link key={href} href={href}>
            <motion.div
              whileTap={{ scale: 0.97 }}
              className={`w-full font-semibold rounded-xl p-4 text-center shadow-sm border flex flex-col items-center gap-1 ${className}`}
            >
              <Icon className="w-6 h-6" />
              {label}
            </motion.div>
          </Link>
        ))}

        {ready && cards.length === 0 && (
          <p className="text-sm text-gray-500 text-center">
            No tens accés a cap secció d&apos;Espais.
          </p>
        )}
      </div>
    </section>
  )
}
