'use client'

import React, { useMemo } from 'react'
import {
  CorporateFilterField,
  CorporateFilterSearch,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { corporateFilterBadgeClass } from '@/lib/corporate-filters'

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
    <CorporateFiltersShell
      bodyClassName="flex-col items-stretch gap-4"
    >
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CorporateFilterField label="Cerca intel·ligent" className="md:col-span-2 xl:col-span-2">
          <CorporateFilterSearch
            id="users-search"
            placeholder="Nom, email, telèfon, comercial, rol, departament..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ search: e.target.value })}
            autoComplete="off"
          />
        </CorporateFilterField>

        <CorporateFilterField label="Departament">
          <CorporateFilterSelect
            id="users-department"
            className="w-full"
            minWidthClassName="min-w-0"
            value={filters.department || '__all__'}
            onChange={(e) => setFilters({ department: e.target.value })}
          >
            <option value="__all__">Tots els departaments</option>
            {dynamicDepartments.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </CorporateFilterSelect>
        </CorporateFilterField>

        <CorporateFilterField label="Rol">
          <CorporateFilterSelect
            id="users-role"
            className="w-full"
            minWidthClassName="min-w-0"
            value={filters.role || '__all__'}
            onChange={(e) => setFilters({ role: e.target.value })}
          >
            <option value="__all__">Tots els rols</option>
            {dynamicRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </CorporateFilterSelect>
        </CorporateFilterField>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          Cerca sense accents; es poden usar diverses paraules.
          {typeof totalCount === 'number' && typeof filteredCount === 'number' ? (
            <>
              {' '}
              Mostrant {filteredCount} de {totalCount} usuaris.
            </>
          ) : null}
        </p>
        {hasActiveFilters ? (
          <button type="button" onClick={clearFilters} className={corporateFilterBadgeClass(false)}>
            Neteja filtres
          </button>
        ) : null}
      </div>
    </CorporateFiltersShell>
  )
}
