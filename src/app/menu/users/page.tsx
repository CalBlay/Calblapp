// file: src/app/menu/users/page.tsx
'use client'

import React, { useEffect } from 'react'
import { withAdmin } from '@/hooks/withAdmin'
import { useUsers } from '@/hooks/useUsers'
import { normalizeRole } from '@/lib/roles'

import { Button } from '@/components/ui/button'
import { UserTable } from '@/components/users/UserTable'
import UserFormModal from '@/components/users/UserFormModal'
import { Trash2, UserCog } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import UserFilters, { UserFiltersState } from '@/components/users/UserFilters'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { markAdminUserRequestsRead } from '@/hooks/useAdminNotifications'
import { DEFAULT_USER_DEPARTMENT, DEPARTMENTS } from '@/data/departments'


// 🔥 Model unificat amb UserFormModal (id opcional)
export interface AppUser {
  id?: string
  personId?: string
  name: string
  role: string
  isAdmin?: boolean
  department: string
  commercialName?: string
  phone?: string
  email?: string
  opsChannelsConfigurable?: string[]
  opsEventsConfigurable?: boolean
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  isTransportLead?: boolean

  available?: boolean
  isDriver?: boolean
  workerRank?: string
  opsProjectsConfigurable?: boolean
}

type PendingUserRequest = {
  id: string
  personId?: string
  name?: string
  role?: string
  isAdmin?: boolean
  department?: string
  phone?: string
  email?: string
  available?: boolean
  driver?: { isDriver?: boolean }
  workerRank?: string
}

type RejectRequestResponse = { error?: string }

