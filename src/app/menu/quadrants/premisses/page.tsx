'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Plus, Save, Trash2, UserPlus } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { normalizeRole } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DriverCrewPremise, Premises } from '@/services/premises'

type MetaState = {
  source: 'firestore' | 'fallback'
  warnings: string[]
}

type EditableCondition = {
  id: string
  locations: string[]
  responsible: string
}

type PersonnelOption = {
  id: string
  name: string
  isDriver: boolean
}

type EditableDriverCrew = {
  id: string
  driverId: string
  companionIds: string[]
}

type FincaOption = {
  id: string
  name: string
}

const DEPARTMENTS = ['serveis', 'logistica', 'cuina'] as const

const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const prettyDepartment = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value

const buildSnapshot = ({
  department,
  premises,
  defaultCharacteristicsText,
  conditions,
  driverCrews,
}: {
  department: string
  premises: Premises
  defaultCharacteristicsText: string
  conditions: EditableCondition[]
  driverCrews: EditableDriverCrew[]
}) =>
  JSON.stringify({
    department,
    restHours: premises.restHours,
    allowMultipleEventsSameDay: premises.allowMultipleEventsSameDay,
    maxFirstEventDurationHours: premises.maxFirstEventDurationHours || 0,
    requireResponsible: Boolean(premises.requireResponsible),
    defaultCharacteristicsText,
    conditions: conditions.map((condition) => ({
      id: condition.id,
      locations: condition.locations,
      responsible: condition.responsible,
    })),
    driverCrews: driverCrews.map((crew) => ({
      id: crew.id,
      driverId: crew.driverId,
      companionIds: crew.companionIds,
    })),
  })

const emptyPremises = (department: string): Premises => ({
  department,
  defaultCharacteristics: ['Treballador', 'Responsable', 'Conductor'],
  restHours: 8,
  allowMultipleEventsSameDay: true,
  maxFirstEventDurationHours: 24,
  requireResponsible: true,
  conditions: [],
})

const toEditableConditions = (premises: Premises): EditableCondition[] =>
  (premises.conditions || []).map((condition) => ({
    id: condition.id,
    locations: condition.locations,
    responsible: condition.responsible,
  }))

const toEditableDriverCrews = (
  premises: Premises,
  people: PersonnelOption[]
): EditableDriverCrew[] => {
  const ids = new Set(people.map((item) => item.id))
  return (premises.driverCrews || []).map((crew, index) => ({
    id: crew.id || `crew-${index + 1}`,
    driverId:
      crew.driverId && ids.has(crew.driverId)
        ? crew.driverId
        : people.find((item) => item.isDriver && item.name === crew.driverName)?.id || '',
    companionIds: (crew.companions || [])
      .map((companion) =>
        companion.id && ids.has(companion.id)
          ? companion.id
          : people.find((item) => item.name === companion.name)?.id || ''
      )
      .filter(Boolean),
  }))
}

