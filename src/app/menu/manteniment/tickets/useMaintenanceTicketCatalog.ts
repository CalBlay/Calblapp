import { useEffect, useMemo, useState } from 'react'
import { useTransports } from '@/hooks/useTransports'
import { normalizeRole } from '@/lib/roles'
import type { MachineItem, TransportItem, UserItem } from './types'
import type { CenterRow } from '@/app/menu/manteniment/dades/types'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export function useMaintenanceTicketCatalog(assigneeDepartment = 'manteniment') {
  const [locations, setLocations] = useState<string[]>([])
  const [centers, setCenters] = useState<CenterRow[]>([])
  const [machines, setMachines] = useState<MachineItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const { data: transports } = useTransports()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [locationsRes, centersRes, usersRes, machinesRes] = await Promise.all([
          fetch('/api/spaces/internal', { cache: 'no-store' }),
          fetch('/api/maintenance/data/centers', { cache: 'no-store' }),
          fetch(
            assigneeDepartment === 'deco'
              ? '/api/personnel'
              : `/api/personnel?department=${encodeURIComponent(assigneeDepartment)}`,
            { cache: 'no-store' }
          ),
          fetch('/api/maintenance/machines', { cache: 'no-store' }),
        ])

        const [locationsJson, centersJson, usersJson, machinesJson] = await Promise.all([
          locationsRes.ok ? locationsRes.json() : { locations: [] },
          centersRes.ok ? centersRes.json() : { centers: [] },
          usersRes.ok ? usersRes.json() : { data: [] },
          machinesRes.ok ? machinesRes.json() : { machines: [] },
        ])

        if (cancelled) return

        setLocations(Array.isArray(locationsJson?.locations) ? locationsJson.locations : [])
        setCenters(Array.isArray(centersJson?.centers) ? centersJson.centers : [])
        setUsers(Array.isArray(usersJson?.data) ? usersJson.data : [])
        setMachines(Array.isArray(machinesJson?.machines) ? machinesJson.machines : [])
      } catch {
        if (cancelled) return
        setLocations([])
        setCenters([])
        setUsers([])
        setMachines([])
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [assigneeDepartment])

  const maintenanceUsers = useMemo(
    () =>
      users.filter((user) => {
        const dept = normalizeDept(user.departmentLower || user.department)
        const role = normalizeRole(user.role || '')
        const requestedDepartment = normalizeDept(assigneeDepartment)
        const matchesDepartment =
          requestedDepartment === 'deco'
            ? ['deco', 'decoracio', 'decoracions'].includes(dept)
            : dept === requestedDepartment
        return matchesDepartment && (role === 'treballador' || role === 'cap')
      }),
    [assigneeDepartment, users]
  )

  const furgonetes = useMemo(
    () =>
      (((transports as TransportItem[]) || []).filter(
        (item) => item.type === 'furgonetaManteniment'
      )),
    [transports]
  )

  return {
    locations,
    centers,
    machines,
    maintenanceUsers,
    furgonetes,
  }
}
