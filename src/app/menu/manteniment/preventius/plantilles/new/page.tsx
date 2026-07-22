'use client'

import React, { useEffect, useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import {
  getMaintenanceCenterOptions,
  getMaintenanceLocationsForCenter,
  getMaintenanceZones,
  type MaintenanceCenterHierarchyRow,
} from '@/lib/maintenanceLocationCatalog'
import MaintenancePermissionGate from '../../../components/MaintenancePermissionGate'

type PersonnelApiItem = { name?: string }

export default function PlantillaNewPage() {
  const [centers, setCenters] = useState<MaintenanceCenterHierarchyRow[]>([])
  const [operators, setOperators] = useState<string[]>([])
  const [name, setName] = useState('')
  const [periodicity, setPeriodicity] = useState('monthly')
  const [lastDone, setLastDone] = useState('')
  const [center, setCenter] = useState('')
  const [location, setLocation] = useState('')
  const [zone, setZone] = useState('')
  const [primaryOperator, setPrimaryOperator] = useState('')
  const [backupOperator, setBackupOperator] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [operatorsRes, centersRes] = await Promise.all([
          fetch('/api/personnel?department=manteniment', { cache: 'no-store' }),
          fetch('/api/maintenance/data/centers', { cache: 'no-store' }),
        ])

        if (!operatorsRes.ok) {
          setOperators([])
        } else {
          const json = await operatorsRes.json()
          const list = Array.isArray(json?.data) ? json.data : []
          const names = list
            .map((item: PersonnelApiItem) => String(item?.name || '').trim())
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b))
          setOperators(Array.from(new Set(names)))
        }

        if (!centersRes.ok) {
          setCenters([])
          return
        }
        const centersJson = await centersRes.json()
        setCenters(Array.isArray(centersJson?.centers) ? centersJson.centers : [])
      } catch {
        setOperators([])
        setCenters([])
      }
    }
    void loadData()
  }, [])

  const backupOptions = useMemo(
    () => operators.filter((operator) => operator !== primaryOperator),
    [operators, primaryOperator]
  )
  const centerOptions = useMemo(() => getMaintenanceCenterOptions(centers), [centers])
  const locationOptions = useMemo(
    () => getMaintenanceLocationsForCenter(centers, center),
    [center, centers]
  )
  const zoneOptions = useMemo(
    () => {
      const options = getMaintenanceZones(centers, center, location)
      const currentZone = String(zone || '').trim()
      if (!currentZone || options.includes(currentZone)) return options
      return [currentZone, ...options]
    },
    [center, centers, location, zone]
  )

  useEffect(() => {
    if (location && !locationOptions.includes(location)) {
      setLocation('')
    }
  }, [location, locationOptions])

  useEffect(() => {
    if (zone && !zoneOptions.includes(zone)) {
      setZone('')
    }
  }, [zone, zoneOptions])

  const create = async () => {
    if (!name.trim()) {
      alert('Omple el nom de la plantilla.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/maintenance/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          periodicity,
          lastDone: lastDone || null,
          center,
          location,
          zone,
          primaryOperator,
          backupOperator,
          sections: [],
        }),
      })
      if (!res.ok) throw new Error('create_failed')
      const json = await res.json().catch(() => null)
      const id = json?.id ? String(json.id) : null
      if (id) {
        const win = window.open(`/menu/manteniment/preventius/plantilles/${id}`, '_blank', 'noopener')
        if (win) win.opener = null
      }
      window.close()
    } catch {
      alert('No s’ha pogut crear la plantilla.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MaintenancePermissionGate>
      <div className="w-full max-w-5xl mx-auto p-4 space-y-5">
        <ModuleHeader subtitle="Nova plantilla" />

        <div className="rounded-2xl border bg-white p-5 space-y-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">Nom</span>
            <input
              className="h-10 rounded-xl border px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Temporalitat</span>
              <select
                className="h-10 rounded-xl border px-3"
                value={periodicity}
                onChange={(e) => setPeriodicity(e.target.value)}
              >
                <option value="daily">Diari</option>
                <option value="weekly">Setmanal</option>
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="yearly">Anual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Ultima data revisio</span>
              <input
                type="date"
                className="h-10 rounded-xl border px-3"
                value={lastDone}
                onChange={(e) => setLastDone(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Centre</span>
              <select
                className="h-10 rounded-xl border px-3"
                value={center}
                onChange={(e) => {
                  setCenter(e.target.value)
                  setLocation('')
                  setZone('')
                }}
              >
                <option value="">Sense centre</option>
                {centerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Ubicacio</span>
              <select
                className="h-10 rounded-xl border px-3"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value)
                  setZone('')
                }}
                disabled={locationOptions.length === 0}
              >
                <option value="">{center ? 'Sense ubicacio' : 'Selecciona centre'}</option>
                {locationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Zona</span>
              <select
                className="h-10 rounded-xl border px-3"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                disabled={zoneOptions.length === 0}
              >
                <option value="">
                  {location ? 'Sense zona' : center ? 'Selecciona ubicacio' : 'Selecciona centre'}
                </option>
                {zoneOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Operari assignat</span>
              <select
                className="h-10 rounded-xl border px-3"
                value={primaryOperator}
                onChange={(e) => {
                  const next = e.target.value
                  setPrimaryOperator(next)
                  if (backupOperator === next) setBackupOperator('')
                }}
              >
                <option value="">Sense assignar</option>
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Segon operari</span>
              <select
                className="h-10 rounded-xl border px-3"
                value={backupOperator}
                onChange={(e) => setBackupOperator(e.target.value)}
              >
                <option value="">Sense assignar</option>
                {backupOptions.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="text-xs text-gray-500">
            La definicio del checklist (seccions i tasques) la podras editar dins la plantilla un cop creada.
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
              disabled={saving}
              onClick={create}
            >
              {saving ? 'Creant...' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </MaintenancePermissionGate>
  )
}
