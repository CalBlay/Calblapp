'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, ClipboardList, Factory, Search, Truck, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import FloatingAddButton from '@/components/ui/floating-add-button'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'
import MaintenancePermissionGate from '../components/MaintenancePermissionGate'
import MachinesPanel from './components/MachinesPanel'
import SuppliersPanel from './components/SuppliersPanel'
import CentersPanel from './components/CentersPanel'
import ResolutionCategoriesPanel from './components/ResolutionCategoriesPanel'
import { PreventiusTemplatesContent } from '../preventius/plantilles/page'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import {
  buildMachineForm,
  getLastMovementAt,
  getTrackedMinutes,
  normalizeText,
} from './utils'
import {
  emptyMachine,
  emptyResolutionCategory,
  emptySupplier,
  type CenterRow,
  type MachineListStats,
  type MachineRow,
  type MachineView,
  type ResolutionCategoryRow,
  type ResolutionCategoryView,
  type SupplierRow,
} from './types'
import { parseFetchJson } from '@/lib/parseFetchJson'

export default function MaintenanceDataPage() {
  const { setContent } = useFilters()
  const [tab, setTab] = useState<'machines' | 'preventives' | 'suppliers' | 'centers' | 'resolutionCategories'>('machines')
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [resolutionCategories, setResolutionCategories] = useState<ResolutionCategoryRow[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [machineForm, setMachineForm] = useState<MachineView>(emptyMachine)
  const [supplierForm, setSupplierForm] = useState(emptySupplier)
  const [resolutionCategoryForm, setResolutionCategoryForm] =
    useState<ResolutionCategoryView>(emptyResolutionCategory)
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [machineSearch, setMachineSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [resolutionCategorySearch, setResolutionCategorySearch] = useState('')
  const [centerSearch, setCenterSearch] = useState('')
  const [centerTipusFilter, setCenterTipusFilter] = useState<'all' | 'propi' | 'extern'>('all')
  const [centers, setCenters] = useState<CenterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadedTabs, setLoadedTabs] = useState({
    machines: false,
    suppliers: false,
    centers: false,
    resolutionCategories: false,
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

  const loadCentersData = async () => {
    try {
      setLoading(true)
      const centersRes = await fetch('/api/maintenance/data/centers', { cache: 'no-store' })
      const centersJson = await parseFetchJson(centersRes, { centers: [] as CenterRow[] })
      setCenters(Array.isArray(centersJson?.centers) ? centersJson.centers : [])
      setLoadedTabs((current) => ({ ...current, centers: true }))
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

  const loadResolutionCategoriesData = async () => {
    try {
      setLoading(true)
      const categoriesRes = await fetch('/api/maintenance/data/resolution-categories', {
        cache: 'no-store',
      })
      const categoriesJson = await parseFetchJson(categoriesRes, {
        categories: [] as ResolutionCategoryRow[],
      })
      setResolutionCategories(
        Array.isArray(categoriesJson?.categories) ? categoriesJson.categories : []
      )
      setLoadedTabs((current) => ({ ...current, resolutionCategories: true }))
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
    if (tab === 'resolutionCategories' && !loadedTabs.resolutionCategories) {
      void loadResolutionCategoriesData()
    }
  }, [loadedTabs.machines, loadedTabs.resolutionCategories, loadedTabs.suppliers, tab])

  useEffect(() => {
    if (tab === 'centers' && !loadedTabs.centers) {
      void loadCentersData()
    }
  }, [loadedTabs.centers, tab])

  const filteredCenters = useMemo(() => {
    const q = normalizeText(centerSearch)
    return centers.filter((row) => {
      if (centerTipusFilter !== 'all' && row.tipus !== centerTipusFilter) return false
      if (!q) return true
      return normalizeText([row.name, row.code].join(' ')).includes(q)
    })
  }, [centerSearch, centerTipusFilter, centers])

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

  const filteredResolutionCategories = useMemo(() => {
    const q = resolutionCategorySearch.trim().toLowerCase()
    if (!q) return resolutionCategories
    return resolutionCategories.filter((item) => item.name.toLowerCase().includes(q))
  }, [resolutionCategories, resolutionCategorySearch])

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

  const saveResolutionCategory = async () => {
    setSaving(true)
    try {
      const url = resolutionCategoryForm.id
        ? `/api/maintenance/data/resolution-categories/${encodeURIComponent(resolutionCategoryForm.id)}`
        : '/api/maintenance/data/resolution-categories'
      const method = resolutionCategoryForm.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolutionCategoryForm),
      })
      if (!res.ok) throw new Error('save_failed')
      setResolutionCategoryForm(emptyResolutionCategory)
      await loadResolutionCategoriesData()
    } finally {
      setSaving(false)
    }
  }

  const deleteResolutionCategory = async () => {
    if (!resolutionCategoryForm.id) return
    if (!window.confirm(`Eliminar la categoria «${resolutionCategoryForm.name || 'sense nom'}»?`)) {
      return
    }

    setSaving(true)
    try {
      const res = await fetch(
        `/api/maintenance/data/resolution-categories/${encodeURIComponent(resolutionCategoryForm.id)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('delete_failed')
      setResolutionCategoryForm(emptyResolutionCategory)
      await loadResolutionCategoriesData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <MaintenancePermissionGate path="/menu/manteniment/dades">
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
        <ModuleHeader title="Manteniment" subtitle="Dades" mainHref="/menu/manteniment" />

        {tab !== 'preventives' && tab !== 'centers' ? (
          <MaintenanceToolbar
            rightSlot={
              <div className="flex w-full items-center justify-end gap-2">
                <div className="relative w-full max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={
                      tab === 'machines'
                        ? machineSearch
                        : tab === 'suppliers'
                          ? supplierSearch
                          : resolutionCategorySearch
                    }
                    onChange={(e) => {
                      if (tab === 'machines') {
                        setMachineSearch(e.target.value)
                      } else if (tab === 'suppliers') {
                        setSupplierSearch(e.target.value)
                      } else {
                        setResolutionCategorySearch(e.target.value)
                      }
                    }}
                    placeholder={
                      tab === 'machines'
                        ? 'Cerca codi, nom o ubicacio...'
                        : tab === 'suppliers'
                          ? 'Cerca nom, email o especialitat...'
                          : 'Cerca categories de resolucio...'
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900"
                  />
                  {(
                    tab === 'machines'
                      ? machineSearch
                      : tab === 'suppliers'
                        ? supplierSearch
                        : resolutionCategorySearch
                  ).trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (tab === 'machines') {
                          setMachineSearch('')
                        } else if (tab === 'suppliers') {
                          setSupplierSearch('')
                        } else {
                          setResolutionCategorySearch('')
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

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <button
            type="button"
            onClick={() => setTab('machines')}
            className={`rounded-2xl border p-3 text-left ${
              tab === 'machines'
                ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-100'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow">
                <Factory className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Maquinaria</div>
                <div className="text-xs text-gray-500">Fitxa d&apos;actiu i historial de tickets</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('preventives')}
            className={`rounded-2xl border p-3 text-left ${
              tab === 'preventives'
                ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Preventius</div>
                <div className="text-xs text-gray-500">Plantilles, plans i checklists</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('suppliers')}
            className={`rounded-2xl border p-3 text-left ${
              tab === 'suppliers'
                ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 shadow">
                <Truck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Proveidors</div>
                <div className="text-xs text-gray-500">Contactes externs de suport</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('centers')}
            className={`rounded-2xl border p-3 text-left ${
              tab === 'centers'
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Centres</div>
                <div className="text-xs text-gray-500">Temps de desplaçament per finca</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('resolutionCategories')}
            className={`rounded-2xl border p-3 text-left ${
              tab === 'resolutionCategories'
                ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50'
                : 'bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-rose-700 shadow">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Resolucions</div>
                <div className="text-xs text-gray-500">Categories de tancament dels tickets</div>
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
        ) : tab === 'centers' ? (
          <>
            <MaintenanceToolbar
              rightSlot={
                <div className="relative w-full max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={centerSearch}
                    onChange={(e) => setCenterSearch(e.target.value)}
                    placeholder="Cerca nom o codi de finca..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900"
                  />
                  {centerSearch.trim() ? (
                    <button
                      type="button"
                      onClick={() => setCenterSearch('')}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Netejar cerca"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              }
            />
            <CentersPanel
              centers={filteredCenters}
              allCentersForCounts={centers}
              loading={loading}
              tipusFilter={centerTipusFilter}
              onTipusFilterChange={setCenterTipusFilter}
              onSaved={(id, travelMinutes) => {
                setCenters((prev) =>
                  prev.map((row) => (row.id === id ? { ...row, travelMinutes } : row))
                )
              }}
            />
          </>
        ) : tab === 'suppliers' ? (
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
                supplierDepartments:
                  supplier.supplierDepartments?.length &&
                  supplier.supplierDepartments.some(Boolean)
                    ? [...supplier.supplierDepartments]
                    : ['Manteniment'],
              })
            }
            onSupplierFormChange={(updater) => setSupplierForm((prev) => updater(prev))}
            onResetSupplier={() => setSupplierForm(emptySupplier)}
            onSaveSupplier={() => void saveSupplier()}
          />
        ) : (
          <ResolutionCategoriesPanel
            filteredCategories={filteredResolutionCategories}
            categoryForm={resolutionCategoryForm}
            loading={loading}
            saving={saving}
            onSelectCategory={(category) =>
              setResolutionCategoryForm({
                id: category.id,
                name: category.name || '',
                active: category.active !== false,
              })
            }
            onCategoryFormChange={(updater) => setResolutionCategoryForm((prev) => updater(prev))}
            onSaveCategory={() => void saveResolutionCategory()}
            onDeleteCategory={() => void deleteResolutionCategory()}
          />
        )}

        {tab !== 'centers' ? (
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
            if (tab === 'suppliers') {
              setSupplierForm(emptySupplier)
              return
            }
            setResolutionCategoryForm(emptyResolutionCategory)
          }}
        />
        ) : null}
      </div>
    </MaintenancePermissionGate>
  )
}
