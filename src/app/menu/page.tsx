'use client'

import React, { useEffect, useMemo, useRef } from 'react'
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
  Sparkles,
  BookOpen,
  Shirt,
  Factory,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import OpsiaIcon from '@/components/icons/OpsIcon'
import { MODULES } from '@/lib/accessControl'
import { resolveModuleMenuHref } from '@/lib/moduleMenuNavigation'
import useSWR from 'swr'
import {
  useAdminUserRequestCount,
  useLogisticsReservationNotificationCount,
  useEventComandaNotificationCount,
  useProjectAssignmentCount,
  useRobaPersonalRequestNotificationCount,
  useUserRequestResultCount,
  useTornNotificationCount,
} from '@/hooks/useAdminNotifications'
import { useMessagingUnreadCount } from '@/hooks/useMessagingUnread'
import { useMaintenanceNotificationCount } from '@/hooks/useMaintenanceNotificationCount'
import { useIncidentNotificationCount } from '@/hooks/useIncidentNotificationCount'
import { useSurveyNotificationCount } from '@/hooks/useSurveyNotificationCount'

/* ─────────────────────────────────────────────
   TIPUS
───────────────────────────────────────────── */
interface SessionUser {
  id: string
  role?: string
  department?: string
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean
}

/* ─────────────────────────────────────────────
   MAPA UI (només estètica, NO permisos)
───────────────────────────────────────────── */
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
  '/menu/sondeigs': {
    icon: ClipboardList,
    color: 'from-violet-100 to-fuchsia-50',
    iconColor: 'text-violet-600',
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
  '/menu/roba-personal': {
    icon: Shirt,
    color: 'from-sky-100 to-indigo-50',
    iconColor: 'text-indigo-600',
  },
  '/menu/users': {
    icon: Shield,
    color: 'from-gray-200 to-gray-50',
    iconColor: 'text-gray-600',
  },
  '/menu/settings': {
    icon: Settings,
    color: 'from-slate-100 to-gray-50',
    iconColor: 'text-slate-700',
  },
  '/menu/documentacio': {
    icon: BookOpen,
    color: 'from-teal-100 to-cyan-50',
    iconColor: 'text-teal-700',
  },
  '/menu/consultes-mcp': {
    icon: Sparkles,
    color: 'from-violet-100 to-purple-50',
    iconColor: 'text-violet-600',
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
  '/menu/cuina-central': {
    icon: Factory,
    color: 'from-orange-100 to-amber-50',
    iconColor: 'text-orange-700',
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
  const { count: incidentNotificationCount } = useIncidentNotificationCount()
  const { count: surveyNotificationCount } = useSurveyNotificationCount()
  const { count: robaPersonalRequestCount } = useRobaPersonalRequestNotificationCount()
  const { count: logisticsReservationNotificationCount } = useLogisticsReservationNotificationCount()
  const { count: eventComandaNotificationCount } = useEventComandaNotificationCount()
  const maintenanceBadge = maintenanceNotificationCount

  const fetcher = (url: string) => fetch(url).then((r) => r.json())
  const { data: uiPermData } = useSWR(user?.id ? '/api/permissions/ui' : null, fetcher)
  const uiMap = useMemo(
    () => (uiPermData?.map || {}) as Record<string, boolean>,
    [uiPermData]
  )

  const filteredModules = useMemo(() => {
    if (!uiPermData) return []
    return MODULES.filter((m) => uiMap[m.path] === true).map((m) => ({
      ...m,
      submodules: (m.submodules || []).filter((s) => uiMap[s.path] === true),
    }))
  }, [uiPermData, uiMap])

  const lastStableModulesRef = useRef(filteredModules)
  useEffect(() => {
    if (uiPermData) {
      lastStableModulesRef.current = filteredModules
    }
  }, [uiPermData, filteredModules])

  const stableModules = uiPermData ? filteredModules : lastStableModulesRef.current ?? []

  const sortedModules = [...stableModules].sort((a, b) =>
    a.label.localeCompare(b.label, 'ca', { sensitivity: 'base' })
  )

  return (
    <section className="relative w-full max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">
        Accedeix als teus mòduls
      </h1>

      {!uiPermData ? (
        <p className="text-center text-muted-foreground">Carregant mòduls…</p>
      ) : null}

      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3">
        {sortedModules.map(mod => {
          const ui = UI_MAP[mod.path]
          if (!ui) return null

          const Icon = ui.icon
          const isActive = pathname?.startsWith(mod.path)

          const moduleHref = resolveModuleMenuHref(mod, uiMap)

          return (
            <Link
              key={mod.path}
              href={moduleHref}
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
                {mod.path === '/menu/incidents' && incidentNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {incidentNotificationCount}
                  </span>
                )}
                {mod.path === '/menu/projects' && projectAssignmentCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {projectAssignmentCount}
                  </span>
                )}
                {mod.path === '/menu/sondeigs' && surveyNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {surveyNotificationCount}
                  </span>
                )}
                {mod.path === '/menu/roba-personal' && robaPersonalRequestCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {robaPersonalRequestCount}
                  </span>
                )}
                {mod.path === '/menu/events' && eventComandaNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {eventComandaNotificationCount}
                  </span>
                )}
                {mod.path === '/menu/logistica' && logisticsReservationNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {logisticsReservationNotificationCount}
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
