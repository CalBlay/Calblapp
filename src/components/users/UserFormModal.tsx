'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Shield } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { normalizeRole } from '@/lib/roles'
import {
  DEFAULT_USER_DEPARTMENT,
  getUserDepartmentSelectOptions,
} from '@/data/departments'
import useSWR from 'swr'
import type { AccessUser } from '@/lib/accessControl'
import type { AssignmentOverride } from '@/lib/permissions/types'
import { UserPermissionsEditor } from '@/components/permissions/UserPermissionsEditor'
import { buildEffectiveBaseMap, baseForPath } from '@/lib/permissions/effectiveBase'
import { applyOverrideEffect } from '@/lib/permissions/overrideState'
import { buildMatrixRows } from '@/lib/permissions/matrixConfig'
import { PERM } from '@/lib/permissionKeys'
import {
  cloneAssignmentOverrides,
  type UserConfigTemplate,
  type UserConfigTemplateProfile,
} from '@/lib/permissions/userConfigTemplate'

export interface User {
  id?: string
  personId?: string
  name?: string
  role?: string
  isAdmin?: boolean
  department?: string
  commercialName?: string
  available?: boolean
  driver?: { isDriver?: boolean }
  workerRank?: string
  phone?: string
  email?: string
  password?: string
  opsChannelsConfigurable?: string[]
  opsEventsConfigurable?: boolean
  opsProjectsConfigurable?: boolean
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  isTransportLead?: boolean
}

export interface NewUserPayload {
  name: string
  password: string
  role: string
  isAdmin?: boolean
  department: string
  commercialName?: string
  opsChannelsConfigurable?: string[]
  opsEventsConfigurable?: boolean
  opsProjectsConfigurable?: boolean
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  isTransportLead?: boolean
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  phone?: string
  email?: string
  accessAssignment?: {
    overrides: AssignmentOverride[]
  }
}

type Props = {
  user: User | null
  onSubmit: (data: User | NewUserPayload) => void | Promise<void>
  onClose: () => void
  onAfterAction?: () => void
}

type MessagingChannel = {
  id: string
  source?: string
  location?: string
  name?: string
}

type PermissionUserOption = {
  id: string
  name?: string
  email?: string
  role?: string
  department?: string
}

type PermissionUsersResponse = {
  users?: PermissionUserOption[]
}

type ApproveUserRequestResponse = {
  error?: string
  user?: User
}

async function fetchUserConfigTemplate(userId: string): Promise<UserConfigTemplate> {
  const res = await fetch(`/api/admin/permissions/templates/${encodeURIComponent(userId)}`, {
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(json?.error || 'No s’ha pogut carregar la plantilla'))
  }
  return json as UserConfigTemplate
}

const ROLES = [
  'Admin',
  'Direccio',
  'Cap Departament',
  'Treballador',
  'Usuari',
  'Comercial',
  'Observer',
] as const

const RANKS = [
  { value: 'equip', label: 'Equip' },
  { value: 'responsable', label: 'Responsable' },
] as const

