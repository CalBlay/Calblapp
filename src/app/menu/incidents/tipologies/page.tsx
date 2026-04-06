'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Plus } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { canManageIncidentCategories } from '@/lib/incidentPolicy'
import { familyLabelForCategoryId, mergeFamilyLabels } from '@/lib/incidentTypology'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type CategoryRow = {
  id: string
  label: string
  active: boolean
  sortOrder: number
  fromDefaults: boolean
}

export default function IncidentTipologiesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as { role?: string; department?: string } | undefined
  const canManage = canManageIncidentCategories(user || {})

  const [rows, setRows] = useState<CategoryRow[]>([])
  const [families, setFamilies] = useState<Record<string, string>>(() => mergeFamilyLabels(undefined))
  const [familyEdits, setFamilyEdits] = useState<Record<string, string>>(() => mergeFamilyLabels(undefined))
  const [newFamilyPrefix, setNewFamilyPrefix] = useState('')
  const [newFamilyLabel, setNewFamilyLabel] = useState('')
  const [savingFamilies, setSavingFamilies] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [edits, setEdits] = useState<Record<string, { label: string; sortOrder: string }>>({})
  const [newId, setNewId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newSort, setNewSort] = useState('')
  const [savingId, setSavingId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.replace('/login')
      return
    }
    if (!canManage) {
      router.replace('/menu/incidents')
    }
  }, [status, session, router, canManage])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [catRes, famRes] = await Promise.all([
        fetch('/api/incidents/categories', { cache: 'no-store' }),
        fetch('/api/incidents/category-families', { cache: 'no-store' }),
      ])
      const json = await catRes.json().catch(() => ({}))
      if (!catRes.ok) throw new Error(String(json?.error || 'Error carregant'))

      let famMap = mergeFamilyLabels(undefined)
      if (famRes.ok) {
        const famJson = await famRes.json().catch(() => ({}))
        if (famJson.families && typeof famJson.families === 'object') {
          famMap = famJson.families as Record<string, string>
        }
      }
      setFamilies(famMap)
      setFamilyEdits(famMap)

      const list = Array.isArray(json.categories) ? (json.categories as CategoryRow[]) : []
      setRows(list)
      const nextEdits: Record<string, { label: string; sortOrder: string }> = {}
      list.forEach((r) => {
        nextEdits[r.id] = { label: r.label, sortOrder: String(r.sortOrder ?? '') }
      })
      setEdits(nextEdits)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canManage) return
    void load()
  }, [canManage, load])

  const saveFamilies = async () => {
    setSavingFamilies(true)
    setError('')
    try {
      const res = await fetch('/api/incidents/category-families', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: familyEdits }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error desant grups'))
      const f = json.families && typeof json.families === 'object' ? json.families : familyEdits
      setFamilies(f as Record<string, string>)
      setFamilyEdits(f as Record<string, string>)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant grups')
    } finally {
      setSavingFamilies(false)
    }
  }

  const addFamilyRow = () => {
    const d = newFamilyPrefix.trim().charAt(0)
    if (!/^[0-9]$/.test(d)) {
      setError('El prefix ha de ser una sola xifra (ex. 2 per a 2XX).')
      return
    }
    const lab = newFamilyLabel.trim()
    if (!lab) {
      setError('Indica el nom del grup.')
      return
    }
    setError('')
    setFamilyEdits((prev) => ({ ...prev, [d]: lab }))
    setNewFamilyPrefix('')
    setNewFamilyLabel('')
  }

  const saveRow = async (id: string) => {
    const e = edits[id]
    if (!e) return
    setSavingId(id)
    setError('')
    try {
      const sortOrder = parseInt(e.sortOrder, 10)
      const res = await fetch(`/api/incidents/categories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: e.label.trim(),
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error desant'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant')
    } finally {
      setSavingId('')
    }
  }

  const toggleActive = async (id: string, active: boolean) => {
    setSavingId(id)
    setError('')
    try {
      const res = await fetch(`/api/incidents/categories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSavingId('')
    }
  }

  const createCategory = async () => {
    const id = newId.trim()
    const label = newLabel.trim()
    if (!id || !label) return
    setCreating(true)
    setError('')
    try {
      const sortOrder = newSort.trim() ? parseInt(newSort, 10) : undefined
      const res = await fetch('/api/incidents/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          label,
          ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant'))
      setNewId('')
      setNewLabel('')
      setNewSort('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creant')
    } finally {
      setCreating(false)
    }
  }

  const familyKeys = Object.keys(familyEdits).sort((a, b) => a.localeCompare(b))

  if (status === 'loading' || !canManage) {
    return <div className={`p-6 text-center ${typography('bodySm')}`}>Carregant…</div>
  }

  return (
    <div className="p-4 flex flex-col gap-6 w-full max-w-5xl">
      <ModuleHeader
        icon={<AlertTriangle className="w-7 h-7 text-yellow-600" />}
        title="Incidències"
        subtitle="Tipologies"
        mainHref="/menu/incidents"
        actions={
          <Link href="/menu/incidents" className={`${typography('bodyMd')} font-medium hover:underline`}>
            ← Tauler
          </Link>
        }
      />

      {error ? <p className={`${typography('bodySm')} text-red-600`}>{error}</p> : null}

      {/* Grups 2XX / 4XX */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
        <div>
          <div className={typography('sectionTitle')}>Grups per codi (prefix)</div>
          <p className={`${typography('bodySm')} mt-1`}>
            La primera xifra del codi defineix el grup (ex. 201 → 2XX = Maquinària). Pots canviar
            els noms dels grups; es mostren a la taula de sota.
          </p>
        </div>
        <div className="space-y-2">
          {familyKeys.map((prefix) => (
            <div key={prefix} className="flex flex-wrap items-center gap-2">
              <span className={`font-mono w-14 shrink-0 ${typography('bodyMd')}`}>{prefix}XX</span>
              <Input
                className="max-w-md flex-1 min-w-[12rem]"
                value={familyEdits[prefix] ?? ''}
                onChange={(ev) =>
                  setFamilyEdits((prev) => ({ ...prev, [prefix]: ev.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-100">
          <div>
            <label className={`${typography('label')} block mb-1`}>Afegir prefix</label>
            <Input
              className="w-16 font-mono"
              placeholder="9"
              maxLength={1}
              value={newFamilyPrefix}
              onChange={(e) => setNewFamilyPrefix(e.target.value.replace(/\D/g, '').slice(0, 1))}
            />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className={`${typography('label')} block mb-1`}>Nom del grup</label>
            <Input
              placeholder="Ex. Qualitat"
              value={newFamilyLabel}
              onChange={(e) => setNewFamilyLabel(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addFamilyRow}>
            Afegir línia
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={savingFamilies}
            onClick={() => void saveFamilies()}
          >
            {savingFamilies ? 'Desant…' : 'Desar grups'}
          </Button>
        </div>
      </div>

      {/* Nova categoria */}
      <form
        className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4 space-y-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void createCategory()
        }}
      >
        <div className={typography('sectionTitle')}>Nova categoria</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={`${typography('label')} block mb-1`}>Codi id *</label>
            <Input
              placeholder="Ex. 901"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={`${typography('label')} block mb-1`}>Etiqueta *</label>
            <Input
              placeholder="Descripció curta"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={`${typography('label')} block mb-1`}>Ordre (opcional)</label>
            <Input
              placeholder="Número"
              value={newSort}
              onChange={(e) => setNewSort(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full sm:w-auto min-h-11 px-6"
          disabled={creating || !newId.trim() || !newLabel.trim()}
        >
          <Plus className="w-5 h-5 mr-2 shrink-0" />
          {creating ? 'Afegint…' : 'Afegir al catàleg'}
        </Button>
      </form>

      {loading ? (
        <p className={typography('bodySm')}>Carregant categories…</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto shadow-sm">
          <table className={cn('w-full min-w-[640px]', typography('bodySm'))}>
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className={`p-2 w-20 ${typography('label')}`}>Id</th>
                <th className={`p-2 min-w-[140px] ${typography('label')}`}>Família</th>
                <th className={`p-2 min-w-[180px] ${typography('label')}`}>Etiqueta</th>
                <th className={`p-2 w-24 ${typography('label')}`}>Ordre</th>
                <th className={`p-2 w-28 ${typography('label')}`}>Actiu</th>
                <th className={`p-2 w-28 ${typography('label')}`}>Desar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const e = edits[r.id] || { label: r.label, sortOrder: String(r.sortOrder) }
                const fam = familyLabelForCategoryId(r.id, families)
                return (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className={`p-2 font-mono align-middle ${typography('bodyXs')}`}>{r.id}</td>
                    <td className={`p-2 align-middle ${typography('bodyMd')}`}>{fam}</td>
                    <td className="p-2">
                      <Input
                        value={e.label}
                        onChange={(ev) =>
                          setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...e, label: ev.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        className="w-20"
                        value={e.sortOrder}
                        onChange={(ev) =>
                          setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...e, sortOrder: ev.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant={r.active ? 'secondary' : 'outline'}
                        disabled={savingId === r.id}
                        onClick={() => void toggleActive(r.id, !r.active)}
                      >
                        {r.active ? 'Actiu' : 'Inactiu'}
                      </Button>
                    </td>
                    <td className="p-2 align-middle">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="whitespace-nowrap"
                        disabled={savingId === r.id}
                        onClick={() => void saveRow(r.id)}
                      >
                        Desar
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
