'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Factory, Search, Truck, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { RoleGuard } from '@/lib/withRoleGuard'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'
import MachinesPanel from './components/MachinesPanel'
import SuppliersPanel from './components/SuppliersPanel'
import { PreventiusTemplatesContent } from '../preventius/plantilles/page'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import {
  buildMachineForm,
  getLastMovementAt,
  getTrackedMinutes,
  normalizeText,
} from './utils'
import { emptyMachine, emptySupplier, type MachineListStats, type MachineRow, type MachineView, type SupplierRow } from './types'
import { parseFetchJson } from '@/lib/parseFetchJson'

export default function MaintenanceDataPage() {
  const { setContent } = useFilters()
  const [tab, setTab] = useState<'machines' | 'preventives' | 'suppliers'>('machines')
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [machineForm, setMachineForm] = useState<MachineView>(emptyMachine)
  const [supplierForm, setSupplierForm] = useState(emptySupplier)
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [machineSearch, setMachineSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadedTabs, setLoadedTabs] = useState({
    machines: false,
    suppliers: false,
  })

  const loadMachinesData = async () => {
    try {
      setLoading(true)
      const [machinesRes, suppliersRes, ticketsRes] = await Promise.all([
        fetch('/api/maintenance/data/machines', { cache: 'no-store' }),
        fetch('/api/maintenance/data/suppliers', { cache: 'no-store' }),
        fetch('/api/maintenance/tickets?ticketType=maquinaria&limit=300', { cache: 'no-store' }),
      ])
      const machinesJson = await parseFetchJson(machinesRes, { machines: [] as MachineRow[] })
      const suppliersJson = await parseFetchJson(suppliersRes, { suppliers: [] as SupplierRow[] })
      const ticketsJson = await parseFetchJson(ticketsRes, { tickets: [] as Ticket[] })
      const nextMachines = Array.isArray(machinesJson?.machines) ? machinesJson.machines : []
      const nextSuppliers = Array.isArray(suppliersJson?.suppliers) ? suppliersJson.suppliers : []
      const nextTickets = Array.isArray(ticketsJson?.tickets) ? ticketsJson.tickets : []

      setMachines(nextMachines)
      setSuppliers(nextSuppliers)
      setTickets(nextTickets)
      setLoadedTabs((current) => ({ ...current, machines: true, suppliers: true }))

      setSelectedMachineId((current) => {
        const stillExists = current && nextMachines.some((item: MachineRow) => item.id === current)
        const nextId = stillExists ? current : nextMachines[0]?.id || null
        const selected = nextMachines.find((item: MachineRow) => item.id === nextId)
        setMachineForm(selected ? buildMachineForm(selected) : emptyMachine)
        return nextId
      })
    } finally {
      setLoading(false)
    }
  }

  const loadSuppliersData = async () => {
    try {
      setLoading(true)
      const suppliersRes = await fetch('/api/maintenance/data/suppliers', { cache: 'no-store' })
      const suppliersJson = await parseFetchJson(suppliersRes, { suppliers: [] as SupplierRow[] })
      const nextSuppliers = Array.isArray(suppliersJson?.suppliers) ? suppliersJson.suppliers : []
      setSuppliers(nextSuppliers)
      setLoadedTabs((current) => ({ ...current, suppliers: true }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setContent(<></>)
  }, [setContent])

  useEffect(() => {
    if (tab === 'machines' && !loadedTabs.machines) {
      void loadMachinesData()
      return
    }
    if (tab === 'suppliers' && !loadedTabs.suppliers) {
      void loadSuppliersData()
    }
  }, [loadedTabs.machines, loadedTabs.suppliers, tab])

  const filteredMachines = useMemo(() => {
    const q = machineSearch.trim().toLowerCase()
    if (!q) return machines
    return machines.filter((item) =>
      [item.code, item.name, item.location, item.brand, item.model, item.supplierName]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [machineSearch, machines])

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((item) =>
      [item.name, item.email, item.phone, item.specialty].join(' ').toLowerCase().includes(q)
    )
  }, [supplierSearch, suppliers])

  const selectedMachine = useMemo(
    () => machines.find((item) => item.id === selectedMachineId) || null,
    [machines, selectedMachineId]
  )

  const machineDataIndex = useMemo(() => {
    const entries = new Map<string, MachineListStats>()
    const ticketsByMachineId = new Map<string, Ticket[]>()
    const machineMatchers = machines.map((machine) => ({
      id: machine.id,
      code: normalizeText(machine.code),
      name: normalizeText(machine.name),
    }))

    machines.forEach((machine) => {
      entries.set(machine.id, {
        total: 0,
        openCount: 0,
        pendingValidation: 0,
        openStatus: null,
        trackedMinutes: 0,
        lastMovement: 0,
      })
      ticketsByMachineId.set(machine.id, [])
    })

    tickets.forEach((ticket) => {
      const ticketMachine = normalizeText(ticket.machine)
      if (!ticketMachine) return

      const matchedMachineId =
        machineMatchers.find((machine) => {
          if (machine.code && ticketMachine.includes(machine.code)) return true
          if (machine.name && ticketMachine.includes(machine.name)) return true
          return false
        })?.id || null
      if (!matchedMachineId) return

      const current = entries.get(matchedMachineId)
      if (!current) return

      current.total += 1
      if (ticket.status === 'fet') current.pendingValidation += 1
      if (!['fet', 'no_fet', 'validat', 'resolut'].includes(String(ticket.status || ''))) {
        current.openCount += 1
        if (!current.openStatus) current.openStatus = String(ticket.status || '') || null
      }
      current.trackedMinutes += getTrackedMinutes(ticket)
      current.lastMovement = Math.max(current.lastMovement, getLastMovementAt(ticket))
      ticketsByMachineId.get(matchedMachineId)?.push(ticket)
    })

    ticketsByMachineId.forEach((items) => {
      items.sort((a, b) => getLastMovementAt(b) - getLastMovementAt(a))
    })

    return {
      machineStatsById: entries,
      ticketsByMachineId,
    }
  }, [machines, tickets])

  const machineTickets = useMemo(() => {
    if (!selectedMachine) return []
    return machineDataIndex.ticketsByMachineId.get(selectedMachine.id) || []
  }, [machineDataIndex, selectedMachine])

  const machineStats = useMemo(() => {
    if (!selectedMachine) {
      return {
        total: 0,
        openCount: 0,
        pendingValidation: 0,
        openStatus: null as string | null,
        trackedMinutes: 0,
        lastMovement: 0,
      }
    }
    return (
      machineDataIndex.machineStatsById.get(selectedMachine.id) || {
        total: 0,
        openCount: 0,
        pendingValidation: 0,
        openStatus: null as string | null,
        trackedMinutes: 0,
        lastMovement: 0,
      }
    )
  }, [machineDataIndex.machineStatsById, selectedMachine])

  const saveMachine = async () => {
    setSaving(true)
    try {
      const selectedSupplier = suppliers.find((item) => item.id === machineForm.supplierId)
      const payload = {
        ...machineForm,
        supplierName: selectedSupplier?.name || '',
      }
      const url = machineForm.id
        ? `/api/maintenance/data/machines/${encodeURIComponent(machineForm.id)}`
        : '/api/maintenance/data/machines'
      const method = machineForm.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('save_failed')
      await loadMachinesData()
    } finally {
      setSaving(false)
    }
  }

  const saveSupplier = async () => {
    setSaving(true)
    try {
      const url = supplierForm.id
        ? `/api/maintenance/data/suppliers/${encodeURIComponent(supplierForm.id)}`
        : '/api/maintenance/data/suppliers'
      const method = supplierForm.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierForm),
      })
      if (!res.ok) throw new Error('save_failed')
      setSupplierForm(emptySupplier)
      await loadSuppliersData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
        <ModuleHeader title="Manteniment" subtitle="Dades" mainHref="/menu/manteniment" />

        {tab !== 'preventives' ? (
          <MaintenanceToolbar
            rightSlot={
              <div className="flex w-full items-center justify-end gap-2">
                <div className="relative w-full max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={tab === 'machines' ? machineSearch : supplierSearch}
                    onChange={(e) => {
                      if (tab === 'machines') {
                        setMachineSearch(e.target.value)
                      } else {
                        setSupplierSearch(e.target.value)
                      }
                    }}
                    placeholder={
                      tab === 'machines'
                        ? 'Cerca codi, nom o ubicacio...'
                        : 'Cerca nom, email o especialitat...'
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900"
                  />
                  {(tab === 'machines' ? machineSearch : supplierSearch).trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (tab === 'machines') {
                          setMachineSearch('')
                        } else {
                          setSupplierSearch('')
                        }
                      }}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Netejar cerca"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            }
          />
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => setTab('machines')}
            className={`rounded-2xl border p-4 text-left ${
              tab === 'machines'
                ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-100'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-cyan-700 shadow">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Maquinaria</div>
                <div className="text-xs text-gray-500">Fitxa d&apos;actiu i historial de tickets</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('preventives')}
            className={`rounded-2xl border p-4 text-left ${
              tab === 'preventives'
                ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-violet-700 shadow">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Preventius</div>
                <div className="text-xs text-gray-500">Plantilles, plans i checklists</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('suppliers')}
            className={`rounded-2xl border p-4 text-left ${
              tab === 'suppliers'
                ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-amber-700 shadow">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Proveidors</div>
                <div className="text-xs text-gray-500">Contactes externs de suport</div>
              </div>
            </div>
          </button>
        </div>

        {tab === 'machines' ? (
          <MachinesPanel
            loading={loading}
            saving={saving}
            filteredMachines={filteredMachines}
            suppliers={suppliers}
            selectedMachine={selectedMachine}
            selectedMachineId={selectedMachineId}
            machineForm={machineForm}
            machineStats={machineStats}
            machineStatsById={machineDataIndex.machineStatsById}
            onSelectMachine={(machine) => {
              setSelectedMachineId(machine.id)
              setMachineForm(buildMachineForm(machine))
            }}
            onMachineFormChange={(updater) => setMachineForm((prev) => updater(prev))}
            onResetMachine={() => {
              setSelectedMachineId(null)
              setMachineForm(emptyMachine)
            }}
            onSaveMachine={() => void saveMachine()}
          />
        ) : tab === 'preventives' ? (
          <PreventiusTemplatesContent embedded hideFab />
        ) : (
          <SuppliersPanel
            filteredSuppliers={filteredSuppliers}
            supplierForm={supplierForm}
            loading={loading}
            saving={saving}
            onSelectSupplier={(supplier) =>
              setSupplierForm({
                id: supplier.id,
                name: supplier.name || '',
                email: supplier.email || '',
                phone: supplier.phone || '',
                specialty: supplier.specialty || '',
                notes: supplier.notes || '',
                active: supplier.active !== false,
              })
            }
            onSupplierFormChange={(updater) => setSupplierForm((prev) => updater(prev))}
            onResetSupplier={() => setSupplierForm(emptySupplier)}
            onSaveSupplier={() => void saveSupplier()}
          />
        )}

        <FloatingAddButton
          onClick={() => {
            if (tab === 'machines') {
              setSelectedMachineId(null)
              setMachineForm(emptyMachine)
              return
            }
            if (tab === 'preventives') {
              const url = `/menu/manteniment/preventius/plantilles/new`
              const win = window.open(url, '_blank', 'noopener')
              if (win) win.opener = null
              return
            }
            setSupplierForm(emptySupplier)
          }}
        />
      </div>
    </RoleGuard>
  )
}
