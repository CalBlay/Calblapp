// filename: src/app/menu/torns/components/TornFilters.tsx
'use client'

import React, { useState } from 'react'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'

type TornRoleType = 'all' | 'treballador' | 'responsable' | 'conductor'
type TornFiltersState = Omit<SmartFiltersChange, 'roleType'> & {
  roleType?: TornRoleType
}

type Props = {
  setFilters: React.Dispatch<React.SetStateAction<TornFiltersState>>
  deptOptions?: string[]
  workerOptions?: { id: string; name: string }[]
  role: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
  sessionDept?: string
  userName?: string
  isAdminOrDireccio?: boolean
  isWorker?: boolean
}

export default function TornFilters({
  setFilters,
  deptOptions = [],
  workerOptions = [],
  role: _role,
  sessionDept,
  userName: _userName,
  isAdminOrDireccio,
  isWorker: _isWorker,
}: Props) {

  const [localRoleType, setLocalRoleType] = useState<TornRoleType>('all')
  const [localDepartment, setLocalDepartment] = useState(
    isAdminOrDireccio ? '' : sessionDept || ''
  )
  const [localWorker, setLocalWorker] = useState('')

  /* ─────────────────────────────────────────────
     RESET (igual que Esdeveniments)
  ───────────────────────────────────────────── */
  const resetFilters = () => {
    setLocalRoleType('all')
    setLocalDepartment(isAdminOrDireccio ? '' : sessionDept || '')
    setLocalWorker('')

    setFilters(prev => ({
      start: prev.start,
      end: prev.end,
      roleType: undefined,
      department: undefined,
      workerName: undefined,
      workerId: undefined,
    }))
  }

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 bg-white rounded-xl p-4 shadow-sm border border-gray-200">

      {/* ROLE */}
      {isAdminOrDireccio && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Rol</label>
          <select
            className="border rounded-lg p-2"
            value={localRoleType}
            onChange={(e) => {
              const v = e.target.value as TornRoleType
              setLocalRoleType(v)
              setFilters(prev => ({ ...prev, roleType: v }))
            }}
          >
            <option value="all">Tots</option>
            <option value="treballador">Treballador</option>
            <option value="conductor">Conductor</option>
            <option value="responsable">Responsable</option>
          </select>
        </div>
      )}

      {/* DEPARTAMENT */}
      {isAdminOrDireccio && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Departament</label>
          <select
            className="border rounded-lg p-2"
            value={localDepartment}
            onChange={(e) => {
              const v = e.target.value
              setLocalDepartment(v)
              setFilters(prev => ({ ...prev, department: v }))
            }}
          >
            <option value="">Tots</option>
            {deptOptions.map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </div>
      )}

      {/* WORKER */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Treballador</label>
        <select
          className="border rounded-lg p-2"
          value={localWorker}
          onChange={(e) => {
            const v = e.target.value
            setLocalWorker(v)
            setFilters(prev => ({ ...prev, workerName: v }))
          }}
        >
          <option value="">Tots</option>
          {workerOptions.map((w, i) => (
            <option key={w.id || `${w.name}-${i}`} value={w.name}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {/* BOTÓ RESET */}
     <ResetFilterButton onClick={resetFilters} />

    </div>
  )
}
