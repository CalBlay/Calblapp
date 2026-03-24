import { useEffect, useMemo, useState } from 'react'
import { useTransports } from '@/hooks/useTransports'
import { normalizeRole } from '@/lib/roles'
import type { MachineItem, TransportItem, UserItem } from './types'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export function useMaintenanceTicketCatalog() {
  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<MachineItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const { data: transports } = useTransports()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [locationsRes, usersRes, machinesRes] = await Promise.all([
          fetch('/api/spaces/internal', { cache: 'no-store' }),
          fetch('/api/personnel?department=manteniment', { cache: 'no-store' }),
          fetch('/api/maintenance/machines', { cache: 'no-store' }),
        ])

        const [locationsJson, usersJson, machinesJson] = await Promise.all([
          locationsRes.ok ? locationsRes.json() : { locations: [] },
          usersRes.ok ? usersRes.json() : { data: [] },
          machinesRes.ok ? machinesRes.json() : { machines: [] },
        ])

        if (cancelled) return

        setLocations(Array.isArray(locationsJson?.locations) ? locationsJson.locations : [])
        setUsers(Array.isArray(usersJson?.data) ? usersJson.data : [])
        setMachines(Array.isArray(machinesJson?.machines) ? machinesJson.machines : [])
      } catch {
        if (cancelled) return
        setLocations([])
        setUsers([])
        setMachines([])
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const maintenanceUsers = useMemo(
    () =>
      users.filter((user) => {
        const dept = normalizeDept(user.departmentLower || user.department)
        const role = normalizeRole(user.role || '')
        return dept === 'manteniment' && (role === 'treballador' || role === 'cap')
      }),
    [users]
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
    machines,
    maintenanceUsers,
    furgonetes,
  }
}
