'use client'

import React, { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Grid,
  Calendar,
  CalendarDays,
  FolderKanban,
  Users,
  AlertTriangle,
  BarChart2,
  Shield,
  Truck,
  FileEdit,
  User,
  Leaf,
  ClipboardList,
  ClipboardCheck,
  Wrench,
  Images,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getVisibleModules } from '@/lib/accessControl'
import {
  useAdminUserRequestCount,
  useProjectAssignmentCount,
  useUserRequestResultCount,
  useTornNotificationCount,
} from '@/hooks/useAdminNotifications'
import { useMessagingUnreadCount } from '@/hooks/useMessagingUnread'
import { useMaintenanceNewCount } from '@/hooks/useMaintenanceNewCount'
import { useMaintenanceNotificationCount } from '@/hooks/useMaintenanceNotificationCount'
import { normalizeRole } from '@/lib/roles'

/* ─────────────────────────────────────────────
   TIPUS
───────────────────────────────────────────── */
interface SessionUser {
  id: string
  role?: string
  department?: string
}

/* ─────────────────────────────────────────────
   MAPA UI (només estètica, NO permisos)
───────────────────────────────────────────── */
const OPSIA_ICON_VARIANT: 'a' | 'b' = 'b'

const OpsiaIconA: LucideIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="7.6" cy="7" r="1.8" />
    <circle cx="16.4" cy="7" r="1.8" />
    <path d="M6.3 11.2h2.6" />
    <path d="M15.1 11.2h2.6" />
    <path d="M5.8 15.8c.4-1.6 1.6-2.7 2.6-2.7s2.2 1.1 2.6 2.7" />
    <path d="M13 15.8c.4-1.6 1.6-2.7 2.6-2.7s2.2 1.1 2.6 2.7" />
    <path d="M4.8 18.4h5.6" />
    <path d="M13.6 18.4h5.6" />
    <rect x="7.1" y="16.8" width="1" height="1" rx="0.2" />
    <rect x="15.9" y="16.8" width="1" height="1" rx="0.2" />
    <circle cx="12" cy="3.8" r="0.6" />
    <path d="M11.4 4.3 9.8 5.6" />
    <path d="M12.6 4.3 14.2 5.6" />
  </svg>
)

const OpsiaIconB: LucideIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="7.5" cy="6.9" r="1.7" />
    <circle cx="16.5" cy="6.9" r="1.7" />
    <path d="M6.3 11.1h2.4" />
    <path d="M15.3 11.1h2.4" />
    <path d="M6 15.6c.4-1.5 1.5-2.5 2.4-2.5s2 1 2.4 2.5" />
    <path d="M13.2 15.6c.4-1.5 1.5-2.5 2.4-2.5s2 1 2.4 2.5" />
    <path d="M5.3 18.1h4.8" />
    <path d="M14 18.1h4.8" />
    <rect x="7.1" y="16.6" width="0.9" height="0.9" rx="0.2" />
    <rect x="16" y="16.6" width="0.9" height="0.9" rx="0.2" />
    <circle cx="12" cy="3.7" r="0.55" />
    <path d="M11.5 4.1 10.2 5.3" />
    <path d="M12.5 4.1 13.8 5.3" />
  </svg>
)

const OpsiaIcon: LucideIcon = OPSIA_ICON_VARIANT === 'a' ? OpsiaIconA : OpsiaIconB

const UI_MAP: Record<
  string,
  { icon: LucideIcon; color: string; iconColor: string; tileClass?: string }
> = {
  '/menu/torns': {
    icon: Grid,
    color: 'from-blue-100 to-indigo-100',
    iconColor: 'text-blue-500',
  },
  '/menu/events': {
    icon: Calendar,
    color: 'from-orange-100 to-rose-50',
    iconColor: 'text-orange-600',
  },
  '/menu/auditoria': {
    icon: ClipboardCheck,
    color: 'from-cyan-100 to-teal-100',
    iconColor: 'text-cyan-700',
  },
  '/menu/pissarra': {
    icon: FileEdit,
    color: 'from-rose-100 to-pink-50',
    iconColor: 'text-rose-600',
  },
  '/menu/comercial': {
    icon: ClipboardList,
    color: 'from-blue-100 to-sky-50',
    iconColor: 'text-sky-600',
  },
  '/menu/calendar': {
    icon: CalendarDays,
    color: 'from-indigo-100 to-blue-50',
    iconColor: 'text-indigo-500',
  },
  '/menu/projects': {
    icon: FolderKanban,
    color: 'from-violet-100 to-fuchsia-50',
    iconColor: 'text-violet-600',
  },
  '/menu/personnel': {
    icon: Users,
    color: 'from-green-100 to-lime-100',
    iconColor: 'text-green-600',
  },
  '/menu/missatgeria': {
    icon: OpsiaIcon,
    color: 'from-[#FFF6CC] to-[#FFF2B3]',
    iconColor: 'text-amber-700',
    tileClass: 'ring-1 ring-amber-200/70',
  },
  '/menu/manteniment': {
    icon: Wrench,
    color: 'from-emerald-50 to-green-100',
    iconColor: 'text-emerald-700',
  },
  '/menu/deco': {
    icon: ClipboardList,
    color: 'from-amber-50 to-yellow-100',
    iconColor: 'text-amber-700',
  },
  '/menu/quadrants': {
    icon: User,
    color: 'from-indigo-100 to-blue-50',
    iconColor: 'text-indigo-500',
  },
  '/menu/incidents': {
    icon: AlertTriangle,
    color: 'from-red-100 to-pink-100',
    iconColor: 'text-red-500',
  },
  '/menu/modifications': {
    icon: FileEdit,
    color: 'from-purple-100 to-violet-100',
    iconColor: 'text-purple-600',
  },
  '/menu/reports': {
    icon: BarChart2,
    color: 'from-cyan-100 to-blue-100',
    iconColor: 'text-cyan-600',
  },
  '/menu/users': {
    icon: Shield,
    color: 'from-gray-200 to-gray-50',
    iconColor: 'text-gray-600',
  },
  '/menu/media': {
    icon: Images,
    color: 'from-slate-100 to-gray-50',
    iconColor: 'text-slate-700',
  },
  '/menu/logistica': {
    icon: Truck,
    color: 'from-orange-100 to-yellow-100',
    iconColor: 'text-orange-600',
  },
  '/menu/spaces': {
    icon: CalendarDays,
    color: 'from-emerald-100 to-green-50',
    iconColor: 'text-emerald-600',
  },
  '/menu/allergens': {
    icon: Leaf,
    color: 'from-amber-100 to-yellow-50',
    iconColor: 'text-amber-600',
  },
}

