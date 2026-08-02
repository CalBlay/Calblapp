'use client'

import { useEffect, useState } from 'react'
import { normalizeRole } from '@/lib/roles'
import type { ResponsibleOption } from './project-workspace-helpers'

export function useProjectUsersCatalog(initialCatalog?: ResponsibleOption[]) {
  const [usersCatalog, setUsersCatalog] = useState<ResponsibleOption[]>(initialCatalog ?? [])
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>(() =>
    (initialCatalog ?? []).filter(
      (user) => user.role === 'admin' || user.role === 'direccio' || user.role === 'cap'
    )
  )
  const hasInitialCatalog = Boolean(initialCatalog && initialCatalog.length > 0)

  useEffect(() => {
    if (hasInitialCatalog) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/users?view=project-options', { cache: 'no-store' })
        if (!res.ok) throw new Error('No s han pogut carregar els usuaris')
        const users = (await res.json()) as Array<{
          id: string
          name?: string
          role?: string
          email?: string
          department?: string
        }>

        const catalog = users
          .map((user) => ({
            id: user.id,
            name: String(user.name || '').trim(),
            role: normalizeRole(user.role || ''),
            email: String(user.email || '').trim(),
            department: String(user.department || '').trim(),
          }))
          .filter((user) => user.name)
          .sort((a, b) => a.name.localeCompare(b.name))

        const next = catalog.filter((user) => {
          return user.role === 'admin' || user.role === 'direccio' || user.role === 'cap'
        })

        if (!cancelled) {
          setUsersCatalog(catalog)
          setResponsibles(next)
        }
      } catch {
        if (!cancelled) {
          setUsersCatalog([])
          setResponsibles([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasInitialCatalog])

  return { usersCatalog, responsibles }
}
