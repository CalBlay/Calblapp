// filename: src/app/menu/torns/page.tsx
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { CalendarDays } from 'lucide-react'
import { RoleGuard } from '@/lib/withRoleGuard'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import TornsList from './components/TornsList'
import TornDetailModal from './components/TornDetailModal'
import FilterButton from '@/components/ui/filter-button'
import EventMenuModal from '@/components/events/EventMenuModal'
import EventAvisosReadOnlyModal from '@/components/events/EventAvisosReadOnlyModal'

const EventAuditExecutionModal = dynamic(
  () => import('@/components/events/EventAuditExecutionModal'),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25"
        aria-busy="true"
        aria-label="Carregant auditoria"
      >
        <span className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
          Carregant auditoria…
        </span>
      </div>
    ),
  }
)
import { useFilters } from '@/context/FiltersContext'
import TornFilters from './components/TornFilters'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { useSearchParams, useRouter } from 'next/navigation'
import TornNotificationsBanner from '@/components/torns/TornNotificationsBanner'

type ApiWorker = { id?: string; name?: string }
type ApiTorn = {
  id: string
  eventId?: string
  code: string
  eventName: string
  date: string
  dayNote?: string
  time?: string
  location?: string
  meetingPoint?: string
  department?: string
  workerRole?: 'responsable' | 'conductor' | 'treballador' | null
  workerName?: string
  workerPlate?: string
  vestimentModel?: string
  fincaId?: string | null
  fincaCode?: string | null
  __rawWorkers?: (ApiWorker & {
    role?: 'responsable' | 'conductor' | 'treballador'
    startTime?: string
    endTime?: string
    meetingPoint?: string
    department?: string
    plate?: string
  })[]
}

type ApiResp = {
  ok: boolean
  data: ApiTorn[]
  meta?: {
    departments?: string[]
    workers?: { id?: string; name: string }[]
  }
}