const normalizeDepartmentLabel = (value?: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .toLowerCase()
    .trim()

const formatRoleLabel = (role?: string, isAdmin?: boolean) => {
  if (isAdmin || normalizeRole(role) === 'admin') return 'Admin'
  switch (normalizeRole(role)) {
    case 'direccio':
      return 'Direcció'
    case 'cap':
      return 'Cap Departament'
    case 'treballador':
      return 'Treballador'
    case 'comercial':
      return 'Comercial'
    case 'observer':
      return 'Observer'
    case 'usuari':
      return 'Usuari'
    default:
      return String(role || '').trim() || '-'
  }
}

const formatDepartmentLabel = (value?: string) => {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const key = normalizeDepartmentLabel(raw)
  const exact = DEPARTMENTS.find((dep) => normalizeDepartmentLabel(dep) === key)
  if (exact) return exact
  if (key.includes('recursos') && key.includes('humans')) return 'Recursos Humans'
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function UsersPage() {
  const { users, loading, saveUser, deleteUser, fetchUsers } = useUsers()

  const [modalUser, setModalUser] = React.useState<AppUser | null>(null)
  const [filters, setFilters] = React.useState<UserFiltersState>({})
  const [pendingRequests, setPendingRequests] = React.useState<PendingUserRequest[]>([])
  const [loadingRequests, setLoadingRequests] = React.useState(false)

  const roleOptions = ['Admin', 'Direcció', 'Cap Departament', 'Treballador', 'Observer']

  const deptOptions = Array.from(
    [...DEPARTMENTS, ...users.map((u) => formatDepartmentLabel(u.department)).filter(Boolean)].reduce((map, department) => {
      const key = normalizeDepartmentLabel(department)
      if (!key || map.has(key)) return map
      map.set(key, department)
      return map
    }, new Map<string, string>()).values(),
  ).sort((a, b) => a.localeCompare(b, 'ca'))

  const loadPendingRequests = React.useCallback(async () => {
    setLoadingRequests(true)
    try {
      const res = await fetch('/api/user-requests?status=pending', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setPendingRequests(Array.isArray(data.items) ? data.items : [])
      }
    } catch (err) {
      console.error('Error carregant sol·licituds:', err)
    } finally {
      setLoadingRequests(false)
    }
  }, [])

  const rejectRequest = React.useCallback(async (personId: string) => {
    const reason = window.prompt('Motiu de rebuig', 'No acceptat') || 'No acceptat'
    try {
      const res = await fetch(`/api/user-requests/${personId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as RejectRequestResponse
        alert(data.error || "No s'ha pogut rebutjar la sol·licitud")
        return
      }
      await loadPendingRequests()
    } catch (err) {
      console.error('Error rebutjant sol·licitud:', err)
    }
  }, [loadPendingRequests])

  useEffect(() => {
    markAdminUserRequestsRead().catch(() => {})
    loadPendingRequests().catch(() => {})
  }, [loadPendingRequests])

  // Aplicar filtres
  const filteredUsers = users.filter((u) => {
    const okDept =
      !filters.department ||
      filters.department === '__all__' ||
      normalizeDepartmentLabel(u.department) === normalizeDepartmentLabel(filters.department)

    const okRole =
      !filters.role ||
      filters.role === '__all__' ||
      formatRoleLabel(u.role, u.isAdmin) === filters.role

    return okDept && okRole
  })

  const displayUsers = filteredUsers.map((u) => ({
    ...u,
    role: formatRoleLabel(u.role, u.isAdmin),
    department: formatDepartmentLabel(u.department),
  }))

  return (
    <div className="p-6 space-y-6">

      {/* Capçalera */}
      <ModuleHeader
        icon={<UserCog className="w-7 h-7 text-indigo-600" />}
        title="Gestió d’Usuaris"
        subtitle="Crea, edita i administra usuaris del sistema"
      />

      {/* Sol·licituds pendents */}
      <div className="rounded-xl bg-white shadow-sm border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm text-gray-700">Sol·licituds pendents</div>
          <Button
            variant="outline"
            onClick={() => loadPendingRequests()}
            className="text-xs"
          >
            Actualitzar
          </Button>
        </div>

        {loadingRequests ? (
          <div className="text-sm text-gray-500">Carregant sol·licituds…</div>
        ) : pendingRequests.length === 0 ? (
          <div className="text-sm text-gray-500">No hi ha sol·licituds pendents</div>
        ) : (
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="text-sm">
                  <div className="font-semibold">{req.name || req.id}</div>
                  <div className="text-xs text-gray-500">
                    {req.department || 'Sense departament'} · {req.role || 'Treballador'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 px-3"
                    aria-label="Rebutjar sol·licitud"
                    onClick={() => rejectRequest(req.personId || req.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    className="bg-indigo-500 hover:bg-indigo-600 text-white"
                    onClick={() => {
                      setModalUser({
                        id: undefined,
                        personId: req.personId || req.id,
                        name: req.name || req.id,
                        role: req.role || 'treballador',
                        isAdmin: Boolean(req.isAdmin),
                        department: req.department || DEFAULT_USER_DEPARTMENT,
                        phone: req.phone,
                        email: req.email,
                        available: req.available,
                        isDriver: req.driver?.isDriver,
                        workerRank: req.workerRank,
                      })
                    }}
                  >
                    Obrir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filtres + CTA */}
      <div className="flex items-center justify-between rounded-xl bg-white shadow-sm border p-4">
        <UserFilters
          filters={filters}
          setFilters={(f) => setFilters((prev) => ({ ...prev, ...f }))}
          departmentOptions={deptOptions}
          roleOptions={roleOptions}
          users={users.map((u) => ({
            ...u,
            role: formatRoleLabel(u.role, u.isAdmin),
            department: formatDepartmentLabel(u.department),
          }))}
        />

   <FloatingAddButton
  onClick={() =>
    setModalUser({
      id: undefined,
      name: '',
      role: 'Treballador',
      isAdmin: false,
      department: DEFAULT_USER_DEPARTMENT,
      phone: '',
      available: true,
      isDriver: false,
    workerRank: 'equip',
    })
  }
/>

      </div>

      {/* Taula */}
      {loading ? (
        <div className="text-center text-gray-500">Carregant usuaris…</div>
      ) : (
        <UserTable
          users={displayUsers}
          onEdit={(u) => {
            const original = users.find((item) => item.id === u.id) || u
            setModalUser(original as AppUser)
          }}
          onDelete={deleteUser}
        />
      )}

      {/* Modal */}
      {modalUser && (
        <UserFormModal
          user={{
            id: modalUser.id,
            personId: modalUser.personId,
            name: modalUser.name,
            role: modalUser.role,
            isAdmin: modalUser.isAdmin ?? false,
            department: modalUser.department,
            commercialName: modalUser.commercialName ?? '',
            phone: modalUser.phone ?? '',
            email: modalUser.email ?? '',
            available: modalUser.available ?? true,
            driver: { isDriver: modalUser.isDriver ?? false },
            workerRank: modalUser.workerRank ?? 'equip',
            opsChannelsConfigurable: modalUser.opsChannelsConfigurable ?? [],
            opsEventsConfigurable: modalUser.opsEventsConfigurable ?? false,
            opsProjectsConfigurable:
              typeof modalUser.opsProjectsConfigurable === 'boolean'
                ? modalUser.opsProjectsConfigurable
                : true,
            canRespondSurveys: Boolean(modalUser.canRespondSurveys),
            isDepartmentRobaLead: Boolean(modalUser.isDepartmentRobaLead),
            isTransportLead: Boolean(modalUser.isTransportLead),
          }}
          onSubmit={async (data) => {
            if (modalUser.personId) {
              await fetchUsers()
              await loadPendingRequests()
            } else {
              await saveUser(modalUser.id, data)
            }
            setModalUser(null)
          }}
          onAfterAction={() => {
            fetchUsers()
            loadPendingRequests()
          }}
          onClose={() => setModalUser(null)}
        />
      )}
    </div>
  )
}

export default withAdmin(UsersPage)
