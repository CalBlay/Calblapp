'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
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

export default function AdminPermisosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = normalizeRole(session?.user?.role || '')
  const [bootLoading, setBootLoading] = useState(false)
  const [bootMsg, setBootMsg] = useState<string | null>(null)

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Cerca (MVP)</Label>
            <Input placeholder="Nom, email, rol..." disabled />
          </div>
          <div className="space-y-1">
            <Label>Scope</Label>
            <Input value="Client/Empresa (base)" disabled />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          L’API guarda `permissions_defaults/v1` (si no existeix) i `user_access_assignments/{'{userId}'}` per cada usuari.
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
          {(data?.users || []).map((u) => (
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
          {!isLoading && (data?.users?.length || 0) === 0 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">No hi ha usuaris.</div>
          )}
          {isLoading && <div className="px-3 py-6 text-sm text-muted-foreground">Carregant…</div>}
        </div>
      </div>
    </section>
  )
}

