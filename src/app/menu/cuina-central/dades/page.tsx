'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Factory, Search, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FloatingAddButton from '@/components/ui/floating-add-button'
import MachinesPanel from '@/app/menu/manteniment/dades/components/MachinesPanel'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import {
  emptyMachine,
  type CenterRow,
  type MachineListStats,
  type MachineRow,
  type MachineView,
  type SupplierRow,
} from '@/app/menu/manteniment/dades/types'
import {
  buildMachineForm,
  getLastMovementAt,
  getTrackedMinutes,
  normalizeText,
} from '@/app/menu/manteniment/dades/utils'
import { parseFetchJson } from '@/lib/parseFetchJson'

const EMPTY_STATS = {
  total: 0,
  openCount: 0,
  pendingValidation: 0,
  openStatus: null as string | null,
  trackedMinutes: 0,
  lastMovement: 0,
}

export default function CuinaCentralDadesPage() {
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [centers, setCenters] = useState<CenterRow[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [machineForm, setMachineForm] = useState<MachineView>(emptyMachine)
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [showCreateMachine, setShowCreateMachine] = useState(false)
  const [machineSearch, setMachineSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [machinesRes, suppliersRes, centersRes, ticketsRes] = await Promise.all([
        fetch('/api/maintenance/data/machines', { cache: 'no-store' }),
        fetch('/api/maintenance/data/suppliers', { cache: 'no-store' }),
        fetch('/api/maintenance/data/centers', { cache: 'no-store' }),
        fetch('/api/maintenance/tickets?scope=cuina_central&ticketType=maquinaria&limit=300', {
          cache: 'no-store',
        }),
      ])
      if (!machinesRes.ok) {
        const error = await parseFetchJson(machinesRes, {
          error: "No s'han pogut carregar les màquines",
        })
        throw new Error(error.error)
      }

      const machinesJson = await parseFetchJson(machinesRes, { machines: [] as MachineRow[] })
      const suppliersJson = await parseFetchJson(suppliersRes, { suppliers: [] as SupplierRow[] })
      const centersJson = await parseFetchJson(centersRes, { centers: [] as CenterRow[] })
      const ticketsJson = await parseFetchJson(ticketsRes, { tickets: [] as Ticket[] })
      const nextMachines = Array.isArray(machinesJson.machines) ? machinesJson.machines : []

      setMachines(nextMachines)
      setSuppliers(Array.isArray(suppliersJson.suppliers) ? suppliersJson.suppliers : [])
      setCenters(Array.isArray(centersJson.centers) ? centersJson.centers : [])
      setTickets(Array.isArray(ticketsJson.tickets) ? ticketsJson.tickets : [])
      setSelectedMachineId((current) => {
        const nextId = current && nextMachines.some((machine) => machine.id === current) ? current : null
        const selected = nextMachines.find((machine) => machine.id === nextId)
        setMachineForm(selected ? buildMachineForm(selected) : emptyMachine)
        return nextId
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No s'han pogut carregar les dades")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredMachines = useMemo(() => {
    const query = normalizeText(machineSearch)
    if (!query) return machines
    return machines.filter((machine) =>
      normalizeText(
        [machine.code, machine.name, machine.center, machine.location, machine.zone, machine.brand, machine.model, machine.supplierName].join(' ')
      ).includes(query)
    )
  }, [machineSearch, machines])

  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === selectedMachineId) || null,
    [machines, selectedMachineId]
  )

  const machineStatsById = useMemo(() => {
    const stats = new Map<string, MachineListStats>()
    const matchers = machines.map((machine) => ({
      id: machine.id,
      code: normalizeText(machine.code),
      name: normalizeText(machine.name),
    }))
    machines.forEach((machine) => stats.set(machine.id, { ...EMPTY_STATS }))
    tickets.forEach((ticket) => {
      const ticketMachine = normalizeText(ticket.machine)
      const machineId = matchers.find(
        (machine) =>
          (machine.code && ticketMachine.includes(machine.code)) ||
          (machine.name && ticketMachine.includes(machine.name))
      )?.id
      if (!machineId) return
      const current = stats.get(machineId)
      if (!current) return
      current.total += 1
      if (ticket.status === 'fet') current.pendingValidation += 1
      if (!['fet', 'no_fet', 'validat'].includes(String(ticket.status || ''))) {
        current.openCount += 1
        if (!current.openStatus) current.openStatus = String(ticket.status || '') || null
      }
      current.trackedMinutes += getTrackedMinutes(ticket)
      current.lastMovement = Math.max(current.lastMovement, getLastMovementAt(ticket))
    })
    return stats
  }, [machines, tickets])

  const machineStats = selectedMachine
    ? machineStatsById.get(selectedMachine.id) || EMPTY_STATS
    : EMPTY_STATS

  const saveMachine = async () => {
    if (!machineForm.center.trim() || !machineForm.location.trim()) {
      setStatus('Cal seleccionar un centre i una ubicació vàlids per a la màquina.')
      return
    }
    setSaving(true)
    setStatus('')
    try {
      const selectedSupplier = suppliers.find((supplier) => supplier.id === machineForm.supplierId)
      const payload = { ...machineForm, supplierName: selectedSupplier?.name || '' }
      const url = machineForm.id
        ? `/api/maintenance/data/machines/${encodeURIComponent(machineForm.id)}`
        : '/api/maintenance/data/machines'
      const response = await fetch(url, {
        method: machineForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await parseFetchJson(response, { error: "No s'ha pogut desar la màquina" })
      if (!response.ok) throw new Error(json.error)
      setShowCreateMachine(false)
      await loadData()
      setStatus(machineForm.id ? 'Màquina actualitzada' : 'Màquina creada')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No s'ha pogut desar la màquina")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-4 p-4 lg:px-6 xl:px-8">
      <ModuleHeader
        title="Cuina central"
        subtitle="Dades · Fitxa de maquinària compartida amb Manteniment"
        icon={<Factory className="h-5 w-5 text-slate-700" aria-hidden />}
      />
      {status ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{status}</p>
      ) : null}

      <div className="flex justify-end">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={machineSearch}
            onChange={(event) => setMachineSearch(event.target.value)}
            placeholder="Cerca codi, nom o ubicació..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900"
          />
          {machineSearch.trim() ? (
            <button type="button" onClick={() => setMachineSearch('')} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="Netejar cerca">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <MachinesPanel
        loading={loading}
        saving={saving}
        filteredMachines={filteredMachines}
        centers={centers}
        suppliers={suppliers}
        showCreateMachine={showCreateMachine}
        selectedMachine={selectedMachine}
        selectedMachineId={selectedMachineId}
        machineForm={machineForm}
        machineStats={machineStats}
        machineStatsById={machineStatsById}
        detailHrefSuffix="?source=cuina-central"
        onSelectMachine={(machine) => {
          if (selectedMachineId === machine.id) {
            setSelectedMachineId(null)
            setMachineForm(emptyMachine)
            return
          }
          setShowCreateMachine(false)
          setSelectedMachineId(machine.id)
          setMachineForm(buildMachineForm(machine))
        }}
        onMachineFormChange={(updater) => setMachineForm((current) => updater(current))}
        onResetMachine={() => {
          if (showCreateMachine) setMachineForm(emptyMachine)
          else {
            setSelectedMachineId(null)
            setMachineForm(emptyMachine)
          }
        }}
        onSaveMachine={() => void saveMachine()}
      />

      <FloatingAddButton
        onClick={() => {
          setShowCreateMachine(true)
          setSelectedMachineId(null)
          setMachineForm(emptyMachine)
        }}
      />
    </div>
  )
}
