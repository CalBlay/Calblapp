'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import Link from 'next/link'
import { Shield } from 'lucide-react'
import {
  DEPARTMENTS,
  getUserDepartmentSelectOptions,
  normalizeDepartmentLabel,
} from '@/data/departments'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildMatrixRows } from '@/lib/permissions/matrixConfig'
import { PERM } from '@/lib/permissionKeys'
import { normalizeRole, type Role } from '@/lib/roles'
import { matchesUserSearch } from '@/lib/userSearch'

type UserRow = {
  id: string
  name?: string
  email?: string
  role?: string
  department?: string
}

type ListUsersResponse = { users: UserRow[] }

type OverrideEffect = 'allow' | 'deny' | null
type AccessLevel = 'none' | 'view' | 'edit'

type AssignmentOverride = {
  permission: string
  effect: 'allow' | 'deny'
  scope: 'client' | 'centre' | 'project'
  scopeId?: string | null
  note?: string | null
}

type ModuleAuditUserRow = UserRow & {
  assignment: {
    base: { role?: Role; department?: string | null }
    permissionSets: string[]
    overrides: AssignmentOverride[]
  }
  audit: {
    view: boolean
    edit: boolean
    baseView: boolean
    baseEdit: boolean
    viewOverride: OverrideEffect
    editOverride: OverrideEffect
  }
}

type ModuleAuditResponse = { users: ModuleAuditUserRow[] }

type MatrixRow = ReturnType<typeof buildMatrixRows>[number]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const selectClassName =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

