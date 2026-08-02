'use client'

import { useMemo } from 'react'
import { DEPARTMENTS } from '@/data/departments'
import type { ProjectData } from './project-shared'
import {
  normalizeDepartment,
  type ResponsibleOption,
} from './project-workspace-helpers'

type Params = {
  project: ProjectData
  usersCatalog: ResponsibleOption[]
  responsibles: ResponsibleOption[]
}

export function useProjectResponsibleOptions({
  project,
  usersCatalog,
  responsibles,
}: Params) {
  const userByName = useMemo(
    () => new Map(usersCatalog.map((user) => [user.name, user])),
    [usersCatalog]
  )

  const ownerOptions = useMemo(() => {
    if (project.owner && !responsibles.some((item) => item.name === project.owner)) {
      return [
        { id: 'current', name: project.owner, role: 'current', email: '', department: '' },
        ...responsibles,
      ]
    }
    return responsibles
  }, [project.owner, responsibles])

  const availableDepartments = useMemo(
    () =>
      DEPARTMENTS.filter((department) => {
        const normalized = normalizeDepartment(department)
        return normalized !== 'delsys' && normalized !== 'total'
      }),
    []
  )

  const withProjectOwnerOption = (options: ResponsibleOption[]) => {
    const ownerName = String(project.owner || '').trim()
    if (!ownerName) return options
    if (options.some((item) => item.name === ownerName)) return options

    const ownerUser = userByName.get(ownerName)
    return [
      {
        id: ownerUser?.id || 'project-owner',
        name: ownerName,
        role: ownerUser?.role || 'current',
        email: ownerUser?.email || '',
        department: ownerUser?.department || '',
      },
      ...options,
    ]
  }

  const kickoffAttendeeOptions = useMemo(
    () =>
      usersCatalog.filter(
        (user) =>
          Boolean(user.email) &&
          !project.kickoff.attendees.some((item) => item.key === `user:${user.id}`)
      ),
    [usersCatalog, project.kickoff.attendees]
  )

  const departmentResponsibleOptions = (department?: string | string[]) => {
    const departments = Array.isArray(department) ? department : [department || '']
    const normalizedDepartments = departments
      .map((item) => normalizeDepartment(item || ''))
      .filter(Boolean)

    if (normalizedDepartments.length === 0) return withProjectOwnerOption(ownerOptions)

    const filtered = responsibles.filter(
      (user) =>
        (user.role === 'cap' || user.role === 'direccio') &&
        normalizedDepartments.includes(normalizeDepartment(user.department || ''))
    )

    return withProjectOwnerOption(filtered.length > 0 ? filtered : ownerOptions)
  }

  const taskResponsibleOptions = (department?: string, blockId?: string) => {
    const normalized = normalizeDepartment(department || '')
    const blockOwnerName = String(
      project.blocks.find((block) => block.id === blockId)?.owner || ''
    ).trim()

    const filtered = normalized
      ? usersCatalog.filter(
          (user) =>
            normalizeDepartment(user.department || '') === normalized &&
            (
              user.role === 'usuari' ||
              user.role === 'treballador' ||
              user.role === 'cap' ||
              user.role === 'comercial'
            )
        )
      : []

    const withBlockOwner = (() => {
      if (!blockOwnerName) return filtered
      if (filtered.some((item) => item.name === blockOwnerName)) return filtered
      const blockOwnerUser = userByName.get(blockOwnerName)
      return [
        {
          id: blockOwnerUser?.id || `block-owner:${blockId || 'current'}`,
          name: blockOwnerName,
          role: blockOwnerUser?.role || 'current',
          email: blockOwnerUser?.email || '',
          department: blockOwnerUser?.department || '',
        },
        ...filtered,
      ]
    })()

    return withProjectOwnerOption(withBlockOwner)
  }

  return {
    availableDepartments,
    departmentResponsibleOptions,
    kickoffAttendeeOptions,
    ownerOptions,
    taskResponsibleOptions,
    userByName,
  }
}
