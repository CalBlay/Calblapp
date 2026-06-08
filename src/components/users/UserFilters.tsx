'use client'

import React, { useMemo } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface UserFiltersState {
  search?: string
  department?: string
  role?: string
}

type Props = {
  filters: UserFiltersState
  setFilters: (f: Partial<UserFiltersState>) => void
  departmentOptions: string[]
  roleOptions: string[]
  users: { department?: string; role?: string }[]
  totalCount?: number
  filteredCount?: number
}

const selectClassName =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-h-11'

export default function UserFilters({
  filters,
  setFilters,
  departmentOptions,
  roleOptions,
  users,
  totalCount,
  filteredCount,
}: Props) {
  const safeUsers = useMemo(() => users || [], [users])

  const dynamicRoles = useMemo(() => {
    let base = safeUsers
    if (filters.department && filters.department !== '__all__') {
      base = base.filter((u) => u.department === filters.department)
    }

    const roles = base.map((u) => u.role).filter(Boolean) as string[]
    return roles.length ? Array.from(new Set(roles)) : roleOptions
  }, [filters.department, safeUsers, roleOptions])

  const dynamicDepartments = useMemo(() => {
    let base = safeUsers
    if (filters.role && filters.role !== '__all__') {
      base = base.filter((u) => u.role === filters.role)
    }

    const depts = base.map((u) => u.department).filter(Boolean) as string[]
    return depts.length ? Array.from(new Set(depts)) : departmentOptions
  }, [filters.role, safeUsers, departmentOptions])

  const hasActiveFilters =
    Boolean(String(filters.search || '').trim()) ||
    (filters.department && filters.department !== '__all__') ||
    (filters.role && filters.role !== '__all__')

  const clearFilters = () => {
    setFilters({ search: '', department: '__all__', role: '__all__' })
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1 md:col-span-2 xl:col-span-2">
          <Label htmlFor="users-search" className="text-xs font-semibold text-gray-600">
            Cerca intel·ligent
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="users-search"
              placeholder="Nom, email, telèfon, comercial, rol, departament..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ search: e.target.value })}
              autoComplete="off"
              className="min-h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="users-department" className="text-xs font-semibold text-gray-600">
            Departament
          </Label>
          <select
            id="users-department"
            value={filters.department || '__all__'}
            onChange={(e) => setFilters({ department: e.target.value })}
            className={`${selectClassName} w-full`}
          >
            <option value="__all__">Tots els departaments</option>
            {dynamicDepartments.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="users-role" className="text-xs font-semibold text-gray-600">
            Rol
          </Label>
          <select
            id="users-role"
            value={filters.role || '__all__'}
            onChange={(e) => setFilters({ role: e.target.value })}
            className={`${selectClassName} w-full`}
          >
            <option value="__all__">Tots els rols</option>
            {dynamicRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Cerca sense accents; es poden usar diverses paraules.
          {typeof totalCount === 'number' && typeof filteredCount === 'number' ? (
            <>
              {' '}
              Mostrant {filteredCount} de {totalCount} usuaris.
            </>
          ) : null}
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            Neteja filtres
          </button>
        ) : null}
      </div>
    </div>
  )
}