function formatDepartmentLabel(value?: string) {
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

function matchesDepartmentFilter(user: UserRow, departmentFilter: string) {
  if (!departmentFilter || departmentFilter === '__all__') return true
  return normalizeDepartmentLabel(user.department) === normalizeDepartmentLabel(departmentFilter)
}

function normalizeModuleSearchText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getModuleSearchScore(row: MatrixRow, query: string) {
  const normalizedQuery = normalizeModuleSearchText(query)
  if (!normalizedQuery) return 1

  const label = normalizeModuleSearchText(row.label)
  const path = normalizeModuleSearchText(row.path)
  const level = normalizeModuleSearchText(row.level)
  const combined = `${label} ${path} ${level}`.trim()
  const pathTail = path.split('/').filter(Boolean).join(' ')
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  let score = 0

  if (label === normalizedQuery) score += 1000
  if (path === normalizedQuery) score += 950
  if (label.startsWith(normalizedQuery)) score += 700
  if (path.startsWith(normalizedQuery)) score += 650
  if (pathTail.startsWith(normalizedQuery)) score += 625
  if (label.includes(normalizedQuery)) score += 450
  if (path.includes(normalizedQuery)) score += 425
  if (combined.includes(normalizedQuery)) score += 300

  for (const token of tokens) {
    if (label.startsWith(token)) score += 120
    if (label.includes(token)) score += 75
    if (pathTail.startsWith(token)) score += 90
    if (path.includes(token)) score += 60
    if (combined.includes(token)) score += 30
  }

  return score
}

function accessLevelFromAudit(audit: ModuleAuditUserRow['audit']): AccessLevel {
  if (audit.edit) return 'edit'
  if (audit.view) return 'view'
  return 'none'
}

function baseAccessLevel(audit: ModuleAuditUserRow['audit']): AccessLevel {
  if (audit.baseEdit) return 'edit'
  if (audit.baseView) return 'view'
  return 'none'
}

function accessLevelLabel(level: AccessLevel) {
  if (level === 'edit') return 'Editar'
  if (level === 'view') return 'Veure'
  return 'Sense acces'
}

function accessLevelDescription(level: AccessLevel) {
  if (level === 'edit') return 'Pot veure i modificar'
  if (level === 'view') return 'Pot entrar pero no editar'
  return 'No te acces a aquest modul'
}

function hasExplicitOverride(audit: ModuleAuditUserRow['audit']) {
  return audit.viewOverride !== null || audit.editOverride !== null
}

function accessOverridesForLevel(level: AccessLevel): {
  viewOverride: OverrideEffect
  editOverride: OverrideEffect
} {
  if (level === 'edit') return { viewOverride: 'allow', editOverride: 'allow' }
  if (level === 'view') return { viewOverride: 'allow', editOverride: 'deny' }
  return { viewOverride: 'deny', editOverride: 'deny' }
}

export default function AdminPermisosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = normalizeRole(session?.user?.role || '')

  const [bootLoading, setBootLoading] = useState(false)
  const [bootMsg, setBootMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('__all__')
  const [moduleQuery, setModuleQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({})
  const [rowMessageByUser, setRowMessageByUser] = useState<Record<string, string>>({})

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

  const matrixRows = useMemo(() => buildMatrixRows(), [])

  const rankedModuleRows = useMemo(
    () =>
      matrixRows
        .map((row) => ({ row, score: getModuleSearchScore(row, moduleQuery) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return a.row.label.localeCompare(b.row.label, 'ca', { sensitivity: 'base' })
        }),
    [matrixRows, moduleQuery]
  )

  const filteredModuleRows = useMemo(
    () => rankedModuleRows.map((entry) => entry.row),
    [rankedModuleRows]
  )

  const topSuggestedModuleRows = useMemo(
    () => rankedModuleRows.slice(0, 5).map((entry) => entry.row),
    [rankedModuleRows]
  )

  const selectedModule = useMemo(
    () => matrixRows.find((row) => row.path === selectedPath) ?? null,
    [matrixRows, selectedPath]
  )

  useEffect(() => {
    const query = moduleQuery.trim()
    if (!query) return
    if (rankedModuleRows.length !== 1) return
    const bestMatch = rankedModuleRows[0]?.row
    if (!bestMatch || bestMatch.path === selectedPath) return
    setSelectedPath(bestMatch.path)
  }, [moduleQuery, rankedModuleRows, selectedPath])

  const {
    data: moduleAuditData,
    error: moduleAuditError,
    mutate: mutateModuleAudit,
    isLoading: isModuleAuditLoading,
  } = useSWR<ModuleAuditResponse>(
    role === 'admin' && selectedPath
      ? `/api/admin/permissions/module-audit?path=${encodeURIComponent(selectedPath)}`
      : null,
    fetcher
  )

  useEffect(() => {
    setRowMessageByUser({})
  }, [moduleAuditData])

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
        (u) =>
          matchesUserSearch(
            {
              name: u.name,
              email: u.email,
              role: u.role,
              department: formatDepartmentLabel(u.department),
              id: u.id,
            },
            searchQuery
          ) && matchesDepartmentFilter(u, departmentFilter)
      ),
    [users, searchQuery, departmentFilter]
  )

  const filteredAuditUsers = useMemo(
    () =>
      (moduleAuditData?.users ?? []).filter((u) => {
        const hasModuleActivated = u.audit.view || u.audit.edit
        if (!hasModuleActivated) return false
        return (
          matchesUserSearch(
            {
              name: u.name,
              email: u.email,
              role: u.role,
              department: formatDepartmentLabel(u.department),
              id: u.id,
            },
            searchQuery
          ) && matchesDepartmentFilter(u, departmentFilter)
        )
      }),
    [moduleAuditData?.users, searchQuery, departmentFilter]
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
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Error inicialitzant')
      }
      const msg = `Inicialitzat. Usuaris processats: ${json.usersProcessed ?? '-'}, escrits: ${json.usersWritten ?? '-'}, defaults nous: ${json.defaultsWritten ? 'si' : 'no'}`
      setBootMsg(msg)
      await Promise.all([mutate(), mutateModuleAudit()])
    } catch (e) {
      setBootMsg(e instanceof Error ? e.message : 'Error inicialitzant')
    } finally {
      setBootLoading(false)
    }
  }

  const saveAuditRow = async (
    user: ModuleAuditUserRow,
    options?: { level?: AccessLevel; resetToBase?: boolean }
  ) => {
    if (!selectedPath) return

    const desiredOverrides = options?.resetToBase
      ? { viewOverride: null, editOverride: null }
      : accessOverridesForLevel(options?.level ?? accessLevelFromAudit(user.audit))

    const nextOverrides = (user.assignment.overrides ?? []).filter((item) => {
      if ((item.scope || 'client') !== 'client') return true
      if (item.scopeId) return true
      return item.permission !== PERM.view(selectedPath) && item.permission !== PERM.edit(selectedPath)
    })

    if (desiredOverrides.viewOverride) {
      nextOverrides.push({
        permission: PERM.view(selectedPath),
        effect: desiredOverrides.viewOverride,
        scope: 'client',
      })
    }

    if (desiredOverrides.editOverride) {
      nextOverrides.push({
        permission: PERM.edit(selectedPath),
        effect: desiredOverrides.editOverride,
        scope: 'client',
      })
    }

    setSavingByUser((current) => ({ ...current, [user.id]: true }))
    setRowMessageByUser((current) => ({ ...current, [user.id]: '' }))

    try {
      const res = await fetch(`/api/admin/permissions/assignments/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base: user.assignment.base,
          permissionSets: user.assignment.permissionSets ?? [],
          overrides: nextOverrides,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'No s ha pogut desar')
      }
      setRowMessageByUser((current) => ({ ...current, [user.id]: 'Desat' }))
      await Promise.all([mutateModuleAudit(), mutate()])
    } catch (e) {
      setRowMessageByUser((current) => ({
        ...current,
        [user.id]: e instanceof Error ? e.message : 'Error desant',
      }))
    } finally {
      setSavingByUser((current) => ({ ...current, [user.id]: false }))
    }
  }

  if (status === 'loading') return <p className="p-4">Carregant...</p>
  if (!session?.user) return <p className="p-4">No autoritzat.</p>
  if (role !== 'admin') return null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-8">
      <ModuleHeader
        icon={<Shield className="h-6 w-6 text-slate-700" />}
        mainHref="/menu/settings"
        actions={
          <>
            <Button onClick={bootstrapDefaults} disabled={bootLoading}>
              {bootLoading ? 'Inicialitzant...' : 'Inicialitzar per defecte'}
            </Button>
            <Button
              onClick={() => {
                void mutate()
                void mutateModuleAudit()
              }}
              disabled={isLoading || isModuleAuditLoading}
              variant="outline"
            >
              Recarregar
            </Button>
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        Generacio de configuracio per defecte basada en `MODULES` + rols/departaments actuals.
      </p>

      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="permisos-search">Cerca d usuaris</Label>
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

        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-1">
            <Label htmlFor="module-query">Buscador de modul / submodul</Label>
            <Input
              id="module-query"
              placeholder="Ex: roba personal, calendar, tickets..."
              value={moduleQuery}
              onChange={(e) => setModuleQuery(e.target.value)}
              autoComplete="off"
            />
            {moduleQuery.trim() ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {topSuggestedModuleRows.length > 0 ? (
                  topSuggestedModuleRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSelectedPath(row.path)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        selectedPath === row.path
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {row.label}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No s ha trobat cap modul semblant.
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="module-path">Modul seleccionat</Label>
            <select
              id="module-path"
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              className={selectClassName}
            >
              <option value="">Selecciona un modul o submodul</option>
              {filteredModuleRows.map((row) => (
                <option key={row.key} value={row.path}>
                  {row.label} · {row.level === 'module' ? 'modul' : 'submodul'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Pots continuar entrant usuari per usuari, pero ara tambe pots buscar un modul concret i
          veure rapidament qui el te actiu i qui el pot editar.
          {users.length > 0 ? <> Llistat general: {filteredUsers.length} de {users.length} usuaris.</> : null}
        </p>

        {bootMsg ? (
          <div className="rounded-lg border border-border bg-muted/30 p-2 text-sm">{bootMsg}</div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Consulta rapida per modul</h2>
          <p className="text-sm text-muted-foreground">
            Patron mes proper a eines com GitHub, Linear o Vercel: un sol nivell d acces per fila,
            canvi immediat i context clar de si es base o forcat.
          </p>
        </div>

        {selectedModule ? (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="font-medium">{selectedModule.label}</span> · {selectedModule.path}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
            Selecciona un modul o submodul per veure qui en te permisos.
          </div>
        )}

        {moduleAuditError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Error carregant l auditoria del modul.
          </div>
        ) : null}

        {selectedPath ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-12 bg-muted/40 px-3 py-2 text-xs font-semibold">
              <div className="col-span-4">Usuari</div>
              <div className="col-span-2">Departament</div>
              <div className="col-span-4">Acces</div>
              <div className="col-span-2">Estat</div>
            </div>
            <div className="divide-y">
              {filteredAuditUsers.map((user) => {
                const rowMessage = rowMessageByUser[user.id]
                const isSaving = savingByUser[user.id] === true
                const currentLevel = accessLevelFromAudit(user.audit)
                const inheritedLevel = baseAccessLevel(user.audit)
                const explicitOverride = hasExplicitOverride(user.audit)

                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-12 gap-3 px-3 py-3 text-sm items-center"
                  >
                    <div className="col-span-4 min-w-0">
                      <div className="truncate font-medium">{user.name || user.id}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {user.email || '-'} · {user.role || '-'}
                      </div>
                    </div>

                    <div className="col-span-2 min-w-0">{formatDepartmentLabel(user.department)}</div>

                    <div className="col-span-4 space-y-2">
                      <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
                        {(['none', 'view', 'edit'] as AccessLevel[]).map((level) => {
                          const isActive = currentLevel === level
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => void saveAuditRow(user, { level })}
                              disabled={isSaving}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                isActive
                                  ? 'bg-background text-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              } ${isSaving ? 'cursor-wait opacity-70' : ''}`}
                            >
                              {accessLevelLabel(level)}
                            </button>
                          )
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {accessLevelDescription(currentLevel)}
                      </div>
                    </div>

                    <div className="col-span-2 flex flex-col items-start gap-1 text-xs">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 font-medium ${
                          explicitOverride
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {explicitOverride ? 'Forcat' : 'Base'}
                      </span>
                      <span className="text-muted-foreground">
                        Base: {accessLevelLabel(inheritedLevel)}
                      </span>
                      {explicitOverride ? (
                        <button
                          type="button"
                          onClick={() => void saveAuditRow(user, { resetToBase: true })}
                          disabled={isSaving}
                          className="text-slate-700 underline-offset-2 hover:underline disabled:opacity-60"
                        >
                          Torna a base
                        </button>
                      ) : null}
                      {rowMessage ? (
                        <span className="text-[11px] text-muted-foreground">{rowMessage}</span>
                      ) : null}
                      {isSaving ? (
                        <span className="text-[11px] text-muted-foreground">Desant...</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}

              {!isModuleAuditLoading && selectedPath && filteredAuditUsers.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">
                  No hi ha cap usuari amb aquest modul activat que coincideixi amb els filtres.
                </div>
              ) : null}

              {isModuleAuditLoading ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">
                  Carregant auditoria del modul...
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Error carregant usuaris.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
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

          {!isLoading && users.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">No hi ha usuaris.</div>
          ) : null}

          {!isLoading && users.length > 0 && filteredUsers.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              Cap usuari coincideix amb els filtres.
            </div>
          ) : null}

          {isLoading ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">Carregant...</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
