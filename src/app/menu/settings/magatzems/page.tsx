'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Package, Plus, Shield, Trash2, Users } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MotionDiv } from '@/lib/lazyMotion'
import { normalizeDepartmentLabel } from '@/data/departments'
import { normalizeRole } from '@/lib/roles'
import { useSession } from 'next-auth/react'

type Warehouse = {
  id: string
  code: string
  name: string
  isActive: boolean
}

type AssignmentUser = {
  id: string
  name: string
  email?: string
  role?: string
  department?: string
}

type WarehouseMember = {
  userId: string
  userName: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const DEFAULT_WAREHOUSE_DEPT_KEYS = new Set([
  normalizeDepartmentLabel('Logistica'),
  normalizeDepartmentLabel('Produccio'),
  normalizeDepartmentLabel('Cuina Central'),
])

const isDefaultWarehouseDeptUser = (user: AssignmentUser) =>
  DEFAULT_WAREHOUSE_DEPT_KEYS.has(normalizeDepartmentLabel(user.department))

export default function EventComandaMagatzemsPage() {
  const { data: session } = useSession()
  const role = normalizeRole(session?.user?.role)
  const isAdmin = role === 'admin' || role === 'direccio'

  const { data, mutate, isLoading } = useSWR<{ warehouses?: Warehouse[] }>(
    isAdmin ? '/api/event-comanda/warehouses' : null,
    fetcher
  )
  const warehouses = useMemo(() => data?.warehouses ?? [], [data?.warehouses])

  const { data: usersData } = useSWR<{ users?: AssignmentUser[] }>(
    isAdmin ? '/api/event-comanda/assignment-users' : null,
    fetcher
  )
  const assignmentUsers = usersData?.users ?? []

  const { data: membersData, mutate: refreshMembers } = useSWR<{
    membersByWarehouse?: Record<string, WarehouseMember[]>
  }>(isAdmin ? '/api/event-comanda/warehouse-members' : null, fetcher)

  const [membersByWarehouse, setMembersByWarehouse] = useState<Record<string, string[]>>({})
  const [showAllDepartments, setShowAllDepartments] = useState(false)

  useEffect(() => {
    const raw = membersData?.membersByWarehouse ?? {}
    const next: Record<string, string[]> = {}
    for (const [warehouseId, members] of Object.entries(raw)) {
      next[warehouseId] = members.map((member) => member.userId)
    }
    setMembersByWarehouse(next)
  }, [membersData?.membersByWarehouse])

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const createWarehouse = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/event-comanda/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant magatzem'))
      setCode('')
      setName('')
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creant magatzem')
    } finally {
      setBusy(false)
    }
  }

  const updateWarehouse = async (warehouse: Warehouse, patch: Partial<Warehouse>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/event-comanda/warehouses/${encodeURIComponent(warehouse.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant magatzem'))
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualitzant magatzem')
    } finally {
      setBusy(false)
    }
  }

  const deleteWarehouse = async (warehouse: Warehouse) => {
    if (!window.confirm(`Eliminar el magatzem ${warehouse.code}?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/event-comanda/warehouses/${encodeURIComponent(warehouse.id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error eliminant magatzem'))
      await mutate()
      await refreshMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminant magatzem')
    } finally {
      setBusy(false)
    }
  }

  const saveWarehouseMembers = async (warehouseId: string, memberIds: string[]) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/api/event-comanda/warehouses/${encodeURIComponent(warehouseId)}/members`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberIds }),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error desant equip'))
      setMembersByWarehouse((prev) => ({ ...prev, [warehouseId]: memberIds }))
      await refreshMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desant equip')
      throw e
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return <p className="p-4 text-sm text-red-600">No tens permís per accedir a aquesta pàgina.</p>
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-4 pb-8 lg:px-6 xl:px-8">
      <ModuleHeader
        icon={<Shield className="h-6 w-6 text-slate-700" />}
        mainHref="/menu/settings"
      />

      <p className="text-sm text-slate-600">
        Codi, nom i equip responsable de cada magatzem. Els usuaris assignats només veuen les comandes
        del seu magatzem; admin i direcció veuen tot.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <MotionDiv
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow"
      >
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-lg">Nou magatzem</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Codi</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MAG" />
          </div>
          <div className="sm:col-span-1 lg:col-span-2">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Magatzem central" />
          </div>
          <div className="flex items-end justify-end">
            <Button
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={busy || !code.trim() || !name.trim()}
              onClick={() => void createWarehouse()}
            >
              <Plus className="h-4 w-4" />
              Afegir
            </Button>
          </div>
        </div>
      </MotionDiv>

      <MotionDiv
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h2 className="font-semibold">Llista de magatzems</h2>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showAllDepartments}
              onChange={(e) => setShowAllDepartments(e.target.checked)}
            />
            Mostrar usuaris de tots els departaments
          </label>
        </div>
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Carregant…</p>
        ) : warehouses.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Encara no hi ha magatzems.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[4.5rem]" />
                <col className="w-[18%]" />
                <col className="w-[4.5rem]" />
                <col className="w-[38%]" />
                <col className="w-[5.5rem]" />
              </colgroup>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Codi</th>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Actiu</th>
                  <th className="px-3 py-2">Equip</th>
                  <th className="px-3 py-2 text-right">Accions</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((warehouse) => (
                  <WarehouseRow
                    key={warehouse.id}
                    warehouse={warehouse}
                    busy={busy}
                    assignmentUsers={assignmentUsers}
                    memberIds={membersByWarehouse[warehouse.id] ?? []}
                    showAllDepartments={showAllDepartments}
                    onSave={(patch) => void updateWarehouse(warehouse, patch)}
                    onDelete={() => void deleteWarehouse(warehouse)}
                    onSaveMembers={(memberIds) => saveWarehouseMembers(warehouse.id, memberIds)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MotionDiv>
    </div>
  )
}

function WarehouseRow({
  warehouse,
  busy,
  assignmentUsers,
  memberIds,
  showAllDepartments,
  onSave,
  onDelete,
  onSaveMembers,
}: {
  warehouse: Warehouse
  busy: boolean
  assignmentUsers: AssignmentUser[]
  memberIds: string[]
  showAllDepartments: boolean
  onSave: (patch: Partial<Warehouse>) => void
  onDelete: () => void
  onSaveMembers: (memberIds: string[]) => Promise<void>
}) {
  const [name, setName] = useState(warehouse.name)
  const dirtyName = name.trim() !== warehouse.name

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 align-middle font-mono text-xs">{warehouse.code}</td>
      <td className="px-3 py-2 align-middle">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </td>
      <td className="px-3 py-2 align-middle">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={warehouse.isActive}
            disabled={busy}
            onChange={(e) => onSave({ isActive: e.target.checked })}
          />
          <span className="text-xs text-slate-600">{warehouse.isActive ? 'Sí' : 'No'}</span>
        </label>
      </td>
      <td className="px-3 py-2 align-middle">
        <WarehouseMemberPicker
          warehouse={warehouse}
          busy={busy}
          assignmentUsers={assignmentUsers}
          memberIds={memberIds}
          showAllDepartments={showAllDepartments}
          onSaveMembers={onSaveMembers}
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex justify-end gap-2">
          {dirtyName ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave({ name: name.trim() })}>
              Desar
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function WarehouseMemberPicker({
  warehouse,
  busy,
  assignmentUsers,
  memberIds,
  showAllDepartments,
  onSaveMembers,
}: {
  warehouse: Warehouse
  busy: boolean
  assignmentUsers: AssignmentUser[]
  memberIds: string[]
  showAllDepartments: boolean
  onSaveMembers: (memberIds: string[]) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draftIds, setDraftIds] = useState<string[]>(memberIds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraftIds(memberIds)
  }, [open, memberIds])

  const usersById = useMemo(
    () => new Map(assignmentUsers.map((user) => [user.id, user])),
    [assignmentUsers]
  )

  const pickerUsers = useMemo(() => {
    const assigned = new Set(draftIds)
    const q = query.trim().toLowerCase()
    return assignmentUsers
      .filter((user) => {
        if (!showAllDepartments && !isDefaultWarehouseDeptUser(user) && !assigned.has(user.id)) {
          return false
        }
        if (!q) return true
        const hay = `${user.name} ${user.email || ''} ${user.department || ''}`.toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
  }, [assignmentUsers, draftIds, query, showAllDepartments])

  const assignedUsers = useMemo(
    () =>
      memberIds
        .map((id) => usersById.get(id))
        .filter((user): user is AssignmentUser => user != null),
    [memberIds, usersById]
  )

  const toggleMember = (userId: string) => {
    setDraftIds((prev) => {
      const set = new Set(prev)
      if (set.has(userId)) set.delete(userId)
      else set.add(userId)
      return [...set]
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveMembers(draftIds)
      setOpen(false)
      setQuery('')
    } catch {
      // error handled by parent
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    draftIds.length !== memberIds.length ||
    draftIds.some((id) => !memberIds.includes(id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {assignedUsers.map((user) => (
          <span
            key={user.id}
            className="inline-flex max-w-full items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
            title={user.department ? `${user.name} · ${user.department}` : user.name}
          >
            <span className="truncate">{user.name}</span>
          </span>
        ))}
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            disabled={busy || !warehouse.isActive}
          >
            <Users className="h-3 w-3 text-emerald-600" />
            {assignedUsers.length === 0 ? 'Afegir equip' : 'Editar'}
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-slate-100 px-3 py-2">
          <p className="text-sm font-medium text-slate-900">
            {warehouse.code} · {warehouse.name}
          </p>
          <p className="text-xs text-slate-500">
            Pots assignar <strong>diversos usuaris</strong> a aquest magatzem. Per defecte:
            Logística, Producció i Cuina Central.
          </p>
        </div>
        <div className="border-b border-slate-100 px-3 py-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca usuari…"
            className="h-8"
          />
        </div>
        <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
          {pickerUsers.length === 0 ? (
            <li className="px-3 py-4 text-sm text-slate-500">Cap usuari trobat.</li>
          ) : (
            pickerUsers.map((user) => (
              <li key={user.id}>
                <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draftIds.includes(user.id)}
                    disabled={busy || saving}
                    onChange={() => toggleMember(user.id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{user.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[user.department, user.role].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
          <span className="text-xs text-slate-500">
            {draftIds.length}{' '}
            {draftIds.length === 1 ? 'usuari assignat' : 'usuaris assignats'}
          </span>
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={busy || saving || !dirty}
            onClick={() => void handleSave()}
          >
            {saving ? 'Desant…' : 'Desar'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