export default function QuadrantPremisesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const role = normalizeRole(String((session?.user as any)?.role || ''))
  const sessionDept = norm(String((session?.user as any)?.department || 'serveis'))
  const canSelectDepartment = role === 'admin' || role === 'direccio'
  const lastSavedSnapshotRef = useRef('')
  const hydratingDepartmentRef = useRef(false)

  const [department, setDepartment] = useState<string>('serveis')
  const [premises, setPremises] = useState<Premises>(emptyPremises('serveis'))
  const [conditions, setConditions] = useState<EditableCondition[]>([])
  const [people, setPeople] = useState<PersonnelOption[]>([])
  const [finques, setFinques] = useState<FincaOption[]>([])
  const [driverCrews, setDriverCrews] = useState<EditableDriverCrew[]>([])
  const [defaultCharacteristicsText, setDefaultCharacteristicsText] = useState(
    'Treballador, Responsable, Conductor'
  )
  const [meta, setMeta] = useState<MetaState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    if (!canSelectDepartment && sessionDept) {
      setDepartment(sessionDept)
      return
    }
    if (canSelectDepartment) {
      setDepartment((prev) => prev || 'serveis')
    }
  }, [status, canSelectDepartment, sessionDept])

  useEffect(() => {
    if (status !== 'authenticated' || !department) return

    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      setSuccess(null)
      hydratingDepartmentRef.current = true
      try {
        const res = await fetch(
          `/api/quadrants/premises?department=${encodeURIComponent(department)}`,
          { cache: 'no-store' }
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No s’han pogut carregar les premisses')
        if (cancelled) return

        const nextPremises = (json?.premises || emptyPremises(department)) as Premises
        const nextConditions = toEditableConditions(nextPremises)
        const nextDefaultCharacteristicsText = (nextPremises.defaultCharacteristics || []).join(', ')
        const nextDriverCrews = toEditableDriverCrews(nextPremises, people)
        setPremises(nextPremises)
        setConditions(nextConditions)
        setDriverCrews(nextDriverCrews)
        setDefaultCharacteristicsText(nextDefaultCharacteristicsText)
        setMeta(json?.meta || null)
        lastSavedSnapshotRef.current = buildSnapshot({
          department,
          premises: nextPremises,
          defaultCharacteristicsText: nextDefaultCharacteristicsText,
          conditions: nextConditions,
          driverCrews: nextDriverCrews,
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error carregant premisses')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [status, department, people])

  useEffect(() => {
    if (status !== 'authenticated' || !department) return

    let cancelled = false

    const run = async () => {
      try {
        const res = await fetch(
          `/api/quadrants/premises/personnel?department=${encodeURIComponent(department)}`,
          { cache: 'no-store' }
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No s’ha pogut carregar el personal')
        if (cancelled) return

        const nextPeople = Array.isArray(json?.people) ? (json.people as PersonnelOption[]) : []
        setPeople(nextPeople)
        const nextDriverCrews = driverCrews.length > 0
          ? driverCrews.map((crew) => ({
              ...crew,
              driverId: nextPeople.some((item) => item.id === crew.driverId) ? crew.driverId : '',
              companionIds: crew.companionIds.filter((id) =>
                nextPeople.some((item) => item.id === id)
              ),
            }))
          : toEditableDriverCrews(premises, nextPeople)
        setDriverCrews(nextDriverCrews)
        if (hydratingDepartmentRef.current) {
          lastSavedSnapshotRef.current = buildSnapshot({
            department,
            premises,
            defaultCharacteristicsText,
            conditions,
            driverCrews: nextDriverCrews,
          })
          hydratingDepartmentRef.current = false
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [status, department])

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false

    const run = async () => {
      try {
        const res = await fetch('/api/quadrants/premises/finques', {
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No s’han pogut carregar les finques')
        if (!cancelled) {
          setFinques(Array.isArray(json?.finques) ? (json.finques as FincaOption[]) : [])
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [status])

  const warningText = useMemo(() => {
    if (!meta?.warnings?.length) return null
    return meta.warnings.join(', ')
  }, [meta])

  const currentSnapshot = useMemo(
    () =>
      buildSnapshot({
        department,
        premises,
        defaultCharacteristicsText,
        conditions,
        driverCrews,
      }),
    [conditions, defaultCharacteristicsText, department, driverCrews, premises]
  )

  const dirty = !loading && currentSnapshot !== lastSavedSnapshotRef.current

  const drivers = useMemo(
    () => people.filter((item) => item.isDriver),
    [people]
  )

  const peopleById = useMemo(
    () =>
      people.reduce<Record<string, PersonnelOption>>((acc, item) => {
        acc[item.id] = item
        return acc
      }, {}),
    [people]
  )

  const updateCondition = (id: string, patch: Partial<EditableCondition>) => {
    setConditions((prev) =>
      prev.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition
      )
    )
  }

  const addCondition = () => {
    const id = `condition-${Date.now()}`
    setConditions((prev) => [
      ...prev,
      {
        id,
        locations: [],
        responsible: '',
      },
    ])
  }

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((condition) => condition.id !== id))
  }

  const addLocationToCondition = (conditionId: string) => {
    const condition = conditions.find((item) => item.id === conditionId)
    if (!condition) return
    const next = finques.find((finca) => !condition.locations.includes(finca.name))
    if (!next) return
    updateCondition(conditionId, {
      locations: [...condition.locations, next.name],
    })
  }

  const updateConditionLocation = (
    conditionId: string,
    index: number,
    value: string
  ) => {
    const condition = conditions.find((item) => item.id === conditionId)
    if (!condition) return
    const nextLocations = [...condition.locations]
    nextLocations[index] = value
    updateCondition(conditionId, {
      locations: nextLocations.filter(Boolean),
    })
  }

  const removeConditionLocation = (conditionId: string, index: number) => {
    const condition = conditions.find((item) => item.id === conditionId)
    if (!condition) return
    updateCondition(conditionId, {
      locations: condition.locations.filter((_, itemIndex) => itemIndex !== index),
    })
  }

  const updateDriverCrew = (id: string, patch: Partial<EditableDriverCrew>) => {
    setDriverCrews((prev) =>
      prev.map((crew) => (crew.id === id ? { ...crew, ...patch } : crew))
    )
  }

  const addDriverCrew = () => {
    setDriverCrews((prev) => [
      ...prev,
      {
        id: `driver-crew-${Date.now()}`,
        driverId: '',
        companionIds: [],
      },
    ])
  }

  const removeDriverCrew = (id: string) => {
    setDriverCrews((prev) => prev.filter((crew) => crew.id !== id))
  }

  const addCompanionToCrew = (crewId: string) => {
    const crew = driverCrews.find((item) => item.id === crewId)
    if (!crew) return
    const next = people.find(
      (person) =>
        person.id !== crew.driverId &&
        !crew.companionIds.includes(person.id)
    )
    if (!next) return
    updateDriverCrew(crewId, {
      companionIds: [...crew.companionIds, next.id],
    })
  }

  const updateCompanion = (crewId: string, index: number, personId: string) => {
    const crew = driverCrews.find((item) => item.id === crewId)
    if (!crew) return
    const nextIds = [...crew.companionIds]
    nextIds[index] = personId
    updateDriverCrew(crewId, { companionIds: nextIds.filter(Boolean) })
  }

  const removeCompanion = (crewId: string, index: number) => {
    const crew = driverCrews.find((item) => item.id === crewId)
    if (!crew) return
    updateDriverCrew(crewId, {
      companionIds: crew.companionIds.filter((_, itemIndex) => itemIndex !== index),
    })
  }

  useEffect(() => {
    if (!dirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: Premises = {
        ...premises,
        department,
        defaultCharacteristics: defaultCharacteristicsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        conditions: conditions
          .map((condition) => ({
            id: condition.id,
            locations: condition.locations
              .map((item) => item.trim())
              .filter(Boolean),
            responsible: condition.responsible.trim(),
          }))
          .filter(
            (condition) =>
              condition.locations.length > 0 || Boolean(condition.responsible)
          ),
        driverCrews: driverCrews
          .map((crew): DriverCrewPremise | null => {
            const driver = peopleById[crew.driverId]
            const companions = crew.companionIds
              .map((id) => peopleById[id])
              .filter(Boolean)
              .map((person) => ({
                id: person.id,
                name: person.name,
              }))
            if (!driver && companions.length === 0) return null
            return {
              id: crew.id,
              driverId: driver?.id || '',
              driverName: driver?.name || '',
              companions,
            }
          })
          .filter((item): item is DriverCrewPremise => Boolean(item)),
      }

      const res = await fetch('/api/quadrants/premises', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No s’han pogut desar les premisses')

      setPremises(json.premises as Premises)
      setConditions(toEditableConditions(json.premises as Premises))
      setDriverCrews(toEditableDriverCrews(json.premises as Premises, people))
      setDefaultCharacteristicsText(
        ((json.premises as Premises).defaultCharacteristics || []).join(', ')
      )
      setMeta({ source: 'firestore', warnings: [] })
      lastSavedSnapshotRef.current = buildSnapshot({
        department,
        premises: json.premises as Premises,
        defaultCharacteristicsText: ((json.premises as Premises).defaultCharacteristics || []).join(', '),
        conditions: toEditableConditions(json.premises as Premises),
        driverCrews: toEditableDriverCrews(json.premises as Premises, people),
      })
      setSuccess('Premisses desades correctament.')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant premisses')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleLeave = async () => {
    if (!dirty) {
      router.push('/menu/quadrants')
      return
    }

    const confirmed = window.confirm('Tens canvis pendents. Vols guardar abans de sortir?')
    if (!confirmed) return

    const saved = await handleSave()
    if (saved !== false) {
      router.push('/menu/quadrants')
    }
  }

  const handleDepartmentChange = async (nextDepartment: string) => {
    if (nextDepartment === department) return
    if (!dirty) {
      setDepartment(nextDepartment)
      return
    }

    const confirmed = window.confirm('Tens canvis pendents. Vols guardar abans de canviar de departament?')
    if (!confirmed) return

    const saved = await handleSave()
    if (saved !== false) {
      setDepartment(nextDepartment)
    }
  }

  return (
    <main className="space-y-5 px-4 pb-10">
      <ModuleHeader
        icon={<Save className="h-6 w-6 text-indigo-600" />}
        title="Quadrants"
        subtitle="Premisses"
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <Button type="button" variant="outline" onClick={handleLeave}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna a quadrants
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Desant...' : 'Guardar canvis'}
            </Button>
          </div>
        }
      />

      {error ? (
        <section className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </section>
      ) : null}

      {success ? (
        <section className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-100">
          {success}
        </section>
      ) : null}

      <section className="sticky top-3 z-20 rounded-2xl bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {dirty ? 'Tens canvis pendents de guardar.' : 'No hi ha canvis pendents.'}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="md:hidden" onClick={handleLeave}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="min-w-[160px] bg-violet-600 hover:bg-violet-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Desant...' : 'Guardar canvis'}
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Configuracio
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  Premisses de {prettyDepartment(department)}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Edicio directa de les regles que fa servir l&apos;autogeneracio.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                  Origen:{' '}
                  <span className="font-medium text-slate-900">
                    {meta?.source === 'firestore' ? 'Firestore' : 'Fallback JSON'}
                  </span>
                </div>
                {warningText ? (
                  <div className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700 ring-1 ring-amber-200/60">
                    Avisos: {warningText}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="w-full max-w-xs space-y-2">
              <Label htmlFor="premises-department">Departament</Label>
              <select
                id="premises-department"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
                disabled={!canSelectDepartment || loading}
                value={department}
                onChange={(event) => {
                  void handleDepartmentChange(event.target.value)
                }}
              >
                {DEPARTMENTS.map((item) => (
                  <option key={item} value={item}>
                    {prettyDepartment(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-6">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <section className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-900">Regles generals</h3>
                <p className="text-sm text-slate-600">
                  Parametres base del departament.
                </p>
              </div>

              {loading ? (
                <div className="py-6 text-sm text-slate-500">Carregant premisses...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="rest-hours">Hores minimes de descans</Label>
                      <Input
                        id="rest-hours"
                        type="number"
                        min="0"
                        className="border-slate-200 bg-slate-50/40"
                        value={premises.restHours}
                        onChange={(event) =>
                          setPremises((prev) => ({
                            ...prev,
                            restHours: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-duration">Durada maxima primer esdeveniment</Label>
                      <Input
                        id="max-duration"
                        type="number"
                        min="0"
                        className="border-slate-200 bg-slate-50/40"
                        value={premises.maxFirstEventDurationHours || 0}
                        onChange={(event) =>
                          setPremises((prev) => ({
                            ...prev,
                            maxFirstEventDurationHours: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-characteristics">
                      Caracteristiques per defecte
                    </Label>
                    <Input
                      id="default-characteristics"
                      className="border-slate-200 bg-slate-50/40"
                      value={defaultCharacteristicsText}
                      onChange={(event) => setDefaultCharacteristicsText(event.target.value)}
                      placeholder="Treballador, Responsable, Conductor"
                    />
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <label className="flex items-start gap-3 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={premises.allowMultipleEventsSameDay}
                        onChange={(event) =>
                          setPremises((prev) => ({
                            ...prev,
                            allowMultipleEventsSameDay: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <span className="block font-medium text-slate-900">
                          Permetre multiples serveis el mateix dia
                        </span>
                        <span className="block text-slate-500">
                          Si es desmarca, una persona no podra repetir servei el mateix dia.
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(premises.requireResponsible)}
                        onChange={(event) =>
                          setPremises((prev) => ({
                            ...prev,
                            requireResponsible: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <span className="block font-medium text-slate-900">
                          Responsable obligatori
                        </span>
                        <span className="block text-slate-500">
                          Marca incidencies si no es troba cap responsable elegible.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-5 border-t border-slate-100 pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Equips de conductors
                    </h3>
                    <p className="text-sm text-slate-600">
                      Conductor habitual i acompanyants preferits del departament.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addDriverCrew}
                    disabled={loading || drivers.length === 0}
                    className="rounded-xl"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Afegir equip
                  </Button>
                </div>

                {loading ? (
                  <div className="py-3 text-sm text-slate-500">Carregant conductors...</div>
                ) : drivers.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    No hi ha conductors disponibles per aquest departament.
                  </div>
                ) : driverCrews.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Encara no hi ha equips de conductors definits.
                  </div>
                ) : (
                  <div className="space-y-0">
                    {driverCrews.map((crew, index) => {
                      const availableCompanions = people.filter(
                        (person) => person.id !== crew.driverId
                      )
                      return (
                        <div
                          key={crew.id}
                          className={`py-5 ${
                            index > 0 ? 'border-t border-slate-100' : ''
                          }`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-800">
                              Equip conductor {index + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDriverCrew(crew.id)}
                              className="inline-flex items-center gap-2 text-sm font-medium text-rose-600 transition hover:text-rose-700"
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </button>
                          </div>

                          <div className="grid gap-4">
                            <div className="space-y-2">
                              <Label>Conductor</Label>
                              <select
                                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3 text-sm shadow-sm"
                                value={crew.driverId}
                                onChange={(event) =>
                                  updateDriverCrew(crew.id, {
                                    driverId: event.target.value,
                                    companionIds: crew.companionIds.filter(
                                      (id) => id !== event.target.value
                                    ),
                                  })
                                }
                              >
                                <option value="">Selecciona conductor</option>
                                {drivers.map((driver) => (
                                  <option key={driver.id} value={driver.id}>
                                    {driver.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <Label>Acompanyants</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-auto px-0 text-indigo-600 hover:text-indigo-700"
                                  onClick={() => addCompanionToCrew(crew.id)}
                                  disabled={
                                    availableCompanions.filter(
                                      (person) => !crew.companionIds.includes(person.id)
                                    ).length === 0
                                  }
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Afegir acompanyant
                                </Button>
                              </div>

                              {crew.companionIds.length === 0 ? (
                                <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                                  Encara no hi ha acompanyants en aquest equip.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {crew.companionIds.map((companionId, companionIndex) => (
                                    <div
                                      key={`${crew.id}-${companionIndex}`}
                                      className="flex items-center gap-3"
                                    >
                                      <select
                                        className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50/40 px-3 text-sm shadow-sm"
                                        value={companionId}
                                        onChange={(event) =>
                                          updateCompanion(
                                            crew.id,
                                            companionIndex,
                                            event.target.value
                                          )
                                        }
                                      >
                                        <option value="">Selecciona acompanyant</option>
                                        {availableCompanions
                                          .filter(
                                            (person) =>
                                              person.id === companionId ||
                                              !crew.companionIds.includes(person.id)
                                          )
                                          .map((person) => (
                                            <option key={person.id} value={person.id}>
                                              {person.name}
                                            </option>
                                          ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => removeCompanion(crew.id, companionIndex)}
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Condicions per ubicacio
                  </h3>
                  <p className="text-sm text-slate-600">
                    Prioritats de responsable segons finca o variant de nom.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCondition}
                  disabled={loading}
                  className="rounded-xl"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Afegir
                </Button>
              </div>

              {loading ? (
                <div className="py-6 text-sm text-slate-500">Carregant condicions...</div>
              ) : conditions.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  Aquest departament encara no te condicions desades.
                </div>
              ) : (
                <div className="space-y-0">
                  {conditions.map((condition, index) => (
                    <div
                      key={condition.id}
                      className={`py-5 ${
                        index > 0 ? 'border-t border-slate-100' : ''
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-800">
                          Condicio {index + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCondition(condition.id)}
                          className="inline-flex items-center gap-2 text-sm font-medium text-rose-600 transition hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
                            <div className="space-y-2">
                              <Label>Ubicacions</Label>
                          <div className="space-y-3">
                            {condition.locations.length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                                Encara no hi ha cap ubicacio afegida.
                              </div>
                            ) : (
                              condition.locations.map((location, locationIndex) => (
                                <div
                                  key={`${condition.id}-${locationIndex}`}
                                  className="flex items-center gap-3"
                                >
                                  <select
                                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50/40 px-3 text-sm shadow-sm"
                                    value={location}
                                    onChange={(event) =>
                                      updateConditionLocation(
                                        condition.id,
                                        locationIndex,
                                        event.target.value
                                      )
                                    }
                                  >
                                    <option value="">Selecciona finca</option>
                                    {finques
                                      .filter(
                                        (finca) =>
                                          finca.name === location ||
                                          !condition.locations.includes(finca.name)
                                      )
                                      .map((finca) => (
                                        <option key={finca.id} value={finca.name}>
                                          {finca.name}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeConditionLocation(condition.id, locationIndex)
                                    }
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))
                            )}

                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-0 text-indigo-600 hover:text-indigo-700"
                              onClick={() => addLocationToCondition(condition.id)}
                              disabled={
                                finques.filter(
                                  (finca) => !condition.locations.includes(finca.name)
                                ).length === 0
                              }
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Afegir ubicacio
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Responsable prioritari</Label>
                          <Input
                            className="border-slate-200 bg-slate-50/40"
                            value={condition.responsible}
                            onChange={(event) =>
                              updateCondition(condition.id, {
                                responsible: event.target.value,
                              })
                            }
                            placeholder="Nom del responsable"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
