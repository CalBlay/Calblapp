'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { normalizeRole, type Role } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MODULES } from '@/lib/accessControl'
import { applyOverrideEffects } from '@/lib/permissions/overrideState'
import { CALENDAR_EDIT_IMPLIED_ACTIONS, PERM } from '@/lib/permissionKeys'

type AssignmentOverride = {
  permission: string
  effect: 'allow' | 'deny'
  scope: 'client' | 'centre' | 'project'
  scopeId?: string | null
  note?: string | null
}

type UserAccessAssignment = {
  userId: string
  name?: string
  base?: { role?: Role; department?: string | null }
  permissionSets?: string[]
  overrides?: AssignmentOverride[]
}

type EffectiveRow = {
  path: string
  level: 'module' | 'submodule'
  baseView: boolean
  baseEdit: boolean
}

type EffectiveResponse = { rows: EffectiveRow[] }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ROLE_OPTIONS: { id: Role; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'direccio', label: 'Direcció' },
  { id: 'cap', label: 'Cap departament' },
  { id: 'usuari', label: 'Usuari' },
  { id: 'treballador', label: 'Treballador' },
  { id: 'comercial', label: 'Comercial' },
  { id: 'observer', label: 'Observer' },
]

type MatrixRow = {
  key: string
  label: string
  path: string
  level: 'module' | 'submodule'
}

const compareLabels = (a: string, b: string) =>
  a.localeCompare(b, 'ca', { sensitivity: 'base' })

const buildRows = (): MatrixRow[] => {
  const rows: MatrixRow[] = []
  const sortedModules = [...MODULES].sort((a, b) => compareLabels(a.label, b.label))
  for (const mod of sortedModules) {
    rows.push({
      key: `module:${mod.path}`,
      label: mod.label,
      path: mod.path,
      level: 'module',
    })
    if (Array.isArray(mod.submodules)) {
      const sortedSubs = [...mod.submodules].sort((a, b) => compareLabels(a.label, b.label))
      for (const sub of sortedSubs) {
        rows.push({
          key: `submodule:${sub.path}:${sub.label}`,
          label: sub.label,
          path: sub.path,
          level: 'submodule',
        })
      }
    }
  }
  return rows
}

const MEDIA_SOURCES: Array<{ id: string; label: string }> = [
  { id: 'incidents', label: 'Incidències' },
  { id: 'maintenance', label: 'Manteniment' },
  { id: 'messaging', label: 'Missatgeria' },
  { id: 'audits', label: 'Auditories' },
  { id: 'spaces', label: 'Espais' },
]

