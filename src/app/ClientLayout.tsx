// file: src/app/ClientLayout.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Providers } from '@/app/providers'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { LogOut, Settings } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { normalizeRole } from '@/lib/roles'
import {
  MODULES,
  isLogisticsMaintenanceTicketsManager,
  isMaintenanceWorkerSpacesBlocked,
} from '@/lib/accessControl'
import { isUiPathAllowed } from '@/lib/uiPathAccess'
import { resolveModuleMenuHref } from '@/lib/moduleMenuNavigation'
import { FiltersProvider } from '@/context/FiltersContext'
import FilterSlideOver from '@/components/ui/filter-slide-over'
import PWARegister from '@/components/PWARegister'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())


export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.classList.remove('dark')
  }, [])

  return (
    <Providers>
      <TooltipProvider>
        <FiltersProvider>
          <InnerLayout>{children}</InnerLayout>
          <FilterSlideOver />
          <PWARegister />
        </FiltersProvider>
      </TooltipProvider>
    </Providers>
  )
}

/* ------------------------------------------------------------------ */
/* INNER LAYOUT                                                        */
/* ------------------------------------------------------------------ */

function InnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const { data: session, status } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  const user = session?.user
  const isLogin = pathname.startsWith('/login')
  const { data: uiPermData } = useSWR(
    user?.id ? '/api/permissions/ui' : null,
    fetcher
  )
  const uiMap = useMemo(
    () => (uiPermData?.map ?? {}) as Record<string, boolean>,
    [uiPermData]
  )

  /* 🔐 Protecció de sessió */
  useEffect(() => {
    if (status !== 'loading' && !user && !pathname.startsWith('/login')) {
      router.replace('/login')
    }
  }, [status, user, pathname, router])

  /* Treballadors manteniment: sense accés a /menu/spaces (abans de qualsevol return per regles dels hooks) */
  useEffect(() => {
    if (pathname.startsWith('/login') || status === 'loading' || !user) return
    const role = normalizeRole(user.role)
    const department = user.department || ''
    if (isMaintenanceWorkerSpacesBlocked({ role, department }) && pathname.startsWith('/menu/spaces')) {
      router.replace('/menu/manteniment')
    }
    if (
      isLogisticsMaintenanceTicketsManager({ role, department }) &&
      (pathname.startsWith('/menu/incidents') || pathname.startsWith('/menu/modifications'))
    ) {
      router.replace('/menu')
    }
    if (pathname.startsWith('/menu/projects') && user.opsProjectsConfigurable === false) {
      router.replace('/menu')
    }
  }, [pathname, status, user, router])

  const username = user?.name || user?.email || 'Usuari'
  const avatarLetter = username[0]?.toUpperCase() ?? 'U'

  const filteredVisibleModules = useMemo(() => {
    if (!uiPermData) return []
    return MODULES.filter((m) => uiMap[m.path] === true).map((m) => ({
      ...m,
      submodules: (m.submodules || []).filter((s) => uiMap[s.path] === true),
    }))
  }, [uiPermData, uiMap])

  const lastStableVisibleModulesRef = useRef(filteredVisibleModules)
  useEffect(() => {
    if (uiPermData) {
      lastStableVisibleModulesRef.current = filteredVisibleModules
    }
  }, [uiPermData, filteredVisibleModules])

  const stableVisibleModules = uiPermData
    ? filteredVisibleModules
    : lastStableVisibleModulesRef.current ?? []

  const sortedVisibleModules = [...stableVisibleModules].sort((a, b) =>
    a.label.localeCompare(b.label, 'ca', { sensitivity: 'base' })
  )

  // Si estem en una ruta que l'usuari ha denegat via overrides UI, redirigim a /menu
  useEffect(() => {
    if (!uiPermData || isLogin) return
    if (pathname?.startsWith('/menu/') && !isUiPathAllowed(pathname, uiMap)) {
      router.replace('/menu')
    }
  }, [uiPermData, uiMap, pathname, router, isLogin])

  /* 🔓 Pantalla login sense layout */
  if (isLogin) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-foreground">
        <Image src="/logo.png" alt="Cal Blay" width={200} height={80} />
        {children}
      </div>
    )
  }

  if (!user) return null

  return (
      <div className="min-h-[100dvh] bg-background text-foreground">

      {/* ---------------- CAPÇALERA ---------------- */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border">
        <div className="h-14 flex items-center justify-between px-4">

          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded-md hover:bg-muted"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/menu">
            <Image src="/logo.png" alt="Cal Blay" width={120} height={50} />
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground font-bold">
              {avatarLetter}
            </div>

            <button
              onClick={async () => {
                await signOut({ redirect: false })
                router.replace('/login')
              }}
              className="p-2 rounded hover:bg-muted"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

        </div>
      </header>

      {/* ---------------- MENÚ LATERAL ---------------- */}
      {menuOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/40" onClick={() => setMenuOpen(false)}>
          <aside
            className="fixed left-0 top-0 h-full w-64 bg-background shadow-xl p-4 border-r border-border overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between mb-4">
              <span className="text-lg font-semibold">Menú</span>
              <button onClick={() => setMenuOpen(false)}>✕</button>
            </div>

            <nav className="flex flex-col gap-2">
              {sortedVisibleModules.map(mod => (
                <Link
                  key={mod.path}
                  href={resolveModuleMenuHref(mod, uiMap)}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 rounded-md hover:bg-muted"
                >
                  {mod.label}
                </Link>
              ))}

              <Link
                href="/menu/configuracio"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-md hover:bg-muted flex items-center gap-2"
              >
                <Settings className="w-5 h-5" />
                Configuració
              </Link>
            </nav>
          </aside>
        </div>
      )}

      {/* ---------------- CONTINGUT ---------------- */}
      <main
        className={
          pathname.startsWith('/menu/quadrants') ||
          pathname.startsWith('/menu/modifications') ||
          pathname.startsWith('/menu/incidents') ||
          pathname.startsWith('/menu/projects') ||
          pathname.startsWith('/menu/manteniment/preventius/planificador') ||
          pathname.startsWith('/menu/manteniment/seguiment') ||
          pathname.startsWith('/menu/manteniment/tickets') ||
          pathname.startsWith('/menu/documentacio') ||
          pathname.startsWith('/menu/roba-personal') ||
          pathname.startsWith('/menu/spaces')
            ? 'h-auto w-full max-w-none overflow-visible px-2 pb-6 sm:px-4 lg:px-6 xl:px-8'
            : 'mx-auto h-auto max-w-7xl overflow-visible px-2 pb-6 sm:px-4'
        }
      >
        {children}
      </main>

    </div>
  )
}
