'use client'

import * as React from 'react'
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
import { DEPARTMENTS } from '@/data/departments'
import useSWR from 'swr'

export interface User {
  id?: string
  personId?: string
  name?: string
  role?: string
  isAdmin?: boolean
  department?: string
  available?: boolean
  driver?: { isDriver?: boolean }
  workerRank?: string
  phone?: string
  email?: string
  password?: string
  opsChannelsConfigurable?: string[]
  opsEventsConfigurable?: boolean
  opsProjectsConfigurable?: boolean
}

export interface NewUserPayload {
  name: string
  password: string
  role: string
  isAdmin?: boolean
  department: string
  opsChannelsConfigurable?: string[]
  opsEventsConfigurable?: boolean
  opsProjectsConfigurable?: boolean
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  phone?: string
  email?: string
}

type Props = {
  user: User | null
  onSubmit: (data: User | NewUserPayload) => void
  onClose: () => void
  onAfterAction?: () => void
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
  const [loading, setLoading] = React.useState(false)

  const [name, setName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<string>('Treballador')
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [department, setDepartment] = React.useState<string>('Total')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [available, setAvailable] = React.useState(true)
  const [isDriver, setIsDriver] = React.useState(false)
  const [workerRank, setWorkerRank] = React.useState<string>('equip')
  const [opsChannelsConfigurable, setOpsChannelsConfigurable] = React.useState<string[]>([])
  const [opsEventsConfigurable, setOpsEventsConfigurable] = React.useState(false)
  const [opsProjectsConfigurable, setOpsProjectsConfigurable] = React.useState(true)

  const { data: channelsData } = useSWR('/api/messaging/channels?scope=all', (url: string) =>
    fetch(url).then((r) => r.json())
  )

  const allChannels = Array.isArray(channelsData?.channels) ? channelsData.channels : []
  const opsChannels = allChannels.filter(
    (ch: any) => ch?.source === 'finques' || ch?.source === 'restaurants' || ch?.source === 'events'
  )
  const opsByGroup = {
    finques: opsChannels.filter((ch: any) => ch?.source === 'finques'),
    restaurants: opsChannels.filter((ch: any) => ch?.source === 'restaurants'),
  }

  const isWorker =
    role?.toLowerCase().trim() === 'treballador' ||
    role?.toLowerCase().trim() === 'cap departament'
  const requiresCorporateEmail = isAdmin || ['admin', 'direccio', 'cap'].includes(normalizeRole(role))

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
        setDepartment(data.department ?? data.departmentLower ?? 'Total')
        setPhone(data.phone ?? '')
        setEmail(data.email ?? '')
        setAvailable(data.available ?? true)
        setIsDriver(Boolean(data.driver?.isDriver))
        setWorkerRank(data.workerRank ?? 'equip')
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
    setDepartment(user.department ?? 'Total')
    setPhone(user.phone ?? '')
    setEmail(user.email ?? '')
    setOpsChannelsConfigurable(
      Array.isArray(user.opsChannelsConfigurable) ? user.opsChannelsConfigurable.map(String) : []
    )
    setOpsEventsConfigurable(Boolean(user.opsEventsConfigurable))
    setOpsProjectsConfigurable(
      typeof user.opsProjectsConfigurable === 'boolean' ? user.opsProjectsConfigurable : true
    )
    if (user.role?.toLowerCase() === 'treballador') {
      setAvailable(user.available ?? true)
      setIsDriver(user.driver?.isDriver ?? false)
      setWorkerRank(user.workerRank ?? 'equip')
    }
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (user?.personId) {
      try {
        const res = await fetch(`/api/user-requests/${user.personId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        const data = await res.json()
        if (!res.ok) {
          const msg = (data && (data as any).error) || "No s'ha pogut aprovar la sollicitud"
          alert(msg)
          return
        }
        onSubmit((data as any).user || { id: user.personId })
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
        phone,
        email,
        available,
        isDriver,
        workerRank,
        opsChannelsConfigurable,
        opsEventsConfigurable,
        opsProjectsConfigurable,
      }
      if (password.trim()) payload.password = password.trim()
      onSubmit(payload)
      return
    }

    const payload: NewUserPayload = {
      name,
      password,
      role,
      isAdmin,
      department,
      phone,
      email,
      opsChannelsConfigurable,
      opsEventsConfigurable,
      opsProjectsConfigurable,
    }
    if (isWorker) {
      payload.available = available
      payload.isDriver = isDriver
      payload.workerRank = workerRank
    }
    onSubmit(payload)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{user?.id ? 'Editar Usuari' : 'Nou Usuari'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-center text-gray-500">Carregant dades...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
                {DEPARTMENTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

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
                    {opsByGroup.finques.map((ch: any) => {
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
                    {opsByGroup.restaurants.map((ch: any) => {
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

                {opsChannels.length === 0 ? (
                  <div className="text-xs text-gray-500">No hi ha canals disponibles.</div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-2 border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                onClick={onClose}
              >
                Cancella
              </Button>

              <Button
                type="submit"
                className={cn(
                  'rounded-xl px-6 py-2 font-semibold text-white shadow-md',
                  user?.id ? 'bg-emerald-400 hover:bg-emerald-500' : 'bg-indigo-400 hover:bg-indigo-500'
                )}
              >
                {user?.id ? 'Desar Canvis' : 'Crear Usuari'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default UserFormModal