export function UserFormModal({ user, onSubmit, onClose, onAfterAction }: Props) {
  const { data: session } = useSession()
  const sessionRole = normalizeRole(session?.user?.role || '')
  const isSessionAdmin = sessionRole === 'admin'

  const [loading, setLoading] = React.useState(false)

  const [name, setName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<string>('Treballador')
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [department, setDepartment] = React.useState<string>(DEFAULT_USER_DEPARTMENT)
  const [commercialName, setCommercialName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [available, setAvailable] = React.useState(true)
  const [isDriver, setIsDriver] = React.useState(false)
  const [workerRank, setWorkerRank] = React.useState<string>('equip')
  const [opsChannelsConfigurable, setOpsChannelsConfigurable] = React.useState<string[]>([])
  const [opsEventsConfigurable, setOpsEventsConfigurable] = React.useState(false)
  const [opsProjectsConfigurable, setOpsProjectsConfigurable] = React.useState(true)
  const [canRespondSurveys, setCanRespondSurveys] = React.useState(false)
  const [isDepartmentRobaLead, setIsDepartmentRobaLead] = React.useState(false)
  const [isTransportLead, setIsTransportLead] = React.useState(false)
  const [step, setStep] = React.useState<1 | 2>(1)
  const [permissionOverrides, setPermissionOverrides] = React.useState<AssignmentOverride[]>([])
  const [templateUserId, setTemplateUserId] = React.useState('')
  const [templateSourceName, setTemplateSourceName] = React.useState('')
  const [templateLoading, setTemplateLoading] = React.useState(false)

  const isPendingApproval = Boolean(user?.personId)
  const isNewUser = !user?.id && !isPendingApproval
  const canUseConfigTemplate = isSessionAdmin && (isNewUser || isPendingApproval)
  const showPermissionsStep = isSessionAdmin && (isNewUser || isPendingApproval) && !isAdmin

  const previewAccessUser = React.useMemo<AccessUser>(
    () => ({
      role,
      department,
      canRespondSurveys,
      isDepartmentRobaLead,
      isTransportLead,
      opsProjectsConfigurable,
    }),
    [
      role,
      department,
      canRespondSurveys,
      isDepartmentRobaLead,
      isTransportLead,
      opsProjectsConfigurable,
    ]
  )

  React.useEffect(() => {
    setStep(1)
    setPermissionOverrides([])
    setTemplateUserId('')
    setTemplateSourceName('')
  }, [user])

  const { data: permissionUsersData } = useSWR<PermissionUsersResponse>(
    canUseConfigTemplate ? '/api/admin/permissions/users' : null,
    (url: string) => fetch(url).then((r) => r.json())
  )

  const templateUserOptions = React.useMemo(() => {
    const list = Array.isArray(permissionUsersData?.users) ? permissionUsersData.users : []
    return [...list].sort((a, b) =>
      String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'ca', {
        sensitivity: 'base',
      })
    )
  }, [permissionUsersData])

  function formatTemplateUserLabel(option: PermissionUserOption): string {
    const name = String(option.name || option.email || option.id).trim()
    const role = String(option.role || '').trim()
    const dept = String(option.department || '').trim()
    const meta = [role, dept].filter(Boolean).join(' · ')
    return meta ? `${name} (${meta})` : name
  }

  function applyProfileFromTemplate(profile: UserConfigTemplateProfile) {
    setOpsChannelsConfigurable(profile.opsChannelsConfigurable)
    setOpsEventsConfigurable(profile.opsEventsConfigurable)
    setOpsProjectsConfigurable(profile.opsProjectsConfigurable)
    setCanRespondSurveys(profile.canRespondSurveys)
    setIsDepartmentRobaLead(profile.isDepartmentRobaLead)
    setIsTransportLead(profile.isTransportLead)
    setAvailable(profile.available)
    setIsDriver(profile.isDriver)
    setWorkerRank(profile.workerRank)
  }

  function buildDefaultPermissionDenies(): AssignmentOverride[] {
    const baseMap = buildEffectiveBaseMap(previewAccessUser)
    let initialDenies: AssignmentOverride[] = []
    for (const row of buildMatrixRows()) {
      if (baseForPath(baseMap, row.path).view) {
        initialDenies = applyOverrideEffect(initialDenies, PERM.view(row.path), 'deny')
      }
    }
    return initialDenies
  }

  async function applySelectedTemplate(options?: { permissionsOnly?: boolean }) {
    const sourceId = String(templateUserId || '').trim()
    if (!sourceId) return false

    setTemplateLoading(true)
    try {
      const template = await fetchUserConfigTemplate(sourceId)
      if (!options?.permissionsOnly) {
        applyProfileFromTemplate(template.profile)
      }
      setPermissionOverrides(cloneAssignmentOverrides(template.overrides))
      setTemplateSourceName(template.sourceName)
      return true
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No s’ha pogut carregar la plantilla')
      return false
    } finally {
      setTemplateLoading(false)
    }
  }

  React.useEffect(() => {
    if (!showPermissionsStep && step === 2) {
      setStep(1)
    }
  }, [showPermissionsStep, step])

  const { data: channelsData } = useSWR('/api/messaging/channels?scope=all', (url: string) =>
    fetch(url).then((r) => r.json())
  )

  const allChannels: MessagingChannel[] = Array.isArray(channelsData?.channels) ? channelsData.channels : []
  const opsChannels = allChannels.filter(
    (ch) => ch?.source === 'finques' || ch?.source === 'restaurants' || ch?.source === 'events'
  )
  const opsByGroup = {
    finques: opsChannels.filter((ch) => ch?.source === 'finques'),
    restaurants: opsChannels.filter((ch) => ch?.source === 'restaurants'),
  }

  const isWorker =
    role?.toLowerCase().trim() === 'treballador' ||
    role?.toLowerCase().trim() === 'cap departament'
  const requiresCorporateEmail = isAdmin || ['admin', 'direccio', 'cap'].includes(normalizeRole(role))
  const canBeTransportLead =
    normalizeRole(role) === 'cap' &&
    department
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim() === 'logistica'

  const departmentOptions = React.useMemo(
    () => getUserDepartmentSelectOptions(department),
    [department],
  )

  React.useEffect(() => {
    let active = true

    async function loadRequest(personId: string) {
      setLoading(true)
      try {
        const res = await fetch(`/api/user-requests/${personId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Error carregant sollicitud')

        if (!active) return
        setName(data.name ?? '')
        setRole(data.role ?? 'Treballador')
        setIsAdmin(Boolean(data.isAdmin || normalizeRole(data.role) === 'admin'))
        setDepartment(data.department ?? data.departmentLower ?? DEFAULT_USER_DEPARTMENT)
        setPhone(data.phone ?? '')
        setEmail(data.email ?? '')
        setAvailable(data.available ?? true)
        setIsDriver(Boolean(data.driver?.isDriver))
        setWorkerRank(data.workerRank ?? 'equip')
        setIsDepartmentRobaLead(Boolean((data as { isDepartmentRobaLead?: boolean }).isDepartmentRobaLead))
        setIsTransportLead(Boolean((data as { isTransportLead?: boolean }).isTransportLead))
        setPassword(Math.random().toString(36).slice(-8))
      } catch (err) {
        console.error('Error carregant sollicitud:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    if (user?.personId) {
      loadRequest(user.personId)
      return () => {
        active = false
      }
    }

    if (!user?.id) return

    setName(user.name ?? '')
    setRole(user.role ?? 'Treballador')
    setIsAdmin(Boolean(user.isAdmin || normalizeRole(user.role) === 'admin'))
    setDepartment(user.department ?? DEFAULT_USER_DEPARTMENT)
    setCommercialName(user.commercialName ?? '')
    setPhone(user.phone ?? '')
    setEmail(user.email ?? '')
    setOpsChannelsConfigurable(
      Array.isArray(user.opsChannelsConfigurable) ? user.opsChannelsConfigurable.map(String) : []
    )
    setOpsEventsConfigurable(Boolean(user.opsEventsConfigurable))
    setOpsProjectsConfigurable(
      typeof user.opsProjectsConfigurable === 'boolean' ? user.opsProjectsConfigurable : true
    )
    setCanRespondSurveys(Boolean(user.canRespondSurveys))
    setIsDepartmentRobaLead(Boolean(user.isDepartmentRobaLead))
    setIsTransportLead(Boolean(user.isTransportLead))
    if (user.role?.toLowerCase() === 'treballador') {
      setAvailable(user.available ?? true)
      setIsDriver(user.driver?.isDriver ?? false)
      setWorkerRank(user.workerRank ?? 'equip')
    }
  }, [user])

  React.useEffect(() => {
    if (!canBeTransportLead && isTransportLead) {
      setIsTransportLead(false)
    }
  }, [canBeTransportLead, isTransportLead])

  function validateStepOne(): boolean {
    if (!name.trim()) {
      alert('El nom és obligatori')
      return false
    }
    if ((isNewUser || isPendingApproval) && !password.trim()) {
      alert('La contrasenya és obligatòria')
      return false
    }
    if (requiresCorporateEmail && !email.trim()) {
      alert('Email corporatiu obligatori per aquest nivell')
      return false
    }
    return true
  }

  function goToPermissionsStep() {
    if (!validateStepOne()) return

    void (async () => {
      if (templateUserId) {
        const ok = await applySelectedTemplate()
        if (!ok) {
          setPermissionOverrides(buildDefaultPermissionDenies())
          setTemplateSourceName('')
        }
      } else {
        setPermissionOverrides(buildDefaultPermissionDenies())
        setTemplateSourceName('')
      }
      setStep(2)
    })()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (user?.personId) {
      if (!validateStepOne()) return

      try {
        const approveBody: Record<string, unknown> = {
          password,
          name,
          role,
          isAdmin,
          department,
          commercialName,
          phone,
          email,
          opsChannelsConfigurable,
          opsEventsConfigurable,
          opsProjectsConfigurable,
          canRespondSurveys,
          isDepartmentRobaLead,
          isTransportLead,
        }
        if (isWorker) {
          approveBody.available = available
          approveBody.isDriver = isDriver
          approveBody.workerRank = workerRank
        }
        if (showPermissionsStep) {
          approveBody.accessAssignment = { overrides: permissionOverrides }
        }

        const res = await fetch(`/api/user-requests/${user.personId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(approveBody),
        })
        const data = (await res.json()) as ApproveUserRequestResponse
        if (!res.ok) {
          const msg = data.error || "No s'ha pogut aprovar la sollicitud"
          alert(msg)
          return
        }
        onSubmit(data.user || { id: user.personId })
        onAfterAction?.()
      } catch (err) {
        console.error('Error cridant approve:', err)
      }
      return
    }

    if (user?.id) {
      const payload: User = {
        ...user,
        name,
        role,
        isAdmin,
        department,
        commercialName,
        phone,
        email,
        available,
        driver: {
          ...(user.driver || {}),
          isDriver,
        },
        workerRank,
        opsChannelsConfigurable,
        opsEventsConfigurable,
        opsProjectsConfigurable,
        canRespondSurveys,
        isDepartmentRobaLead,
        isTransportLead,
      }
      if (password.trim()) payload.password = password.trim()
      await onSubmit(payload)
      return
    }

    if (!validateStepOne()) return

    const payload: NewUserPayload = {
      name,
      password,
      role,
      isAdmin,
      department,
      commercialName,
      phone,
      email,
      opsChannelsConfigurable,
      opsEventsConfigurable,
      opsProjectsConfigurable,
      canRespondSurveys,
      isDepartmentRobaLead,
      isTransportLead,
    }
    if (isWorker) {
      payload.available = available
      payload.isDriver = isDriver
      payload.workerRank = workerRank
    }
    if (showPermissionsStep) {
      payload.accessAssignment = { overrides: permissionOverrides }
    }
    await onSubmit(payload)
  }

  const dialogTitle = user?.id
    ? 'Editar Usuari'
    : isPendingApproval
      ? step === 2
        ? 'Aprovar sol·licitud · Permisos'
        : 'Aprovar sol·licitud'
      : step === 2
        ? 'Nou Usuari · Permisos'
        : 'Nou Usuari'

  const createSubmitLabel = isPendingApproval ? 'Aprovar i crear usuari' : 'Crear Usuari'

  function renderConfigTemplatePicker(options?: {
    showApplyButton?: boolean
    permissionsOnly?: boolean
    applyLabel?: string
  }) {
    if (!canUseConfigTemplate) return null

    return (
      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <div>
          <Label className="text-sm">Copiar configuració de (opcional)</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Copia permisos UI i opcions operatives (canals ops, enquestes, etc.). No copia nom,
            email, contrasenya ni rol.
          </p>
        </div>
        <select
          className="w-full rounded-md border bg-white p-2 text-sm"
          value={templateUserId}
          onChange={(e) => {
            setTemplateUserId(e.target.value)
            if (!e.target.value) setTemplateSourceName('')
          }}
          disabled={templateLoading}
        >
          <option value="">Cap — configurar manualment</option>
          {templateUserOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {formatTemplateUserLabel(option)}
            </option>
          ))}
        </select>
        {templateSourceName ? (
          <p className="text-xs text-emerald-700">
            Plantilla aplicada des de{' '}
            <span className="font-medium">{templateSourceName}</span>.
          </p>
        ) : null}
        {options?.showApplyButton && templateUserId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={templateLoading}
            onClick={() =>
              void applySelectedTemplate({ permissionsOnly: options.permissionsOnly })
            }
          >
            {templateLoading
              ? 'Carregant…'
              : options.applyLabel || 'Aplicar plantilla ara'}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={cn(
          step === 2 ? 'sm:max-w-5xl max-h-[90vh] overflow-y-auto' : 'sm:max-w-xl'
        )}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {showPermissionsStep ? (
            <p className="text-sm text-muted-foreground">
              Pas {step} de 2 · {step === 1 ? 'Dades bàsiques' : 'Permisos d’accés'}
            </p>
          ) : null}
        </DialogHeader>

        {loading ? (
          <p className="text-center text-gray-500">Carregant dades...</p>
        ) : step === 2 && showPermissionsStep ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {renderConfigTemplatePicker({
              showApplyButton: true,
              permissionsOnly: true,
              applyLabel: 'Actualitzar permisos des de plantilla',
            })}

            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{name.trim()}</span>
              {' · '}
              {role}
              {' · '}
              {department}
            </div>

            <UserPermissionsEditor
              accessUser={previewAccessUser}
              overrides={permissionOverrides}
              onOverridesChange={setPermissionOverrides}
              compact
              intro={
                templateSourceName
                  ? `Permisos copiats de ${templateSourceName}. Revisa i ajusta abans de crear l’usuari.`
                  : isPendingApproval
                    ? 'Configura els permisos abans d’aprovar la sol·licitud. Per defecte segons el nivell i departament del pas anterior.'
                    : 'Configura els permisos abans de crear l’usuari. Per defecte segons el nivell i departament del pas anterior.'
              }
            />

            <div className="mt-6 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-2 border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                onClick={() => setStep(1)}
              >
                Enrere
              </Button>

              <Button
                type="submit"
                className="rounded-xl bg-indigo-400 px-6 py-2 font-semibold text-white shadow-md hover:bg-indigo-500"
              >
                {createSubmitLabel}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {renderConfigTemplatePicker({
              showApplyButton: true,
              applyLabel: 'Aplicar plantilla ara',
            })}

            <div>
              <Label>Nom complet</Label>
              <input
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Contrasenya {user?.id ? '(opcional)' : ''}</Label>
              <input
                type="password"
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!user?.id}
                placeholder={user?.id ? 'Deixa buit per no canviar-la' : ''}
              />
            </div>

            <div>
              <Label>Nivell</Label>
              <select
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label className="text-sm">Admin</Label>
                <div className="text-xs text-gray-500">
                  Dona permisos maxim a tots els moduls per sobre del nivell.
                </div>
              </div>
              <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
            </div>

            <div>
              <Label>Departament</Label>
              <select
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {departmentOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label className="text-sm">Responsable de roba (departament)</Label>
                <div className="text-xs text-gray-500">
                  Al mòdul Roba personal pot marcar la recollida del material preparat per al seu
                  departament.
                </div>
              </div>
              <Switch
                checked={isDepartmentRobaLead}
                onCheckedChange={setIsDepartmentRobaLead}
              />
            </div>

            {canBeTransportLead ? (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <Label className="text-sm">Responsable de transports</Label>
                  <div className="text-xs text-gray-500">
                    Rebrà notificacions i push quan un vehicle tingui la revisió vençuda.
                  </div>
                </div>
                <Switch
                  checked={isTransportLead}
                  onCheckedChange={setIsTransportLead}
                />
              </div>
            ) : null}

            {normalizeRole(role) === 'comercial' ? (
              <div>
                <Label>Nom comercial a Zoho</Label>
                <input
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                  value={commercialName}
                  onChange={(e) => setCommercialName(e.target.value)}
                  placeholder="Ex: Raquel Queralt"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Ha de coincidir amb el camp Comercial que arriba de Zoho per filtrar correctament.
                </p>
              </div>
            ) : null}

            <div>
              <Label>Telefon</Label>
              <input
                type="tel"
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="600123123"
              />
            </div>

            <div>
              <Label>Email corporatiu</Label>
              <input
                type="email"
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@calblay.com"
                required={requiresCorporateEmail}
              />
              {requiresCorporateEmail ? (
                <p className="mt-1 text-xs text-gray-500">
                  Obligatori per admin, direccio i caps de departament.
                </p>
              ) : null}
            </div>

            <div
              className={cn(
                'rounded-xl border p-3 transition',
                isWorker ? 'opacity-100' : 'pointer-events-none opacity-40'
              )}
            >
              <div className="mb-2 text-xs font-semibold text-gray-500">
                Parametres de Treballador
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm">Disponible</Label>
                  <div className="text-xs text-gray-500">Pot ser assignat a torns</div>
                </div>
                <Switch checked={available} onCheckedChange={setAvailable} />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm">Conductor</Label>
                  <div className="text-xs text-gray-500">Pot fer de conductor</div>
                </div>
                <Switch checked={isDriver} onCheckedChange={setIsDriver} />
              </div>

              <div className="py-2">
                <Label>Categoria</Label>
                <select
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                  value={workerRank}
                  onChange={(e) => setWorkerRank(e.target.value)}
                >
                  {RANKS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="mb-2 text-xs font-semibold text-gray-500">
                Canals configurables (Ops)
              </div>
              <div className="space-y-3">
                <details className="border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Finques</summary>
                  <div className="mt-2 space-y-2">
                    {opsByGroup.finques.map((ch) => {
                      const id = String(ch.id)
                      const text = ch.location || ch.name || id
                      return (
                        <label key={id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={opsChannelsConfigurable.includes(id)}
                            onChange={() =>
                              setOpsChannelsConfigurable((prev) =>
                                prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
                              )
                            }
                          />
                          <span>{text}</span>
                        </label>
                      )
                    })}
                  </div>
                </details>

                <details className="border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Restaurants</summary>
                  <div className="mt-2 space-y-2">
                    {opsByGroup.restaurants.map((ch) => {
                      const id = String(ch.id)
                      const text = ch.location || ch.name || id
                      return (
                        <label key={id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={opsChannelsConfigurable.includes(id)}
                            onChange={() =>
                              setOpsChannelsConfigurable((prev) =>
                                prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
                              )
                            }
                          />
                          <span>{text}</span>
                        </label>
                      )
                    })}
                  </div>
                </details>

                <details className="border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Projectes</summary>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={opsProjectsConfigurable}
                        onChange={(e) => setOpsProjectsConfigurable(e.target.checked)}
                      />
                      <span>Permetre xats de projectes</span>
                    </label>
                  </div>
                </details>

                <details className="border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Events</summary>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={opsEventsConfigurable}
                        onChange={(e) => setOpsEventsConfigurable(e.target.checked)}
                      />
                      <span>Permetre xats d'events</span>
                    </label>
                  </div>
                </details>

                <details className="border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Sondeigs</summary>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={canRespondSurveys}
                        onChange={(e) => setCanRespondSurveys(e.target.checked)}
                      />
                      <span>Permetre respondre sondeigs</span>
                    </label>
                  </div>
                </details>

                {opsChannels.length === 0 ? (
                  <div className="text-xs text-gray-500">No hi ha canals disponibles.</div>
                ) : null}
              </div>
            </div>

            {isSessionAdmin && user?.id ? (
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-2 border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                  asChild
                >
                  <Link
                    href={`/menu/settings/permisos/${user.id}`}
                    className="inline-flex items-center gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Gestionar permisos
                  </Link>
                </Button>
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-2 border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                onClick={onClose}
              >
                Cancella
              </Button>

              {showPermissionsStep ? (
                <Button
                  type="button"
                  className="rounded-xl bg-indigo-400 px-6 py-2 font-semibold text-white shadow-md hover:bg-indigo-500"
                  onClick={goToPermissionsStep}
                  disabled={templateLoading}
                >
                  {templateLoading ? 'Carregant plantilla…' : 'Següent · Permisos'}
                </Button>
              ) : (
                <Button
                  type="submit"
                  className={cn(
                    'rounded-xl px-6 py-2 font-semibold text-white shadow-md',
                    user?.id
                      ? 'bg-emerald-400 hover:bg-emerald-500'
                      : isPendingApproval
                        ? 'bg-indigo-400 hover:bg-indigo-500'
                        : 'bg-indigo-400 hover:bg-indigo-500'
                  )}
                >
                  {user?.id ? 'Desar Canvis' : isPendingApproval ? 'Aprovar i crear usuari' : 'Crear Usuari'}
                </Button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default UserFormModal
