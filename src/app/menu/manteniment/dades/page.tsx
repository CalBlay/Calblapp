'use client'

import { useEffect, useMemo, useState } from 'react'
import { Database, Factory, Truck } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { RoleGuard } from '@/lib/withRoleGuard'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'

type MachineRow = {
  id: string
  code: string
  name: string
  label: string
  location?: string
  brand?: string
  model?: string
  serialNumber?: string
  supplierId?: string
  supplierName?: string
  active?: boolean
}

type SupplierRow = {
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  notes?: string
  active?: boolean
}

const emptyMachine = {
  id: '',
  code: '',
  name: '',
  location: '',
  brand: '',
  model: '',
  serialNumber: '',
  supplierId: '',
  supplierName: '',
  active: true,
}

const emptySupplier = {
  id: '',
  name: '',
  email: '',
  phone: '',
  specialty: '',
  notes: '',
  active: true,
}

export default function MaintenanceDataPage() {
  const { setContent } = useFilters()
  const [tab, setTab] = useState<'machines' | 'suppliers'>('machines')
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [machineForm, setMachineForm] = useState(emptyMachine)
  const [supplierForm, setSupplierForm] = useState(emptySupplier)
  const [machineSearch, setMachineSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [machinesRes, suppliersRes] = await Promise.all([
        fetch('/api/maintenance/data/machines', { cache: 'no-store' }),
        fetch('/api/maintenance/data/suppliers', { cache: 'no-store' }),
      ])
      const machinesJson = machinesRes.ok ? await machinesRes.json() : { machines: [] }
      const suppliersJson = suppliersRes.ok ? await suppliersRes.json() : { suppliers: [] }
      setMachines(Array.isArray(machinesJson?.machines) ? machinesJson.machines : [])
      setSuppliers(Array.isArray(suppliersJson?.suppliers) ? suppliersJson.suppliers : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    setContent(
      <div className="space-y-4 p-4">
        {tab === 'machines' ? (
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Cerca maquinaria</span>
            <input
              value={machineSearch}
              onChange={(e) => setMachineSearch(e.target.value)}
              placeholder="Cerca codi, nom o ubicacio..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            />
          </label>
        ) : (
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Cerca proveidor</span>
            <input
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Cerca nom, email o especialitat..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            />
          </label>
        )}

        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              setMachineSearch('')
              setSupplierSearch('')
            }}
          />
        </div>
      </div>
    )
  }, [machineSearch, setContent, supplierSearch, tab])

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
      setMachineForm(emptyMachine)
      await loadData()
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
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
        <ModuleHeader title="Manteniment" subtitle="Dades" mainHref="/menu/manteniment" />

        <MaintenanceToolbar
          onOpenFilters={() => undefined}
          rightSlot={
            tab === 'machines' ? (
              machineSearch.trim() ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Cerca maquinaria activa
                </span>
              ) : null
            ) : supplierSearch.trim() ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Cerca proveidor activa
              </span>
            ) : null
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow text-cyan-700">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Maquinaria</div>
                <div className="text-xs text-gray-500">Actius i equips de manteniment</div>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow text-amber-700">
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
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
            <section className="rounded-2xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-500" />
                  <div className="text-sm font-semibold text-slate-900">
                    Llistat de maquinaria
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {loading ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                    Carregant maquinaria...
                  </div>
                ) : filteredMachines.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                    Encara no hi ha maquinaria desada.
                  </div>
                ) : (
                  filteredMachines.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setMachineForm({
                          id: item.id,
                          code: item.code || '',
                          name: item.name || '',
                          location: item.location || '',
                          brand: item.brand || '',
                          model: item.model || '',
                          serialNumber: item.serialNumber || '',
                          supplierId: item.supplierId || '',
                          supplierName: item.supplierName || '',
                          active: item.active !== false,
                        })
                      }
                      className="w-full rounded-2xl border px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {item.code ? `${item.code} · ` : ''}
                            {item.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {[item.location, item.brand, item.model].filter(Boolean).join(' · ') ||
                              'Sense dades extra'}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.active !== false
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.active !== false ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">
                {machineForm.id ? 'Editar maquina' : 'Nova maquina'}
              </div>
              <div className="grid gap-3">
                <input value={machineForm.code} onChange={(e) => setMachineForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="Codi" className="h-11 rounded-2xl border px-4" />
                <input value={machineForm.name} onChange={(e) => setMachineForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nom" className="h-11 rounded-2xl border px-4" />
                <input value={machineForm.location} onChange={(e) => setMachineForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Ubicacio" className="h-11 rounded-2xl border px-4" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={machineForm.brand} onChange={(e) => setMachineForm((prev) => ({ ...prev, brand: e.target.value }))} placeholder="Marca" className="h-11 rounded-2xl border px-4" />
                  <input value={machineForm.model} onChange={(e) => setMachineForm((prev) => ({ ...prev, model: e.target.value }))} placeholder="Model" className="h-11 rounded-2xl border px-4" />
                </div>
                <input value={machineForm.serialNumber} onChange={(e) => setMachineForm((prev) => ({ ...prev, serialNumber: e.target.value }))} placeholder="Numero serie" className="h-11 rounded-2xl border px-4" />
                <select value={machineForm.supplierId} onChange={(e) => setMachineForm((prev) => ({ ...prev, supplierId: e.target.value }))} className="h-11 rounded-2xl border px-4">
                  <option value="">Sense proveidor assignat</option>
                  {suppliers.filter((item) => item.active !== false).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={machineForm.active} onChange={(e) => setMachineForm((prev) => ({ ...prev, active: e.target.checked }))} />
                  Activa
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setMachineForm(emptyMachine)} className="min-h-[44px] rounded-full border px-4 text-sm">Netejar</button>
                  <button type="button" disabled={saving} onClick={() => void saveMachine()} className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? 'Desant...' : machineForm.id ? 'Guardar canvis' : 'Crear maquina'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <section className="rounded-2xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Llistat de proveidors</div>
              </div>
              <div className="space-y-2">
                {loading ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                    Carregant proveidors...
                  </div>
                ) : filteredSuppliers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                    Encara no hi ha proveidors desats.
                  </div>
                ) : (
                  filteredSuppliers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setSupplierForm({
                          id: item.id,
                          name: item.name || '',
                          email: item.email || '',
                          phone: item.phone || '',
                          specialty: item.specialty || '',
                          notes: item.notes || '',
                          active: item.active !== false,
                        })
                      }
                      className="w-full rounded-2xl border px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {[item.email, item.phone, item.specialty].filter(Boolean).join(' · ') ||
                              'Sense dades extra'}
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {item.active !== false ? 'Actiu' : 'Inactiu'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">
                {supplierForm.id ? 'Editar proveidor' : 'Nou proveidor'}
              </div>
              <div className="grid gap-3">
                <input value={supplierForm.name} onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nom" className="h-11 rounded-2xl border px-4" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={supplierForm.email} onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="h-11 rounded-2xl border px-4" />
                  <input value={supplierForm.phone} onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Telefon" className="h-11 rounded-2xl border px-4" />
                </div>
                <input value={supplierForm.specialty} onChange={(e) => setSupplierForm((prev) => ({ ...prev, specialty: e.target.value }))} placeholder="Especialitat" className="h-11 rounded-2xl border px-4" />
                <textarea value={supplierForm.notes} onChange={(e) => setSupplierForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" className="min-h-[120px] rounded-2xl border px-4 py-3" />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={supplierForm.active} onChange={(e) => setSupplierForm((prev) => ({ ...prev, active: e.target.checked }))} />
                  Actiu
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setSupplierForm(emptySupplier)} className="min-h-[44px] rounded-full border px-4 text-sm">Netejar</button>
                  <button type="button" disabled={saving} onClick={() => void saveSupplier()} className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? 'Desant...' : supplierForm.id ? 'Guardar canvis' : 'Crear proveidor'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
