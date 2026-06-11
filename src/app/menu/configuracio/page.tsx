// file: src/app/menu/configuracio/page.tsx
'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { MotionDiv } from '@/lib/lazyMotion'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Bell,
  LogOut,
  Shield,
  KeyRound,
  CalendarRange,
  ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { normalizeRole } from '@/lib/roles'

type SessionUser = {
  id: string
  name?: string
  role?: string
}

type MessagingChannel = {
  id: string
  source?: string
  subscribed?: boolean
  projectName?: string
  roomName?: string
  location?: string
  name?: string
}

type MessagingSubscriptionsResponse = {
  channels?: MessagingChannel[]
  eventsConfigurable?: boolean
  eventsEnabled?: boolean
  projectsConfigurable?: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ConfiguracioPage() {
  const { data: session, status } = useSession()
  const user = session?.user as SessionUser | undefined
  const userRole = normalizeRole(user?.role || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const { permission, error: pushError, requestPermission, subscribeUser } = usePushNotifications()

  const { data: subsData, mutate: refreshSubs } = useSWR(
    user?.id ? `/api/messaging/subscriptions` : null,
    fetcher
  )
  const subscriptions = subsData as MessagingSubscriptionsResponse | undefined
  const channels = useMemo(
    () => (Array.isArray(subscriptions?.channels) ? subscriptions.channels : []),
    [subscriptions?.channels]
  )
  const eventsConfigurable = Boolean(subsData?.eventsConfigurable)
  const eventsEnabled = Boolean(subsData?.eventsEnabled)
  const projectsConfigurable = Boolean(subsData?.projectsConfigurable)
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [savingSubs, setSavingSubs] = useState(false)

  const channelGroups = useMemo(() => {
    const defs = [
      { key: 'finques', label: 'Finques' },
      { key: 'restaurants', label: 'Restaurants' },
      { key: 'projects', label: 'Projectes' },
      { key: 'events', label: 'Events' },
    ]

    return defs.map((def) => {
      const ids = channels
        .filter((ch) => ch?.source === def.key)
        .map((ch) => ch.id)
      return { ...def, ids }
    })
  }, [channels])

  const subscribedIds = useMemo(
    () => channels.filter((c) => c.subscribed).map((c) => c.id),
    [channels]
  )

  useEffect(() => {
    setSelectedChannels((prev) => {
      if (prev.length === subscribedIds.length && prev.every((id, i) => id === subscribedIds[i])) {
        return prev
      }
      return subscribedIds
    })
  }, [subscribedIds])

  const toggleGroup = (groupKey: string) => {
    const group = channelGroups.find((g) => g.key === groupKey)
    if (!group || group.ids.length === 0) return

    setSelectedChannels((prev) => {
      const set = new Set(prev)
      const allSelected = group.ids.every((id) => set.has(id))
      if (allSelected) {
        group.ids.forEach((id) => set.delete(id))
      } else {
        group.ids.forEach((id) => set.add(id))
      }
      return Array.from(set)
    })
  }

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return
      setProfileLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/users/${user.id}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Error carregant perfil')
        setName(data.name || '')
        setEmail(data.email || '')
        setPhone(data.phone || '')
        if (userRole !== 'admin' && Array.isArray(data.opsChannelsConfigurable)) {
          const allowed = data.opsChannelsConfigurable.map(String).filter(Boolean)
          setSelectedChannels((prev) => prev.filter((id) => allowed.includes(id)))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error carregant perfil')
      } finally {
        setProfileLoading(false)
      }
    }
    loadProfile()
  }, [user?.id, userRole])

  if (status === 'loading') return <p className="p-4">Carregant...</p>
  if (!user) return <p className="p-4">No autoritzat.</p>

  const enablePush = async () => {
    if (!user?.id) return
    try {
      setPushLoading(true)
      const perm = await requestPermission()
      if (perm !== 'granted') return
      const ok = await subscribeUser(user.id)
      if (!ok) return
      setPushEnabled(true)
    } finally {
      setPushLoading(false)
    }
  }

  // Desa perfil
  const saveProfile = async () => {
    if (!user?.id) return
    setProfileSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      }
      if (password.trim()) payload.password = password.trim()

      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message =
          typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Error desant perfil'
        throw new Error(message)
      }

      setSuccess('Canvis desats correctament')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant perfil')
    } finally {
      setProfileSaving(false)
    }
  }

  const saveSubscriptions = async () => {
    try {
      setSavingSubs(true)
      const filtered = selectedChannels.filter((id) => !String(id).startsWith('event_'))
      await fetch('/api/messaging/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: filtered, eventsEnabled }),
      })
      await refreshSubs()
    } finally {
      setSavingSubs(false)
    }
  }

  return (
    <section className="w-full max-w-md mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-center mb-4">Configuració</h1>

      {/* Push */}
      <MotionDiv
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl bg-white shadow border border-gray-200 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold text-lg">Notificacions Push</h2>
        </div>

        <div className="flex items-center justify-between">
          <Label>Rebre notificacions al mòbil</Label>
          <Button
            onClick={enablePush}
            disabled={pushLoading || pushEnabled}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {pushEnabled ? 'Activat' : 'Activar'}
          </Button>
        </div>

        {pushLoading && <p className="text-sm text-blue-600">Activant...</p>}
        {pushError && <p className="text-xs text-red-600">Error: {pushError}</p>}
        {permission === 'denied' && (
          <p className="text-xs text-amber-600">
            Has bloquejat les notificacions. Caldrà activar-les als ajustos del navegador.
          </p>
        )}
      </MotionDiv>

      {/* Perfil i contrasenya */}
      <MotionDiv
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl bg-white shadow border border-gray-200 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-lg">Perfil i seguretat</h2>
        </div>

        {profileLoading ? (
          <p className="text-sm text-gray-500">Carregant perfil...</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Nom d'usuari</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuari@exemple.com"
              />
            </div>
            <div>
              <Label>Telèfon</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="600123123"
              />
            </div>
            <div>
              <Label>Contrasenya (opcional)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixa buit per no canviar-la"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            <div className="flex justify-end">
              <Button
                onClick={saveProfile}
                disabled={profileSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {profileSaving ? 'Desant...' : 'Desar canvis'}
              </Button>
            </div>
          </div>
        )}
      </MotionDiv>

      {/* Subscripcions missatgeria */}
      <MotionDiv
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl bg-white shadow border border-gray-200 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-lg">Ops · Subscripcions</h2>
        </div>

        {channelGroups.every((group) => group.ids.length === 0) && !projectsConfigurable ? (
          <p className="text-sm text-gray-500">
            No tens canals configurables.
          </p>
        ) : (
          <div className="space-y-3">
              {channelGroups
                .filter(
                  (group) =>
                    group.ids.length > 0 ||
                    (group.key === 'events' && eventsConfigurable) ||
                    (group.key === 'projects' && projectsConfigurable)
                )
                .map((group) => {
                  const selectedCount = group.ids.filter((id) => selectedChannels.includes(id)).length
                  const allSelected = selectedCount === group.ids.length
                  const someSelected = selectedCount > 0 && !allSelected

                  return (
                    <details key={group.key} className="border rounded-lg px-3 py-2">
                      <summary className="flex items-center justify-between cursor-pointer text-sm">
                        <label className="flex items-center gap-2">
                          {group.key === 'events' ? (
                            <input
                              type="checkbox"
                              checked={eventsEnabled}
                              onChange={async (e) => {
                                const next = e.target.checked
                                await fetch('/api/messaging/subscriptions', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    channelIds: selectedChannels.filter(
                                      (id) => !String(id).startsWith('event_')
                                    ),
                                    eventsEnabled: next,
                                  }),
                                })
                                await refreshSubs()
                              }}
                            />
                          ) : group.key === 'projects' ? (
                            <input
                              type="checkbox"
                              checked={projectsConfigurable}
                              readOnly
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected
                              }}
                              onChange={(e) => {
                                e.preventDefault()
                                toggleGroup(group.key)
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <span className="font-medium">{group.label}</span>
                        </label>
                        <span className="text-xs text-gray-500">
                          {group.key === 'events'
                            ? eventsEnabled
                              ? 'Actiu'
                              : 'Inactiu'
                            : group.key === 'projects'
                            ? projectsConfigurable
                              ? 'Actiu'
                              : 'Inactiu'
                            : someSelected
                            ? 'Parcial'
                            : allSelected
                            ? 'Tot'
                            : 'Cap'}
                        </span>
                      </summary>

                      {group.key === 'projects' ? (
                        <div className="mt-2 text-sm text-gray-500">
                          Els xats de projectes es gestionen automàticament segons les sales i els participants.
                        </div>
                      ) : group.key !== 'events' ? (
                        <div className="mt-2 space-y-2">
                          {group.ids.map((id) => {
                            const ch = channels.find((c) => c.id === id)
                            if (!ch) return null
                            const label =
                              ch.source === 'projects'
                                ? [ch.projectName, ch.roomName || ch.location || ch.name].filter(Boolean).join(' · ')
                                : ch.location || ch.name
                            return (
                              <label key={id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedChannels.includes(id)}
                                  onChange={() =>
                                    setSelectedChannels((prev) =>
                                      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
                                    )
                                  }
                                />
                                <span>{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      ) : null}
                    </details>
                  )
                })}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={saveSubscriptions}
            disabled={savingSubs}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {savingSubs ? 'Desant...' : 'Desar subscripcions'}
          </Button>
        </div>
      </MotionDiv>
{/* Integracions placeholder */}
      <MotionDiv
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl bg-white shadow border border-gray-200 space-y-3"
      >
        <div className="flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-indigo-500" />
          <h2 className="font-semibold text-lg">Integracions</h2>
        </div>
        <p className="text-sm text-gray-600">
          Properament: connexió amb Google Calendar i Outlook per sincronitzar esdeveniments i torns.
        </p>
      </MotionDiv>

      {/* Privadesa i compte */}
      <MotionDiv
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl bg-white shadow border border-gray-200 space-y-4"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-lg">Privadesa i dades</h2>
        </div>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setShowPrivacy((v) => !v)}
          >
            {showPrivacy ? 'Amagar text' : 'Llegir avís de privadesa'}
          </Button>
          {showPrivacy && (
            <p className="text-sm text-gray-600">
              Catering Cal Blay S.L. tracta les dades per a la gestió de serveis, personal i comunicacions internes.
              Pots sol·licitar rectificació o eliminació escrivint a{' '}
              <a href="mailto:rrhh@calblay.com" className="text-blue-600 underline">rrhh@calblay.com</a>.
              Les dades s'emmagatzemen de forma segura i només es comparteixen amb proveïdors necessaris per al servei.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-red-500" />
          <h2 className="font-semibold text-lg">Compte</h2>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 text-red-600 font-semibold"
        >
          <LogOut className="w-5 h-5" />
          Tancar sessió
        </button>
      </MotionDiv>
    </section>
  )
}

