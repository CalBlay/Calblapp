'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CreateTicketModal from '@/app/menu/manteniment/tickets/components/CreateTicketModal'
import { useMaintenanceTicketCatalog } from '@/app/menu/manteniment/tickets/useMaintenanceTicketCatalog'
import { useMaintenanceTicketComposer } from '@/app/menu/manteniment/tickets/useMaintenanceTicketComposer'
import type { TicketPriority } from '@/app/menu/manteniment/tickets/types'
import type { CenterRow } from '@/app/menu/manteniment/dades/types'
import type { CuinaCentralMachine } from '@/lib/cuina-central/types'
import {
  CUINA_CENTRAL_TICKET_ROUTING,
  machineLabel,
} from '@/lib/cuina-central/maintenanceTicket'
import { normalizeMaintenanceLocationKey } from '@/lib/maintenanceCenterTravel'

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

type OpenPreset = { location?: string; machine?: string }

type TicketContextValue = {
  openCreateTicket: (preset?: OpenPreset) => void
  openForMachine: (machine: Pick<CuinaCentralMachine, 'code' | 'name'>) => void
}

const CuinaCentralTicketContext = createContext<TicketContextValue | null>(null)

export function useCuinaCentralMaintenanceTicket() {
  const ctx = useContext(CuinaCentralTicketContext)
  if (!ctx) {
    throw new Error('useCuinaCentralMaintenanceTicket dins CuinaCentralMaintenanceTicketProvider')
  }
  return ctx
}

export function CuinaCentralMaintenanceTicketProvider({ children }: { children: ReactNode }) {
  const { machines: maintenanceMachines } =
    useMaintenanceTicketCatalog()
  const [centers, setCenters] = useState<CenterRow[]>([])

  const composer = useMaintenanceTicketComposer({
    defaultCenter: 'Cuina Central',
    routingOverride: CUINA_CENTRAL_TICKET_ROUTING,
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/maintenance/data/centers', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { centers: [] }))
      .then((json) => {
        if (cancelled) return
        setCenters(Array.isArray(json?.centers) ? json.centers : [])
      })
      .catch(() => {
        if (cancelled) return
        setCenters([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cuinaCentralCenters = useMemo(() => {
    const targetKey = normalizeMaintenanceLocationKey('Cuina Central')
    return centers.filter(
      (center) => normalizeMaintenanceLocationKey(center.name) === targetKey
    )
  }, [centers])

  const openCreateTicket = useCallback(
    (preset?: OpenPreset) => {
      composer.openCreate({
        center: 'Cuina Central',
        location: preset?.location || '',
        machine: preset?.machine || '',
      })
    },
    [composer]
  )

  const openForMachine = useCallback(
    (machine: Pick<CuinaCentralMachine, 'code' | 'name'>) => {
      const full = maintenanceMachines.find(
        (item) => item.code === machine.code && item.name === machine.name
      )
      openCreateTicket({
        location: String(full?.location || '').trim(),
        machine: machineLabel(machine),
      })
    },
    [maintenanceMachines, openCreateTicket]
  )

  const attachmentPreviews = composer.createAttachments.map((item) => ({
    preview: item.preview,
    kind: item.kind,
  }))

  return (
    <CuinaCentralTicketContext.Provider value={{ openCreateTicket, openForMachine }}>
      {children}
      {composer.showCreate ? (
        <CreateTicketModal
          centers={cuinaCentralCenters}
          machines={maintenanceMachines}
          createPriority={composer.createPriority}
          setCreatePriority={composer.setCreatePriority}
          centerQuery={composer.centerQuery}
          setCenterQuery={composer.setCenterQuery}
          createCenter={composer.createCenter}
          setCreateCenter={composer.setCreateCenter}
          locationQuery={composer.locationQuery}
          setLocationQuery={composer.setLocationQuery}
          createLocation={composer.createLocation}
          setCreateLocation={composer.setCreateLocation}
          zoneQuery={composer.zoneQuery}
          setZoneQuery={composer.setZoneQuery}
          createZone={composer.createZone}
          setCreateZone={composer.setCreateZone}
          showCenterList={composer.showCenterList}
          setShowCenterList={composer.setShowCenterList}
          showZoneList={composer.showZoneList}
          setShowZoneList={composer.setShowZoneList}
          machineQuery={composer.machineQuery}
          setMachineQuery={composer.setMachineQuery}
          createMachine={composer.createMachine}
          setCreateMachine={composer.setCreateMachine}
          createDescription={composer.createDescription}
          setCreateDescription={composer.setCreateDescription}
          createWorkerName={composer.createWorkerName}
          setCreateWorkerName={composer.setCreateWorkerName}
          needsWorkerName={composer.needsWorkerName}
          showLocationList={composer.showLocationList}
          setShowLocationList={composer.setShowLocationList}
          showMachineList={composer.showMachineList}
          setShowMachineList={composer.setShowMachineList}
          priorityLabels={PRIORITY_LABELS}
          onClose={() => composer.setShowCreate(false)}
          onCreate={() => void composer.handleCreateTicket()}
          createBusy={composer.createBusy}
          attachmentCompressing={composer.attachmentCompressing}
          canCreate={composer.canCreateTicket}
          onAttachmentChange={composer.handleAttachmentChange}
          attachmentPreviews={attachmentPreviews}
          attachmentCount={composer.createAttachmentCount}
          maxAttachments={composer.maxTicketAttachments}
          onRemoveAttachment={composer.removeAttachment}
          attachmentError={composer.attachmentError}
          formError={composer.formError}
        />
      ) : null}
    </CuinaCentralTicketContext.Provider>
  )
}

/** Botó principal (subnav) per obrir el mateix flux que Manteniment → Tickets. */
export function CuinaCentralMaintenanceTicketButton() {
  const { openCreateTicket } = useCuinaCentralMaintenanceTicket()
  return (
    <Button
      type="button"
      size="sm"
      className="bg-emerald-600 text-white hover:bg-emerald-700"
      onClick={() => openCreateTicket()}
    >
      + Ticket manteniment
    </Button>
  )
}

/** Botó compacte per una fila de màquina. */
export function MachineMaintenanceTicketButton({
  machine,
}: {
  machine: Pick<CuinaCentralMachine, 'code' | 'name'>
}) {
  const { openForMachine } = useCuinaCentralMaintenanceTicket()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 gap-1 text-xs"
      onClick={() => openForMachine(machine)}
    >
      <Wrench className="h-3.5 w-3.5" aria-hidden />
      Ticket
    </Button>
  )
}

export function CuinaCentralMaintenanceTicketShell({ children }: { children: ReactNode }) {
  return <CuinaCentralMaintenanceTicketProvider>{children}</CuinaCentralMaintenanceTicketProvider>
}

export function CuinaCentralMaintenanceTicketSuccessLink({
  onClose,
}: {
  onClose?: () => void
}) {
  return (
    <p className="text-xs text-slate-600">
      El ticket es deriva al planificador de manteniment.{' '}
      <Link
        href="/menu/manteniment/tickets"
        className="font-medium text-emerald-700 underline"
        onClick={onClose}
      >
        Veure tickets
      </Link>
    </p>
  )
}
