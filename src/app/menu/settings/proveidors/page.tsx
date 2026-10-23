'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Pencil, Search, Shield, Trash2, Truck } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  SETTINGS_SUPPLIERS_PATH,
  canEditSettingsSubpath,
  canViewSettingsSubpath,
} from '@/lib/settingsPermissions'

type SupplierSource = 'manteniment' | 'roba'
type SourceFilter = 'tots' | SupplierSource

type SettingsSupplier = {
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  notes?: string
  active?: boolean
  source: SupplierSource
  sourceLabel: string
}

type SupplierForm = {
  name: string
  email: string
  phone: string
  specialty: string
  notes: string
  active: boolean
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(body?.error || 'Error carregant els proveïdors'))
  return body as { suppliers?: SettingsSupplier[] }
}

const normalize = (value?: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const supplierKey = (supplier: SettingsSupplier) => `${supplier.source}:${supplier.id}`

export default function SettingsSuppliersPage() {
  const { ready: permissionsReady, canViewPath, canEditPath } = useUiPermissions()
  const canView = canViewSettingsSubpath(canViewPath, SETTINGS_SUPPLIERS_PATH)
  const canEdit = canEditSettingsSubpath(canEditPath, SETTINGS_SUPPLIERS_PATH)
  const { data, error: loadError, isLoading, mutate } = useSWR(
    permissionsReady && canView ? '/api/settings/suppliers' : null,
    fetcher
  )

  const suppliers = useMemo(() => data?.suppliers ?? [], [data?.suppliers])
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('tots')
  const [query, setQuery] = useState('')
  const [editSupplier, setEditSupplier] = useState<SettingsSupplier | null>(null)
  const [editForm, setEditForm] = useState<SupplierForm>({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    notes: '',
    active: true,
  })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const counts = useMemo(
    () => ({
      tots: suppliers.length,
      manteniment: suppliers.filter((supplier) => supplier.source === 'manteniment').length,
      roba: suppliers.filter((supplier) => supplier.source === 'roba').length,
    }),
    [suppliers]
  )

  const filteredSuppliers = useMemo(() => {
    const needle = normalize(query)
    return suppliers.filter((supplier) => {
      if (sourceFilter !== 'tots' && supplier.source !== sourceFilter) return false
      if (!needle) return true
      return normalize(
        [supplier.name, supplier.email, supplier.phone, supplier.specialty].filter(Boolean).join(' ')
      ).includes(needle)
    })
  }, [query, sourceFilter, suppliers])

  const openEdit = (supplier: SettingsSupplier) => {
    setActionError('')
    setEditSupplier(supplier)
    setEditForm({
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      specialty: supplier.specialty || '',
      notes: supplier.notes || '',
      active: supplier.active !== false,
    })
  }

  const saveEdit = async () => {
    if (!editSupplier || !editForm.name.trim()) return
    const key = supplierKey(editSupplier)
    setBusyKey(key)
    setActionError('')
    try {
      const response = await fetch(
        `/api/settings/suppliers/${editSupplier.source}/${encodeURIComponent(editSupplier.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(body?.error || 'Error actualitzant el proveïdor'))
      await mutate()
      setEditSupplier(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Error actualitzant el proveïdor')
    } finally {
      setBusyKey(null)
    }
  }

  const deleteSupplier = async (supplier: SettingsSupplier) => {
    if (!window.confirm(`Eliminar el proveïdor «${supplier.name}» de ${supplier.sourceLabel}?`)) {
      return
    }
    const key = supplierKey(supplier)
    setBusyKey(key)
    setActionError('')
    try {
      const response = await fetch(
        `/api/settings/suppliers/${supplier.source}/${encodeURIComponent(supplier.id)}`,
        { method: 'DELETE' }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(body?.error || 'Error eliminant el proveïdor'))
      await mutate()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Error eliminant el proveïdor')
    } finally {
      setBusyKey(null)
    }
  }

  if (!permissionsReady) {
    return <p className="p-4 text-sm text-slate-500">Carregant…</p>
  }
  if (!canView) {
    return <p className="p-4 text-sm text-red-600">No tens permís per accedir a aquesta pàgina.</p>
  }

  const visibleError = actionError || (loadError instanceof Error ? loadError.message : '')

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-4 pb-8 lg:px-6 xl:px-8">
      <ModuleHeader
        icon={<Shield className="h-6 w-6 text-slate-700" />}
        mainHref="/menu/settings"
      />

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <Truck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h1 className="font-semibold text-slate-900">Proveïdors</h1>
          <p className="text-sm text-slate-600">
            Vista conjunta dels dos catàlegs independents. Cada canvi s’aplica només al mòdul indicat
            a la columna Origen.
          </p>
        </div>
      </div>

      {visibleError ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {visibleError}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Filtrar per origen">
            {(
              [
                ['tots', 'Tots', counts.tots],
                ['manteniment', 'Manteniment', counts.manteniment],
                ['roba', 'Roba personal (RRHH)', counts.roba],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sourceFilter === value}
                onClick={() => setSourceFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  sourceFilter === value
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label} · {count}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Cercar proveïdors"
              placeholder="Cerca nom, correu, telèfon…"
              className="h-9 pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="px-4 py-8 text-sm text-slate-500">Carregant proveïdors…</p>
        ) : filteredSuppliers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500">No hi ha proveïdors amb aquests filtres.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Proveïdor</th>
                  <th className="px-4 py-3 font-semibold">Origen</th>
                  <th className="px-4 py-3 font-semibold">Contacte</th>
                  <th className="px-4 py-3 font-semibold">Especialitat</th>
                  <th className="px-4 py-3 font-semibold">Estat</th>
                  <th className="px-4 py-3 text-right font-semibold">Accions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((supplier) => {
                  const key = supplierKey(supplier)
                  const rowBusy = busyKey === key
                  return (
                    <tr key={key} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{supplier.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            supplier.source === 'manteniment'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {supplier.sourceLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {[supplier.email, supplier.phone].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{supplier.specialty || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            supplier.active !== false
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {supplier.active !== false ? 'Actiu' : 'Inactiu'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!canEdit || rowBusy}
                            aria-label={`Editar ${supplier.name}`}
                            title="Editar proveïdor"
                            onClick={() => openEdit(supplier)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            disabled={!canEdit || rowBusy}
                            aria-label={`Eliminar ${supplier.name}`}
                            title="Eliminar proveïdor"
                            onClick={() => void deleteSupplier(supplier)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(editSupplier)} onOpenChange={(open) => !open && setEditSupplier(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar proveïdor</DialogTitle>
          </DialogHeader>
          {editSupplier ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Origen: {editSupplier.sourceLabel}</p>
              {actionError ? (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </p>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="settings-supplier-name">Nom</Label>
                <Input
                  id="settings-supplier-name"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="settings-supplier-email">Email</Label>
                  <Input
                    id="settings-supplier-email"
                    type="email"
                    value={editForm.email}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="settings-supplier-phone">Telèfon</Label>
                  <Input
                    id="settings-supplier-phone"
                    value={editForm.phone}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="settings-supplier-specialty">Especialitat</Label>
                <Input
                  id="settings-supplier-specialty"
                  value={editForm.specialty}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, specialty: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="settings-supplier-notes">Notes</Label>
                <Input
                  id="settings-supplier-notes"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="settings-supplier-active">Proveïdor actiu</Label>
                <Switch
                  id="settings-supplier-active"
                  checked={editForm.active}
                  onCheckedChange={(active) =>
                    setEditForm((current) => ({ ...current, active }))
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditSupplier(null)}>
              Cancel·lar
            </Button>
            <Button
              type="button"
              disabled={!editForm.name.trim() || Boolean(busyKey)}
              onClick={() => void saveEdit()}
            >
              {busyKey ? 'Desant…' : 'Desar canvis'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
