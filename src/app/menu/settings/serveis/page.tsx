'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ConciergeBell, Plus, Search, Shield, Trash2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MotionDiv } from '@/lib/lazyMotion'
import { slugifyServeiCodi } from '@/lib/serveis/utils'
import {
  SETTINGS_SERVEIS_PATH,
  canEditSettingsSubpath,
  canViewSettingsSubpath,
} from '@/lib/settingsPermissions'
import { useUiPermissions } from '@/hooks/useUiPermissions'

type Servei = {
  id: string
  nom: string
  codi: string
  searchable: string
  origen?: string
  updatedAt: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SettingsServeisPage() {
  const { ready: permsReady, canViewPath, canEditPath } = useUiPermissions()
  const canView = canViewSettingsSubpath(canViewPath, SETTINGS_SERVEIS_PATH)
  const canEdit = canEditSettingsSubpath(canEditPath, SETTINGS_SERVEIS_PATH)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const listUrl = permsReady && canView
    ? `/api/serveis${debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : ''}`
    : null

  const { data, mutate, isLoading } = useSWR<{ serveis?: Servei[] }>(listUrl, fetcher)
  const serveis = useMemo(() => data?.serveis ?? [], [data?.serveis])

  const previewCodi = useMemo(() => slugifyServeiCodi(nom), [nom])

  const createServei = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/serveis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant servei'))
      setNom('')
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creant servei')
    } finally {
      setBusy(false)
    }
  }

  const updateServei = async (servei: Servei, nextNom: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/serveis/${encodeURIComponent(servei.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nextNom }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant servei'))
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualitzant servei')
    } finally {
      setBusy(false)
    }
  }

  const deleteServei = async (servei: Servei) => {
    if (!window.confirm(`Eliminar el servei «${servei.nom}»?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/serveis/${encodeURIComponent(servei.id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error eliminant servei'))
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminant servei')
    } finally {
      setBusy(false)
    }
  }

  if (!permsReady) {
    return <p className="p-4 text-sm text-slate-500">Carregant…</p>
  }

  if (!canView) {
    return <p className="p-4 text-sm text-red-600">No tens permís per accedir a aquesta pàgina.</p>
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-4 pb-8 lg:px-6 xl:px-8">
      <ModuleHeader
        icon={<Shield className="h-6 w-6 text-slate-700" />}
        mainHref="/menu/settings"
      />

      <p className="text-sm text-slate-600">
        Catàleg de serveis utilitzat als esdeveniments, quadrants i cerques. Els documents es desen a
        la col·lecció <code className="text-xs">serveis</code> de Firestore.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {canEdit ? (
        <MotionDiv
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow"
        >
          <div className="flex items-center gap-2">
            <ConciergeBell className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-lg">Nou servei</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label>Nom</Label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Casament clàssic"
              />
            </div>
            <div>
              <Label>Codi (auto)</Label>
              <Input value={previewCodi} readOnly className="font-mono text-xs bg-slate-50" />
            </div>
            <div className="flex items-end justify-end">
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={busy || !nom.trim() || !previewCodi}
                onClick={() => void createServei()}
              >
                <Plus className="h-4 w-4" />
                Afegir
              </Button>
            </div>
          </div>
        </MotionDiv>
      ) : null}

      <MotionDiv
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h2 className="font-semibold">Llista de serveis</h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nom o codi…"
              className="h-9 pl-8"
            />
          </div>
        </div>
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Carregant…</p>
        ) : serveis.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {debouncedQuery ? 'Cap servei coincideix amb la cerca.' : 'Encara no hi ha serveis.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[34%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[5.5rem]" />
              </colgroup>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Codi</th>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Actualitzat</th>
                  <th className="px-3 py-2 text-right">Accions</th>
                </tr>
              </thead>
              <tbody>
                {serveis.map((servei) => (
                  <ServeiRow
                    key={servei.id}
                    servei={servei}
                    busy={busy}
                    canEdit={canEdit}
                    onSave={(nextNom) => void updateServei(servei, nextNom)}
                    onDelete={() => void deleteServei(servei)}
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

function ServeiRow({
  servei,
  busy,
  canEdit,
  onSave,
  onDelete,
}: {
  servei: Servei
  busy: boolean
  canEdit: boolean
  onSave: (nom: string) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(servei.nom)
  const dirtyName = name.trim() !== servei.nom

  useEffect(() => {
    setName(servei.nom)
  }, [servei.nom])

  const updatedLabel = servei.updatedAt
    ? new Date(servei.updatedAt).toLocaleString('ca-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—'

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 align-middle font-mono text-xs">{servei.codi}</td>
      <td className="px-3 py-2 align-middle">
        {canEdit ? (
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        ) : (
          <span>{servei.nom}</span>
        )}
      </td>
      <td className="px-3 py-2 align-middle text-xs text-slate-600">{servei.origen || '—'}</td>
      <td className="px-3 py-2 align-middle text-xs text-slate-500">{updatedLabel}</td>
      <td className="px-3 py-2 align-middle">
        <div className="flex justify-end gap-2">
          {canEdit && dirtyName ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !name.trim()}
              onClick={() => onSave(name.trim())}
            >
              Desar
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}