const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export default function TornsPage() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [items, setItems] = useState<ApiTorn[]>([])
  const [deptOptions, setDeptOptions] = useState<string[]>([])
  const [workerOptions, setWorkerOptions] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedTorn, setSelectedTorn] = useState<ApiTorn | null>(null)
  const [detail, setDetail] = useState<ApiTorn | null>(null)
  const [eventMenuOpen, setEventMenuOpen] = useState(false)
  const [eventMenuData, setEventMenuData] = useState<{
    id: string
    summary: string
    start: string
    eventCode?: string | null
    code?: string | null
    department?: string
    isResponsible?: boolean
    fincaId?: string | null
    fincaCode?: string | null
    pax?: number
    importAmount?: number
    location?: string
  } | null>(null)
  const [auditEvent, setAuditEvent] = useState<NonNullable<typeof eventMenuData> | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [avisosOpen, setAvisosOpen] = useState(false)
  const [avisosEventCode, setAvisosEventCode] = useState<string | null>(null)

  const userName = session?.user?.name || ''
  const normalizedUserName = norm(userName)
  const rawRole = norm(session?.user?.role)
  const sessionDept = norm(session?.user?.department)

  const role: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador' =
    rawRole.startsWith('admin')
      ? 'Admin'
      : rawRole.includes('dire')
      ? 'Direcció'
      : rawRole.includes('cap')
      ? 'Cap Departament'
      : 'Treballador'

  const isAdminOrDireccio = role === 'Admin' || role === 'Direcció'
  const isWorker = role === 'Treballador'

  // ============================
  // 📅 Dates per defecte
  // ============================
  const today = new Date()
  const defaultStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const defaultEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [filters, setFilters] = useState<SmartFiltersChange>({
    mode: 'week',
    start: defaultStart,
    end: defaultEnd,
    roleType: 'all' as any,
  })
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null)

  // ============================
  // 🟦 CONTEXT SLIDE FILTERS
  // ============================
  const { setOpen, setContent } = useFilters()

  // ============================
  // 🔵 FETCH TURNS
  // ============================
  useEffect(() => {
    if (status !== 'authenticated') return

    // ❗ No fer fetch fins tenir dates correctes
    if (
      !filters.start ||
      !filters.end ||
      filters.start.length !== 10 ||
      filters.end.length !== 10
    ) {
      return
    }

    const controller = new AbortController()

    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        params.set('mode', filters.mode || 'week')
        params.set('start', filters.start!)
        params.set('end', filters.end!)

        if (filters.roleType) params.set('roleType', filters.roleType)
        if (filters.workerId) params.set('workerId', filters.workerId)
        if (filters.workerName) params.set('workerName', filters.workerName)
        if (filters.department) params.set('department', filters.department)

        const res = await fetch(`/api/torns/getTorns?${params}`, {
          signal: controller.signal,
        })
        const json = (await res.json()) as ApiResp

        if (!json.ok) {
          setItems([])
          setDeptOptions([])
          setWorkerOptions([])
          setError('Error carregant torns')
          return
        }

        setItems(json.data || [])
        const depts = json.meta?.departments || []
        setDeptOptions(isAdminOrDireccio ? ['tots', ...depts] : depts)

        const rawWorkers = Array.isArray(json.meta?.workers)
          ? json.meta.workers
          : []
        const workers = rawWorkers.map((w) => ({
          id: w.id || '',
          name: w.name || '',
        }))
        setWorkerOptions(workers)
      } catch (err: unknown) {
        if ((err as any)?.name === 'AbortError') return
        console.error('[torns] fetch error', err)
        setError('Error de connexió')
      } finally {
        setLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [filters, isAdminOrDireccio, status])

  useEffect(() => {
    const open = searchParams?.get('open')
    const date = searchParams?.get('date')
    if (!open && !date) return

    if (date) {
      const d = new Date(date)
      const start = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const end = format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      setFilters((prev) => ({ ...prev, start, end, mode: 'week' }))
    }
    if (open) {
      setPendingOpenId(open)
    }
    router.replace('/menu/torns')
  }, [searchParams, router])

  useEffect(() => {
    if (!pendingOpenId || !items.length) return
    const found = items.find(
      (t) => t.eventId === pendingOpenId || t.id === pendingOpenId
    )
    if (found) {
      openDetail(found)
      setPendingOpenId(null)
    }
  }, [pendingOpenId, items])

  // ============================
  // DETALL
  // ============================
  const openDetail = (t: ApiTorn) => {
    setSelectedTorn(t)
    setDetail(t)
  }

  const closeDetail = () => {
    setSelectedTorn(null)
    setDetail(null)
  }

  const closeEventMenu = () => {
    setEventMenuOpen(false)
    setEventMenuData(null)
  }

  const openAuditExecution = useCallback(() => {
    if (!eventMenuData) return
    setAuditEvent(eventMenuData)
    queueMicrotask(() => setAuditOpen(true))
  }, [eventMenuData])

  const openAvisos = (t: ApiTorn) => {
    if (!t.code) return
    setAvisosEventCode(t.code)
    setAvisosOpen(true)
  }

  const openEventMenu = (t: ApiTorn) => {
    if (!t.eventId) {
      console.warn('[torns] eventId missing, skipping event menu', t)
      return
    }

    const isResponsible = Boolean(
      normalizedUserName &&
      t.workerName &&
      norm(t.workerName) === normalizedUserName &&
      norm(t.workerRole) === 'responsable'
    )

    setEventMenuData({
      id: t.eventId,
      summary: t.eventName,
      start: t.date,
      eventCode: t.code,
      code: t.code,
      department: t.department,
      isResponsible,
      fincaId: t.fincaId ?? null,
      fincaCode: t.fincaCode ?? null,
      location: t.location || '',
    })
    setEventMenuOpen(true)
  }


  const openEventChat = (t: ApiTorn) => {
    const eventId = String(t.eventId || t.code || '').trim()
    if (!eventId) return
    const returnTo = encodeURIComponent(`/menu/torns?start=${filters.start}&end=${filters.end}`)
    const url = `/menu/missatgeria?eventId=${encodeURIComponent(eventId)}&event=1&returnTo=${returnTo}`
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener')
      return
    }
    router.push(url)
  }

  const userForEventMenu = {
    id: (session?.user as any)?.id,
    role: (session?.user as any)?.role,
    department: (session?.user as any)?.department,
    name: (session?.user as any)?.name,
  }

  if (status === 'loading') return <p className="p-6">Carregant sessió…</p>

  // ============================
  // RENDER
  // ============================
  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'treballador']}>
      <div className="px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4 max-w-full overflow-x-hidden touch-manipulation">
      <ModuleHeader
        icon={<CalendarDays className="w-7 h-7 text-blue-600 shrink-0" />}
        title="Torns Assignats"
        subtitle="Consulta i gestiona els torns assignats"
      />

      <TornNotificationsBanner />

      {/* SMART FILTERS — apil·lat al mòbil, fila a escriptori */}
      <div className="w-full min-w-0 py-2 sm:px-1 sm:py-3 mb-4 sm:mb-6">
