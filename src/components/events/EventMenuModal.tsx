// file: src/components/events/EventMenuModal.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  Users,
  FileText,
  FileSignature,
  FileBarChart2,
  Sparkles,
  X,
  ChevronRight,
  Home,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import EventDocumentsSheet from '@/components/events/EventDocumentsSheet'
import EventKitchenDocumentsModal from '@/components/events/EventKitchenDocumentsModal'
import EventPersonnelModal from './EventPersonnelModal'
import { useEventPersonnel } from '@/hooks/useEventPersonnel'
import EventIncidentsModal from './EventIncidentsModal'
import EventModificationsModal from './EventModificationsModal'
import CreateModificationModal from './CreateModificationModal'
import EventSpacesModal from './EventSpacesModal'
import EventAvisosModal from './EventAvisosModal'
import EventClosingModal from './EventClosingModal'
import { normalizeAuditDepartment } from '@/lib/auditDepartment'

/** ───────────────────────── Helpers ───────────────────────── */
const norm = (s?: string | number | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

type LnKey = 'empresa' | 'casaments' | 'foodlovers' | 'agenda' | 'altres'

interface WorkerLite {
  id?: string | number
  name?: string
  role?: string
  department?: string
}

interface EventMenuModalProps {
  event: {
    id?: string | number
    summary: string
    start: string
    location?: string
    eventCode?: string | null
    code?: string | null
    lnKey?: LnKey
    isResponsible?: boolean
    responsable?: WorkerLite | null
    conductors?: WorkerLite[]
    treballadors?: WorkerLite[]
    fincaId?: string | null
    fincaCode?: string | null
    pax?: number
    importAmount?: number
  }
  user: {
    id?: string | number
    role?: string
    department?: string
  
    name?: string
  }
  onClose: () => void
  onOpenAuditExecution?: () => void
  onAvisosStateChange?: (state: { eventCode: string | null; hasAvisos: boolean; lastAvisoDate?: string }) => void
  suppressMenuInteraction?: boolean
}

function deduceLnKeyFromSummary(summary: string): LnKey {
  const s = summary.trim().toUpperCase()
  if (s.startsWith('E-')) return 'empresa'
  if (s.startsWith('C-')) return 'casaments'
  if (s.startsWith('F-')) return 'foodlovers'
  if (s.startsWith('PM')) return 'agenda'
  return 'altres'
}

function firstFiniteNumber(obj: Record<string, unknown> | null | undefined, keys: string[]): number {
  if (!obj) return 0
  for (const k of keys) {
    const v = obj[k]
    if (v == null || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

type Tone = 'warning' | 'info' | 'success' | 'neutral' | 'purple'

function toneIconClass(tone: Tone) {
  // Color només a la icona (no al botó)
  if (tone === 'warning') return 'text-orange-600'
  if (tone === 'info') return 'text-blue-600'
  if (tone === 'success') return 'text-emerald-600'
  if (tone === 'purple') return 'text-purple-600'
  return 'text-slate-600'
}

function badgeClass(tone: Tone) {
  if (tone === 'warning') return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
  if (tone === 'info') return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
  if (tone === 'success') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
  if (tone === 'purple') return 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
  return 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0 pt-3 pb-1">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{children}</p>
    </div>
  )
}

function ActionRow({
  icon: Icon,
  label,
  badge,
  tone,
  onClick,
  disabled,
}: {
  icon: any
  label: string
  badge?: string
  tone: Tone
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        'w-full min-h-[3rem] py-2.5 sm:h-12 rounded-xl px-3',
        'flex items-center justify-between gap-3 touch-manipulation',
        'bg-white border border-slate-200',
        'hover:bg-slate-50 active:scale-[0.99] transition',
        'disabled:cursor-not-allowed disabled:opacity-70',
        'text-left',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200">
          <Icon className={['h-5 w-5', toneIconClass(tone)].join(' ')} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{label}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {badge ? (
          <span
            className={['px-2 py-1 rounded-full text-[11px] font-semibold', badgeClass(tone)].join(' ')}
          >
            {badge}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>
    </button>
  )
}

/** ───────────────────────── Component ───────────────────────── */
export default function EventMenuModal({
  event,
  user,
  onClose,
  onOpenAuditExecution,
  onAvisosStateChange,
  suppressMenuInteraction = false,
}: EventMenuModalProps) {

  const router = useRouter()

  // Internals
  const [pendingDocsOpen, setPendingDocsOpen] = useState(false)

  const [showPersonnel, setShowPersonnel] = useState(false)
  const [showIncidents, setShowIncidents] = useState(false)
  const [showModifications, setShowModifications] = useState(false)
  const [showCreateModification, setShowCreateModification] = useState(false)
  const [showAvisos, setShowAvisos] = useState(false)
  const [showClosing, setShowClosing] = useState(false)
  const [showBudget, setShowBudget] = useState(false)
  const [showKitchenDocs, setShowKitchenDocs] = useState(false)


  // ✅ Nou botó: Espais (placeholder fins que ens diguis on ha d'anar)
  const [showEspais, setShowEspais] = useState(false)

  const { data: personnelData, loading: personnelLoading } = useEventPersonnel(event?.id)
  const responsablePerson = personnelData?.responsables?.[0]
  ? {
      id: personnelData.responsables[0].id,
      name: personnelData.responsables[0].name,
      phone: personnelData.responsables[0].phone,
      department: personnelData.responsables[0].department,
      meetingPoint: personnelData.responsables[0].meetingPoint,
      time: personnelData.responsables[0].time,
    }
  : null

const conductorsPersons =
  personnelData?.conductors?.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    department: c.department,
    meetingPoint: c.meetingPoint,
    time: c.time,
    plate: c.plate,
  })) ?? []

const treballadorsPersons =
  personnelData?.treballadors?.map(t => ({
    id: t.id,
    name: t.name,
    phone: t.phone,
    department: t.department,
    meetingPoint: t.meetingPoint,
    time: t.time,
  })) ?? []

  useEffect(() => {
    const eventId = String(event?.id ?? '').trim()
    if (!eventId) return

    const warm = () => {
      const incidentsQs = new URLSearchParams()
      incidentsQs.set('eventId', eventId)
      incidentsQs.set('limit', '80')
      void fetch(`/api/incidents?${incidentsQs}`, { cache: 'no-store' }).catch(() => {})

      const dept = normalizeAuditDepartment(user.department)
      if (dept) {
        const auditQs = new URLSearchParams({ eventId, department: dept })
        void fetch(`/api/auditoria/executions?${auditQs}`, { cache: 'no-store' }).catch(() => {})
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(warm, { timeout: 1200 })
      return () => cancelIdleCallback(id)
    }
    const t = window.setTimeout(warm, 120)
    return () => clearTimeout(t)
  }, [event?.id, user.department])

  const roleN = norm(user?.role)
  const deptN = norm(user?.department)
  const lnKey: LnKey = event?.lnKey ?? deduceLnKeyFromSummary(event?.summary ?? '')
  const isAdmin = roleN === 'admin'
  const isDireccio = roleN === 'direccio'
  const isCapDept = roleN === 'cap' || (roleN.includes('cap') && roleN.includes('depart'))
  const isProduccio = deptN === 'produccio'
  const isCuina = deptN === 'cuina'
  const canWriteAvisos = isAdmin || isDireccio || isProduccio
  const isWorkerResponsible = roleN === 'treballador' && !!event?.isResponsible
  const canCloseEvent =
    isAdmin || isDireccio || isCapDept || isWorkerResponsible



  const canSeeIncidents = isAdmin || isDireccio || isCapDept || roleN === 'comercial'
  const canSeeKitchenDocs = isAdmin || isDireccio || isCuina

  const canCreateIncident =
    isAdmin ||
    isDireccio ||
    roleN === 'comercial' ||
    (isCapDept && ['foodlovers', 'logistica', 'cuina', 'serveis'].includes(norm(deptN))) ||
      isWorkerResponsible

  const DEPT_TO_LN: Record<string, LnKey> = {
    empresa: 'empresa',
    casaments: 'casaments',
    foodlovers: 'foodlovers',
    agenda: 'agenda',
  }
  const deptNoBudget = new Set(['serveis', 'logistica', 'logística', 'cuina'])
  const canSeeBudgetContract =
    isAdmin ||
    isDireccio ||
    (isCapDept && !deptNoBudget.has(deptN) && DEPT_TO_LN[deptN] === lnKey)

  // Producció ha de veure/crear modificacions sempre; altres dep. només si són caps o admins/direcció
  const canSeeModifications =
    isAdmin ||
    isDireccio ||
    isProduccio ||
    (isCapDept && ['logistica', 'cuina'].includes(norm(deptN)))

  const canCreateModification =
    isAdmin ||
    isDireccio ||
    isProduccio ||
    (isCapDept && ['logistica', 'cuina'].includes(norm(deptN)))

  const navigateTo = (path: string) => {
    onClose()
    router.push(path)
  }

  const dateStr = useMemo(() => event?.start?.substring(0, 10) || '-', [event?.start])
  const eventRecord = (event ?? {}) as Record<string, unknown>
  const budgetPax = firstFiniteNumber(eventRecord, ['pax', 'NumPax', 'numPax'])
  const budgetAmount = firstFiniteNumber(eventRecord, ['importAmount', 'Import', 'import'])
  const budgetTicket = budgetPax > 0 ? budgetAmount / budgetPax : 0
  const hasBudgetAmount = budgetAmount > 0
  const hasBudgetPax = budgetPax > 0
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('ca-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value)
  const formatNumber = (value: number) =>
    new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(value)
  // ✅ Seccions per ordenar i donar sentit (més “app”)
const operativa = useMemo(
  () =>
    [
      canCreateIncident
        ? {
            key: 'audit-execution',
            label: 'Tancament operatiu',
            badge: 'Auditoria',
            icon: AlertTriangle,
            tone: 'warning' as const,
            onClick: () => {
              // Primer el pare pot capturar l’esdeveniment (p. ex. Torns); després es tanca el menú.
              onOpenAuditExecution?.()
              onClose()
            },
          }
        : null,

      canSeeIncidents
        ? {
            key: 'view-incidents',
            label: 'Veure incidències',
            badge: 'Incidències',
            icon: Eye,
            tone: 'warning' as const,
            onClick: () => setShowIncidents(true),
          }
        : null,

      canCreateModification
        ? {
            key: 'create-mod',
            label: 'Registrar modificació',
            badge: 'Canvis',
            icon: Sparkles,
            tone: 'purple' as const,
            onClick: () => setShowCreateModification(true),
          }
        : null,

      canSeeModifications
        ? {
            key: 'view-mod',
            label: 'Veure modificacions',
            badge: 'Canvis',
            icon: Sparkles,
            tone: 'purple' as const,
            onClick: () => setShowModifications(true),
          }
        : null,

      canCloseEvent
        ? {
            key: 'closing',
            label: 'Tancament (hores reals)',
            badge: 'Tancament',
            icon: Sparkles,
            tone: 'success' as const,
            onClick: () => setShowClosing(true),
          }
        : null,

      // 🔔 Avisos de Producció (visible només per Producció / Admin / Direcció)
      canWriteAvisos
        ? {
            key: 'avisos',
            label: 'Avisos de Producció',
            badge: 'Info',
            icon: FileText,
            tone: 'info' as const,
            onClick: () => setShowAvisos(true),
          }
        : null,

    ].filter(Boolean) as any[],
  [
    canCreateIncident,
    canSeeIncidents,
    canCreateModification,
    canSeeModifications,
    canWriteAvisos,
    canCloseEvent,
    onClose,
    onOpenAuditExecution,
  ]
)


const recursos = useMemo(
  () =>
    [
    {
      key: 'espais',
      label: 'Espais',
      badge: 'Masies',
      icon: Home,
      tone: 'neutral' as const,
   onClick: () => {
  const fincaRef = (event?.fincaId || event?.fincaCode || '').trim()
  if (!fincaRef) {
    window.alert('Aquest esdeveniment no té finca assignada.')
    return
  }
  setShowEspais(true)
}
,
    },
    {
      key: 'personnel',
      label: 'Veure personal assignat',
      badge: 'Equip',
      icon: Users,
      tone: 'info' as const,
      onClick: () => setShowPersonnel(true),
    },
    {
      key: 'docs',
      label: 'Veure documents',
      badge: 'Docs',
      icon: FileText,
      tone: 'info' as const,
      onClick: () => {
        setPendingDocsOpen(true)
      }

    },
      canSeeKitchenDocs
        ? {
            key: 'docs-cuina',
            label: 'Adjuntar documents cuina',
            badge: 'Cuina',
            icon: FileText,
            tone: 'info' as const,
            onClick: () => setShowKitchenDocs(true),
          }
        : null,
    ].filter(Boolean) as any[],
  [event, navigateTo, canSeeKitchenDocs]
)

  const economic = useMemo(
    () =>
      [
        canSeeBudgetContract
          ? {
              key: 'contract',
              label: 'Veure contracte',
              badge: 'Econòmic',
              icon: FileSignature,
              tone: 'success' as const,
              onClick: () => {
                const id = event?.id
                if (id == null || id === '') return
                navigateTo(`/menu/events/${id}/contract`)
              },
            }
          : null,
        canSeeBudgetContract
          ? {
              key: 'budget',
              label: 'Veure pressupost',
              badge: 'Econòmic',
              icon: FileBarChart2,
              tone: 'success' as const,
              onClick: () => setShowBudget(true),
            }
          : null,
      ].filter(Boolean) as any[],
    [canSeeBudgetContract, event?.id, navigateTo, event]
  )

  if (!event || !event.id) return null

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
<DialogContent
  className="w-[min(100vw-1rem,28rem)] max-w-[calc(100vw-1rem)] sm:max-w-md rounded-2xl p-0 overflow-hidden max-h-[min(88dvh,100svh)] gap-0 pb-[max(0px,env(safe-area-inset-bottom))]"
>


          {/* Header */}
          <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <DialogTitle className="text-[15px] sm:text-base font-semibold tracking-tight break-words">
                  {pendingDocsOpen ? 'Documents' : event.summary}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1 break-words">
                  {pendingDocsOpen ? 'Consulta de documents de l esdeveniment' : `Data: ${dateStr}`}
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                {pendingDocsOpen ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setPendingDocsOpen(false)}
                    aria-label="Tornar"
                    className="rounded-full"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Tancar"
                  className="rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 pb-4 sm:px-5 sm:pb-5 max-h-[min(72dvh,80svh)] overflow-y-auto overscroll-contain touch-pan-y">
            {pendingDocsOpen ? (
              <EventDocumentsSheet
                eventId={String(event.id)}
                eventCode={event.eventCode || event.code || null}
                open
                embedded
                onOpenChange={() => setPendingDocsOpen(false)}
              />
            ) : null}
            {!pendingDocsOpen && operativa.length > 0 && (
              <>
                <SectionTitle>Operativa</SectionTitle>
                <div className="space-y-2">
                  {operativa.map((a: any) => (
                    <ActionRow
                      key={a.key}
                      icon={a.icon}
                      label={a.label}
                      badge={a.badge}
                      tone={a.tone}
                      onClick={a.onClick}
                      disabled={suppressMenuInteraction}
                    />
                  ))}
                </div>
              </>
            )}

            {!pendingDocsOpen && (
              <>
                <SectionTitle>Recursos</SectionTitle>
                <div className="space-y-2">
                  {recursos.map((a: any) => (
                    <ActionRow
                      key={a.key}
                      icon={a.icon}
                      label={a.label}
                      badge={a.badge}
                      tone={a.tone}
                      onClick={a.onClick}
                      disabled={suppressMenuInteraction}
                    />
                  ))}
                </div>
              </>
            )}

            {!pendingDocsOpen && economic.length > 0 && (
              <>
                <SectionTitle>Econòmic</SectionTitle>
                <div className="space-y-2">
                  {economic.map((a: any) => (
                    <ActionRow
                      key={a.key}
                      icon={a.icon}
                      label={a.label}
                      badge={a.badge}
                      tone={a.tone}
                      onClick={a.onClick}
                      disabled={suppressMenuInteraction}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showBudget} onOpenChange={setShowBudget}>
        <DialogContent className="w-[90vw] max-w-sm rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">
              Pressupost
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {event.summary}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Import:</span>
              <span className="font-semibold text-slate-900">
                {hasBudgetAmount ? formatCurrency(budgetAmount) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Num pax:</span>
              <span className="font-semibold text-slate-900">
                {hasBudgetPax ? formatNumber(budgetPax) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tiquet / pax:</span>
              <span className="font-semibold text-slate-900">
                {hasBudgetAmount && hasBudgetPax ? formatCurrency(budgetTicket) : '-'}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <EventKitchenDocumentsModal
        eventId={String(event.id)}
        eventCode={event.eventCode || event.code || null}
        open={showKitchenDocs}
        onOpenChange={setShowKitchenDocs}
      />


      {/* ─────────── MODALS INTERNES EXISTENTS ─────────── */}
     <EventPersonnelModal
  open={showPersonnel}
  onClose={() => setShowPersonnel(false)}
  eventName={event.summary}
  code={String(event.id)}
  responsable={responsablePerson}
conductors={conductorsPersons}
treballadors={treballadorsPersons}

  loading={personnelLoading}
/>


      <EventIncidentsModal
        open={showIncidents}
        onClose={() => setShowIncidents(false)}
        eventId={String(event.id)}
        eventSummary={event.summary}
      />

      <EventModificationsModal
        open={showModifications}
        onClose={() => setShowModifications(false)}
        eventId={String(event.id)}
        eventSummary={event.summary}
      />

      {showCreateModification && (
        <CreateModificationModal
          event={event}
          user={user}
          onClose={() => setShowCreateModification(false)}
          onCreated={() => setShowCreateModification(false)}
        />
        
      )
      }
      {/* ✅ Espais: placeholder (decidim ruta/sheet/modal quan ens diguis) */}
      {/* ✅ Espais: modal de consulta (mobile-first, només lectura) */}

<EventAvisosModal
  open={showAvisos}
  onClose={() => setShowAvisos(false)}
  eventCode={event.eventCode ?? event.code ?? (event.id ? String(event.id) : null)}
  user={user}
  onAvisosStateChange={onAvisosStateChange}
/>
      <EventSpacesModal
  open={showEspais}
  onClose={() => setShowEspais(false)}
  fincaId={(event.fincaId || event.fincaCode || '').trim() || null}
  eventSummary={event.summary}
  eventId={event.id != null ? String(event.id) : null}
  eventCode={event.eventCode ?? event.code ?? null}
/>
      <EventClosingModal
        open={showClosing}
        onClose={() => setShowClosing(false)}
        eventId={String(event.id)}
        eventName={event.summary}
        user={user as any}
      />
      

     
    </>
  )
}


