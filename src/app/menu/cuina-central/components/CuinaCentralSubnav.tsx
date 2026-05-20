'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CuinaCentralMaintenanceTicketButton } from './CuinaCentralMaintenanceTicket'

const LINKS = [
  { href: '/menu/cuina-central/dades', label: 'Dades' },
  { href: '/menu/cuina-central/produccio', label: 'Producció' },
  { href: '/menu/cuina-central/decisions', label: 'Decisions diàries' },
  { href: '/menu/cuina-central/informes', label: 'Informes' },
  { href: '/menu/cuina-central/planificador', label: 'Planificador' },
] as const

export default function CuinaCentralSubnav() {
  const pathname = usePathname()
  return (
    <nav className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition',
              active
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            {link.label}
          </Link>
        )
      })}
      </div>
      <CuinaCentralMaintenanceTicketButton />
    </nav>
  )
}