<div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  
  {/* Bloc esquerra: SmartFilters */}
  <div className="flex items-center gap-3 w-full min-w-0">
    <SmartFilters
      modeDefault="week"
      role={role}
      departmentOptions={deptOptions}
      workerOptions={workerOptions}
      fixedDepartment={!isAdminOrDireccio ? sessionDept : null}
      lockedWorkerName={isWorker ? userName : undefined}
      showDepartment={false}
      showStatus={false}
      showLocation={false}
      showWorker={false}
      showImportance={false}
      onChange={(f) => setFilters(f)}
    />
  </div>

  {/* Bloc dreta: Botó filtres avançats */}
  <FilterButton
  className="shrink-0 self-end sm:self-center"
  onClick={() => {
    setContent(
      <TornFilters
        setFilters={setFilters}
        deptOptions={deptOptions}
        workerOptions={workerOptions}
        role={role}
        sessionDept={sessionDept}
        userName={userName}
        isAdminOrDireccio={isAdminOrDireccio}
        isWorker={isWorker}
      />
    )
  }}
/>

</div>

      </div>



      {/* LLISTAT */}
      {loading ? (
        <p className="text-center py-10">Carregant torns…</p>
      ) : error && filters.start && filters.end ? (
        <p className="text-center py-10 text-red-500">{error}</p>
      ) : items.length === 0 && filters.start && filters.end ? (
        <p className="text-center py-10 text-gray-500">
          No hi ha torns assignats en aquest període
        </p>
      ) : (
        <TornsList
          items={items}
          onTornClick={openDetail}
          onEventClick={openEventMenu}
          onAvisosClick={openAvisos}
          onChatClick={openEventChat}
          groupByEvent={
            !isWorker && !(filters.workerId) && !(filters.workerName)
          }
          role={role}
        />
      )}

      {/* MODAL DETALL */}
      <TornDetailModal
        open={!!selectedTorn}
        onClose={closeDetail}
        torn={detail || selectedTorn}
      />
      {eventMenuOpen && eventMenuData && (
        <EventMenuModal
          event={eventMenuData}
          user={userForEventMenu}
          onClose={closeEventMenu}
          onOpenAuditExecution={openAuditExecution}
        />
      )}
      {auditEvent && (
        <EventAuditExecutionModal
          open={auditOpen}
          onClose={() => {
            setAuditOpen(false)
            setAuditEvent(null)
          }}
          event={{
            id: auditEvent.id,
            summary: auditEvent.summary,
            start: auditEvent.start,
            eventCode: auditEvent.eventCode || auditEvent.code || undefined,
            location: auditEvent.location,
          }}
          user={{
            department: userForEventMenu.department,
            role: userForEventMenu.role,
            name: userForEventMenu.name,
          }}
        />
      )}
      <EventAvisosReadOnlyModal
        open={avisosOpen}
        onClose={() => setAvisosOpen(false)}
        eventCode={avisosEventCode}
      />
      </div>
    </RoleGuard>
  )
}