const ACTION_GROUPS: Array<{
  id: string
  title: string
  subtitle?: string
  visibleWhen: { path: string }
  actions: Array<{ key: string; label: string }>
}> = [
  {
    id: 'mediaSources',
    title: 'Imatges · Fonts',
    subtitle: 'Tria quines fonts pot veure (filtre i resultats).',
    visibleWhen: { path: '/menu/media' },
    actions: MEDIA_SOURCES.map((s) => ({
      key: PERM.action('/menu/media', `source:${s.id}`),
      label: s.label,
    })),
  },
  {
    id: 'mediaDelete',
    title: 'Imatges · Accions',
    subtitle: 'Accions amb impacte (eliminar fitxers i referències).',
    visibleWhen: { path: '/menu/media' },
    actions: [{ key: PERM.action('/menu/media', 'delete'), label: 'Eliminar imatges' }],
  },
  {
    id: 'allergensBbddActions',
    title: 'Al·lèrgens · BBDD plats · Accions',
    subtitle: 'Botons especials dins de BBDD plats.',
    visibleWhen: { path: '/menu/allergens/bbdd' },
    actions: [
      { key: PERM.action('/menu/allergens/bbdd', 'import'), label: 'Importar' },
      { key: PERM.action('/menu/allergens/bbdd', 'replace'), label: 'Reemplaçar' },
      { key: PERM.action('/menu/allergens/bbdd', 'export'), label: 'Exportar' },
    ],
  },
  {
    id: 'calendarActions',
    title: 'Calendar · Accions',
    subtitle: 'Accions de calendari (esdeveniments manuals i documents).',
    visibleWhen: { path: '/menu/calendar' },
    actions: [
      { key: PERM.action('/menu/calendar', 'manual:create'), label: 'Crear esdeveniment manual' },
      { key: PERM.action('/menu/calendar', 'manual:update'), label: 'Editar esdeveniment manual' },
      { key: PERM.action('/menu/calendar', 'manual:delete'), label: 'Eliminar esdeveniment manual' },
      { key: PERM.action('/menu/calendar', 'attach:sharepoint'), label: 'Adjuntar documents (SharePoint)' },
      { key: PERM.action('/menu/calendar', 'sync:zoho'), label: 'Sync Zoho' },
      { key: PERM.action('/menu/calendar', 'sync:ada'), label: 'Sync Ada' },
    ],
  },
  {
    id: 'eventsActions',
    title: 'Esdeveniments · Accions',
    subtitle: 'Accions de gestió amb impacte.',
    visibleWhen: { path: '/menu/events' },
    actions: [
      { key: PERM.action('/menu/events', 'docs:view'), label: 'Veure documents' },
      { key: PERM.action('/menu/events', 'docs:attach:kitchen'), label: 'Adjuntar documents de cuina' },
      { key: PERM.action('/menu/events', 'modifications:register'), label: 'Registrar modificacions' },
      { key: PERM.action('/menu/events', 'event:close'), label: 'Tancar esdeveniment' },
    ],
  },
  {
    id: 'reservaComercialsActions',
    title: 'Reserva comercials · Accions',
    subtitle:
      'Per defecte: Sol·licitud si pot veure el submòdul; Validació només admin i cap de transports. Marca/desmarca per override; cal desar.',
    visibleWhen: { path: '/menu/logistica/reserva-comercials' },
    actions: [
      {
        key: PERM.action('/menu/logistica/reserva-comercials', 'request'),
        label: 'Sol·licitud (crear i anul·lar pròpies)',
      },
      {
        key: PERM.action('/menu/logistica/reserva-comercials', 'validate'),
        label: 'Validació (aprovar / rebutjar)',
      },
    ],
  },
  {
    id: 'quadrantsActions',
    title: 'Quadrants · Accions',
    subtitle:
      'Accions especials dins del mòdul Quadrants. «Premisses» permet el botó i editar la configuració (models, equips, condicions). Per defecte: administració, direcció i caps (el cap només el seu departament a l’API). Marca/desmarca per override; cal desar.',
    visibleWhen: { path: '/menu/quadrants' },
    actions: [
      {
        key: PERM.action('/menu/quadrants', 'premisses:edit'),
        label: 'Premisses (configuració)',
      },
      { key: PERM.action('/menu/quadrants', 'save'), label: 'Desar quadrant' },
      { key: PERM.action('/menu/quadrants', 'confirm'), label: 'Confirmar quadrant' },
      { key: PERM.action('/menu/quadrants', 'draft:save'), label: 'Esborranys · desar' },
      { key: PERM.action('/menu/quadrants', 'draft:confirm'), label: 'Esborranys · confirmar' },
      { key: PERM.action('/menu/quadrants', 'draft:unconfirm'), label: 'Esborranys · desconfirmar' },
      { key: PERM.action('/menu/quadrants', 'draft:delete'), label: 'Esborranys · eliminar' },
    ],
  },
  {
    id: 'spacesBbddActions',
    title: 'Espais · Consulta BBDD · Accions',
    subtitle:
      'Opcional: restringeix export o CRUD dins del submòdul. Per defecte, «Veure» permet consulta i export; «Editar» al submòdul Consulta BBDD implica crear/editar (segons rol), llevat de denegació explícita. Eliminar només admin i cap producció.',
    visibleWhen: { path: '/menu/spaces/info' },
    actions: [
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:export'),
        label: 'Exportar (Excel / PDF)',
      },
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:create'),
        label: 'Crear espai',
      },
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:update'),
        label: 'Editar espai (i pujar imatges)',
      },
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:delete'),
        label: 'Eliminar espai',
      },
    ],
  },
]

/** Accions només es configuren quan l’usuari té veure i editar al path del submòdul. */
const shouldShowActionGroup = (viewAllowed: boolean, editAllowed: boolean): boolean =>
  viewAllowed && editAllowed

const actionGroupDefaultExpanded = (viewAllowed: boolean, editAllowed: boolean): boolean =>
  shouldShowActionGroup(viewAllowed, editAllowed)

function PermissionActionGroupCard({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left rounded-lg -m-1 p-1 hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <h2 className="font-semibold flex-1">{title}</h2>
      </button>
      {expanded && (
        <>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          {children}
        </>
      )}
    </div>
  )
}

