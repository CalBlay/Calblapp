'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { ClipboardList, Search } from 'lucide-react'
import { getVisibleModules } from '@/lib/accessControl'

type HubCardStyle = {
  bg: string
  text: string
  border: string
  Icon: typeof ClipboardList
}

export default function AllergensHubPage() {
  const { data: session } = useSession()
  const user = session?.user

  const allergensModule = getVisibleModules({
    role: user?.role,
    department: user?.department,
  }).find(m => m.path === '/menu/allergens')

  const submodules = allergensModule?.submodules ?? []

  return (
    <>
      <ModuleHeader />

      <section className="w-full h-full flex flex-col items-center justify-center p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
          {submodules.map(sub => {
            const key = sub.path.split('/').pop() || sub.path

            const styleMap: Record<string, HubCardStyle> = {
              bbdd: {
                bg: 'bg-[#fff7e6]',
                text: 'text-[#9a3412]',
                border: 'border-[#fde2bd]',
                Icon: ClipboardList,
              },
              buscador: {
                bg: 'bg-[#fef3c7]',
                text: 'text-[#92400e]',
                border: 'border-[#fde68a]',
                Icon: Search,
              },
            }

            const styles = styleMap[key] ?? {
              bg: 'bg-white',
              text: 'text-slate-800',
              border: 'border-slate-200',
              Icon: ClipboardList,
            }
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
              No tens accés a cap secció d'Al·lèrgens.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