/* ─────────────────────────────────────────────
   COMPONENT PRINCIPAL
───────────────────────────────────────────── */
export default function MenuPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const isLoading = status === 'loading'
  const user = session?.user as SessionUser | undefined

  // 🔐 Protecció sessió
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login')
    }
  }, [isLoading, user, router])

  if (isLoading) {
    return <p className="text-center mt-20">Carregant…</p>
  }

  if (!user) {
    return <p className="text-center mt-20">No autoritzat.</p>
  }

  // 👉 només es renderitza quan user existeix
  return <MenuContent user={user} />
}

/* ─────────────────────────────────────────────
   CONTINGUT REAL (hooks dependents d’usuari)
───────────────────────────────────────────── */
function MenuContent({ user }: { user: SessionUser }) {
  const pathname = usePathname()
  const { count: userRequestsCount, isAdmin } = useAdminUserRequestCount()
  const { count: projectAssignmentCount } = useProjectAssignmentCount()
  const { count: userRequestResultsCount } = useUserRequestResultCount()
  const { count: tornCount } = useTornNotificationCount()
  const { count: messagingCount } = useMessagingUnreadCount()
  const { count: maintenanceNotificationCount } = useMaintenanceNotificationCount()
  const { count: maintenanceNewCountDeco } = useMaintenanceNewCount({ ticketType: 'deco' })
  const normDept = (raw?: string) =>
    (raw || '')
      .toString()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
  const role = normalizeRole(user.role || '')
  const dept = normDept(user.department)
  const isDecorationsCap = role === 'cap' && (dept === 'decoracio' || dept === 'decoracions')
  const isAdminOrDir = role === 'admin' || role === 'direccio'

  const maintenanceBadge = maintenanceNotificationCount

  const decoBadge = isDecorationsCap
    ? maintenanceNewCountDeco
    : isAdminOrDir
    ? maintenanceNewCountDeco
    : 0

  // 🔑 ÚNICA FONT DE MÒDULS
  const modules = getVisibleModules(user)

  return (
    <section className="relative w-full max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">
        Accedeix als teus mòduls
      </h1>

      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3">
        {modules.map(mod => {
          const ui = UI_MAP[mod.path]
          if (!ui) return null

          const Icon = ui.icon
          const isActive = pathname?.startsWith(mod.path)

          return (
            <Link
              key={mod.path}
              href={mod.path}
              className={cn(
                `group rounded-2xl bg-gradient-to-br ${ui.color} p-4 flex flex-col items-center justify-center transition-all shadow hover:shadow-lg hover:scale-105 active:scale-95 border border-blue-200`,
                isActive && 'ring-2 ring-blue-400 scale-105',
                ui.tileClass,
              )}
            >
              <div
                className={cn(
                  'relative mb-2 rounded-full bg-white shadow flex items-center justify-center w-14 h-14 transition',
                  ui.iconColor,
                )}
              >
                <Icon className="w-8 h-8" />
                {isAdmin && mod.path === '/menu/users' && userRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {userRequestsCount}
                  </span>
                )}
                {mod.path === '/menu/torns' && tornCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {tornCount}
                  </span>
                )}
                {mod.path === '/menu/missatgeria' && messagingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {messagingCount}
                  </span>
                )}
                {mod.path === '/menu/manteniment' && maintenanceBadge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {maintenanceBadge}
                  </span>
                )}
                {mod.path === '/menu/deco' && decoBadge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {decoBadge}
                  </span>
                )}
                {mod.path === '/menu/projects' && projectAssignmentCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {projectAssignmentCount}
                  </span>
                )}
                {!isAdmin && mod.path === '/menu/personnel' && userRequestResultsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {userRequestResultsCount}
                  </span>
                )}
              </div>

              <span className="text-base font-semibold text-gray-700 text-center">
                {mod.label}
              </span>
              {mod.path === '/menu/missatgeria' && (
                <span className="text-[11px] font-medium text-amber-700/80 text-center -mt-0.5">
                  Canal intern
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