export default function PermisosUserPage() {
  const routeParams = useParams<{ userId?: string }>()
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = normalizeRole(session?.user?.role || '')
  const userId = String(routeParams?.userId || '').trim()

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user) {
      router.replace('/login')
      return
    }
    if (role !== 'admin') router.replace('/menu')
  }, [status, session?.user, role, router])

  const { data, error, isLoading, mutate } = useSWR<UserAccessAssignment>(
    role === 'admin' && userId ? `/api/admin/permissions/assignments/${userId}` : null,
    fetcher
  )

  const { data: effectiveData } = useSWR<EffectiveResponse>(
    role === 'admin' && userId ? `/api/admin/permissions/effective/${userId}` : null,
    fetcher
  )

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [baseRole, setBaseRole] = useState<Role>('treballador')
  const [baseDepartment, setBaseDepartment] = useState<string>('')
  const [overrides, setOverrides] = useState<AssignmentOverride[]>([])
  const [actionGroupExpandedManual, setActionGroupExpandedManual] = useState<
    Record<string, boolean>
  >({})
  const initialRef = useRef<{
    baseRole: Role
    baseDepartment: string
    overrides: AssignmentOverride[]
  } | null>(null)
  const rows = useMemo(() => buildRows(), [])

  const getOverrideEffect = (permission: string): 'allow' | 'deny' | null => {
    const found = overrides.find(
      (o) => o.permission === permission && (o.scope || 'client') === 'client' && !o.scopeId
    )
    return found ? found.effect : null
  }

  const baseFor = (path: string) => {
    const found = effectiveData?.rows?.find((r) => r.path === path)
    return {
      view: Boolean(found?.baseView),
      edit: Boolean(found?.baseEdit),
    }
  }

  const effectiveAllowed = (permission: string, baseAllowed: boolean) => {
    const o = getOverrideEffect(permission)
    if (o === 'deny') return false
    if (o === 'allow') return true
    return baseAllowed
  }

  const setOverrideEffects = (
    updates: Array<{ permission: string; effect: 'allow' | 'deny' | null }>
  ) => {
    setOverrides((prev) => applyOverrideEffects(prev, updates))
  }

  const setOverrideEffect = (permission: string, effect: 'allow' | 'deny' | null) => {
    setOverrideEffects([{ permission, effect }])
  }

  useEffect(() => {
    if (!data) return
    const nextBaseRole = normalizeRole(data.base?.role || 'treballador')
    const nextBaseDepartment = String(data.base?.department || '')
    const nextOverrides = Array.isArray(data.overrides) ? data.overrides : []

    setBaseRole(nextBaseRole)
    setBaseDepartment(nextBaseDepartment)
    setOverrides(nextOverrides)

    // snapshot per "Desfer canvis"
    if (!initialRef.current) {
      initialRef.current = {
        baseRole: nextBaseRole,
        baseDepartment: nextBaseDepartment,
        overrides: nextOverrides,
      }
    }
  }, [data])

  const discardChanges = () => {
    const snap = initialRef.current
    if (!snap) return
    setBaseRole(snap.baseRole)
    setBaseDepartment(snap.baseDepartment)
    setOverrides(snap.overrides)
    setActionGroupExpandedManual({})
    setMsg('Canvis desfets (tornat a l’últim estat desat)')
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const payload: UserAccessAssignment = {
        userId,
        base: { role: baseRole, department: baseDepartment.trim() || null },
        permissionSets: [],
        overrides,
      }
      const res = await fetch(`/api/admin/permissions/assignments/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Error desant')
      setMsg('Desat correctament')
      await mutate()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error desant')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <p className="p-4">Carregant...</p>
  if (!session?.user) return <p className="p-4">No autoritzat.</p>
  if (role !== 'admin') return null

  return (
    <section className="w-full max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Permisos · Usuari</h1>
          <div className="space-y-0.5">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregant nom…</p>
            ) : (
              <p className="text-lg font-medium">
                {data?.name?.trim() ? (
                  <>
                    <span className="text-muted-foreground font-normal">Nom: </span>
                    {data.name.trim()}
                  </>
                ) : (
                  <span className="text-muted-foreground">Nom no disponible</span>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-mono truncate" title={userId}>
              {userId}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/menu/settings/permisos')}>
            Tornar
          </Button>
          <Button variant="outline" onClick={discardChanges} disabled={saving || isLoading}>
            Desfer canvis
          </Button>
          <Button onClick={save} disabled={saving || isLoading}>
            {saving ? 'Desant…' : 'Desar'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Error carregant configuració.
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">{msg}</div>
      )}

      <div className="rounded-xl border border-border bg-background p-4 space-y-4">
        <h2 className="font-semibold">Base (rol + departament)</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Rol base</Label>
            <select
              value={baseRole}
              onChange={(e) => setBaseRole(normalizeRole(e.target.value))}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Departament (opcional)</Label>
            <Input
              value={baseDepartment}
              onChange={(e) => setBaseDepartment(e.target.value)}
              placeholder="ex. logistica, cuina, serveis..."
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
        <h2 className="font-semibold">Mòduls i submòduls</h2>
        <p className="text-sm text-muted-foreground">
          1 check per columna: marcat = permès. Per defecte es preomple segons la lògica actual
          (rol/departament). Els canvis es guarden com overrides per usuari. Si marques Edició, també
          s’activarà Visualització.
        </p>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-12 bg-muted/40 px-3 py-2 text-xs font-semibold">
            <div className="col-span-6">Mòdul</div>
            <div className="col-span-3">Visualització</div>
            <div className="col-span-3">Edició</div>
          </div>
          <div className="divide-y">
            {rows.map((r) => {
              const base = baseFor(r.path)
              const viewChecked = effectiveAllowed(PERM.view(r.path), base.view)
              const editChecked = effectiveAllowed(PERM.edit(r.path), base.edit)

              const label =
                r.level === 'submodule' ? (
                  <span className="pl-4">↳ {r.label}</span>
                ) : (
                  <span className="font-medium">{r.label}</span>
                )

              return (
                <div key={r.key} className="grid grid-cols-12 px-3 py-2 text-sm items-center">
                  <div className="col-span-6 truncate">{label}</div>

                  <div className="col-span-3">
                    <input
                      type="checkbox"
                      checked={viewChecked}
                      onChange={(e) => {
                        const desired = e.target.checked
                        const updates: Array<{ permission: string; effect: 'allow' | 'deny' | null }> =
                          [
                            {
                              permission: PERM.view(r.path),
                              effect: desired === base.view ? null : desired ? 'allow' : 'deny',
                            },
                          ]
                        if (!desired) {
                          updates.push({ permission: PERM.edit(r.path), effect: null })
                          if (r.level === 'module') {
                            const mod = MODULES.find((m) => m.path === r.path)
                            for (const sub of mod?.submodules || []) {
                              const subBase = baseFor(sub.path)
                              updates.push({
                                permission: PERM.view(sub.path),
                                effect: subBase.view ? 'deny' : null,
                              })
                              updates.push({ permission: PERM.edit(sub.path), effect: null })
                            }
                          }
                        }
                        setOverrideEffects(updates)
                      }}
                    />
                  </div>

                  <div className="col-span-3">
                    <input
                      type="checkbox"
                      checked={editChecked}
                      onChange={(e) => {
                        const desired = e.target.checked
                        setOverrideEffect(
                          PERM.edit(r.path),
                          desired === base.edit ? null : desired ? 'allow' : 'deny'
                        )
                        if (desired) {
                          // editar implica veure
                          setOverrideEffect(
                            PERM.view(r.path),
                            true === base.view ? null : 'allow'
                          )
                          if (r.path === '/menu/calendar') {
                            for (const action of CALENDAR_EDIT_IMPLIED_ACTIONS) {
                              setOverrideEffect(
                                PERM.action('/menu/calendar', action),
                                'allow'
                              )
                            }
                          }
                        } else if (r.path === '/menu/calendar') {
                          for (const action of CALENDAR_EDIT_IMPLIED_ACTIONS) {
                            setOverrideEffect(PERM.action('/menu/calendar', action), null)
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {ACTION_GROUPS.map((group) => {
        const p = group.visibleWhen.path
        const base = baseFor(p)
        const viewAllowed = effectiveAllowed(PERM.view(p), base.view)
        const editAllowed = effectiveAllowed(PERM.edit(p), base.edit)

        if (!shouldShowActionGroup(viewAllowed, editAllowed)) return null

        const defaultExpanded = actionGroupDefaultExpanded(viewAllowed, editAllowed)
        const expanded = actionGroupExpandedManual[group.id] ?? defaultExpanded

        return (
          <PermissionActionGroupCard
            key={group.id}
            title={group.title}
            subtitle={group.subtitle}
            expanded={expanded}
            onToggle={() =>
              setActionGroupExpandedManual((prev) => ({
                ...prev,
                [group.id]: !expanded,
              }))
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.actions.map((a) => {
                const checked = getOverrideEffect(a.key) === 'allow'
                return (
                  <label key={a.key} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setOverrideEffect(a.key, e.target.checked ? 'allow' : 'deny')}
                    />
                    <span className="text-sm">{a.label}</span>
                  </label>
                )
              })}
            </div>
          </PermissionActionGroupCard>
        )
      })}
    </section>
  )
}

