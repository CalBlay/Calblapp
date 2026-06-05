'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import {
  DEPARTMENTS,
  getUserDepartmentSelectOptions,
  normalizeDepartmentLabel,
} from '@/data/departments'
import { normalizeRole } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

type UserRow = {
  id: string
  name?: string
  email?: string
  role?: string
  department?: string
}

type ListUsersResponse = { users: UserRow[] }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fold = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

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

function matchesUserSearch(user: UserRow, query: string) {
  const q = fold(query)
  if (!q) return true
  const haystack = [user.name, user.email, user.role, user.department, user.id]
    .map((v) => fold(v))
    .join(' ')
  return haystack.includes(q)
}

function matchesDepartmentFilter(user: UserRow, departmentFilter: string) {
  if (!departmentFilter || departmentFilter === '__all__') return true
  return (
    normalizeDepartmentLabel(user.department) === normalizeDepartmentLabel(departmentFilter)
  )
}

const selectClassName =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export default function AdminPermisosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = normalizeRole(session?.user?.role || '')
  const [bootLoading, setBootLoading] = useState(false)
  const [bootMsg, setBootMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('__all__')

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user) {
      router.replace('/login')
      return
    }
    if (role !== 'admin') router.replace('/menu')
  }, [status, session?.user, role, router])

  const { data, error, mutate, isLoading } = useSWR<ListUsersResponse>(
    role === 'admin' ? '/api/admin/permissions/users' : null,
    fetcher
  )

  const users = useMemo(() => data?.users ?? [], [data?.users])

  const departmentOptions = useMemo(
    () =>
      getUserDepartmentSelectOptions(
        ...users.map((u) => formatDepartmentLabel(u.department)).filter((d) => d && d !== '-')
      ),
    [users]
  )

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) => matchesUserSearch(u, searchQuery) && matchesDepartmentFilter(u, departmentFilter)
      ),
    [users, searchQuery, departmentFilter]
  )

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || (departmentFilter && departmentFilter !== '__all__')

  const clearFilters = () => {
    setSearchQuery('')
    setDepartmentFilter('__all__')
  }

  const bootstrapDefaults = async () => {
    setBootLoading(true)
    setBootMsg(null)
    try {
      const res = await fetch('/api/admin/permissions/bootstrap', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Error inicialitzant')
      const msg = `Inicialitzat. Usuaris processats: ${json.usersProcessed ?? '-'}, escrits: ${json.usersWritten ?? '-'}, defaults nous: ${json.defaultsWritten ? 'sí' : 'no'}`
      setBootMsg(msg)
      await mutate()
    } catch (e) {
      setBootMsg(e instanceof Error ? e.message : 'Error inicialitzant')
    } finally {
      setBootLoading(false)
    }
  }

  if (status === 'loading') return <p className="p-4">Carregant...</p>
  if (!session?.user) return <p className="p-4">No autoritzat.</p>
  if (role !== 'admin') return null

  return (
    <section className="w-full max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Permisos</h1>
          <p className="text-sm text-muted-foreground">
            Generació de configuració per defecte basada en `MODULES` + rols/departaments actuals.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={bootstrapDefaults} disabled={bootLoading}>
            {bootLoading ? 'Inicialitzant…' : 'Inicialitzar per defecte'}
          </Button>
          <Button onClick={() => mutate()} disabled={isLoading} variant="outline">
            Recarregar
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0">
            <div className="space-y-1">
              <Label htmlFor="permisos-search">Cerca</Label>
              <Input
                id="permisos-search"
                placeholder="Nom, email, rol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="permisos-department">Departament</Label>
              <select
                id="permisos-department"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className={selectClassName}
              >
                <option value="__all__">Tots els departaments</option>
                {departmentOptions.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" className="shrink-0" onClick={clearFilters}>
              Neteja filtres
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Filtra per text i departament; després obre un usuari per ajustar visualització, edició i accions.
          {users.length > 0 && (
            <>
              {' '}
              Mostrant {filteredUsers.length} de {users.length} usuaris.
            </>
          )}
        </p>
        {bootMsg && (
          <div className="rounded-lg border border-border bg-muted/30 p-2 text-sm">
            {bootMsg}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Error carregant usuaris.
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-12 bg-muted/40 px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Nom</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Rol</div>
          <div className="col-span-3">Departament</div>
        </div>
        <div className="divide-y">
          {filteredUsers.map((u) => (
            <div key={u.id} className="grid grid-cols-12 px-3 py-2 text-sm">
              <div className="col-span-3 truncate">
                <Link
                  href={`/menu/settings/permisos/${u.id}`}
                  className="text-blue-700 hover:underline"
                >
                  {u.name || u.id}
                </Link>
              </div>
              <div className="col-span-4 truncate">
                <Link href={`/menu/settings/permisos/${u.id}`} className="hover:underline">
                  {u.email || '-'}
                </Link>
              </div>
              <div className="col-span-2 truncate">{u.role || '-'}</div>
              <div className="col-span-3 truncate">{u.department || '-'}</div>
            </div>
          ))}
          {!isLoading && users.length === 0 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">No hi ha usuaris.</div>
          )}
          {!isLoading && users.length > 0 && filteredUsers.length === 0 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              Cap usuari coincideix amb els filtres.
            </div>
          )}
          {isLoading && <div className="px-3 py-6 text-sm text-muted-foreground">Carregant…</div>}
        </div>
      </div>
    </section>
  )
}

